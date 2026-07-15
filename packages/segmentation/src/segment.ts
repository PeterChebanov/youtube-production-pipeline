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

function extractSection(body: string, label: RegExp): string {
  const match = body.match(label);
  if (!match || match.index === undefined) return '';
  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const nextMarker = rest.search(NEXT_SECTION_MARKER);
  const section = nextMarker >= 0 ? rest.slice(0, nextMarker) : rest;
  return normalizeWhitespace(section.replace(/^---\s*$/gm, '').trim());
}

function parseBlockBody(body: string): { onScreenAction: string; narration: string } {
  const onScreenAction = extractSection(
    body,
    /\*\*On[- ]screen Action:?\*\*\s*\n/i,
  );
  const narration = extractSection(
    body,
    /\*\*(?:Narration|What I Should Say):?\*\*\s*\n/i,
  );
  return { onScreenAction, narration };
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

export function segmentScript(
  scriptMarkdown: string,
  wordsPerMinute: number,
): NarrationSegments {
  const wpm = wordsPerMinute > 0 ? wordsPerMinute : 133;
  const rawBlocks = splitScriptBlocks(scriptMarkdown);

  const blocks: NarrationBlock[] = [];

  for (let i = 0; i < rawBlocks.length; i++) {
    const raw = rawBlocks[i];
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

  return NarrationSegmentsSchema.parse({
    version: 2,
    words_per_minute: wpm,
    blocks,
  });
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
    lines.push(`**Estimated read time:** ~${Math.round((block.estimated_duration_sec / 60) * 10) / 10} min @ ${segments.words_per_minute} WPM`);
    lines.push('');
    for (const sentence of block.sentences) {
      lines.push(`${sentence.index}. ${sentence.text}`);
    }
  }

  return lines.join('\n');
}
