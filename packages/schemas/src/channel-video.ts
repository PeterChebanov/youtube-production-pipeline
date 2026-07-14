import { z } from 'zod';

export const VISUAL_THEME_IDS = [
  'dark-blue',
  'warm-dark',
  'orange-white',
  'purple-dark',
  'teal-dark',
  'minimal-light',
] as const;

export const DIAGRAM_PALETTE_IDS = [
  'dark-branded',
  'pastel-complement',
  'high-contrast',
  'light-pro',
] as const;

export const ChannelSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  audience: z.string().default(''),
  tone: z.string().default(''),
  categories: z.array(z.string()).default([]),
  visual_theme: z.enum(VISUAL_THEME_IDS).default('dark-blue'),
  diagram_palette: z.enum(DIAGRAM_PALETTE_IDS).default('dark-branded'),
  /** Fraction of mermaid/excalidraw/ui-cards scenes rendered as animated MP4 (0–1). */
  motion_ratio: z.number().min(0).max(1).default(0),
});

export type Channel = z.infer<typeof ChannelSchema>;

export const NARRATIVE_BALANCES = ['theory-first', 'balanced', 'practice-first'] as const;

export const VideoSchema = z.object({
  title: z.string().min(1),
  topic: z.string().min(1),
  target_length_minutes: z.number().positive().default(10),
  words_per_minute: z.number().positive().default(133),
  notes: z.string().default(''),
  format: z.string().default('educational'),
  /**
   * theory-first — teach concepts from scratch for an unfamiliar viewer.
   * balanced — partial prior knowledge; medium theory + substantial practice.
   * practice-first — prepared viewer; short recap, focus on approaches and results.
   */
  narrative_balance: z.enum(NARRATIVE_BALANCES).default('theory-first'),
  /** Comma-separated topics needing ~10–15 sentences of theory (override). */
  theory_boost: z.string().default(''),
  /** Comma-separated topics needing extra real-world practice/examples (override). */
  practice_boost: z.string().default(''),
  /** single = one-off video; episode = part of a course */
  kind: z.enum(['single', 'episode']).default('single'),
  course_id: z.string().optional(),
  course_root: z.string().optional(),
  episode: z.number().int().positive().optional(),
});

export type Video = z.infer<typeof VideoSchema>;

export const ProjectStateSchema = z.object({
  slug: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  last_completed_stage: z.string().nullable().default(null),
  last_run_id: z.string().nullable().default(null),
  /** SHA-256 of final-script.md content last applied to course application-state */
  episode_wrap_script_hash: z.string().nullable().optional(),
  episode_wrap_at: z.string().nullable().optional(),
});

export type ProjectState = z.infer<typeof ProjectStateSchema>;
