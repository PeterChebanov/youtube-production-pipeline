import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeAuthoringSchema, type EpisodeAuthoring } from '@ecpe/schemas';
import { parseYamlFile } from '@ecpe/schemas';
import { stringify as stringifyYaml } from 'yaml';
import { ARTIFACTS } from './artifacts.js';

export function episodeAuthoringFile(episodeRoot: string): string {
  return path.join(episodeRoot, ARTIFACTS.episodeAuthoring);
}

export async function readEpisodeAuthoring(
  episodeRoot: string,
): Promise<EpisodeAuthoring | undefined> {
  const filePath = episodeAuthoringFile(episodeRoot);
  try {
    const raw = await readFile(filePath, 'utf8');
    return parseYamlFile(raw, EpisodeAuthoringSchema);
  } catch {
    return undefined;
  }
}

export async function writeEpisodeAuthoring(
  episodeRoot: string,
  authoring: EpisodeAuthoring,
): Promise<void> {
  const parsed = EpisodeAuthoringSchema.parse(authoring);
  await writeFile(episodeAuthoringFile(episodeRoot), stringifyYaml(parsed), 'utf8');
}

export function formatEpisodeAuthoringAppendix(
  authoring: EpisodeAuthoring,
  stageId?: string,
): string | undefined {
  const parts: string[] = [];

  if (stageId === 'research' && authoring.research_focus.trim()) {
    parts.push(
      '## Creator research focus (mandatory)\n\n' + authoring.research_focus.trim(),
    );
  }

  if (stageId === 'technical-review' && authoring.review_focus.trim()) {
    parts.push(
      '## Creator technical-review focus (mandatory)\n\n' + authoring.review_focus.trim(),
    );
  }

  if (authoring.demo_walkthrough_md.trim()) {
    const header =
      stageId === 'visual-designer'
        ? '## Demo walkthrough + verification (code-map index)'
        : '## Demo walkthrough (implementation index — mandatory for build-app)';
    parts.push(`${header}\n\n${authoring.demo_walkthrough_md.trim()}`);
  }

  if (parts.length === 0) return undefined;
  return parts.join('\n\n---\n\n');
}
