import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  EpisodeCodeBindingSchema,
  type EpisodeCodeBinding,
} from '@ecpe/schemas';
import { ARTIFACTS } from './artifacts.js';

const MAX_SOURCE_FILE_CHARS = 12_000;

export interface BuildAppReadiness {
  ready: boolean;
  missing: string[];
  buildsApplication: boolean;
}

export interface BuildAppEpisodeContext {
  buildsApplication: boolean;
  episodeNumber?: number;
  episodeBinding?: EpisodeCodeBinding;
  episodeCodeAppendix?: string;
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
): Promise<BuildAppReadiness> {
  if (!buildsApplication) {
    return { ready: true, missing: [], buildsApplication: false };
  }

  const missing: string[] = [];
  const binding = await readEpisodeCodeBinding(episodeRoot);
  if (!binding) {
    missing.push(ARTIFACTS.episodeCode);
  }

  return {
    ready: missing.length === 0,
    missing,
    buildsApplication: true,
  };
}

export async function assertEpisodeBuildAppReady(
  episodeRoot: string,
  buildsApplication: boolean,
): Promise<void> {
  const status = await assessEpisodeBuildAppReadiness(episodeRoot, buildsApplication);
  if (!status.ready) {
    throw new Error(
      `Build-app episode is not ready for pipeline:\n${status.missing.map((m) => `  - ${m}`).join('\n')}\n` +
        `Add ${ARTIFACTS.episodeCode} when creating the episode (repo paths, demo, script_sources).`,
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
): Promise<string> {
  const lines: string[] = [
    '## Build-app episode code (mandatory)',
    '',
    'This course uses a **real application repository**. Do not invent application code.',
    '',
    `- Repository: ${binding.repo_url || '(set repo_url in episode-code.json)'}`,
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
    const resolvedRepo = repoPath?.trim() || binding.repo_path?.trim();
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
): Promise<BuildAppEpisodeContext> {
  if (!buildsApplication || episodeNumber == null) {
    return { buildsApplication: false };
  }

  const binding = await readEpisodeCodeBinding(episodeRoot);
  if (!binding) {
    return { buildsApplication: true, episodeNumber };
  }

  const repoPath = binding.repo_path?.trim() || undefined;
  const episodeCodeAppendix = await formatEpisodeCodeAppendix(binding, episodeNumber, repoPath);

  return {
    buildsApplication: true,
    episodeNumber,
    episodeBinding: binding,
    episodeCodeAppendix,
  };
}
