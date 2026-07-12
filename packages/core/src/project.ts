import { mkdir, readFile, writeFile, access, cp } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as stringifyYaml } from 'yaml';
import {
  ChannelSchema,
  VideoSchema,
  ProjectStateSchema,
  type Channel,
  type Video,
  type ProjectState,
  parseYamlFile,
} from '@ecpe/schemas';
import { ARTIFACTS, ASSET_DIRS } from './artifacts.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface ProjectPaths {
  root: string;
  slug: string;
  channelYaml: string;
  videoYaml: string;
  promptsDir: string;
  assetsDir: string;
  logsDir: string;
  ecpeDir: string;
  stateFile: string;
}

export interface CreateProjectOptions {
  channel?: Partial<Channel>;
  video?: Partial<Video>;
  copyTemplates?: boolean;
}

export interface ProjectInfo {
  paths: ProjectPaths;
  state: ProjectState;
  channel: Channel;
  video: Video;
  artifacts: Record<string, boolean>;
}

export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (base) return base;
  const hash = Buffer.from(name.trim(), 'utf8').toString('base64url').slice(0, 12);
  return `video-${hash}`;
}

export function resolveProjectPaths(rootDir: string, slug: string): ProjectPaths {
  const root = path.join(rootDir, slug);
  return {
    root,
    slug,
    channelYaml: path.join(root, ARTIFACTS.channel),
    videoYaml: path.join(root, ARTIFACTS.video),
    promptsDir: path.join(root, 'prompts'),
    assetsDir: path.join(root, 'assets'),
    logsDir: path.join(root, 'logs'),
    ecpeDir: path.join(root, '.ecpe'),
    stateFile: path.join(root, '.ecpe', 'state.json'),
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function createProject(
  parentDir: string,
  name: string,
  options: CreateProjectOptions = {},
): Promise<ProjectPaths> {
  const slug = slugify(name);
  if (!slug) {
    throw new Error('Project name must contain at least one alphanumeric character.');
  }

  const paths = resolveProjectPaths(path.resolve(parentDir), slug);
  if (await exists(paths.root)) {
    throw new Error(`Project directory already exists: ${paths.root}`);
  }

  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.promptsDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });
  await mkdir(paths.ecpeDir, { recursive: true });

  for (const dir of ASSET_DIRS) {
    await mkdir(path.join(paths.assetsDir, dir), { recursive: true });
  }

  const now = new Date().toISOString();
  const state: ProjectState = {
    slug,
    created_at: now,
    updated_at: now,
    last_completed_stage: null,
    last_run_id: null,
  };
  await writeFile(paths.stateFile, JSON.stringify(state, null, 2), 'utf8');

  const copyTemplates = options.copyTemplates !== false;

  if (copyTemplates) {
    await cp(path.join(REPO_ROOT, 'templates', ARTIFACTS.channel), paths.channelYaml);
    await cp(path.join(REPO_ROOT, 'templates', ARTIFACTS.video), paths.videoYaml);
  } else {
    const channel = ChannelSchema.parse({
      name: options.channel?.name ?? name,
      ...options.channel,
    });
    const video = VideoSchema.parse({
      title: options.video?.title ?? name,
      topic: options.video?.topic ?? '',
      ...options.video,
    });
    await writeFile(paths.channelYaml, stringifyYaml(channel), 'utf8');
    await writeFile(paths.videoYaml, stringifyYaml(video), 'utf8');
  }

  if (copyTemplates) {
    const videoRaw = await readFile(paths.videoYaml, 'utf8');
    const video = parseYamlFile(videoRaw, VideoSchema);
    video.title = options.video?.title ?? name;
    if (options.video?.topic) video.topic = options.video.topic;
    await writeFile(paths.videoYaml, stringifyYaml(video), 'utf8');
  }

  return paths;
}

export async function openProject(projectRoot: string): Promise<ProjectPaths> {
  const root = path.resolve(projectRoot);
  const slug = path.basename(root);
  const paths = resolveProjectPaths(path.dirname(root), slug);
  paths.root = root;
  paths.channelYaml = path.join(root, ARTIFACTS.channel);
  paths.videoYaml = path.join(root, ARTIFACTS.video);
  paths.promptsDir = path.join(root, 'prompts');
  paths.assetsDir = path.join(root, 'assets');
  paths.logsDir = path.join(root, 'logs');
  paths.ecpeDir = path.join(root, '.ecpe');
  paths.stateFile = path.join(root, '.ecpe', 'state.json');

  if (!(await exists(paths.channelYaml))) {
    throw new Error(`Not a valid ECPE project (missing ${ARTIFACTS.channel}): ${root}`);
  }

  return paths;
}

export async function getProjectInfo(projectRoot: string): Promise<ProjectInfo> {
  const paths = await openProject(projectRoot);
  const [stateRaw, channelRaw, videoRaw] = await Promise.all([
    readFile(paths.stateFile, 'utf8'),
    readFile(paths.channelYaml, 'utf8'),
    readFile(paths.videoYaml, 'utf8'),
  ]);

  const state = ProjectStateSchema.parse(JSON.parse(stateRaw));
  const channel = parseYamlFile(channelRaw, ChannelSchema);
  const video = parseYamlFile(videoRaw, VideoSchema);

  const artifactEntries = await Promise.all(
    Object.entries(ARTIFACTS).map(async ([key, filename]) => [
      key,
      await exists(path.join(paths.root, filename)),
    ]),
  );

  return {
    paths,
    state,
    channel,
    video,
    artifacts: Object.fromEntries(artifactEntries),
  };
}

export async function readArtifact(projectRoot: string, filename: string): Promise<string> {
  const filePath = path.join(path.resolve(projectRoot), filename);
  return readFile(filePath, 'utf8');
}

export async function readSourceBrief(projectRoot: string): Promise<string | undefined> {
  try {
    const raw = await readArtifact(projectRoot, ARTIFACTS.sourceBrief);
    const trimmed = raw.trim();
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}

export async function writeArtifact(
  projectRoot: string,
  filename: string,
  content: string,
): Promise<void> {
  const filePath = path.join(path.resolve(projectRoot), filename);
  await writeFile(filePath, content, 'utf8');
}

export function defaultProjectsRoot(): string {
  const fromEnv = process.env.ECPE_DEFAULT_PROJECTS_ROOT;
  if (fromEnv) {
    return fromEnv.replace(/^~/, process.env.HOME ?? '');
  }
  return path.join(process.env.HOME ?? '', 'Desktop', 'ECPE', 'projects');
}
