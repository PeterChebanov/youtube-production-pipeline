/** Canonical artifact filenames inside a project directory. */
export const ARTIFACTS = {
  channel: 'channel.yaml',
  video: 'video.yaml',
  sourceBrief: 'source-brief.md',
  research: 'research.md',
  technicalReview: 'technical-review.md',
  script: 'script.md',
  educationalReview: 'educational-review.md',
  finalScript: 'final-script.md',
  narrationSegments: 'narration-segments.json',
  productionPlan: 'production-plan.json',
  editManifest: 'edit-manifest.json',
} as const;

export type ArtifactKey = keyof typeof ARTIFACTS;

export const ASSET_DIRS = [
  'diagrams',
  'browser',
  'code',
  'terminal',
  'ui-cards',
  'illustrations',
  'motion',
] as const;

export const KNOWLEDGE_STAGES = [
  'research',
  'technical-review',
  'script-writer',
  'educational-review',
  'youtube-editor',
  'segment',
] as const;

export type KnowledgeStageId = (typeof KNOWLEDGE_STAGES)[number];

export const PRODUCTION_STAGES = ['visual-plan', 'render-assets', 'render-scene'] as const;

export type ProductionStageId = (typeof PRODUCTION_STAGES)[number];

export const PIPELINE_STAGE_IDS = [...KNOWLEDGE_STAGES, ...PRODUCTION_STAGES] as const;

export type PipelineStageId = KnowledgeStageId | ProductionStageId;

export const STAGE_OUTPUT: Record<KnowledgeStageId, string> = {
  research: ARTIFACTS.research,
  'technical-review': ARTIFACTS.technicalReview,
  'script-writer': ARTIFACTS.script,
  'educational-review': ARTIFACTS.educationalReview,
  'youtube-editor': ARTIFACTS.finalScript,
  segment: ARTIFACTS.narrationSegments,
};

export const PRODUCTION_STAGE_OUTPUT: Record<ProductionStageId, string> = {
  'visual-plan': ARTIFACTS.productionPlan,
  'render-assets': ARTIFACTS.editManifest,
  'render-scene': ARTIFACTS.editManifest,
};
