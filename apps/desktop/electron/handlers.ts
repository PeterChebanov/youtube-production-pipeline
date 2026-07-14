import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import {
  ARTIFACTS,
  createCourse,
  createEpisode,
  createProject,
  createSingleVideo,
  defaultCoursesRoot,
  defaultSinglesRoot,
  exportEditManifestCsv,
  exportMontageGuide,
  getCourseInfo,
  getProjectInfo,
  openCourse,
  openProject,
  previewMotionPlan,
  readApplicationState,
  readPriorCoverage,
  readArtifact,
  reportProgress,
  runKnowledge,
  runEpisodeWrap,
  runPipelineStage,
  runProduction,
  setProgressReporter,
  syncCourseEpisodeRegistry,
  syncVideoYamlFromRoadmap,
  writeArtifact,
  type RunStageOptions,
} from '@ecpe/core';
import { checkAnthropic, checkOpenAI, DEFAULT_LLM_PROVIDER, getLlmConfig, loadEnv } from '@ecpe/llm';
import { ChannelSchema, VideoSchema, parseYamlFile } from '@ecpe/schemas';
import { stringify as stringifyYaml } from 'yaml';

export interface AppSettings {
  defaultProjectsRoot: string;
  defaultCoursesRoot: string;
  defaultSinglesRoot: string;
  recentProjects: string[];
  recentCourses: string[];
}

const SETTINGS_DIR = path.join(homedir(), '.ecpe');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

export async function loadSettings(): Promise<AppSettings> {
  const fallbackSingles = desktopDefaultSinglesRoot();
  const fallbackCourses = desktopDefaultCoursesRoot();
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const oldDefault = path.join(homedir(), 'Videos', 'ECPE', 'projects');
    const projectsRoot =
      !parsed.defaultProjectsRoot || parsed.defaultProjectsRoot === oldDefault
        ? fallbackSingles
        : parsed.defaultProjectsRoot;
    return {
      defaultProjectsRoot: projectsRoot,
      defaultCoursesRoot: parsed.defaultCoursesRoot || fallbackCourses,
      defaultSinglesRoot: parsed.defaultSinglesRoot || fallbackSingles,
      recentProjects: parsed.recentProjects ?? [],
      recentCourses: parsed.recentCourses ?? [],
    };
  } catch {
    return {
      defaultProjectsRoot: fallbackSingles,
      defaultCoursesRoot: fallbackCourses,
      defaultSinglesRoot: fallbackSingles,
      recentProjects: [],
      recentCourses: [],
    };
  }
}

export function desktopDefaultCoursesRoot(): string {
  return path.join(homedir(), 'Desktop', 'ECPE', 'courses');
}

export function desktopDefaultSinglesRoot(): string {
  return path.join(homedir(), 'Desktop', 'ECPE', 'singles');
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

function deriveProjectName(input: { name?: string; sourceBrief?: string }): string {
  if (input.name?.trim()) return input.name.trim();
  const brief = input.sourceBrief?.trim();
  if (brief) {
    for (const line of brief.split(/\n/)) {
      const trimmed = line.trim().replace(/^#+\s*/, '').replace(/^\*+\s*/, '');
      if (trimmed.length >= 3) return trimmed.slice(0, 80);
    }
  }
  return `video-${new Date().toISOString().slice(0, 10)}`;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await mkdir(SETTINGS_DIR, { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

export async function touchRecent(projectRoot: string): Promise<AppSettings> {
  const settings = await loadSettings();
  const next = [projectRoot, ...settings.recentProjects.filter((p) => p !== projectRoot)].slice(
    0,
    12,
  );
  settings.recentProjects = next;
  await saveSettings(settings);
  return settings;
}

export async function touchRecentCourse(courseRoot: string): Promise<AppSettings> {
  const settings = await loadSettings();
  const next = [courseRoot, ...settings.recentCourses.filter((p) => p !== courseRoot)].slice(0, 12);
  settings.recentCourses = next;
  await saveSettings(settings);
  return settings;
}

export async function createProjectAction(input: {
  name?: string;
  parentDir?: string;
  topic?: string;
  sourceBrief?: string;
}): Promise<{ root: string }> {
  if (!input.name?.trim() && !input.sourceBrief?.trim()) {
    throw new Error('Provide a creator roadmap or a project label.');
  }

  const settings = await loadSettings();
  const parentDir = input.parentDir?.trim() || settings.defaultSinglesRoot;
  const projectName = deriveProjectName(input);
  await ensureDir(parentDir);
  const paths = await createSingleVideo(parentDir, projectName, {
    topic: input.topic?.trim(),
    sourceBrief: input.sourceBrief,
  });
  await touchRecent(paths.root);
  return { root: paths.root };
}

export async function createCourseAction(input: {
  name?: string;
  parentDir?: string;
  topic?: string;
  sourceBrief?: string;
  description?: string;
  type?: 'build-along' | 'theory';
}): Promise<{ courseRoot: string; firstEpisodeRoot?: string }> {
  if (!input.name?.trim() && !input.sourceBrief?.trim()) {
    throw new Error('Provide a course name or a narrative for the first episode.');
  }

  const settings = await loadSettings();
  const parentDir = input.parentDir?.trim() || settings.defaultCoursesRoot;
  const courseName = input.name?.trim() || deriveProjectName(input);
  await ensureDir(parentDir);

  const { paths, firstEpisodeRoot } = await createCourse(parentDir, {
    name: courseName,
    description: input.description,
    type: input.type ?? 'build-along',
    firstEpisodeBrief: input.sourceBrief?.trim(),
    firstEpisodeTitle: input.name?.trim() || courseName,
    firstEpisodeTopic: input.topic?.trim(),
  });

  await touchRecentCourse(paths.root);
  if (firstEpisodeRoot) await touchRecent(firstEpisodeRoot);
  return { courseRoot: paths.root, firstEpisodeRoot };
}

export async function loadCourseAction(courseRoot: string) {
  await openCourse(courseRoot);
  const info = await syncCourseEpisodeRegistry(courseRoot);
  await touchRecentCourse(courseRoot);
  return info;
}

export async function getCourseInfoAction(courseRoot: string) {
  await touchRecentCourse(courseRoot);
  return syncCourseEpisodeRegistry(courseRoot);
}

export async function createEpisodeAction(input: {
  courseRoot: string;
  title: string;
  topic?: string;
  sourceBrief?: string;
}): Promise<{ root: string }> {
  const paths = await createEpisode(input.courseRoot, {
    title: input.title.trim(),
    topic: input.topic?.trim(),
    sourceBrief: input.sourceBrief?.trim(),
  });
  await touchRecent(paths.root);
  await touchRecentCourse(input.courseRoot);
  return { root: paths.root };
}

export async function getApplicationStateAction(courseRoot: string) {
  const content = (await readApplicationState(courseRoot)) ?? '';
  return { content };
}

export async function saveApplicationStateAction(courseRoot: string, content: string) {
  await openCourse(courseRoot);
  await writeArtifact(courseRoot, 'application-state.md', content);
  return { ok: true };
}

export async function getPriorCoverageAction(courseRoot: string) {
  const content = (await readPriorCoverage(courseRoot)) ?? '';
  return { content };
}

export async function savePriorCoverageAction(courseRoot: string, content: string) {
  await openCourse(courseRoot);
  await writeArtifact(courseRoot, 'prior-coverage.md', content);
  return { ok: true };
}

export async function getProjectInfoAction(projectRoot: string) {
  await touchRecent(projectRoot);
  return getProjectInfo(projectRoot);
}

export async function getArtifactAction(projectRoot: string, filename: string) {
  try {
    return await readArtifact(projectRoot, filename);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === 'ENOENT') return '';
    throw err;
  }
}

export async function saveArtifactAction(
  projectRoot: string,
  filename: string,
  content: string,
) {
  await writeArtifact(projectRoot, filename, content);
  return { ok: true };
}

export async function saveChannelVideoAction(
  projectRoot: string,
  channelYaml: string,
  videoYaml: string,
) {
  parseYamlFile(channelYaml, ChannelSchema);
  parseYamlFile(videoYaml, VideoSchema);
  await writeArtifact(projectRoot, 'channel.yaml', channelYaml);
  await writeArtifact(projectRoot, 'video.yaml', videoYaml);
  return { ok: true };
}

export async function runPipelineAction(
  stageId: string,
  options: RunStageOptions & { sceneId?: string },
  onProgress?: (msg: { stage: string; message: string }) => void,
) {
  setProgressReporter(onProgress ? (e) => onProgress(e) : null);
  loadEnv();
  const runOpts: RunStageOptions & { sceneId?: string } = {
    ...options,
    provider: options.provider ?? DEFAULT_LLM_PROVIDER,
  };
  try {
    if (stageId === 'knowledge') {
      const result = await runKnowledge(runOpts);
      await touchRecent(options.projectPath);
      return { ok: true, stages: result.stages.map((s) => s.outputFile) };
    }
    if (stageId === 'production') {
      const result = await runProduction(runOpts);
      await touchRecent(options.projectPath);
      return { ok: true, stages: result.stages.map((s) => s.outputFile) };
    }
    if (stageId === 'episode-wrap') {
      const result = await runEpisodeWrap({ ...runOpts, force: true });
      await touchRecent(options.projectPath);
      if (result.courseRoot) await touchRecentCourse(result.courseRoot);
      return { ok: true, stages: [result.outputFile], courseRoot: result.courseRoot };
    }
    const result = await runPipelineStage(stageId, runOpts);
    await touchRecent(options.projectPath);
    return { ok: true, stages: [result.outputFile] };
  } finally {
    setProgressReporter(null);
  }
}

export async function exportManifestCsvAction(projectRoot: string) {
  const out = await exportEditManifestCsv(projectRoot);
  return { path: out };
}

export async function exportMontageGuideAction(projectRoot: string) {
  const out = await exportMontageGuide(projectRoot);
  return { path: out };
}

export async function llmStatusAction(): Promise<Record<string, string>> {
  try {
    loadEnv();
    const cfg = getLlmConfig();
    const status: Record<string, string> = {};
    status.default_provider = DEFAULT_LLM_PROVIDER;
    if (cfg.anthropicApiKey) {
      const r = await checkAnthropic();
      status.anthropic = r.ok ? 'ok (default)' : `fail: ${r.message}`;
    } else {
      status.anthropic = 'not configured (missing ANTHROPIC_API_KEY in .env)';
    }
    if (cfg.openaiApiKey) {
      const r = await checkOpenAI();
      status.openai = r.ok ? 'ok' : `fail: ${r.message}`;
    } else {
      status.openai = 'not configured (missing OPENAI_API_KEY in .env)';
    }
    return status;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function readChannelVideoYaml(projectRoot: string) {
  const paths = await openProject(projectRoot);
  const [channelRaw, videoRaw] = await Promise.all([
    readFile(paths.channelYaml, 'utf8'),
    readFile(paths.videoYaml, 'utf8'),
  ]);
  return { channelYaml: channelRaw, videoYaml: videoRaw };
}

export async function updateSettingsAction(patch: Partial<AppSettings>) {
  const settings = await loadSettings();
  const next = { ...settings, ...patch };
  await saveSettings(next);
  return next;
}

export function channelVideoToYaml(channel: Record<string, unknown>, video: Record<string, unknown>) {
  return {
    channelYaml: stringifyYaml(ChannelSchema.parse(channel)),
    videoYaml: stringifyYaml(VideoSchema.parse(video)),
  };
}

export async function previewMotionPlanAction(projectRoot: string, motionRatio: number) {
  return previewMotionPlan(projectRoot, motionRatio);
}

// re-export for progress typing
export { reportProgress };
