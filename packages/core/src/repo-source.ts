import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface RepoFileReadOptions {
  repoPath: string;
  relPath: string;
  gitCheckpoint?: string;
}

/** Read a file from a local repo checkout or via `git show TAG:path`. */
export async function readRepoFile(options: RepoFileReadOptions): Promise<string | undefined> {
  const { repoPath, relPath, gitCheckpoint } = options;
  const normalized = relPath.replace(/^\/+/, '');

  if (gitCheckpoint?.trim()) {
    const fromGit = await readGitShow(repoPath, gitCheckpoint.trim(), normalized);
    if (fromGit !== undefined) return fromGit;
  }

  const full = path.join(repoPath, normalized);
  try {
    return await readFile(full, 'utf8');
  } catch {
    return undefined;
  }
}

async function readGitShow(
  repoPath: string,
  ref: string,
  relPath: string,
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'show', `${ref}:${relPath}`],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    return stdout;
  } catch {
    return undefined;
  }
}

export async function gitRefExists(repoPath: string, ref: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', repoPath, 'rev-parse', '--verify', ref], {
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

export function inferLanguageFromPath(relPath: string): string {
  const ext = path.extname(relPath).slice(1).toLowerCase();
  const map: Record<string, string> = {
    py: 'python',
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    json: 'json',
    md: 'markdown',
    sh: 'bash',
    toml: 'toml',
  };
  return map[ext] ?? ext ?? 'text';
}
