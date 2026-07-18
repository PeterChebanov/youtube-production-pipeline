import type { EpisodeCodeBinding } from '@ecpe/schemas';
import type { ProductionPlan, ProductionScene } from '@ecpe/schemas';
import { readRepoFile, inferLanguageFromPath } from './repo-source.js';
import {
  resolveCodeAnchors,
  sliceLines,
  formatAnchorsAppendix,
  type CodeAnchor,
} from './code-anchors.js';

export interface ResolvedSourceFile {
  path: string;
  purpose: string;
  anchors: CodeAnchor[];
  content: string;
}

/** Resolve script_sources to line anchors using repo @ git checkpoint. */
export async function resolveScriptSourceAnchors(
  binding: EpisodeCodeBinding,
  repoPath: string,
): Promise<ResolvedSourceFile[]> {
  const checkpoint = binding.git_checkpoint;
  const resolved: ResolvedSourceFile[] = [];

  for (const src of binding.script_sources) {
    const content = await readRepoFile({
      repoPath,
      relPath: src.path,
      gitCheckpoint: checkpoint,
    });
    if (!content) continue;

    const focusHints =
      src.focus?.length > 0
        ? src.focus
        : [{ focus: 'full' as const, labels: [], label: 'Full file' }];

    const anchors = resolveCodeAnchors(content, src.path, focusHints);
    resolved.push({
      path: src.path,
      purpose: src.purpose,
      anchors,
      content,
    });
  }

  return resolved;
}

export function formatCodeMapAppendix(resolved: ResolvedSourceFile[]): string {
  if (resolved.length === 0) {
    return '## Code map (repository anchors)\n\n_No script_sources resolved — check episode-code.json and app_repo_path._';
  }

  const lines: string[] = [
    '## Code map (repository anchors — mandatory for code scenes)',
    '',
    'Use these **line ranges** for `code` renderer scenes. Do **not** invent code.',
    'Set `data.source_ref`, `data.start_line`, `data.end_line`, `data.filename`, `data.language`, `data.caption`.',
    'Leave `data.code` empty or omit — the pipeline fills it from the repository before render.',
    '',
  ];

  for (const file of resolved) {
    lines.push(formatAnchorsAppendix(file.path, file.anchors, file.purpose));
    lines.push('');
  }

  return lines.join('\n').trim();
}

export interface ResolveProductionCodeOptions {
  repoPath: string;
  gitCheckpoint?: string;
}

/** Fill data.code on code scenes from source_ref + line range before render. */
export async function resolveProductionPlanCode(
  plan: ProductionPlan,
  options: ResolveProductionCodeOptions,
): Promise<{ plan: ProductionPlan; filled: number; skipped: number }> {
  let filled = 0;
  let skipped = 0;

  const scenes: ProductionScene[] = [];
  for (const scene of plan.scenes) {
    const { scene: next, status } = await resolveSceneCode(scene, options);
    scenes.push(next);
    if (status === 'filled') filled++;
    else if (status === 'skipped') skipped++;
  }

  return { plan: { ...plan, scenes }, filled, skipped };
}

async function resolveSceneCode(
  scene: ProductionScene,
  options: ResolveProductionCodeOptions,
): Promise<{ scene: ProductionScene; status: 'unchanged' | 'filled' | 'skipped' }> {
  if (scene.renderer !== 'code') return { scene, status: 'unchanged' };

  const data = { ...scene.data };
  const sourceRef = asString(data.source_ref) ?? asString(data.filename);
  const startLine = asNumber(data.start_line) ?? 1;
  const endLine = asNumber(data.end_line);

  if (!sourceRef) {
    if (typeof data.code === 'string' && data.code.trim()) return { scene, status: 'unchanged' };
    return { scene, status: 'skipped' };
  }

  const content = await readRepoFile({
    repoPath: options.repoPath,
    relPath: sourceRef,
    gitCheckpoint: options.gitCheckpoint,
  });

  if (!content) {
    return { scene, status: 'skipped' };
  }

  const lines = content.split('\n');
  const end = endLine ?? lines.length;
  const slice = sliceLines(content, startLine, end);

  data.code = slice;
  data.language = asString(data.language) ?? inferLanguageFromPath(sourceRef);
  data.filename = asString(data.filename) ?? sourceRef.split('/').pop();
  if (!asString(data.caption)) {
    data.caption = `${sourceRef} (lines ${startLine}–${end})`;
  }

  return { scene: { ...scene, data }, status: 'filled' };
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
