import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ChannelSchema,
  VideoSchema,
  ProductionPlanSchema,
  parseYamlFile,
} from '@ecpe/schemas';
import { buildPrompts, type PromptContext } from '@ecpe/prompts';
import { complete, loadEnv, type LlmProviderId } from '@ecpe/llm';
import { renderAssets } from '@ecpe/production-engine';
import {
  ARTIFACTS,
  PRODUCTION_STAGES,
  PRODUCTION_STAGE_OUTPUT,
  type ArtifactKey,
  type ProductionStageId,
} from './artifacts.js';
import { maybeArchiveArtifact } from './archive.js';
import { openProject, readArtifact, readSourceBrief, writeArtifact } from './project.js';
import { updateProjectState } from './stage.js';

const PRODUCTION_LLM_STAGES = new Set<ProductionStageId>(['visual-plan']);

const PRODUCTION_INPUTS: Record<ProductionStageId, ArtifactKey[]> = {
  'visual-plan': ['finalScript', 'narrationSegments', 'channel', 'video'],
  'render-assets': ['productionPlan'],
  'render-scene': ['productionPlan'],
};

export interface RunProductionOptions {
  projectPath: string;
  provider?: LlmProviderId;
  model?: string;
  revisionNotes?: string;
  sceneId?: string;
}

export interface RunProductionResult {
  stageId: ProductionStageId;
  outputFile: string;
  content: string;
  rendered?: number;
  failed?: number;
}

function isProductionStage(stageId: string): stageId is ProductionStageId {
  return (PRODUCTION_STAGES as readonly string[]).includes(stageId);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function assertProductionInputs(
  projectPath: string,
  stageId: ProductionStageId,
): Promise<void> {
  const missing: string[] = [];
  for (const key of PRODUCTION_INPUTS[stageId]) {
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

function extractJsonFromLlm(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }
  return JSON.parse(text.trim());
}

async function buildVisualPlanContext(
  projectPath: string,
  revisionNotes?: string,
): Promise<PromptContext> {
  const context: PromptContext = { artifacts: {}, revisionNotes };

  const channelRaw = await readArtifact(projectPath, ARTIFACTS.channel);
  const videoRaw = await readArtifact(projectPath, ARTIFACTS.video);
  context.channel = parseYamlFile(channelRaw, ChannelSchema) as Record<string, unknown>;
  context.video = parseYamlFile(videoRaw, VideoSchema) as Record<string, unknown>;

  context.artifacts![ARTIFACTS.finalScript] = await readArtifact(
    projectPath,
    ARTIFACTS.finalScript,
  );
  context.artifacts![ARTIFACTS.narrationSegments] = await readArtifact(
    projectPath,
    ARTIFACTS.narrationSegments,
  );

  const sourceBrief = await readSourceBrief(projectPath);
  if (sourceBrief) context.sourceBrief = sourceBrief;

  return context;
}

async function runVisualPlanStage(
  projectPath: string,
  options: RunProductionOptions,
): Promise<RunProductionResult> {
  await assertProductionInputs(projectPath, 'visual-plan');

  loadEnv();
  const context = await buildVisualPlanContext(projectPath, options.revisionNotes);
  const { system, user } = await buildPrompts('visual-designer', context, projectPath);

  const raw = await complete({
    provider: options.provider,
    model: options.model,
    system,
    user,
  });

  const parsed = ProductionPlanSchema.parse(extractJsonFromLlm(raw));
  const content = JSON.stringify(parsed, null, 2);
  const outputFile = PRODUCTION_STAGE_OUTPUT['visual-plan'];

  await maybeArchiveArtifact(projectPath, outputFile, 'visual-plan');
  await writeArtifact(projectPath, outputFile, content);
  await updateProjectState(projectPath, 'visual-plan');

  return { stageId: 'visual-plan', outputFile, content };
}

async function runRenderAssetsStage(
  projectPath: string,
  options: RunProductionOptions,
): Promise<RunProductionResult> {
  const stageId: ProductionStageId = options.sceneId ? 'render-scene' : 'render-assets';
  await assertProductionInputs(projectPath, stageId);

  const planRaw = await readArtifact(projectPath, ARTIFACTS.productionPlan);
  const plan = ProductionPlanSchema.parse(JSON.parse(planRaw));

  const { manifest, rendered, failed } = await renderAssets(plan, {
    projectRoot: projectPath,
    sceneId: options.sceneId,
  });

  const content = JSON.stringify(manifest, null, 2);
  const outputFile = PRODUCTION_STAGE_OUTPUT[stageId];

  await maybeArchiveArtifact(projectPath, outputFile, stageId);
  await writeArtifact(projectPath, outputFile, content);
  await updateProjectState(projectPath, stageId);

  return { stageId, outputFile, content, rendered, failed };
}

export async function runProductionStage(
  stageId: string,
  options: RunProductionOptions,
): Promise<RunProductionResult> {
  if (!isProductionStage(stageId)) {
    throw new Error(
      `Unknown production stage "${stageId}". Valid: ${PRODUCTION_STAGES.join(', ')}`,
    );
  }

  const projectPath = path.resolve(options.projectPath);
  await openProject(projectPath);

  if (stageId === 'visual-plan') {
    return runVisualPlanStage(projectPath, options);
  }

  if (stageId === 'render-assets') {
    return runRenderAssetsStage(projectPath, options);
  }

  if (stageId === 'render-scene') {
    if (!options.sceneId?.trim()) {
      throw new Error('Stage "render-scene" requires sceneId in options.');
    }
    return runRenderAssetsStage(projectPath, options);
  }

  if (PRODUCTION_LLM_STAGES.has(stageId)) {
    throw new Error(`Production stage "${stageId}" is not wired.`);
  }

  throw new Error(`Unsupported production stage: ${stageId}`);
}
