import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ChannelSchema,
  VideoSchema,
  ProjectStateSchema,
  COURSE_ARTIFACTS,
  parseYamlFile,
} from '@ecpe/schemas';
import { buildPrompts, type PromptContext } from '@ecpe/prompts';
import { complete, loadEnv, type LlmProviderId } from '@ecpe/llm';
import { ARTIFACTS } from './artifacts.js';
import { maybeArchiveArtifact } from './archive.js';
import {
  getCourseInfo,
  openCourse,
  readApplicationState,
  readPriorCoverage,
  resolveCourseRootFromEpisode,
} from './course.js';
import { openProject, readArtifact, writeArtifact } from './project.js';
import { reportProgress } from './progress.js';

export interface RunEpisodeWrapOptions {
  projectPath: string;
  provider?: LlmProviderId;
  model?: string;
  revisionNotes?: string;
  /** Re-wrap even when final-script hash matches the last wrap */
  force?: boolean;
}

export interface RunEpisodeWrapResult {
  courseRoot: string;
  outputFile: string;
  content: string;
}

export interface AutoEpisodeWrapResult {
  skipped: boolean;
  reason?: 'not_episode' | 'unchanged';
  result?: RunEpisodeWrapResult;
}

interface EpisodeWrapPromptContext extends PromptContext {
  productionPlan?: string;
}

function hashFinalScript(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function fileExists(projectPath: string, filename: string): Promise<boolean> {
  try {
    await readArtifact(projectPath, filename);
    return true;
  } catch {
    return false;
  }
}

async function readWrapScriptHash(projectPath: string): Promise<string | undefined> {
  const paths = await openProject(projectPath);
  try {
    const stateRaw = await readFile(paths.stateFile, 'utf8');
    const state = ProjectStateSchema.parse(JSON.parse(stateRaw));
    return state.episode_wrap_script_hash ?? undefined;
  } catch {
    return undefined;
  }
}

async function saveWrapScriptHash(projectPath: string, scriptHash: string): Promise<void> {
  const paths = await openProject(projectPath);
  const stateRaw = await readFile(paths.stateFile, 'utf8');
  const state = ProjectStateSchema.parse(JSON.parse(stateRaw));
  const now = new Date().toISOString();
  state.updated_at = now;
  state.last_completed_stage = 'episode-wrap';
  state.episode_wrap_script_hash = scriptHash;
  state.episode_wrap_at = now;
  await writeFile(paths.stateFile, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Auto episode-wrap after youtube-editor when final-script content changed.
 * Skips non-episodes and unchanged scripts.
 */
export async function maybeAutoEpisodeWrap(
  options: RunEpisodeWrapOptions,
  finalScriptContent: string,
): Promise<AutoEpisodeWrapResult> {
  const projectPath = path.resolve(options.projectPath);
  const courseRoot = await resolveCourseRootFromEpisode(projectPath);
  if (!courseRoot) {
    return { skipped: true, reason: 'not_episode' };
  }

  const scriptHash = hashFinalScript(finalScriptContent);
  if (!options.force) {
    const lastHash = await readWrapScriptHash(projectPath);
    if (lastHash === scriptHash) {
      reportProgress({
        stage: 'episode-wrap',
        message: 'Skipped — final script unchanged since last wrap',
      });
      return { skipped: true, reason: 'unchanged' };
    }
  }

  const result = await runEpisodeWrap({ ...options, force: options.force });
  return { skipped: false, result };
}

export async function runEpisodeWrap(options: RunEpisodeWrapOptions): Promise<RunEpisodeWrapResult> {
  const projectPath = path.resolve(options.projectPath);
  await openProject(projectPath);

  const courseRoot = await resolveCourseRootFromEpisode(projectPath);
  if (!courseRoot) {
    throw new Error(
      'episode-wrap applies only to course episodes (video.yaml must have kind: episode and course_root).',
    );
  }

  if (!(await fileExists(projectPath, ARTIFACTS.finalScript))) {
    throw new Error(`episode-wrap requires ${ARTIFACTS.finalScript} — run youtube-editor first.`);
  }

  loadEnv();
  reportProgress({ stage: 'episode-wrap', message: 'Building context…' });

  await openCourse(courseRoot);

  const [channelRaw, videoRaw, finalScript, sourceBrief, currentState, courseInfo] =
    await Promise.all([
      readArtifact(projectPath, ARTIFACTS.channel),
      readArtifact(projectPath, ARTIFACTS.video),
      readArtifact(projectPath, ARTIFACTS.finalScript),
      readArtifact(projectPath, ARTIFACTS.sourceBrief).catch(() => ''),
      readApplicationState(courseRoot),
      getCourseInfo(courseRoot),
    ]);

  const channel = parseYamlFile(channelRaw, ChannelSchema);
  const video = parseYamlFile(videoRaw, VideoSchema);

  if (video.kind !== 'episode') {
    throw new Error('episode-wrap requires video.yaml kind: episode.');
  }

  if (!options.force) {
    const scriptHash = hashFinalScript(finalScript);
    const lastHash = await readWrapScriptHash(projectPath);
    if (lastHash === scriptHash) {
      reportProgress({
        stage: 'episode-wrap',
        message: 'Skipped — final script unchanged since last wrap',
      });
      return { courseRoot, outputFile: COURSE_ARTIFACTS.applicationState, content: currentState ?? '' };
    }
  }

  const context: EpisodeWrapPromptContext = {
    channel: channel as Record<string, unknown>,
    video: video as Record<string, unknown>,
    courseName: courseInfo.course.name,
    episodeNumber: video.episode,
    applicationState: currentState ?? '_No prior application state — start a fresh digest._',
    sourceBrief: sourceBrief.trim() || undefined,
    artifacts: {
      [ARTIFACTS.finalScript]: finalScript,
    },
    revisionNotes: options.revisionNotes,
    buildsApplication: courseInfo.course.builds_application,
    priorCoverage: (await readPriorCoverage(courseRoot)) ?? undefined,
  };

  if (await fileExists(projectPath, ARTIFACTS.productionPlan)) {
    context.productionPlan = await readArtifact(projectPath, ARTIFACTS.productionPlan);
  }

  reportProgress({ stage: 'episode-wrap', message: 'Calling LLM…' });
  const { system, user } = await buildPrompts('episode-wrap', context, projectPath);

  let content = await complete({
    provider: options.provider,
    model: options.model,
    system,
    user,
  });

  content = content.trim();
  if (!content.startsWith('#')) {
    content = `# Application state\n\n${content}`;
  }

  const outputFile = COURSE_ARTIFACTS.applicationState;
  await maybeArchiveArtifact(courseRoot, outputFile, 'episode-wrap');

  if (currentState?.trim()) {
    const historyDir = path.join(courseRoot, 'logs', 'application-state-history');
    await mkdir(historyDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const epLabel = video.episode != null ? `ep${String(video.episode).padStart(2, '0')}` : 'ep';
    await writeFile(
      path.join(historyDir, `before-${epLabel}-${stamp}.md`),
      currentState.trimEnd() + '\n',
      'utf8',
    );
  }

  await writeArtifact(courseRoot, outputFile, content);

  const scriptHash = hashFinalScript(finalScript);
  await saveWrapScriptHash(projectPath, scriptHash);

  reportProgress({ stage: 'episode-wrap', message: `Updated ${outputFile} on course` });

  return { courseRoot, outputFile, content };
}
