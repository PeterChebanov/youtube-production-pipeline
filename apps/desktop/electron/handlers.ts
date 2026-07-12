import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import {
  ARTIFACTS,
  createProject,
  exportEditManifestCsv,
  getProjectInfo,
  openProject,
  readArtifact,
  reportProgress,
  runKnowledge,
  runPipelineStage,
  runProduction,
  setProgressReporter,
  syncVideoYamlFromRoadmap,
  writeArtifact,
  type RunStageOptions,
} from '@ecpe/core';
import { checkAnthropic, checkOpenAI, DEFAULT_LLM_PROVIDER, getLlmConfig, loadEnv } from '@ecpe/llm';
import { ChannelSchema, VideoSchema, parseYamlFile } from '@ecpe/schemas';
import { stringify as stringifyYaml } from 'yaml';

export interface AppSettings {
  defaultProjectsRoot: string;
  recentProjects: string[];
}

const SETTINGS_DIR = path.join(homedir(), '.ecpe');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

export async function loadSettings(): Promise<AppSettings> {
  const fallback = desktopDefaultProjectsRoot();
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as AppSettings;
    const oldDefault = path.join(homedir(), 'Videos', 'ECPE', 'projects');
    if (!parsed.defaultProjectsRoot || parsed.defaultProjectsRoot === oldDefault) {
      parsed.defaultProjectsRoot = fallback;
    }
    return parsed;
  } catch {
    return { defaultProjectsRoot: fallback, recentProjects: [] };
  }
}

export function desktopDefaultProjectsRoot(): string {
  return path.join(homedir(), 'Desktop', 'ECPE', 'projects');
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
  const parentDir = input.parentDir?.trim() || settings.defaultProjectsRoot;
  const projectName = deriveProjectName(input);
  await ensureDir(parentDir);
  const paths = await createProject(parentDir, projectName, {
    video: {
      title: input.name?.trim() || projectName,
      topic: input.topic?.trim() || 'See source-brief.md',
    },
  });
  if (input.sourceBrief?.trim()) {
    await writeArtifact(paths.root, ARTIFACTS.sourceBrief, input.sourceBrief.trim());
    await syncVideoYamlFromRoadmap(paths.root, input.sourceBrief.trim());
  }
  await touchRecent(paths.root);
  return { root: paths.root };
}

export async function getProjectInfoAction(projectRoot: string) {
  await touchRecent(projectRoot);
  return getProjectInfo(projectRoot);
}

export async function getArtifactAction(projectRoot: string, filename: string) {
  return readArtifact(projectRoot, filename);
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

// re-export for progress typing
export { reportProgress };
