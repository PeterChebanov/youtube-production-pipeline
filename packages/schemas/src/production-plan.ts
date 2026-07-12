import { z } from 'zod';

export const RENDERER_IDS = [
  'mermaid',
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
  segment_ids: z.array(z.string()).min(1),
  narration_excerpt: z.string(),
  start_timecode: z.string(),
  end_timecode: z.string(),
  duration_sec: z.number().nonnegative(),
  purpose: z.string(),
  visual: z.string(),
  renderer: z.enum(RENDERER_IDS),
  insert_hint: z.string().default(''),
  data: z.record(z.string(), z.unknown()),
});

export type ProductionScene = z.infer<typeof ProductionSceneSchema>;

export const ProductionPlanSchema = z.object({
  version: z.literal(1),
  scenes: z.array(ProductionSceneSchema).min(1),
});

export type ProductionPlan = z.infer<typeof ProductionPlanSchema>;

export const EditManifestEntrySchema = z.object({
  timecode_in: z.string(),
  timecode_out: z.string(),
  duration_sec: z.number().nonnegative(),
  segment_ids: z.array(z.string()),
  narration_excerpt: z.string(),
  asset_path: z.string(),
  renderer: z.string(),
  visual: z.string(),
  status: z.enum(['ok', 'failed', 'skipped']),
  insert_hint: z.string().default(''),
  error: z.string().optional(),
});

export type EditManifestEntry = z.infer<typeof EditManifestEntrySchema>;

export const EditManifestSchema = z.object({
  version: z.literal(1),
  entries: z.array(EditManifestEntrySchema),
});

export type EditManifest = z.infer<typeof EditManifestSchema>;

export function editManifestToCsv(manifest: EditManifest): string {
  const headers = [
    'timecode_in',
    'timecode_out',
    'duration_sec',
    'segment_ids',
    'narration_excerpt',
    'asset_path',
    'renderer',
    'visual',
    'status',
    'insert_hint',
    'error',
  ];
  const rows = manifest.entries.map((e) =>
    [
      e.timecode_in,
      e.timecode_out,
      String(e.duration_sec),
      e.segment_ids.join(';'),
      csvEscape(e.narration_excerpt),
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
