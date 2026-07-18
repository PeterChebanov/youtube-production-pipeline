/** Soft episode length band: target −1 min … target +2 min (e.g. 10 → 9–12). */
export const BUDGET_MIN_OFFSET_MINUTES = 1;
export const BUDGET_MAX_OFFSET_MINUTES = 2;

export interface EpisodeWordBudget {
  targetMinutes: number;
  wordsPerMinute: number;
  targetWords: number;
  minWords: number;
  maxWords: number;
}

/** @deprecated Kept for callers that still pass brief clocks; prefer episodeWordBudget. */
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

/** Legacy: parse `[M:SS–M:SS] Title` if present. Prefer topic headers + episode budget. */
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

/** @deprecated Prefer formatEpisodeWordBudget. */
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
  return lines.join('\n');
}

export function episodeWordBudget(
  targetLengthMinutes: number,
  wordsPerMinute: number,
): EpisodeWordBudget {
  const targetMinutes = targetLengthMinutes > 0 ? targetLengthMinutes : 10;
  const wpm = wordsPerMinute > 0 ? wordsPerMinute : 133;
  const targetWords = Math.round(targetMinutes * wpm);
  const minWords = Math.round(Math.max(1, targetMinutes - BUDGET_MIN_OFFSET_MINUTES) * wpm);
  const maxWords = Math.round((targetMinutes + BUDGET_MAX_OFFSET_MINUTES) * wpm);
  return { targetMinutes, wordsPerMinute: wpm, targetWords, minWords, maxWords };
}

export function formatEpisodeWordBudget(budget: EpisodeWordBudget): string {
  return [
    '## Narration length budget (mandatory — total spoken words only)',
    '',
    `- **Target:** ${budget.targetWords} words (~${budget.targetMinutes} min @ ${budget.wordsPerMinute} WPM)`,
    `- **Allowed band:** ${budget.minWords}–${budget.maxWords} words (~${budget.targetMinutes - BUDGET_MIN_OFFSET_MINUTES}–${budget.targetMinutes + BUDGET_MAX_OFFSET_MINUTES} min)`,
    '- Stay inside the band. Prefer cutting repetition/filler before cutting implementation facts or the hero demo.',
    '- Do **not** invent clock timecodes (`[M:SS–M:SS]`). Use topic headers: `## Hook — …`, `## Build — …`, `## Demo — …`, `## Recap — …`.',
    '- Do **not** print word counts in the script.',
  ].join('\n');
}

export function enrichWordBudgetContext(
  context: {
    sourceBrief?: string;
    video?: Record<string, unknown>;
    wordBudgetTable?: string;
    totalNarrationWords?: number;
    minNarrationWords?: number;
    maxNarrationWords?: number;
  },
): void {
  const wpm = Number(context.video?.words_per_minute) || 133;
  const targetMin = Number(context.video?.target_length_minutes) || 10;
  const budget = episodeWordBudget(targetMin, wpm);

  context.totalNarrationWords = budget.targetWords;
  context.minNarrationWords = budget.minWords;
  context.maxNarrationWords = budget.maxWords;
  context.wordBudgetTable = formatEpisodeWordBudget(budget);
}
