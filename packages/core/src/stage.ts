import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ChannelSchema,
  VideoSchema,
  ProjectStateSchema,
  parseYamlFile,
} from '@ecpe/schemas';
import {
  buildPrompts,
  auditScriptWordCounts,
  expandContractionsForNarration,
  stripScriptWordCountLines,
  type PromptContext,
} from '@ecpe/prompts';
import { complete, loadEnv, type LlmProviderId } from '@ecpe/llm';
import { segmentScript } from '@ecpe/segmentation';
import {
  ARTIFACTS,
  KNOWLEDGE_STAGES,
  STAGE_OUTPUT,
  type ArtifactKey,
  type KnowledgeStageId,
} from './artifacts.js';
import { maybeArchiveArtifact } from './archive.js';
import { openProject, readArtifact, readSourceBrief, writeArtifact } from './project.js';
import { maybeAutoEpisodeWrap } from './episode-wrap.js';
import { assertEpisodeBuildAppGate } from './course.js';
import { enrichBuildAppPromptContext } from './build-app-context.js';
import {
  logBuildAppNarrativeBalance,
  warnBuildAppBalanceAfterStage,
} from './build-app-balance-gate.js';
import { reportProgress } from './progress.js';

const LLM_STAGES = new Set<KnowledgeStageId>(
  KNOWLEDGE_STAGES.filter((s) => s !== 'segment'),
);

/** Input artifacts required before a stage can run. */
const STAGE_INPUTS: Record<KnowledgeStageId, ArtifactKey[]> = {
  research: ['channel', 'video'],
  'technical-review': ['research', 'channel', 'video'],
  'script-writer': ['research', 'technicalReview', 'channel', 'video'],
  'educational-review': ['script', 'channel', 'video'],
  'youtube-editor': ['script', 'educationalReview', 'channel', 'video'],
  segment: ['finalScript'],
};

export interface RunStageOptions {
  projectPath: string;
  provider?: LlmProviderId;
  model?: string;
  revisionNotes?: string;
  motionRatio?: number;
}

export interface RunStageResult {
  stageId: KnowledgeStageId;
  outputFile: string;
  content: string;
}

function isKnowledgeStage(stageId: string): stageId is KnowledgeStageId {
  return (KNOWLEDGE_STAGES as readonly string[]).includes(stageId);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function assertStageInputs(projectPath: string, stageId: KnowledgeStageId): Promise<void> {
  const missing: string[] = [];
  for (const key of STAGE_INPUTS[stageId]) {
    const filename = ARTIFACTS[key];
    if (!(await fileExists(path.join(projectPath, filename)))) {
      missing.push(filename);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Stage "${stageId}" requires missing input file(s): ${missing.join(', ')}`,
    );
  }
}

async function buildStageContext(
  projectPath: string,
  stageId: KnowledgeStageId,
  revisionNotes?: string,
): Promise<PromptContext> {
  const context: PromptContext = { artifacts: {}, revisionNotes };

  const needsChannel = STAGE_INPUTS[stageId].includes('channel');
  const needsVideo = STAGE_INPUTS[stageId].includes('video');

  if (needsChannel) {
    const raw = await readArtifact(projectPath, ARTIFACTS.channel);
    context.channel = parseYamlFile(raw, ChannelSchema) as Record<string, unknown>;
  }
  if (needsVideo) {
    const raw = await readArtifact(projectPath, ARTIFACTS.video);
    context.video = parseYamlFile(raw, VideoSchema) as Record<string, unknown>;
  }

  const sourceBrief = await readSourceBrief(projectPath);
  if (sourceBrief) context.sourceBrief = sourceBrief;

  await enrichBuildAppPromptContext(projectPath, stageId, context);

  for (const key of STAGE_INPUTS[stageId]) {
    if (key === 'channel' || key === 'video') continue;
    const filename = ARTIFACTS[key];
    context.artifacts![filename] = await readArtifact(projectPath, filename);
  }

  return context;
}

export async function updateProjectState(
  projectPath: string,
  stageId: string,
): Promise<void> {
  const paths = await openProject(projectPath);
  const stateRaw = await readFile(paths.stateFile, 'utf8');
  const state = ProjectStateSchema.parse(JSON.parse(stateRaw));
  const now = new Date().toISOString();
  state.updated_at = now;
  state.last_completed_stage = stageId;
  state.last_run_id = state.last_run_id ?? `run-${now.replace(/[:.]/g, '-')}`;
  await writeFile(paths.stateFile, JSON.stringify(state, null, 2), 'utf8');
}

async function runSegmentStage(projectPath: string): Promise<RunStageResult> {
  await assertStageInputs(projectPath, 'segment');

  const videoRaw = await readArtifact(projectPath, ARTIFACTS.video);
  const video = parseYamlFile(videoRaw, VideoSchema);
  const script = await readArtifact(projectPath, ARTIFACTS.finalScript);
  const segments = segmentScript(script, video.words_per_minute);
  const content = JSON.stringify(segments, null, 2);
  const outputFile = STAGE_OUTPUT.segment;

  await maybeArchiveArtifact(projectPath, outputFile, 'segment');
  await writeArtifact(projectPath, outputFile, content);
  await updateProjectState(projectPath, 'segment');

  return { stageId: 'segment', outputFile, content };
}

export async function runStage(
  stageId: string,
  options: RunStageOptions,
): Promise<RunStageResult> {
  if (!isKnowledgeStage(stageId)) {
    throw new Error(
      `Unknown stage "${stageId}". Valid knowledge stages: ${KNOWLEDGE_STAGES.join(', ')}`,
    );
  }

  const projectPath = path.resolve(options.projectPath);
  await openProject(projectPath);

  if (stageId === 'segment') {
    return runSegmentStage(projectPath);
  }

  if (!LLM_STAGES.has(stageId)) {
    throw new Error(`Stage "${stageId}" is not an LLM stage.`);
  }

  await assertStageInputs(projectPath, stageId);
  await assertEpisodeBuildAppGate(projectPath);

  loadEnv();
  const context = await buildStageContext(projectPath, stageId, options.revisionNotes);

  let buildAppBalance: ReturnType<typeof logBuildAppNarrativeBalance> | undefined;
  if (context.buildsApplication) {
    buildAppBalance = logBuildAppNarrativeBalance(stageId, context.video);
  }

  const { system, user } = await buildPrompts(stageId, context, projectPath);

  let content = await complete({
    provider: options.provider,
    model: options.model,
    system,
    user,
  });

  if (stageId === 'script-writer' || stageId === 'youtube-editor') {
    const wpm = Number((context.video as { words_per_minute?: number })?.words_per_minute) || 133;
    let prepared = stripScriptWordCountLines(content);
    prepared = expandContractionsForNarration(prepared);
    const { content: audited, audits } = auditScriptWordCounts(
      prepared,
      wpm,
      context.sourceBrief,
    );
    content = audited;
    for (const a of audits) {
      if (a.status === 'over' && a.target != null && a.max != null) {
        reportProgress({
          stage: stageId,
          message: `Word audit — ${a.block}: ${a.words} words (target ${a.target}, max ${a.max}) ⚠️ OVER BUDGET`,
        });
      } else if (a.status === 'under' && a.target != null) {
        reportProgress({
          stage: stageId,
          message: `Word audit — ${a.block}: ${a.words} words (target ${a.target}) — under target`,
        });
      }
    }
  }

  if (context.buildsApplication && buildAppBalance) {
    warnBuildAppBalanceAfterStage(stageId, content, buildAppBalance);
  }

  const outputFile = STAGE_OUTPUT[stageId];
  await maybeArchiveArtifact(projectPath, outputFile, stageId);
  await writeArtifact(projectPath, outputFile, content);
  await updateProjectState(projectPath, stageId);

  if (stageId === 'youtube-editor') {
    const wrap = await maybeAutoEpisodeWrap(
      {
        projectPath,
        provider: options.provider,
        model: options.model,
        revisionNotes: options.revisionNotes,
      },
      content,
    );
    if (!wrap.skipped && wrap.result) {
      reportProgress({
        stage: 'episode-wrap',
        message: `Auto-wrapped course application state (${wrap.result.outputFile})`,
      });
    }
  }

  return { stageId, outputFile, content };
}
