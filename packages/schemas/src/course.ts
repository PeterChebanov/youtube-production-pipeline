import { z } from 'zod';
import { NARRATIVE_BALANCES } from './channel-video.js';

export const COURSE_TYPES = ['build-along', 'theory'] as const;

export const CourseSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  type: z.enum(COURSE_TYPES).default('build-along'),
  description: z.string().default(''),
  episodes_dir: z.string().default('episodes'),
  /** When true: each episode requires episode-code.json; scripts use real repo code only. */
  builds_application: z.boolean().default(false),
  /** Local absolute path to the application repo on this machine (build-app courses). */
  app_repo_path: z.string().default(''),
  /** Optional remote URL shown to viewers (GitHub, etc.). */
  app_repo_url: z.string().default(''),
  /**
   * Default narrative_balance for new episodes (especially build-app).
   * Per-episode video.yaml still wins after create.
   */
  default_narrative_balance: z.enum(NARRATIVE_BALANCES).optional(),
});

export type Course = z.infer<typeof CourseSchema>;

export const CourseEpisodeEntrySchema = z.object({
  episode: z.number().int().positive(),
  slug: z.string().min(1),
  title: z.string().min(1),
  folder: z.string().min(1),
  created_at: z.string(),
  status: z.enum(['planned', 'in_progress', 'done']).default('planned'),
});

export type CourseEpisodeEntry = z.infer<typeof CourseEpisodeEntrySchema>;

export const CourseStateSchema = z.object({
  version: z.literal(1),
  slug: z.string().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  episodes: z.array(CourseEpisodeEntrySchema).default([]),
});

export type CourseState = z.infer<typeof CourseStateSchema>;

export const COURSE_ARTIFACTS = {
  course: 'course.yaml',
  courseState: '.ecpe/course-state.json',
  applicationState: 'application-state.md',
  priorCoverage: 'prior-coverage.md',
} as const;
