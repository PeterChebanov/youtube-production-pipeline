import {
  NarrationSegmentsSchema,
  type NarrationBlock,
  type NarrationSegments,
} from '@ecpe/schemas';

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(narration: string): string[] {
  const normalized = narration.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const raw = normalized.split(/(?<=[.!?])\s+(?=[A-Z"“])/);
  const sentences: string[] = [];

  for (const part of raw) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    sentences.push(trimmed);
  }

  return sentences.length > 0 ? sentences : [normalized];
}

/** Next `**Label**` or `**Label:**` header after the current section. */
const NEXT_SECTION_MARKER = /\n\*\*[^*\n]+:?\*\*/;

const NARRATION_LABEL = /\*\*(?:Narration|What I Should Say):?\*\*\s*\n/gi;
const ONSCREEN_LABEL = /\*\*On[- ]screen Action:?\*\*\s*\n/gi;

function extractSectionAt(body: string, matchIndex: number, matchLength: number): string {
  const start = matchIndex + matchLength;
  const rest = body.slice(start);
  const nextMarker = rest.search(NEXT_SECTION_MARKER);
  const section = nextMarker >= 0 ? rest.slice(0, nextMarker) : rest;
  return normalizeWhitespace(section.replace(/^---\s*$/gm, '').trim());
}

/**
 * Collect every "What I Should Say" / Narration section under one ## block.
 * Scripts often alternate On-screen Action + narration per file beat — dropping
 * all but the first silently truncates the episode for visual-plan (~minutes lost).
 */
function extractAllLabeledSections(body: string, label: RegExp): string[] {
  const sections: string[] = [];
  const re = new RegExp(label.source, label.flags.includes('g') ? label.flags : `${label.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const text = extractSectionAt(body, match.index, match[0].length);
    if (text) sections.push(text);
  }
  return sections;
}

function parseBlockBody(body: string): { onScreenAction: string; narration: string } {
  const onScreenParts = extractAllLabeledSections(body, ONSCREEN_LABEL);
  const narrationParts = extractAllLabeledSections(body, NARRATION_LABEL);
  return {
    onScreenAction: onScreenParts.join('\n\n').trim(),
    narration: narrationParts.join('\n\n').trim(),
  };
}

interface RawBlock {
  title: string;
  body: string;
}

function splitScriptBlocks(scriptMarkdown: string): RawBlock[] {
  const lines = scriptMarkdown.split(/\r?\n/);
  const blocks: RawBlock[] = [];
  let current: RawBlock | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (!current) return;
    blocks.push({ title: current.title, body: bodyLines.join('\n') });
    current = null;
    bodyLines = [];
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      flush();
      current = { title: heading[1].trim(), body: '' };
      continue;
    }
    if (current) bodyLines.push(line);
  }
  flush();

  return blocks;
}

export interface SegmentScriptOptions {
  /** From video.yaml — used for a hard length floor so silent truncation cannot slip into visual-plan. */
  targetLengthMinutes?: number;
  /**
   * Fail if segmented duration < this fraction of target (default 0.55).
   * Catches lost "What I Should Say" blocks and scripts that are far under budget.
   */
  minDurationFractionOfTarget?: number;
}

/**
 * Deterministic inventory of every spoken section in the script.
 * Used to prove segment output did not drop narration.
 */
export function inventoryScriptNarration(scriptMarkdown: string): {
  sectionCount: number;
  wordCount: number;
  perHeading: Array<{ title: string; sectionCount: number; wordCount: number }>;
} {
  const rawBlocks = splitScriptBlocks(scriptMarkdown);
  const perHeading: Array<{ title: string; sectionCount: number; wordCount: number }> = [];
  let sectionCount = 0;
  let wordCount = 0;

  for (const raw of rawBlocks) {
    const parts = extractAllLabeledSections(raw.body, NARRATION_LABEL);
    const words = countWords(parts.join('\n\n'));
    if (parts.length === 0) continue;
    sectionCount += parts.length;
    wordCount += words;
    perHeading.push({ title: raw.title, sectionCount: parts.length, wordCount: words });
  }

  return { sectionCount, wordCount, perHeading };
}

/** Fail hard if output words ≠ inventory — never silently drop Say/Narration sections. */
export function assertSegmentationIntegrity(
  scriptMarkdown: string,
  segments: NarrationSegments,
): void {
  const inventory = inventoryScriptNarration(scriptMarkdown);
  const actualWords = segments.blocks.reduce((sum, b) => sum + b.word_count, 0);

  if (inventory.sectionCount === 0) {
    throw new Error(
      'Segmentation integrity: script has no **What I Should Say:** / **Narration:** sections.',
    );
  }

  if (actualWords !== inventory.wordCount) {
    const multi = inventory.perHeading
      .filter((h) => h.sectionCount > 1)
      .map((h) => `  - "## ${h.title}": ${h.sectionCount} Say sections, ${h.wordCount} words`)
      .join('\n');
    throw new Error(
      `Segmentation integrity failed: script has ${inventory.wordCount} spoken words ` +
        `across ${inventory.sectionCount} What I Should Say / Narration section(s), ` +
        `but narration-segments.json only has ${actualWords} words in ${segments.blocks.length} block(s).\n` +
        (multi
          ? `Headings with multiple Say sections:\n${multi}\n`
          : '') +
        'Every **What I Should Say:** / **Narration:** under a ## must be included. Re-run segment after fixing the parser or script labels.',
    );
  }
}

export function segmentScript(
  scriptMarkdown: string,
  wordsPerMinute: number,
  options: SegmentScriptOptions = {},
): NarrationSegments {
  const wpm = wordsPerMinute > 0 ? wordsPerMinute : 133;
  const rawBlocks = splitScriptBlocks(scriptMarkdown);

  const blocks: NarrationBlock[] = [];

  for (let i = 0; i < rawBlocks.length; i++) {
    const raw = rawBlocks[i]!;
    const { onScreenAction, narration } = parseBlockBody(raw.body);
    if (!narration.trim()) continue;

    const sentences = splitSentences(narration).map((text, idx) => ({
      index: idx + 1,
      text,
    }));

    const wordCount = countWords(narration);
    const durationSec = wordCount > 0 ? (wordCount / wpm) * 60 : 0;
    const order = blocks.length + 1;

    blocks.push({
      block_id: `block-${String(order).padStart(3, '0')}`,
      order,
      title: raw.title,
      on_screen_action: onScreenAction,
      narration_text: narration,
      sentences,
      word_count: wordCount,
      estimated_duration_sec: Math.round(durationSec * 10) / 10,
    });
  }

  if (blocks.length === 0) {
    throw new Error(
      'No narration blocks found in script (expected ## headings with **Narration:** or **What I Should Say:** sections).',
    );
  }

  const segments = NarrationSegmentsSchema.parse({
    version: 2,
    words_per_minute: wpm,
    blocks,
  });

  assertSegmentationIntegrity(scriptMarkdown, segments);

  const targetMin = options.targetLengthMinutes;
  if (targetMin && targetMin > 0) {
    const fraction = options.minDurationFractionOfTarget ?? 0.55;
    const totalSec = segments.blocks.reduce((s, b) => s + b.estimated_duration_sec, 0);
    const floorSec = targetMin * 60 * fraction;
    if (totalSec < floorSec) {
      const inventory = inventoryScriptNarration(scriptMarkdown);
      throw new Error(
        `Segmentation too short for target length: ~${(totalSec / 60).toFixed(1)} min of narration ` +
          `vs target ${targetMin} min (floor ${(fraction * 100).toFixed(0)}% = ${(floorSec / 60).toFixed(1)} min). ` +
          `Script inventory: ${inventory.sectionCount} Say/Narration section(s), ${inventory.wordCount} words. ` +
          `Expand the script or fix lost narration before visual-plan.`,
      );
    }
  }

  return segments;
}

/** Human-readable summary for Visual Designer prompts. */
export function formatBlocksForPrompt(segments: NarrationSegments): string {
  const lines: string[] = [
    '| Block | Sentences | Words | Est. duration | On-screen |',
    '| --- | ---: | ---: | ---: | --- |',
  ];

  for (const block of segments.blocks) {
    const mins = Math.round((block.estimated_duration_sec / 60) * 10) / 10;
    const onScreen = block.on_screen_action
      ? block.on_screen_action.replace(/\s+/g, ' ').slice(0, 80)
      : '—';
    lines.push(
      `| ${block.block_id}: ${block.title} | ${block.sentences.length} | ${block.word_count} | ~${mins} min | ${onScreen} |`,
    );
  }

  lines.push('');
  lines.push('### Block details (sentence index → text)');
  for (const block of segments.blocks) {
    lines.push('');
    lines.push(`#### ${block.block_id} — ${block.title}`);
    if (block.on_screen_action) {
      lines.push(`**On-screen Action:** ${block.on_screen_action}`);
    }
    lines.push(
      `**Estimated read time:** ~${Math.round((block.estimated_duration_sec / 60) * 10) / 10} min @ ${segments.words_per_minute} WPM`,
    );
    lines.push('');
    for (const sentence of block.sentences) {
      lines.push(`${sentence.index}. ${sentence.text}`);
    }
  }

  return lines.join('\n');
}
