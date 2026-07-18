import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import {
  EpisodeCodeBindingSchema,
  type EpisodeCodeBinding,
} from '@ecpe/schemas';
import { ARTIFACTS } from './artifacts.js';
import { gitRefExists } from './repo-source.js';

const MAX_SOURCE_FILE_CHARS = 12_000;

export interface BuildAppReadiness {
  ready: boolean;
  missing: string[];
  buildsApplication: boolean;
  appRepoIssue?: string;
  gitCheckpointIssue?: string;
}

export interface BuildAppEpisodeContext {
  buildsApplication: boolean;
  episodeNumber?: number;
  episodeBinding?: EpisodeCodeBinding;
  episodeCodeAppendix?: string;
  appRepoPath?: string;
}

export interface AppRepoPathStatus {
  configuredPath: string;
  accessible: boolean;
  message?: string;
}

export const APP_REPO_PATH_FIELD = 'app_repo_path';

export function formatAppRepoPathError(configuredPath: string, detail?: string): string {
  const pathLine = configuredPath.trim()
    ? `Configured path: ${configuredPath.trim()}`
    : 'No application repository path is set for this course.';
  const detailLine = detail?.trim() ? `\n${detail.trim()}` : '';
  return (
    `Application repository path is not reachable.\n\n` +
    `${pathLine}${detailLine}\n\n` +
    `Your course folder and completed episodes are **not** modified. ` +
    `Update the local path in course settings (course.yaml → ${APP_REPO_PATH_FIELD}) — ` +
    `for example if you moved or renamed the repository folder.\n\n` +
    `Pipeline stages that need source files cannot run until the path is fixed.`
  );
}

export function resolveAppRepoPath(
  courseAppRepoPath?: string,
  episodeBindingPath?: string,
): string | undefined {
  const fromCourse = courseAppRepoPath?.trim();
  if (fromCourse) return path.resolve(fromCourse);
  const fromEpisode = episodeBindingPath?.trim();
  if (fromEpisode) return path.resolve(fromEpisode);
  return undefined;
}

export async function checkAppRepoPath(repoPath: string | undefined): Promise<AppRepoPathStatus> {
  const configuredPath = repoPath?.trim() ?? '';
  if (!configuredPath) {
    return {
      configuredPath: '',
      accessible: false,
      message:
        'No application repository path configured. Set app_repo_path in course settings.',
    };
  }

  const resolved = path.resolve(configuredPath);
  try {
    await access(resolved, constants.F_OK);
    const s = await stat(resolved);
    if (!s.isDirectory()) {
      return {
        configuredPath: resolved,
        accessible: false,
        message: 'Path exists but is not a directory.',
      };
    }
    let gitHint = '';
    try {
      await access(path.join(resolved, '.git'), constants.F_OK);
    } catch {
      gitHint = ' (no .git folder — git checkpoints may not work until this is a git repo)';
    }
    return {
      configuredPath: resolved,
      accessible: true,
      message: gitHint || undefined,
    };
  } catch {
    return {
      configuredPath: resolved,
      accessible: false,
      message: 'Folder not found or not readable on this machine.',
    };
  }
}

export async function assertAppRepoPathAvailable(
  courseAppRepoPath: string | undefined,
  episodeBindingPath?: string,
): Promise<string> {
  const resolved = resolveAppRepoPath(courseAppRepoPath, episodeBindingPath);
  const status = await checkAppRepoPath(resolved);
  if (!status.accessible) {
    throw new Error(formatAppRepoPathError(status.configuredPath, status.message));
  }
  return status.configuredPath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function episodeCodeFile(episodeRoot: string): string {
  return path.join(episodeRoot, ARTIFACTS.episodeCode);
}

export async function readEpisodeCodeBinding(
  episodeRoot: string,
): Promise<EpisodeCodeBinding | undefined> {
  const filePath = episodeCodeFile(episodeRoot);
  if (!(await fileExists(filePath))) return undefined;
  const raw = await readFile(filePath, 'utf8');
  return EpisodeCodeBindingSchema.parse(JSON.parse(raw));
}

export async function writeEpisodeCodeBinding(
  episodeRoot: string,
  rawJson: string,
): Promise<EpisodeCodeBinding> {
  const parsed = EpisodeCodeBindingSchema.parse(JSON.parse(rawJson));
  const filePath = episodeCodeFile(episodeRoot);
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return parsed;
}

export async function assessEpisodeBuildAppReadiness(
  episodeRoot: string,
  buildsApplication: boolean,
  courseAppRepoPath?: string,
): Promise<BuildAppReadiness> {
  if (!buildsApplication) {
    return { ready: true, missing: [], buildsApplication: false };
  }

  const missing: string[] = [];
  const binding = await readEpisodeCodeBinding(episodeRoot);
  if (!binding) {
    missing.push(ARTIFACTS.episodeCode);
  }

  const repoPath = resolveAppRepoPath(courseAppRepoPath, binding?.repo_path);
  const repoStatus = await checkAppRepoPath(repoPath);
  let appRepoIssue: string | undefined;
  if (!repoStatus.accessible) {
    appRepoIssue = repoStatus.message ?? 'Application repository path is not reachable.';
    missing.push(APP_REPO_PATH_FIELD);
  }

  let gitCheckpointIssue: string | undefined;
  if (binding?.git_checkpoint?.trim() && repoStatus.accessible && repoPath) {
    const ok = await gitRefExists(repoPath, binding.git_checkpoint.trim());
    if (!ok) {
      gitCheckpointIssue =
        `Git checkpoint "${binding.git_checkpoint}" not found in ${repoPath}. ` +
        `Create the tag before running pipeline stages that read source code.`;
      missing.push(`git checkpoint: ${binding.git_checkpoint}`);
    }
  }

  return {
    ready: missing.length === 0,
    missing,
    buildsApplication: true,
    appRepoIssue,
    gitCheckpointIssue,
  };
}

export async function assertEpisodeBuildAppReady(
  episodeRoot: string,
  buildsApplication: boolean,
  courseAppRepoPath?: string,
): Promise<void> {
  const status = await assessEpisodeBuildAppReadiness(
    episodeRoot,
    buildsApplication,
    courseAppRepoPath,
  );
  if (!status.ready) {
    if (status.missing.includes(APP_REPO_PATH_FIELD)) {
      const repoPath = resolveAppRepoPath(
        courseAppRepoPath,
        (await readEpisodeCodeBinding(episodeRoot))?.repo_path,
      );
      throw new Error(formatAppRepoPathError(repoPath ?? '', status.appRepoIssue));
    }
    throw new Error(
      `Build-app episode is not ready for pipeline:\n${status.missing.map((m) => `  - ${m}`).join('\n')}\n` +
        (status.gitCheckpointIssue
          ? `\n${status.gitCheckpointIssue}\n`
          : '') +
        `Ensure episode-code.json exists (auto-generated from demo walkthrough) and git checkpoints are tagged in the app repo.`,
    );
  }
}

async function readRepoSourceSnippet(
  repoPath: string,
  relPath: string,
): Promise<string | undefined> {
  const full = path.join(repoPath, relPath);
  try {
    const content = await readFile(full, 'utf8');
    if (content.length <= MAX_SOURCE_FILE_CHARS) return content;
    return `${content.slice(0, MAX_SOURCE_FILE_CHARS)}\n… [truncated — open repo for full file]`;
  } catch {
    return undefined;
  }
}

export async function formatEpisodeCodeAppendix(
  binding: EpisodeCodeBinding,
  episodeNumber: number,
  repoPath?: string,
  courseRepoUrl?: string,
): Promise<string> {
  const repoUrl = courseRepoUrl?.trim() || binding.repo_url || '(set app_repo_url in course.yaml or repo_url in episode-code.json)';
  const lines: string[] = [
    '## Build-app episode code (mandatory)',
    '',
    'This course uses a **real application repository**. Do not invent application code.',
    '',
    `- Repository: ${repoUrl}`,
    repoPath ? `- Local repo (course): \`${repoPath}\`` : '',
    binding.git_checkpoint ? `- Git checkpoint for this episode: \`${binding.git_checkpoint}\`` : '',
    `- Episode ${episodeNumber}: ${binding.title || '(untitled)'}`,
    `- Has application code this episode: **${binding.has_code ? 'yes' : 'no'}**`,
    '',
  ].filter(Boolean);

  if (binding.new_scope.length > 0) {
    lines.push('### New in this episode (repo paths)', ...binding.new_scope.map((p) => `- \`${p}\``), '');
  }
  if (binding.cumulative_scope.length > 0) {
    lines.push(
      '### Cumulative scope (exists by end of episode)',
      ...binding.cumulative_scope.map((p) => `- \`${p}\``),
      '',
    );
  }
  if (binding.demo?.commands?.length) {
    lines.push('### On-camera demo (use these commands in script)', `Summary: ${binding.demo.summary || '—'}`);
    for (const cmd of binding.demo.commands) {
      lines.push('```bash', cmd, '```');
    }
    lines.push('');
  }
  if (binding.illustrative_allowed.length > 0) {
    lines.push(
      '### Illustrative-only (non-repo examples allowed when noted)',
      ...binding.illustrative_allowed.map((t) => `- ${t}`),
      '',
    );
  } else {
    lines.push(
      '### Illustrative code',
      'Do **not** use made-up application code. Theory examples are fine only when clearly labeled as conceptual, not as project files.',
      '',
    );
  }

  if (binding.script_sources.length > 0) {
    lines.push('### Script / B-roll sources (from repository)');
    const resolvedRepo = repoPath?.trim();
    if (!resolvedRepo) {
      lines.push(
        '_Local repository path not configured — set `app_repo_path` in course settings._',
        '',
      );
    }
    for (const src of binding.script_sources) {
      lines.push(`- \`${src.path}\`${src.purpose ? ` — ${src.purpose}` : ''}`);
      if (src.sections?.length) {
        lines.push(`  Sections: ${src.sections.join(', ')}`);
      }
      if (resolvedRepo) {
        const body = await readRepoSourceSnippet(resolvedRepo, src.path);
        if (body) {
          lines.push('', `\`\`\`${path.extname(src.path).slice(1) || 'text'}`, body, '```', '');
        }
      }
    }
  }

  if (binding.notes.trim()) {
    lines.push('### Notes', binding.notes.trim(), '');
  }

  return lines.join('\n').trim();
}

export async function resolveBuildAppEpisodeContext(
  episodeRoot: string,
  buildsApplication: boolean,
  episodeNumber?: number,
  courseAppRepoPath?: string,
  courseAppRepoUrl?: string,
): Promise<BuildAppEpisodeContext> {
  if (!buildsApplication || episodeNumber == null) {
    return { buildsApplication: false };
  }

  const binding = await readEpisodeCodeBinding(episodeRoot);
  if (!binding) {
    return { buildsApplication: true, episodeNumber };
  }

  const repoPath = resolveAppRepoPath(courseAppRepoPath, binding.repo_path);
  const episodeCodeAppendix = await formatEpisodeCodeAppendix(
    binding,
    episodeNumber,
    repoPath,
    courseAppRepoUrl,
  );

  return {
    buildsApplication: true,
    episodeNumber,
    episodeBinding: binding,
    episodeCodeAppendix,
    appRepoPath: repoPath,
  };
}
