import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EpisodeAuthoringSchema, type EpisodeAuthoring } from '@ecpe/schemas';
import { parseYamlFile } from '@ecpe/schemas';
import { stringify as stringifyYaml } from 'yaml';
import { ARTIFACTS } from './artifacts.js';
import { compressDemoWalkthroughForPrompt } from './walkthrough-compress.js';

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

const STAGES_SKIP_WALKTHROUGH = new Set([
  'educational-review',
  'youtube-editor',
  'segment',
]);

/** Stages that need fuller verification detail for on-camera planning. */
const STAGES_FULLER_WALKTHROUGH = new Set(['visual-designer']);

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

  if (authoring.demo_walkthrough_md.trim() && (!stageId || !STAGES_SKIP_WALKTHROUGH.has(stageId))) {
    const maxChars = stageId && STAGES_FULLER_WALKTHROUGH.has(stageId) ? 10_000 : 7_500;
    const skeleton = compressDemoWalkthroughForPrompt(
      authoring.demo_walkthrough_md.trim(),
      maxChars,
    );
    const header =
      stageId === 'visual-designer'
        ? '## Demo walkthrough skeleton + verification (code-map index)'
        : '## Demo walkthrough skeleton (implementation spine — mandatory for build-app)';
    parts.push(`${header}\n\n${skeleton}`);
  }

  if (parts.length === 0) return undefined;
  return parts.join('\n\n---\n\n');
}
