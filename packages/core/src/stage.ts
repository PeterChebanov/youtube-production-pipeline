import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ChannelSchema,
  VideoSchema,
  ProjectStateSchema,
  parseYamlFile,
} from '@ecpe/schemas';
import { buildPrompts, type PromptContext } from '@ecpe/prompts';
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
import { openProject, readArtifact, writeArtifact } from './project.js';

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

  loadEnv();
  const context = await buildStageContext(projectPath, stageId, options.revisionNotes);
  const { system, user } = await buildPrompts(stageId, context, projectPath);

  const content = await complete({
    provider: options.provider,
    model: options.model,
    system,
    user,
  });

  const outputFile = STAGE_OUTPUT[stageId];
  await maybeArchiveArtifact(projectPath, outputFile, stageId);
  await writeArtifact(projectPath, outputFile, content);
  await updateProjectState(projectPath, stageId);

  return { stageId, outputFile, content };
}
