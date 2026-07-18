import type { PromptContext } from '@ecpe/prompts';
import { readEpisodeCodeBinding } from './build-app.js';
import { formatCodeMapAppendix, resolveScriptSourceAnchors } from './code-map.js';
import {
  formatEpisodeAuthoringAppendix,
  readEpisodeAuthoring,
} from './episode-authoring.js';
import { readCourseContextForEpisode } from './course.js';

/** Stages that do not need repo code dumps (length/polish only). */
const SKIP_CODE_APPENDIX = new Set([
  'educational-review',
  'youtube-editor',
  'segment',
  'episode-wrap',
]);

/**
 * Enrich prompt context for course episodes.
 * Application state / prior coverage apply to all courses.
 * Code binding / authoring / code-map apply only when builds_application.
 */
export async function enrichBuildAppPromptContext(
  projectPath: string,
  stageId: string,
  context: PromptContext,
): Promise<void> {
  const courseCtx = await readCourseContextForEpisode(projectPath);
  if (!courseCtx.courseRoot) return;

  if (courseCtx.applicationState) context.applicationState = courseCtx.applicationState;
  if (courseCtx.priorCoverage) context.priorCoverage = courseCtx.priorCoverage;
  if (courseCtx.courseName) context.courseName = courseCtx.courseName;
  if (courseCtx.episodeNumber) context.episodeNumber = courseCtx.episodeNumber;

  if (!courseCtx.buildsApplication) return;

  context.buildsApplication = true;

  if (!SKIP_CODE_APPENDIX.has(stageId) && courseCtx.episodeCodeAppendix) {
    context.episodeCodeAppendix = courseCtx.episodeCodeAppendix;
  }

  const authoring = await readEpisodeAuthoring(projectPath);
  if (authoring) {
    const appendix = formatEpisodeAuthoringAppendix(authoring, stageId);
    if (appendix) context.episodeAuthoringAppendix = appendix;
  }

  if (stageId === 'visual-designer' && courseCtx.appRepoPath) {
    const binding = await readEpisodeCodeBinding(projectPath);
    if (binding && binding.script_sources.length > 0) {
      const resolved = await resolveScriptSourceAnchors(binding, courseCtx.appRepoPath);
      context.codeMapAppendix = formatCodeMapAppendix(resolved);
    }
  }
}
