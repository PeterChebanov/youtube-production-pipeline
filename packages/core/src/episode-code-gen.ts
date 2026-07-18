import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CourseSchema,
  CourseStateSchema,
  VideoSchema,
  parseYamlFile,
  type EpisodeCodeBinding,
} from '@ecpe/schemas';
import { openCourse } from './course.js';
import { readEpisodeAuthoring } from './episode-authoring.js';
import { generateEpisodeCodeFromDemoSection } from './demo-by-episodes-parser.js';
import { gitRefExists } from './repo-source.js';
import { writeEpisodeCodeBinding } from './build-app.js';

export class GitCheckpointError extends Error {
  constructor(
    message: string,
    readonly checkpoint: string,
    readonly repoPath: string,
  ) {
    super(message);
    this.name = 'GitCheckpointError';
  }
}

/** Prior EP sections from episode-authoring.yaml — used for cumulative_scope on EP02+. */
export async function collectPriorDemoWalkthroughMarkdown(
  courseRoot: string,
  beforeEpisode: number,
): Promise<string> {
  const coursePaths = await openCourse(courseRoot);
  const stateRaw = await readFile(coursePaths.courseStateFile, 'utf8');
  const state = parseYamlFile(stateRaw, CourseStateSchema);

  const sections: string[] = [];
  for (const entry of [...state.episodes].sort((a, b) => a.episode - b.episode)) {
    if (entry.episode >= beforeEpisode) continue;
    const epRoot = path.join(coursePaths.episodesDir, entry.folder);
    const authoring = await readEpisodeAuthoring(epRoot);
    const md = authoring?.demo_walkthrough_md?.trim();
    if (md) sections.push(md);
  }
  return sections.join('\n\n');
}

export async function assertGitCheckpointInRepo(
  repoPath: string,
  checkpoint: string,
): Promise<void> {
  const ref = checkpoint.trim();
  if (!ref) {
    throw new GitCheckpointError(
      'episode-code.json has an empty git_checkpoint.',
      ref,
      repoPath,
    );
  }
  if (!(await gitRefExists(repoPath, ref))) {
    throw new GitCheckpointError(
      `Git checkpoint "${ref}" not found in ${repoPath}. ` +
        `Create the tag (e.g. git tag ${ref}) or fix git_checkpoint before running the pipeline.`,
      ref,
      repoPath,
    );
  }
}

export interface GenerateEpisodeCodeOptions {
  demoWalkthroughMd: string;
  episodeNumber: number;
  repoUrl?: string;
  courseRoot?: string;
  /** When set, skips reading prior episodes from course (e.g. full demo-by-episodes.md paste). */
  allEpisodesMarkdown?: string;
  appRepoPath?: string;
  /** When false, skip git tag check (preview only). Default true. */
  validateGit?: boolean;
  /** Used when paste lacks ## EP0N header. */
  fallbackTitle?: string;
}

export async function generateEpisodeCodeBindingForEpisode(
  options: GenerateEpisodeCodeOptions,
): Promise<EpisodeCodeBinding> {
  const {
    demoWalkthroughMd,
    episodeNumber,
    repoUrl,
    courseRoot,
    allEpisodesMarkdown: allEpisodesOverride,
    appRepoPath,
    validateGit = true,
    fallbackTitle,
  } = options;

  let allEpisodesMarkdown = allEpisodesOverride?.trim() ?? '';
  if (!allEpisodesMarkdown && courseRoot) {
    allEpisodesMarkdown = await collectPriorDemoWalkthroughMarkdown(courseRoot, episodeNumber);
  }

  const binding = generateEpisodeCodeFromDemoSection(demoWalkthroughMd.trim(), episodeNumber, {
    repoUrl,
    allEpisodesMarkdown: allEpisodesMarkdown || undefined,
    fallbackTitle,
  });

  if (validateGit && appRepoPath?.trim()) {
    const checkpoint =
      binding.git_checkpoint?.trim() ??
      `ep${String(episodeNumber).padStart(2, '0')}`;
    await assertGitCheckpointInRepo(appRepoPath.trim(), checkpoint);
  }

  return binding;
}

export async function regenerateEpisodeCodeJson(
  episodeRoot: string,
  options: {
    demoWalkthroughMd?: string;
    validateGit?: boolean;
  } = {},
): Promise<EpisodeCodeBinding> {
  const videoRaw = await readFile(path.join(episodeRoot, 'video.yaml'), 'utf8');
  const video = parseYamlFile(videoRaw, VideoSchema);
  const episodeNumber = video.episode;
  if (!episodeNumber || !video.course_root) {
    throw new Error('Episode video.yaml must include episode number and course_root.');
  }

  const courseRaw = await readFile(path.join(video.course_root, 'course.yaml'), 'utf8');
  const course = parseYamlFile(courseRaw, CourseSchema);
  if (!course.builds_application) {
    throw new Error('Course is not a build-app course — episode-code.json is not used.');
  }

  const demoMd =
    options.demoWalkthroughMd?.trim() ??
    (await readEpisodeAuthoring(episodeRoot))?.demo_walkthrough_md?.trim();
  if (!demoMd) {
    throw new Error(
      'Demo walkthrough is empty — paste the ## EP0N section in Episode authoring before regenerating episode-code.json.',
    );
  }

  const binding = await generateEpisodeCodeBindingForEpisode({
    demoWalkthroughMd: demoMd,
    episodeNumber,
    repoUrl: course.app_repo_url,
    courseRoot: video.course_root,
    appRepoPath: course.app_repo_path,
    validateGit: options.validateGit ?? true,
  });

  await writeEpisodeCodeBinding(episodeRoot, JSON.stringify(binding, null, 2));
  return binding;
}
