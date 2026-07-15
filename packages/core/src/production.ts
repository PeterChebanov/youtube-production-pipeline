import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { jsonrepair } from 'jsonrepair';
import {
  ChannelSchema,
  VideoSchema,
  ProductionPlanSchema,
  EditManifestSchema,
  type ProductionPlan,
  type EditManifestEntry,
  parseYamlFile,
} from '@ecpe/schemas';
import { buildPrompts, type PromptContext } from '@ecpe/prompts';
import { complete, getLlmConfig, loadEnv, type LlmProviderId } from '@ecpe/llm';
import { renderAssets, buildAnimationPlan } from '@ecpe/production-engine';
import { NarrationSegmentsSchema } from '@ecpe/schemas';
import { formatBlocksForPrompt } from '@ecpe/segmentation';
import {
  ARTIFACTS,
  PRODUCTION_STAGES,
  PRODUCTION_STAGE_OUTPUT,
  type ArtifactKey,
  type ProductionStageId,
} from './artifacts.js';
import { maybeArchiveArtifact } from './archive.js';
import { openProject, readArtifact, readSourceBrief, writeArtifact } from './project.js';
import { readCourseContextForEpisode, assertEpisodeBuildAppGate } from './course.js';
import { reportProgress } from './progress.js';
import {
  formatPlanLimitsTable,
  formatValidationFixPrompt,
  validateProductionPlan,
} from './plan-validate.js';
import {
  fixUnescapedQuotesInPlanJson,
  normalizeProductionPlan,
  planLooksTruncated,
} from './plan-normalize.js';
import { updateProjectState } from './stage.js';

const PRODUCTION_LLM_STAGES = new Set<ProductionStageId>(['visual-plan']);

const PRODUCTION_INPUTS: Record<ProductionStageId, ArtifactKey[]> = {
  'visual-plan': ['finalScript', 'narrationSegments', 'channel', 'video'],
  'render-assets': ['productionPlan'],
  'render-scene': ['productionPlan'],
};

export { buildAnimationPlan } from '@ecpe/production-engine';
export type { AnimationPlanStats } from '@ecpe/production-engine';

export interface RunProductionOptions {
  projectPath: string;
  provider?: LlmProviderId;
  model?: string;
  revisionNotes?: string;
  sceneId?: string;
  /** Render only scenes for these renderers (render-assets). */
  renderers?: string[];
  /** Overrides channel.yaml motion_ratio for render-assets (0–1). */
  motionRatio?: number;
}

export interface RunProductionResult {
  stageId: ProductionStageId;
  outputFile: string;
  content: string;
  rendered?: number;
  failed?: number;
  animationStats?: import('@ecpe/production-engine').AnimationPlanStats;
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

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenceOpen = trimmed.match(/^```(?:json)?\s*\n/i);
  if (fenceOpen) {
    const bodyStart = fenceOpen[0].length;
    const fenceClose = trimmed.lastIndexOf('\n```');
    if (fenceClose > bodyStart) {
      return trimmed.slice(bodyStart, fenceClose).trim();
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function extractJsonFromLlm(text: string): unknown {
  const jsonText = fixUnescapedQuotesInPlanJson(extractJsonText(text));
  try {
    return JSON.parse(jsonText);
  } catch {
    return JSON.parse(jsonrepair(jsonText));
  }
}

function parseProductionPlanFromLlm(raw: string): ProductionPlan {
  const data = extractJsonFromLlm(raw);
  const plan = ProductionPlanSchema.parse(data);
  return normalizeProductionPlan(plan);
}

async function saveVisualPlanRaw(projectPath: string, raw: string, label: string): Promise<string> {
  const logsDir = path.join(projectPath, 'logs');
  await mkdir(logsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(logsDir, `visual-plan-raw-${label}-${stamp}.txt`);
  await writeFile(filePath, raw, 'utf8');
  return filePath;
}

const VISUAL_PLAN_MAX_ATTEMPTS = 3;

async function completeVisualPlan(
  projectPath: string,
  options: RunProductionOptions,
): Promise<ProductionPlan> {
  const context = await buildVisualPlanContext(projectPath, options.revisionNotes);
  const segmentsRaw = context.artifacts![ARTIFACTS.narrationSegments];
  const segments = NarrationSegmentsSchema.parse(JSON.parse(segmentsRaw));

  const { system, user: baseUser } = await buildPrompts('visual-designer', context, projectPath);
  loadEnv();
  const visualTimeoutS = getLlmConfig().visualPlanTimeoutS;

  let user = baseUser;
  let lastValidationErrors: string[] = [];

  for (let attempt = 0; attempt < VISUAL_PLAN_MAX_ATTEMPTS; attempt++) {
    reportProgress({
      stage: 'visual-plan',
      message:
        attempt === 0
          ? 'Calling Visual Designer…'
          : `Visual plan retry ${attempt}/${VISUAL_PLAN_MAX_ATTEMPTS - 1}…`,
    });

    const raw = await complete({
      provider: options.provider,
      model: options.model,
      system,
      user,
      maxTokens: 16384,
      timeoutS: visualTimeoutS,
    });

    let plan: ProductionPlan;
    try {
      plan = parseProductionPlanFromLlm(raw);
    } catch (parseErr) {
      const rawPath = await saveVisualPlanRaw(projectPath, raw, `parse-failed-${attempt}`);
      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      reportProgress({
        stage: 'visual-plan',
        message: `JSON parse failed (${errMsg}). Raw: ${rawPath}`,
      });
      if (attempt >= VISUAL_PLAN_MAX_ATTEMPTS - 1) throw parseErr;

      user = `${baseUser}

---
The previous response was invalid JSON (${errMsg}).
Return ONLY corrected valid JSON for production-plan.json version 2.
No markdown fences, no commentary. Fix trailing commas, unclosed strings, and schema fields.`;
      continue;
    }

    const validation = validateProductionPlan(plan, segments);
    if (validation.warnings.length > 0) {
      reportProgress({
        stage: 'visual-plan',
        message: `Plan warnings: ${validation.warnings.slice(0, 3).join('; ')}${validation.warnings.length > 3 ? '…' : ''}`,
      });
    }

    if (validation.ok) {
      reportProgress({
        stage: 'visual-plan',
        message: `Plan OK — ${plan.scenes.length} scenes across ${new Set(plan.scenes.map((s) => s.block_id)).size} blocks`,
      });
      return plan;
    }

    if (planLooksTruncated(plan, segments.blocks.length)) {
      lastValidationErrors = validation.errors;
      const rawPath = await saveVisualPlanRaw(projectPath, raw, `truncated-${attempt}`);
      reportProgress({
        stage: 'visual-plan',
        message: `Plan JSON looks truncated (${plan.scenes.length} scenes, expected all ${segments.blocks.length} blocks). Raw: ${rawPath}`,
      });

      if (attempt >= VISUAL_PLAN_MAX_ATTEMPTS - 1) {
        throw new Error(
          `Production plan JSON was truncated after ${VISUAL_PLAN_MAX_ATTEMPTS} attempts. Escape embedded quotes in narration_span as \\" and return the full plan.`,
        );
      }

      user = `${baseUser}

---
The previous JSON was truncated or invalid (only ${plan.scenes.length} scenes parsed; episode has ${segments.blocks.length} narration blocks).
Return ONLY the complete production-plan.json (version 2) covering every block and every sentence.
Escape embedded double quotes inside strings as \\" (e.g. narration_span).
Use excalidraw data.elements (type "box"), not data.boxes.
No markdown fences.`;
      continue;
    }

    lastValidationErrors = validation.errors;
    const rawPath = await saveVisualPlanRaw(projectPath, raw, `validation-failed-${attempt}`);
    reportProgress({
      stage: 'visual-plan',
      message: `Validation failed (${validation.errors.length} errors). Raw: ${rawPath}`,
    });

    if (attempt >= VISUAL_PLAN_MAX_ATTEMPTS - 1) {
      throw new Error(
        `Production plan validation failed after ${VISUAL_PLAN_MAX_ATTEMPTS} attempts:\n${validation.errors.map((e) => `- ${e}`).join('\n')}`,
      );
    }

    user = `${baseUser}\n\n${formatValidationFixPrompt(validation.errors, validation.warnings)}`;
  }

  throw new Error(
    `Production plan validation failed:\n${lastValidationErrors.map((e) => `- ${e}`).join('\n')}`,
  );
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

  const segmentsRaw = context.artifacts![ARTIFACTS.narrationSegments];
  const segments = NarrationSegmentsSchema.parse(JSON.parse(segmentsRaw));
  context.blocksSummary = formatBlocksForPrompt(segments);
  context.planLimitsTable = formatPlanLimitsTable(segments);

  const sourceBrief = await readSourceBrief(projectPath);
  if (sourceBrief) context.sourceBrief = sourceBrief;

  const courseCtx = await readCourseContextForEpisode(projectPath);
  if (courseCtx.applicationState) context.applicationState = courseCtx.applicationState;
  if (courseCtx.priorCoverage) context.priorCoverage = courseCtx.priorCoverage;
  if (courseCtx.courseName) context.courseName = courseCtx.courseName;
  if (courseCtx.episodeNumber) context.episodeNumber = courseCtx.episodeNumber;
  if (courseCtx.episodeCodeAppendix) context.episodeCodeAppendix = courseCtx.episodeCodeAppendix;

  return context;
}

async function runVisualPlanStage(
  projectPath: string,
  options: RunProductionOptions,
): Promise<RunProductionResult> {
  await assertProductionInputs(projectPath, 'visual-plan');
  await assertEpisodeBuildAppGate(projectPath);

  loadEnv();

  const parsed = await completeVisualPlan(projectPath, options);
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

  const channelRaw = await readArtifact(projectPath, ARTIFACTS.channel);
  const channel = parseYamlFile(channelRaw, ChannelSchema);

  const partialRender = Boolean(options.sceneId?.trim() || options.renderers?.length);
  let previousManifestEntries: EditManifestEntry[] | undefined;
  if (partialRender) {
    try {
      const manifestRaw = await readArtifact(projectPath, ARTIFACTS.editManifest);
      previousManifestEntries = EditManifestSchema.parse(JSON.parse(manifestRaw)).entries;
    } catch {
      previousManifestEntries = undefined;
    }
  }

  const { manifest, rendered, failed, animationStats } = await renderAssets(plan, {
    projectRoot: projectPath,
    sceneId: options.sceneId,
    renderers: options.renderers,
    previousManifestEntries,
    themeId: channel.visual_theme,
    diagramPalette: channel.diagram_palette,
    motionRatio: options.motionRatio ?? 1,
    animationSeed: path.basename(projectPath),
  });

  const content = JSON.stringify(manifest, null, 2);
  const outputFile = PRODUCTION_STAGE_OUTPUT[stageId];

  await maybeArchiveArtifact(projectPath, outputFile, stageId);
  await writeArtifact(projectPath, outputFile, content);
  await updateProjectState(projectPath, stageId);

  return { stageId, outputFile, content, rendered, failed, animationStats };
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

export async function previewMotionPlan(
  projectPath: string,
  motionRatio: number,
): Promise<import('@ecpe/production-engine').AnimationPlanStats> {
  const planRaw = await readArtifact(projectPath, ARTIFACTS.productionPlan);
  const plan = ProductionPlanSchema.parse(JSON.parse(planRaw));
  return buildAnimationPlan(plan.scenes, motionRatio).stats;
}
