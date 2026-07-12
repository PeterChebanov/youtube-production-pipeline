import { mkdir, access, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { loadEnv } from '@ecpe/llm';

export function archiveOnRegenerateEnabled(): boolean {
  loadEnv();
  const v = process.env.ECPE_ARCHIVE_ON_REGENERATE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function maybeArchiveArtifact(
  projectRoot: string,
  filename: string,
  stageId: string,
): Promise<void> {
  if (!archiveOnRegenerateEnabled()) return;

  const filePath = path.join(path.resolve(projectRoot), filename);
  if (!(await exists(filePath))) return;

  const archiveDir = path.join(path.resolve(projectRoot), 'logs', 'archive');
  await mkdir(archiveDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = path.extname(filename) || '.txt';
  const base = path.basename(filename, ext);
  const archiveName = `${stageId}-${base}-${stamp}${ext}`;
  await copyFile(filePath, path.join(archiveDir, archiveName));
}
