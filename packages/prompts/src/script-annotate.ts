import { parseSectionWordBudgets, type SectionWordBudget } from './word-budget.js';

export interface ScriptBlockAudit {
  block: string;
  words: number;
  target?: number;
  max?: number;
  status: 'ok' | 'over' | 'under';
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

function findBudget(
  headingLine: string,
  budgets: SectionWordBudget[],
): SectionWordBudget | undefined {
  const timeMatch = headingLine.match(/\[(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})\]/);
  if (!timeMatch) return undefined;
  const key = `${timeMatch[1]}–${timeMatch[2]}`;
  return budgets.find(
    (b) => b.timeRange === key || b.timeRange.replace(/-/g, '–') === key,
  );
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

/**
 * Strip model word-count junk and audit narration length per block.
 * Does NOT modify narration text — only reports over/under budget.
 */
export function auditScriptWordCounts(
  scriptMarkdown: string,
  wordsPerMinute: number,
  sourceBrief?: string,
): { content: string; audits: ScriptBlockAudit[] } {
  const wpm = wordsPerMinute > 0 ? wordsPerMinute : 133;
  const budgets = sourceBrief ? parseSectionWordBudgets(sourceBrief, wpm) : [];
  const cleaned = stripScriptWordCountLines(scriptMarkdown);
  const audits: ScriptBlockAudit[] = [];

  const parts = cleaned.split(/(?=^## \[)/m);
  if (parts.length <= 1) {
    return { content: cleaned.endsWith('\n') ? cleaned : `${cleaned}\n`, audits };
  }

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const headingEnd = part.indexOf('\n');
    const headingLine = headingEnd >= 0 ? part.slice(0, headingEnd) : part;
    const body = headingEnd >= 0 ? part.slice(headingEnd + 1) : '';

    const narration = extractNarration(body);
    if (!narration) continue;

    const words = countNarrationWords(narration);
    const budget = findBudget(headingLine, budgets);
    const target = budget?.targetWords;
    const max = budget?.hardMaxWords;

    let status: ScriptBlockAudit['status'] = 'ok';
    if (target != null && max != null && words > max) status = 'over';
    else if (target != null && words < target * 0.85) status = 'under';

    audits.push({
      block: headingLine.replace(/^##\s*/, '').trim(),
      words,
      target,
      max,
      status,
    });
  }

  const content = cleaned.endsWith('\n') ? cleaned : `${cleaned}\n`;
  return { content, audits };
}

/** @deprecated Use auditScriptWordCounts — kept for compatibility, no longer appends counts to script. */
export function annotateScriptWordCounts(
  scriptMarkdown: string,
  wordsPerMinute: number,
  sourceBrief?: string,
): string {
  return auditScriptWordCounts(scriptMarkdown, wordsPerMinute, sourceBrief).content;
}
