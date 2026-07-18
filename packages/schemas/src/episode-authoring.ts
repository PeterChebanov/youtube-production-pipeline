import { z } from 'zod';

/** Per-episode creator inputs for build-app courses (separate from episode-code.json). */
export const EpisodeAuthoringSchema = z.object({
  /** Paste of one ## EP0N section from demo-by-episodes.md */
  demo_walkthrough_md: z.string().default(''),
  /** Optional override — where research should concentrate this episode */
  research_focus: z.string().default(''),
  /** Optional override — where technical review should concentrate */
  review_focus: z.string().default(''),
});

export type EpisodeAuthoring = z.infer<typeof EpisodeAuthoringSchema>;
