import { z } from 'zod';

export const EpisodeCodeDemoSchema = z.object({
  commands: z.array(z.string()).default([]),
  summary: z.string().default(''),
});

export const EpisodeScriptSourceSchema = z.object({
  path: z.string().min(1),
  purpose: z.string().default(''),
  sections: z.array(z.string()).optional(),
});

export const EpisodeCodeMapEntrySchema = z.object({
  episode: z.number().int().positive(),
  title: z.string().default(''),
  has_code: z.boolean().default(true),
  git_checkpoint: z.string().optional(),
  new_scope: z.array(z.string()).default([]),
  cumulative_scope: z.array(z.string()).default([]),
  demo: EpisodeCodeDemoSchema.optional(),
  script_sources: z.array(EpisodeScriptSourceSchema).default([]),
  illustrative_allowed: z.array(z.string()).default([]),
  notes: z.string().default(''),
});

export type EpisodeCodeMapEntry = z.infer<typeof EpisodeCodeMapEntrySchema>;

/** Per-episode code binding — one file per video in build-app courses. */
export const EpisodeCodeBindingSchema = z.object({
  version: z.literal(1),
  repo_url: z.string().default(''),
  repo_path: z.string().optional(),
  title: z.string().default(''),
  has_code: z.boolean().default(true),
  git_checkpoint: z.string().optional(),
  new_scope: z.array(z.string()).default([]),
  cumulative_scope: z.array(z.string()).default([]),
  demo: EpisodeCodeDemoSchema.optional(),
  script_sources: z.array(EpisodeScriptSourceSchema).default([]),
  illustrative_allowed: z.array(z.string()).default([]),
  notes: z.string().default(''),
});

export type EpisodeCodeBinding = z.infer<typeof EpisodeCodeBindingSchema>;

/** @deprecated Course-level map — use per-episode episode-code.json instead. */
export const EpisodeCodeMapSchema = z.object({
  version: z.literal(1),
  repo_url: z.string().default(''),
  repo_path: z.string().optional(),
  app_verified: z.boolean().default(false),
  verified_at: z.string().optional(),
  episodes: z.array(EpisodeCodeMapEntrySchema).default([]),
});

export type EpisodeCodeMap = z.infer<typeof EpisodeCodeMapSchema>;
