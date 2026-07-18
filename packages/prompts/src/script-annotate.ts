import { episodeWordBudget } from './word-budget.js';

export interface ScriptBlockAudit {
  block: string;
  words: number;
  target?: number;
  max?: number;
  status: 'ok' | 'over' | 'under';
}

export interface ScriptLengthAudit {
  content: string;
  totalWords: number;
  targetWords: number;
  minWords: number;
  maxWords: number;
  status: 'ok' | 'over' | 'under';
  /** Per-topic block breakdown (informational). */
  blocks: ScriptBlockAudit[];
}

export function countNarrationWords(text: string): number {
  const cleaned = text
    .replace(/\*\*[^*]+\*\*/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[^\w\s'-]/g, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function extractNarration(sectionBody: string): string {
  const match = sectionBody.match(
    /\*\*What I Should Say:\*\*\s*\n(?:"([\s\S]*?)"|([\s\S]*?))(?=\n\*\*|\n---|\n## |$)/i,
  );
  if (!match) return '';
  return (match[1] ?? match[2] ?? '').trim();
}

/** Remove any word-count lines the model may have added (saves tokens, always inaccurate). */
export function stripScriptWordCountLines(text: string): string {
  return text
    .replace(/\n\*\*Narration word count[^*]*\*\*/gi, '')
    .replace(/\n\*\*Word count[^*]*\*\*/gi, '')
    .replace(/\nWord count:\s*\d+[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function splitTopicSections(scriptMarkdown: string): string[] {
  // Prefer ## headings; keep legacy ## [M:SS–M:SS] scripts working.
  return scriptMarkdown.split(/(?=^##\s+)/m);
}

/**
 * Audit total narration length against episode band (target −1 / +2 min).
 * Does NOT modify narration text.
 */
export function auditScriptWordCounts(
  scriptMarkdown: string,
  wordsPerMinute: number,
  _sourceBrief?: string,
  targetLengthMinutes?: number,
): { content: string; audits: ScriptBlockAudit[]; length: ScriptLengthAudit } {
  const wpm = wordsPerMinute > 0 ? wordsPerMinute : 133;
  const targetMin = targetLengthMinutes && targetLengthMinutes > 0 ? targetLengthMinutes : 10;
  const budget = episodeWordBudget(targetMin, wpm);
  const cleaned = stripScriptWordCountLines(scriptMarkdown);
  const blocks: ScriptBlockAudit[] = [];
  let totalWords = 0;

  const parts = splitTopicSections(cleaned);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.trim().startsWith('##')) continue;
    const headingEnd = part.indexOf('\n');
    const headingLine = headingEnd >= 0 ? part.slice(0, headingEnd) : part;
    const body = headingEnd >= 0 ? part.slice(headingEnd + 1) : '';

    const narration = extractNarration(body);
    if (!narration) continue;

    const words = countNarrationWords(narration);
    totalWords += words;
    blocks.push({
      block: headingLine.replace(/^##\s*/, '').trim(),
      words,
      status: 'ok',
    });
  }

  // Fallback: whole doc if no What I Should Say blocks parsed
  if (totalWords === 0) {
    totalWords = countNarrationWords(cleaned);
  }

  let status: ScriptLengthAudit['status'] = 'ok';
  if (totalWords > budget.maxWords) status = 'over';
  else if (totalWords < budget.minWords) status = 'under';

  const content = cleaned.endsWith('\n') ? cleaned : `${cleaned}\n`;
  const length: ScriptLengthAudit = {
    content,
    totalWords,
    targetWords: budget.targetWords,
    minWords: budget.minWords,
    maxWords: budget.maxWords,
    status,
    blocks,
  };

  return {
    content,
    audits: [
      {
        block: 'TOTAL',
        words: totalWords,
        target: budget.targetWords,
        max: budget.maxWords,
        status,
      },
      ...blocks,
    ],
    length,
  };
}

/** @deprecated Use auditScriptWordCounts — kept for compatibility. */
export function annotateScriptWordCounts(
  scriptMarkdown: string,
  wordsPerMinute: number,
  sourceBrief?: string,
): string {
  return auditScriptWordCounts(scriptMarkdown, wordsPerMinute, sourceBrief).content;
}
