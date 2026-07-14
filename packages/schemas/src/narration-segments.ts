import { z } from 'zod';

export const NarrationSentenceSchema = z.object({
  index: z.number().int().positive(),
  text: z.string().min(1),
});

export type NarrationSentence = z.infer<typeof NarrationSentenceSchema>;

export const NarrationBlockSchema = z.object({
  block_id: z.string().min(1),
  order: z.number().int().positive(),
  title: z.string(),
  on_screen_action: z.string().default(''),
  narration_text: z.string(),
  sentences: z.array(NarrationSentenceSchema).min(1),
  word_count: z.number().int().nonnegative(),
  estimated_duration_sec: z.number().nonnegative(),
});

export type NarrationBlock = z.infer<typeof NarrationBlockSchema>;

export const NarrationSegmentsSchema = z.object({
  version: z.literal(2),
  words_per_minute: z.number().positive(),
  blocks: z.array(NarrationBlockSchema).min(1),
});

export type NarrationSegments = z.infer<typeof NarrationSegmentsSchema>;
