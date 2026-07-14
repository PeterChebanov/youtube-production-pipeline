import { z } from 'zod';

export const RENDERER_IDS = [
  'mermaid',
  'excalidraw',
  'code',
  'terminal',
  'browser',
  'ui-cards',
  'illustration',
  'motion',
] as const;

export type RendererId = (typeof RENDERER_IDS)[number];

export const ProductionSceneSchema = z.object({
  scene_id: z.string().min(1),
  block_id: z.string().min(1),
  scene_order: z.number().int().positive(),
  sentence_start: z.number().int().positive(),
  sentence_end: z.number().int().positive(),
  narration_span: z.string().min(1),
  estimated_hold_sec: z.number().nonnegative(),
  purpose: z.string(),
  visual: z.string(),
  renderer: z.enum(RENDERER_IDS),
  insert_hint: z.string().default(''),
  engagement_tactic: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()),
});

export type ProductionScene = z.infer<typeof ProductionSceneSchema>;

export const ProductionPlanSchema = z.object({
  version: z.literal(2),
  scenes: z.array(ProductionSceneSchema).min(1),
});

export type ProductionPlan = z.infer<typeof ProductionPlanSchema>;

export const EditManifestEntrySchema = z.object({
  block_id: z.string(),
  scene_order: z.number().int().positive(),
  sentence_start: z.number().int().positive(),
  sentence_end: z.number().int().positive(),
  narration_span: z.string(),
  estimated_hold_sec: z.number().nonnegative(),
  asset_path: z.string(),
  /** Final-frame PNG in assets/<renderer>/static/ when MP4 reveal was rendered. */
  static_asset_path: z.string().optional(),
  renderer: z.string(),
  visual: z.string(),
  status: z.enum(['ok', 'failed', 'skipped']),
  insert_hint: z.string().default(''),
  error: z.string().optional(),
});

export type EditManifestEntry = z.infer<typeof EditManifestEntrySchema>;

export const EditManifestSchema = z.object({
  version: z.literal(2),
  entries: z.array(EditManifestEntrySchema),
});

export type EditManifest = z.infer<typeof EditManifestSchema>;

export function editManifestToCsv(manifest: EditManifest): string {
  const headers = [
    'block_id',
    'scene_order',
    'sentence_start',
    'sentence_end',
    'narration_span',
    'estimated_hold_sec',
    'asset_path',
    'renderer',
    'visual',
    'status',
    'insert_hint',
    'error',
  ];
  const rows = manifest.entries.map((e) =>
    [
      e.block_id,
      String(e.scene_order),
      String(e.sentence_start),
      String(e.sentence_end),
      csvEscape(e.narration_span),
      String(e.estimated_hold_sec),
      e.asset_path,
      e.renderer,
      e.visual,
      e.status,
      csvEscape(e.insert_hint),
      csvEscape(e.error ?? ''),
    ].join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
