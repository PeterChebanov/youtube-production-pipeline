import path from 'node:path';
import { EditManifestSchema, editManifestToCsv } from '@ecpe/schemas';
import { ARTIFACTS } from './artifacts.js';
import { openProject, readArtifact, writeArtifact } from './project.js';

export async function exportEditManifestCsv(projectPath: string): Promise<string> {
  const root = path.resolve(projectPath);
  await openProject(root);
  const raw = await readArtifact(root, ARTIFACTS.editManifest);
  const manifest = EditManifestSchema.parse(JSON.parse(raw));
  const csv = editManifestToCsv(manifest);
  const outFile = 'edit-manifest.csv';
  await writeArtifact(root, outFile, csv);
  return path.join(root, outFile);
}
