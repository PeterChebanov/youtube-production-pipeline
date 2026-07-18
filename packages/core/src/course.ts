import { mkdir, readFile, writeFile, access, cp, readdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as stringifyYaml } from 'yaml';
import {
  ChannelSchema,
  CourseSchema,
  CourseStateSchema,
  COURSE_ARTIFACTS,
  VideoSchema,
  parseYamlFile,
  type Course,
  type CourseEpisodeEntry,
  type CourseState,
} from '@ecpe/schemas';
import { ARTIFACTS } from './artifacts.js';
import { createProject, openProject, slugify, writeArtifact, type ProjectPaths } from './project.js';
import { syncVideoYamlFromRoadmap } from './roadmap-meta.js';
import {
  assertEpisodeBuildAppReady,
  checkAppRepoPath,
  resolveBuildAppEpisodeContext,
  writeEpisodeCodeBinding,
  type AppRepoPathStatus,
} from './build-app.js';
import { writeEpisodeAuthoring } from './episode-authoring.js';
import {
  generateEpisodeCodeBindingForEpisode,
  assertGitCheckpointInRepo,
} from './episode-code-gen.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface CoursePaths {
  root: string;
  slug: string;
  courseYaml: string;
  channelYaml: string;
  courseStateFile: string;
  applicationStateFile: string;
  priorCoverageFile: string;
  episodesDir: string;
  promptsDir: string;
  logsDir: string;
  ecpeDir: string;
}

export interface CourseInfo {
  paths: CoursePaths;
  course: Course;
  state: CourseState;
  episodes: CourseEpisodeSummary[];
  hasApplicationState: boolean;
  hasPriorCoverage: boolean;
  /** Build-app: local repo path status (does not mutate course on failure). */
  appRepo?: AppRepoPathStatus;
}

export interface CourseEpisodeSummary extends CourseEpisodeEntry {
  root: string;
  hasEpisodeCode: boolean;
  artifactFlags: {
    finalScript: boolean;
    productionPlan: boolean;
    editManifest: boolean;
  };
}

export interface CreateCourseOptions {
  name: string;
  description?: string;
  type?: Course['type'];
  builds_application?: boolean;
  /** Required when builds_application — local path to application repo on this machine. */
  app_repo_path?: string;
  /** Optional GitHub (or other) URL for viewer-facing instructions. */
  app_repo_url?: string;
  /** If set, creates ep01 with this plan as source-brief */
  firstEpisodeBrief?: string;
  firstEpisodeTitle?: string;
  firstEpisodeTopic?: string;
  /** Required when builds_application and first episode is created */
  firstEpisodeCode?: string;
}

export interface CreateEpisodeOptions {
  title: string;
  topic?: string;
  sourceBrief?: string;
  episodeNumber?: number;
  /** JSON for episode-code.json — required in build-app courses */
  episodeCode?: string;
  demoWalkthroughMd?: string;
  researchFocus?: string;
  reviewFocus?: string;
  /** Written to episode video.yaml; falls back to course.default_narrative_balance then theory-first */
  narrativeBalance?: 'theory-first' | 'balanced' | 'practice-first';
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function defaultCoursesRoot(): string {
  const fromEnv = process.env.ECPE_DEFAULT_COURSES_ROOT;
  if (fromEnv) return fromEnv.replace(/^~/, process.env.HOME ?? '');
  return path.join(process.env.HOME ?? '', 'Desktop', 'ECPE', 'courses');
}

export function defaultSinglesRoot(): string {
  const fromEnv = process.env.ECPE_DEFAULT_SINGLES_ROOT;
  if (fromEnv) return fromEnv.replace(/^~/, process.env.HOME ?? '');
  return path.join(process.env.HOME ?? '', 'Desktop', 'ECPE', 'singles');
}

export function resolveCoursePaths(parentDir: string, slug: string): CoursePaths {
  const root = path.join(path.resolve(parentDir), slug);
  return {
    root,
    slug,
    courseYaml: path.join(root, COURSE_ARTIFACTS.course),
    channelYaml: path.join(root, ARTIFACTS.channel),
    courseStateFile: path.join(root, COURSE_ARTIFACTS.courseState),
    applicationStateFile: path.join(root, COURSE_ARTIFACTS.applicationState),
    priorCoverageFile: path.join(root, COURSE_ARTIFACTS.priorCoverage),
    episodesDir: path.join(root, 'episodes'),
    promptsDir: path.join(root, 'prompts'),
    logsDir: path.join(root, 'logs'),
    ecpeDir: path.join(root, '.ecpe'),
  };
}

function episodeFolderName(episode: number, slug: string): string {
  return `ep${String(episode).padStart(2, '0')}-${slug}`;
}

export async function isCourseRoot(root: string): Promise<boolean> {
  const resolved = path.resolve(root);
  const courseYaml = path.join(resolved, COURSE_ARTIFACTS.course);
  const stateFile = path.join(resolved, COURSE_ARTIFACTS.courseState);
  if (!(await exists(courseYaml)) || !(await exists(stateFile))) return false;
  if (await exists(path.join(resolved, ARTIFACTS.video))) {
    throw new Error(
      'This folder looks like an episode or single video, not a course. Open the parent course folder.',
    );
  }
  return true;
}

export async function openCourse(courseRoot: string): Promise<CoursePaths> {
  const root = path.resolve(courseRoot);
  if (!(await isCourseRoot(root))) {
    throw new Error(
      `Not a valid ECPE course (missing ${COURSE_ARTIFACTS.course} or ${COURSE_ARTIFACTS.courseState}): ${root}`,
    );
  }
  const slug = path.basename(root);
  const paths = resolveCoursePaths(path.dirname(root), slug);
  paths.root = root;
  return paths;
}

async function readCourseState(paths: CoursePaths): Promise<CourseState> {
  const raw = await readFile(paths.courseStateFile, 'utf8');
  return CourseStateSchema.parse(JSON.parse(raw));
}

async function writeCourseState(paths: CoursePaths, state: CourseState): Promise<void> {
  state.updated_at = new Date().toISOString();
  await mkdir(paths.ecpeDir, { recursive: true });
  await writeFile(paths.courseStateFile, JSON.stringify(state, null, 2), 'utf8');
}

function deriveEpisodeSlug(title: string): string {
  return slugify(title).slice(0, 48) || 'episode';
}

async function episodeArtifactFlags(episodeRoot: string): Promise<CourseEpisodeSummary['artifactFlags']> {
  return {
    finalScript: await exists(path.join(episodeRoot, ARTIFACTS.finalScript)),
    productionPlan: await exists(path.join(episodeRoot, ARTIFACTS.productionPlan)),
    editManifest: await exists(path.join(episodeRoot, ARTIFACTS.editManifest)),
  };
}

function deriveEpisodeStatus(flags: CourseEpisodeSummary['artifactFlags']): CourseEpisodeEntry['status'] {
  if (flags.editManifest) return 'done';
  if (flags.finalScript || flags.productionPlan) return 'in_progress';
  return 'planned';
}

export async function createCourse(
  parentDir: string,
  options: CreateCourseOptions,
): Promise<{ paths: CoursePaths; firstEpisodeRoot?: string }> {
  const slug = slugify(options.name);
  if (!slug) throw new Error('Course name must contain at least one alphanumeric character.');

  const paths = resolveCoursePaths(path.resolve(parentDir), slug);
  if (await exists(paths.root)) {
    throw new Error(`Course directory already exists: ${paths.root}`);
  }

  const now = new Date().toISOString();
  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.episodesDir, { recursive: true });
  await mkdir(paths.promptsDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });
  await mkdir(paths.ecpeDir, { recursive: true });

  const course: Course = CourseSchema.parse({
    name: options.name.trim(),
    slug,
    type: options.type ?? 'build-along',
    description: options.description?.trim() ?? '',
    builds_application: options.builds_application ?? false,
    app_repo_path: options.builds_application ? options.app_repo_path?.trim() ?? '' : '',
    app_repo_url: options.app_repo_url?.trim() ?? '',
  });

  if (course.builds_application) {
    if (!course.app_repo_path) {
      throw new Error(
        'Build-app course requires app_repo_path: the absolute local path to your application repository on this machine.',
      );
    }
    const repoStatus = await checkAppRepoPath(course.app_repo_path);
    if (!repoStatus.accessible) {
      throw new Error(
        `Cannot create build-app course: application repository path is not reachable.\n` +
          `Path: ${course.app_repo_path}\n${repoStatus.message ?? ''}`,
      );
    }
    course.app_repo_path = repoStatus.configuredPath;
  }
  await writeFile(paths.courseYaml, stringifyYaml(course), 'utf8');

  const state: CourseState = {
    version: 1,
    slug,
    created_at: now,
    updated_at: now,
    episodes: [],
  };
  await writeCourseState(paths, state);

  await cp(path.join(REPO_ROOT, 'templates', ARTIFACTS.channel), paths.channelYaml);
  await cp(path.join(REPO_ROOT, 'templates', COURSE_ARTIFACTS.applicationState), paths.applicationStateFile);
  await cp(path.join(REPO_ROOT, 'templates', COURSE_ARTIFACTS.priorCoverage), paths.priorCoverageFile);

  const channelRaw = await readFile(paths.channelYaml, 'utf8');
  const channel = parseYamlFile(channelRaw, ChannelSchema);
  channel.name = options.name.trim();
  await writeFile(paths.channelYaml, stringifyYaml(channel), 'utf8');

  let firstEpisodeRoot: string | undefined;
  if (options.firstEpisodeBrief?.trim()) {
    const ep = await createEpisode(paths.root, {
      title: options.firstEpisodeTitle?.trim() || options.name.trim(),
      topic: options.firstEpisodeTopic?.trim() || 'See source-brief.md',
      sourceBrief: options.firstEpisodeBrief.trim(),
      episodeCode: options.firstEpisodeCode?.trim(),
      episodeNumber: 1,
    });
    firstEpisodeRoot = ep.root;
  }

  return { paths, firstEpisodeRoot };
}

export async function createEpisode(
  courseRoot: string,
  options: CreateEpisodeOptions,
): Promise<ProjectPaths> {
  const coursePaths = await openCourse(courseRoot);
  const courseRaw = await readFile(coursePaths.courseYaml, 'utf8');
  const course = parseYamlFile(courseRaw, CourseSchema);
  const state = await readCourseState(coursePaths);
  const episodeNumber =
    options.episodeNumber ??
    (state.episodes.length > 0 ? Math.max(...state.episodes.map((e) => e.episode)) + 1 : 1);

  const epSlug = deriveEpisodeSlug(options.title);
  const folder = episodeFolderName(episodeNumber, epSlug);
  const episodeRoot = path.join(coursePaths.episodesDir, folder);

  if (await exists(episodeRoot)) {
    throw new Error(`Episode folder already exists: ${episodeRoot}`);
  }

  const paths = await createProject(coursePaths.episodesDir, folder, {
    video: {
      title: options.title.trim(),
      topic: options.topic?.trim() || 'See source-brief.md',
      kind: 'episode',
      course_id: state.slug,
      course_root: coursePaths.root,
      episode: episodeNumber,
    },
    copyTemplates: false,
  });

  // Re-copy channel from course (createProject with copyTemplates false still wrote minimal yaml)
  await cp(coursePaths.channelYaml, paths.channelYaml);

  const videoRaw = await readFile(paths.videoYaml, 'utf8');
  const video = parseYamlFile(videoRaw, VideoSchema);
  video.title = options.title.trim();
  video.topic = options.topic?.trim() || video.topic;
  video.kind = 'episode';
  video.course_id = state.slug;
  video.course_root = coursePaths.root;
  video.episode = episodeNumber;
  video.narrative_balance =
    options.narrativeBalance ?? course.default_narrative_balance ?? 'theory-first';
  await writeFile(paths.videoYaml, stringifyYaml(video), 'utf8');

  if (options.sourceBrief?.trim()) {
    await writeArtifact(paths.root, ARTIFACTS.sourceBrief, options.sourceBrief.trim());
    await syncVideoYamlFromRoadmap(paths.root, options.sourceBrief.trim());
  }

  if (course.builds_application) {
    try {
      let episodeCodeJson = options.episodeCode?.trim();

      if (!episodeCodeJson) {
        if (!options.demoWalkthroughMd?.trim()) {
          throw new Error(
            `Build-app episode requires demo walkthrough: paste the ## EP${String(episodeNumber).padStart(2, '0')} — … section from demo-by-episodes.md. ` +
              `episode-code.json will be generated automatically.`,
          );
        }
        const binding = await generateEpisodeCodeBindingForEpisode({
          demoWalkthroughMd: options.demoWalkthroughMd.trim(),
          episodeNumber,
          repoUrl: course.app_repo_url,
          courseRoot: coursePaths.root,
          appRepoPath: course.app_repo_path,
          fallbackTitle: options.title.trim(),
        });
        episodeCodeJson = JSON.stringify(binding, null, 2);
      }

      if (course.app_repo_path?.trim() && episodeCodeJson) {
        const checkpoint = JSON.parse(episodeCodeJson).git_checkpoint as string | undefined;
        if (checkpoint) {
          await assertGitCheckpointInRepo(course.app_repo_path.trim(), checkpoint);
        }
      }

      await writeEpisodeCodeBinding(paths.root, episodeCodeJson);

      const hasAuthoring =
        options.demoWalkthroughMd?.trim() ||
        options.researchFocus?.trim() ||
        options.reviewFocus?.trim();

      if (hasAuthoring) {
        await writeEpisodeAuthoring(paths.root, {
          demo_walkthrough_md: options.demoWalkthroughMd?.trim() ?? '',
          research_focus: options.researchFocus?.trim() ?? '',
          review_focus: options.reviewFocus?.trim() ?? '',
        });
      } else {
        await cp(
          path.join(REPO_ROOT, 'templates', ARTIFACTS.episodeAuthoring),
          path.join(paths.root, ARTIFACTS.episodeAuthoring),
        );
      }
    } catch (err) {
      // Avoid orphan episode folders that block retry ("folder already exists").
      await rm(paths.root, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  const entry: CourseEpisodeEntry = {
    episode: episodeNumber,
    slug: epSlug,
    title: options.title.trim(),
    folder,
    created_at: new Date().toISOString(),
    status: 'planned',
  };
  state.episodes = [...state.episodes, entry].sort((a, b) => a.episode - b.episode);
  await writeCourseState(coursePaths, state);

  return paths;
}

export async function getCourseInfo(courseRoot: string): Promise<CourseInfo> {
  const paths = await openCourse(courseRoot);
  const [courseRaw, state] = await Promise.all([
    readFile(paths.courseYaml, 'utf8'),
    readCourseState(paths),
  ]);
  const course = parseYamlFile(courseRaw, CourseSchema);

  const episodes: CourseEpisodeSummary[] = [];
  for (const entry of state.episodes) {
    const root = path.join(paths.episodesDir, entry.folder);
    const flags = await episodeArtifactFlags(root);
    episodes.push({
      ...entry,
      root,
      hasEpisodeCode: await exists(path.join(root, ARTIFACTS.episodeCode)),
      artifactFlags: flags,
      status: deriveEpisodeStatus(flags),
    });
  }

  return {
    paths,
    course,
    state,
    episodes,
    hasApplicationState: await exists(paths.applicationStateFile),
    hasPriorCoverage: await exists(paths.priorCoverageFile),
    appRepo: course.builds_application
      ? await checkAppRepoPath(course.app_repo_path)
      : undefined,
  };
}

/** Scan episodes/ for folders not yet in course-state (recovery after manual copy). */
export async function syncCourseEpisodeRegistry(courseRoot: string): Promise<CourseInfo> {
  const paths = await openCourse(courseRoot);
  const courseRaw = await readFile(paths.courseYaml, 'utf8');
  const course = parseYamlFile(courseRaw, CourseSchema);
  const state = await readCourseState(paths);
  const known = new Set(state.episodes.map((e) => e.folder));

  let entries = [...state.episodes];
  if (await exists(paths.episodesDir)) {
    const dirs = await readdir(paths.episodesDir, { withFileTypes: true });
    for (const dirent of dirs) {
      if (!dirent.isDirectory()) continue;
      const folder = dirent.name;
      if (known.has(folder)) continue;
      const epRoot = path.join(paths.episodesDir, folder);
      if (!(await exists(path.join(epRoot, ARTIFACTS.channel)))) continue;
      // Failed createEpisode can leave an orphan folder; do not promote incomplete
      // build-app episodes into course-state (Research would then fail on missing episode-code).
      if (course.builds_application && !(await exists(path.join(epRoot, ARTIFACTS.episodeCode)))) {
        continue;
      }
      const m = folder.match(/^ep(\d+)-(.+)$/);
      const episode = m ? Number(m[1]) : entries.length + 1;
      let title = folder;
      try {
        const videoRaw = await readFile(path.join(epRoot, ARTIFACTS.video), 'utf8');
        title = parseYamlFile(videoRaw, VideoSchema).title;
      } catch {
        /* keep folder name */
      }
      entries.push({
        episode,
        slug: m?.[2] ?? folder,
        title,
        folder,
        created_at: new Date().toISOString(),
        status: 'planned',
      });
    }
  }

  entries = entries.sort((a, b) => a.episode - b.episode);
  if (entries.length !== state.episodes.length) {
    state.episodes = entries;
    await writeCourseState(paths, state);
  }

  return getCourseInfo(courseRoot);
}

export async function readPriorCoverage(courseRoot: string): Promise<string | undefined> {
  const paths = await openCourse(courseRoot);
  try {
    const raw = await readFile(paths.priorCoverageFile, 'utf8');
    const trimmed = raw.trim();
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}

export async function readApplicationState(courseRoot: string): Promise<string | undefined> {
  const paths = await openCourse(courseRoot);
  try {
    const raw = await readFile(paths.applicationStateFile, 'utf8');
    const trimmed = raw.trim();
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}

/** Resolve course root from an episode or single project folder. */
export async function resolveCourseRootFromEpisode(episodeRoot: string): Promise<string | undefined> {
  try {
    const paths = await openProject(episodeRoot);
    const videoRaw = await readFile(paths.videoYaml, 'utf8');
    const video = parseYamlFile(videoRaw, VideoSchema);
    if (video.kind !== 'episode' || !video.course_root) return undefined;
    const courseRoot = path.resolve(video.course_root);
    if (await isCourseRoot(courseRoot)) return courseRoot;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function readCourseContextForEpisode(episodeRoot: string): Promise<{
  applicationState?: string;
  priorCoverage?: string;
  courseName?: string;
  episodeNumber?: number;
  buildsApplication?: boolean;
  episodeCodeAppendix?: string;
  courseRoot?: string;
  appRepoPath?: string;
  appRepoUrl?: string;
}> {
  const courseRoot = await resolveCourseRootFromEpisode(episodeRoot);
  if (!courseRoot) return {};

  const info = await getCourseInfo(courseRoot);
  const [applicationState, priorCoverage] = await Promise.all([
    readApplicationState(courseRoot),
    readPriorCoverage(courseRoot),
  ]);
  const paths = await openProject(episodeRoot);
  const videoRaw = await readFile(paths.videoYaml, 'utf8');
  const video = parseYamlFile(videoRaw, VideoSchema);

  const buildCtx = await resolveBuildAppEpisodeContext(
    episodeRoot,
    info.course.builds_application,
    video.episode,
    info.course.app_repo_path,
    info.course.app_repo_url,
  );

  return {
    applicationState,
    priorCoverage,
    courseName: info.course.name,
    episodeNumber: video.episode,
    buildsApplication: buildCtx.buildsApplication,
    episodeCodeAppendix: buildCtx.episodeCodeAppendix,
    courseRoot,
    appRepoPath: buildCtx.appRepoPath,
    appRepoUrl: info.course.app_repo_url,
  };
}

/** Block knowledge / visual-plan when build-app episode has no code binding. */
export async function assertEpisodeBuildAppGate(episodeProjectPath: string): Promise<void> {
  const courseRoot = await resolveCourseRootFromEpisode(episodeProjectPath);
  if (!courseRoot) return;
  const coursePaths = await openCourse(courseRoot);
  const courseRaw = await readFile(coursePaths.courseYaml, 'utf8');
  const course = parseYamlFile(courseRaw, CourseSchema);
  if (!course.builds_application) return;
  await assertEpisodeBuildAppReady(episodeProjectPath, true, course.app_repo_path);
}

/** Update course-level application repo path (e.g. after moving the folder). Does not touch episodes. */
export async function updateCourseAppRepo(
  courseRoot: string,
  appRepoPath: string,
  appRepoUrl?: string,
): Promise<Course> {
  const paths = await openCourse(courseRoot);
  const courseRaw = await readFile(paths.courseYaml, 'utf8');
  const course = parseYamlFile(courseRaw, CourseSchema);

  if (!course.builds_application) {
    throw new Error('This course is not a build-app course.');
  }

  const trimmedPath = appRepoPath.trim();
  if (!trimmedPath) {
    throw new Error('app_repo_path cannot be empty for a build-app course.');
  }

  const repoStatus = await checkAppRepoPath(trimmedPath);
  if (!repoStatus.accessible) {
    throw new Error(
      `Application repository path is not reachable.\nPath: ${trimmedPath}\n${repoStatus.message ?? ''}`,
    );
  }

  course.app_repo_path = repoStatus.configuredPath;
  if (appRepoUrl !== undefined) {
    course.app_repo_url = appRepoUrl.trim();
  }

  await writeFile(paths.courseYaml, stringifyYaml(course), 'utf8');
  return course;
}

export async function createSingleVideo(
  parentDir: string,
  name: string,
  options: { topic?: string; sourceBrief?: string } = {},
): Promise<ProjectPaths> {
  const paths = await createProject(path.resolve(parentDir), name, {
    video: {
      title: name,
      topic: options.topic?.trim() || 'See source-brief.md',
      kind: 'single',
    },
  });

  const videoRaw = await readFile(paths.videoYaml, 'utf8');
  const video = parseYamlFile(videoRaw, VideoSchema);
  video.kind = 'single';
  await writeFile(paths.videoYaml, stringifyYaml(video), 'utf8');

  if (options.sourceBrief?.trim()) {
    await writeArtifact(paths.root, ARTIFACTS.sourceBrief, options.sourceBrief.trim());
    await syncVideoYamlFromRoadmap(paths.root, options.sourceBrief.trim());
  }

  return paths;
}
