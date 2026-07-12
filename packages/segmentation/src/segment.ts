import {
  NarrationSegmentsSchema,
  type NarrationSegment,
  type NarrationSegments,
} from '@ecpe/schemas';

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/.test(line.trim());
}

function stripHeading(line: string): string {
  return line.trim().replace(/^#{1,6}\s+/, '').trim();
}

export function segmentScript(
  scriptMarkdown: string,
  wordsPerMinute: number,
): NarrationSegments {
  const wpm = wordsPerMinute > 0 ? wordsPerMinute : 133;
  const lines = scriptMarkdown.split(/\r?\n/);

  let currentHeading = '';
  let paragraphLines: string[] = [];
  const rawSegments: Array<{ heading: string; text: string }> = [];

  const flushParagraph = () => {
    const text = paragraphLines.join('\n').trim();
    paragraphLines = [];
    if (text) {
      rawSegments.push({ heading: currentHeading, text });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    if (isHeadingLine(trimmed)) {
      flushParagraph();
      currentHeading = stripHeading(trimmed);
      continue;
    }
    paragraphLines.push(trimmed);
  }
  flushParagraph();

  let cursorSec = 0;
  const segments: NarrationSegment[] = rawSegments.map((seg, index) => {
    const order = index + 1;
    const wordCount = countWords(seg.text);
    const durationSec = wordCount > 0 ? (wordCount / wpm) * 60 : 0;
    const startSec = cursorSec;
    const endSec = cursorSec + durationSec;
    cursorSec = endSec;

    return {
      id: `seg-${String(order).padStart(3, '0')}`,
      order,
      heading: seg.heading,
      text: seg.text,
      word_count: wordCount,
      estimated_duration_sec: Math.round(durationSec * 10) / 10,
      start_sec: Math.round(startSec * 10) / 10,
      end_sec: Math.round(endSec * 10) / 10,
      start_timecode: formatTimecode(startSec),
      end_timecode: formatTimecode(endSec),
    };
  });

  return NarrationSegmentsSchema.parse({
    version: 1,
    words_per_minute: wpm,
    segments,
  });
}
