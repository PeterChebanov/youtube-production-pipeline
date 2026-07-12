import { z } from 'zod';

export const ChannelSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  audience: z.string().default(''),
  tone: z.string().default(''),
  categories: z.array(z.string()).default([]),
});

export type Channel = z.infer<typeof ChannelSchema>;

export const VideoSchema = z.object({
  title: z.string().min(1),
  topic: z.string().min(1),
  target_length_minutes: z.number().positive().default(10),
  words_per_minute: z.number().positive().default(150),
  notes: z.string().default(''),
  format: z.string().default('educational'),
});

export type Video = z.infer<typeof VideoSchema>;

export const ProjectStateSchema = z.object({
  slug: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  last_completed_stage: z.string().nullable().default(null),
  last_run_id: z.string().nullable().default(null),
});

export type ProjectState = z.infer<typeof ProjectStateSchema>;
