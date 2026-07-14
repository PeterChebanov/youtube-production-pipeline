import path from 'node:path';
import {
  EditManifestSchema,
  NarrationSegmentsSchema,
  editManifestToCsv,
} from '@ecpe/schemas';
import { ARTIFACTS } from './artifacts.js';
import { openProject, readArtifact, writeArtifact } from './project.js';

function sentenceCovered(
  blockId: string,
  sentenceIndex: number,
  entries: { block_id: string; sentence_start: number; sentence_end: number; status: string }[],
): boolean {
  return entries.some(
    (e) =>
      e.block_id === blockId &&
      e.status === 'ok' &&
      e.sentence_start <= sentenceIndex &&
      e.sentence_end >= sentenceIndex,
  );
}

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

export async function exportMontageGuide(projectPath: string): Promise<string> {
  const root = path.resolve(projectPath);
  await openProject(root);

  const manifest = EditManifestSchema.parse(
    JSON.parse(await readArtifact(root, ARTIFACTS.editManifest)),
  );
  const segments = NarrationSegmentsSchema.parse(
    JSON.parse(await readArtifact(root, ARTIFACTS.narrationSegments)),
  );

  const lines: string[] = [];
  lines.push('# Montage Guide\n');
  lines.push(`Generated: ${new Date().toISOString()}\n`);
  lines.push(
    'Use this guide to match rendered assets to narration. Each block lists sentences (✓ = covered by an asset) and the files to insert in your editor.\n',
  );

  let totalUncovered = 0;

  for (const block of segments.blocks) {
    lines.push(`## ${block.block_id}: ${block.title}\n`);
    lines.push(
      `**Duration:** ~${Math.round(block.estimated_duration_sec)}s · **Words:** ${block.word_count} · **Sentences:** ${block.sentences.length}\n`,
    );
    if (block.on_screen_action) {
      lines.push(`**On screen:** ${block.on_screen_action}\n`);
    }

    lines.push('### Narration\n');
    for (const s of block.sentences) {
      const covered = sentenceCovered(block.block_id, s.index, manifest.entries);
      if (!covered) totalUncovered += 1;
      const marker = covered ? '✓' : '⚠';
      lines.push(`${marker} **[${s.index}]** ${s.text}\n`);
    }

    lines.push('### Assets\n');
    const assets = manifest.entries.filter((e) => e.block_id === block.block_id);
    if (assets.length === 0) {
      lines.push('_No assets assigned to this block_\n');
    } else {
      for (const a of assets) {
        const statusIcon = a.status === 'ok' ? '✓' : '✗';
        lines.push(
          `- ${statusIcon} **Scene ${a.scene_order}** (\`${a.renderer}\`) — sentences **${a.sentence_start}–${a.sentence_end}** (~${a.estimated_hold_sec}s hold)\n`,
        );
        lines.push(`  - **File:** \`${a.asset_path || 'FAILED'}\`\n`);
        lines.push(`  - **Narration span:** _"${a.narration_span}"_\n`);
        if (a.visual) lines.push(`  - **Visual:** ${a.visual}\n`);
        if (a.insert_hint) lines.push(`  - **Insert hint:** ${a.insert_hint}\n`);
        if (a.error) lines.push(`  - **Error:** ${a.error}\n`);
      }
    }
    lines.push('---\n');
  }

  if (totalUncovered > 0) {
    lines.push(`\n> ⚠ **${totalUncovered} sentence(s)** have no matching rendered asset. Re-run visual-plan or render-assets, or cover manually in the editor.\n`);
  } else {
    lines.push('\n> ✓ All sentences are covered by at least one asset.\n');
  }

  const outFile = 'montage-guide.md';
  const content = lines.join('\n');
  await writeArtifact(root, outFile, content);
  return path.join(root, outFile);
}
