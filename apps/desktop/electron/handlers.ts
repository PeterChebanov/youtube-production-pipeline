import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import {
  createProject,
  defaultProjectsRoot,
  exportEditManifestCsv,
  getProjectInfo,
  openProject,
  readArtifact,
  reportProgress,
  runKnowledge,
  runPipelineStage,
  runProduction,
  setProgressReporter,
  writeArtifact,
  type RunStageOptions,
} from '@ecpe/core';
import { checkAnthropic, checkOpenAI, getLlmConfig, loadEnv } from '@ecpe/llm';
import { ChannelSchema, VideoSchema, parseYamlFile } from '@ecpe/schemas';
import { stringify as stringifyYaml } from 'yaml';

export interface AppSettings {
  defaultProjectsRoot: string;
  recentProjects: string[];
}

const SETTINGS_DIR = path.join(homedir(), '.ecpe');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8');
    return JSON.parse(raw) as AppSettings;
  } catch {
    return { defaultProjectsRoot: defaultProjectsRoot(), recentProjects: [] };
  }
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
  name: string;
  parentDir?: string;
  topic?: string;
}): Promise<{ root: string }> {
  const settings = await loadSettings();
  const parentDir = input.parentDir ?? settings.defaultProjectsRoot;
  const paths = await createProject(parentDir, input.name, {
    video: input.topic ? { topic: input.topic } : undefined,
  });
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
  try {
    if (stageId === 'knowledge') {
      const result = await runKnowledge(options);
      await touchRecent(options.projectPath);
      return { ok: true, stages: result.stages.map((s) => s.outputFile) };
    }
    if (stageId === 'production') {
      const result = await runProduction(options);
      await touchRecent(options.projectPath);
      return { ok: true, stages: result.stages.map((s) => s.outputFile) };
    }
    const result = await runPipelineStage(stageId, options);
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

export async function llmStatusAction() {
  loadEnv();
  const cfg = getLlmConfig();
  const status: Record<string, string> = {};
  if (cfg.openaiApiKey) {
    const r = await checkOpenAI();
    status.openai = r.ok ? 'ok' : `fail: ${r.message}`;
  } else status.openai = 'skip';
  if (cfg.anthropicApiKey) {
    const r = await checkAnthropic();
    status.anthropic = r.ok ? 'ok' : `fail: ${r.message}`;
  } else status.anthropic = 'skip';
  return status;
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
