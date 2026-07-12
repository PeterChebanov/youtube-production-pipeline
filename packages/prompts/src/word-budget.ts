export interface SectionWordBudget {
  timeRange: string;
  title: string;
  durationMin: number;
  targetWords: number;
  hardMaxWords: number;
}

function parseClockToMinutes(clock: string): number {
  const [m, s] = clock.trim().split(':').map((part) => Number(part));
  if (!Number.isFinite(m) || !Number.isFinite(s)) return NaN;
  return m + s / 60;
}

/** Parse `[M:SS–M:SS] Title` blocks from creator roadmap or script outline. */
export function parseSectionWordBudgets(
  text: string,
  wordsPerMinute: number,
): SectionWordBudget[] {
  const wpm = wordsPerMinute > 0 ? wordsPerMinute : 133;
  const re = /\[(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})\]\s*([^\n]*)/g;
  const budgets: SectionWordBudget[] = [];

  for (const match of text.matchAll(re)) {
    const start = parseClockToMinutes(match[1]);
    const end = parseClockToMinutes(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const durationMin = Math.round((end - start) * 100) / 100;
    const targetWords = Math.round(durationMin * wpm);
    budgets.push({
      timeRange: `${match[1]}–${match[2]}`,
      title: match[3].trim() || 'Section',
      durationMin,
      targetWords,
      hardMaxWords: targetWords,
    });
  }

  return budgets;
}

export function formatWordBudgetTable(
  budgets: SectionWordBudget[],
  wordsPerMinute: number,
): string {
  if (budgets.length === 0) return '';

  const lines = [
    '| Block | Duration | Target words | Hard max |',
    '| --- | ---: | ---: | ---: |',
  ];

  let totalTarget = 0;
  for (const b of budgets) {
    totalTarget += b.targetWords;
    const label = `${b.title} [${b.timeRange}]`.trim();
    lines.push(`| ${label} | ${b.durationMin} min | ${b.targetWords} | ${b.hardMaxWords} |`);
  }

  const totalMin = budgets.reduce((sum, b) => sum + b.durationMin, 0);
  lines.push('');
  lines.push(
    `**Total narration budget:** ${totalTarget} words (~${Math.round(totalMin * 10) / 10} min @ ${wordsPerMinute} WPM).`,
  );
  lines.push(
    '**Hard rule:** "What I Should Say" per block must not exceed Hard max. Aim for 92–100% of Target. Do not print word counts in the script.',
  );

  return lines.join('\n');
}

export function enrichWordBudgetContext(
  context: {
    sourceBrief?: string;
    video?: Record<string, unknown>;
    wordBudgetTable?: string;
    totalNarrationWords?: number;
  },
): void {
  const wpm = Number(context.video?.words_per_minute) || 133;
  const brief = context.sourceBrief?.trim();
  if (!brief) return;

  const budgets = parseSectionWordBudgets(brief, wpm);
  if (budgets.length === 0) return;

  context.wordBudgetTable = formatWordBudgetTable(budgets, wpm);
  context.totalNarrationWords = budgets.reduce((sum, b) => sum + b.targetWords, 0);
}
