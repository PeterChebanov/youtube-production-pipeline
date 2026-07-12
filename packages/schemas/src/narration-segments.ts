import { z } from 'zod';

export const NarrationSegmentSchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  heading: z.string(),
  text: z.string(),
  word_count: z.number().int().nonnegative(),
  estimated_duration_sec: z.number().nonnegative(),
  start_sec: z.number().nonnegative(),
  end_sec: z.number().nonnegative(),
  start_timecode: z.string(),
  end_timecode: z.string(),
});

export type NarrationSegment = z.infer<typeof NarrationSegmentSchema>;

export const NarrationSegmentsSchema = z.object({
  version: z.literal(1),
  words_per_minute: z.number().positive(),
  segments: z.array(NarrationSegmentSchema),
});

export type NarrationSegments = z.infer<typeof NarrationSegmentsSchema>;
