import {
  KNOWLEDGE_STAGES,
  PRODUCTION_STAGES,
  type KnowledgeStageId,
  type ProductionStageId,
} from './artifacts.js';
import {
  runProductionStage,
  type RunProductionOptions,
  type RunProductionResult,
} from './production.js';
import { runStage, type RunStageOptions, type RunStageResult } from './stage.js';

import { reportProgress } from './progress.js';

export const KNOWLEDGE_PIPELINE_STAGES: KnowledgeStageId[] = [
  'research',
  'technical-review',
  'script-writer',
  'educational-review',
  'youtube-editor',
  'segment',
];

export const PRODUCTION_PIPELINE_STAGES: ProductionStageId[] = [
  'visual-plan',
  'render-assets',
];

export interface RunKnowledgeResult {
  stages: RunStageResult[];
}

export interface RunProductionPipelineResult {
  stages: RunProductionResult[];
}

export type RunKnowledgeOptions = RunStageOptions;
export type RunProductionPipelineOptions = RunProductionOptions;

export async function runKnowledge(options: RunKnowledgeOptions): Promise<RunKnowledgeResult> {
  const results: RunStageResult[] = [];

  for (const stageId of KNOWLEDGE_PIPELINE_STAGES) {
    reportProgress({ stage: stageId, message: `Running ${stageId}…` });
    results.push(await runStage(stageId, options));
  }

  return { stages: results };
}

export async function runProduction(
  options: RunProductionPipelineOptions,
): Promise<RunProductionPipelineResult> {
  const results: RunProductionResult[] = [];

  for (const stageId of PRODUCTION_PIPELINE_STAGES) {
    reportProgress({ stage: stageId, message: `Running ${stageId}…` });
    results.push(await runProductionStage(stageId, options));
  }

  return { stages: results };
}

export function isKnowledgePipelineCommand(stageId: string): boolean {
  return stageId === 'knowledge';
}

export function isProductionPipelineCommand(stageId: string): boolean {
  return stageId === 'production';
}

export function isPipelineStage(stageId: string): boolean {
  return (
    stageId === 'episode-wrap' ||
    isKnowledgePipelineCommand(stageId) ||
    isProductionPipelineCommand(stageId) ||
    (KNOWLEDGE_STAGES as readonly string[]).includes(stageId) ||
    (PRODUCTION_STAGES as readonly string[]).includes(stageId)
  );
}

export async function runPipelineStage(
  stageId: string,
  options: RunStageOptions & RunProductionOptions,
): Promise<RunStageResult | RunProductionResult> {
  if ((PRODUCTION_STAGES as readonly string[]).includes(stageId)) {
    return runProductionStage(stageId, options);
  }
  return runStage(stageId, options);
}

export { KNOWLEDGE_STAGES, PRODUCTION_STAGES };
