import { NARRATIVE_BALANCES, type Video } from '@ecpe/schemas';

export type NarrativeBalance = (typeof NARRATIVE_BALANCES)[number];

export function parseBoostList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function readNarrativeFromVideo(video: Record<string, unknown> | undefined): {
  balance: NarrativeBalance;
  theoryBoost: string[];
  practiceBoost: string[];
} {
  const balanceRaw = String(video?.narrative_balance ?? 'theory-first');
  const balance = (NARRATIVE_BALANCES as readonly string[]).includes(balanceRaw)
    ? (balanceRaw as NarrativeBalance)
    : 'theory-first';
  return {
    balance,
    theoryBoost: parseBoostList(String(video?.theory_boost ?? '')),
    practiceBoost: parseBoostList(String(video?.practice_boost ?? '')),
  };
}

function formatBoostList(topics: string[]): string {
  if (topics.length === 0) return '(none)';
  return topics.map((t) => `- **${t}**`).join('\n');
}

function modeInstructions(balance: NarrativeBalance): string {
  switch (balance) {
    case 'theory-first':
      return `### Default posture: theory-first
- Assume the viewer is **not familiar** with core terminology in this video.
- Teach mental models, terminology, and misconceptions before leaning on implementation detail.
- Use **real-world** illustrative examples (not vacuum demos). Calibrate complexity to the episode topic and stage in the series — examples may be simple or advanced as the roadmap requires.
- Use \`practice_boost\` topics (if any) for **extra** hands-on examples and applied scenarios on those subjects.
- **Research depth:** full Must Know expansion (up to default word limits).`;
    case 'balanced':
      return `### Default posture: balanced
- Assume **partial** prior knowledge: some terms are familiar, others are not.
- Per major concept: ~**5–8 sentences** of theory (what it is, why it matters, key trade-offs), then substantial **practice** aligned with the creator roadmap.
- Honor block structure and timecodes from the roadmap. Theory and practice in the same episode are both first-class — not detached side examples.
- When the roadmap includes implementation steps, treat them as **real build progress** (not hypothetical). Note what was built or decided so it can carry into later episodes / application state.
- Use \`theory_boost\` for topics needing deeper explanation (~10–15 sentences).
- Use \`practice_boost\` for topics needing more approaches, comparisons, and results-focused examples.
- **Research depth:** medium — prioritize implementation patterns and trade-offs; do not fully re-teach Prior coverage topics.`;
    case 'practice-first':
      return `### Default posture: practice-first
- Assume the viewer is **theoretically prepared** (see Prior coverage if provided).
- Per concept: **2–3 sentences** recap (what it is, why it matters), then focus on **approaches, methods, trade-offs, risks, best practices, and results**.
- Compare alternatives when they exist. Show what you chose and why.
- Still weave brief theory reminders where needed so the narrative does not feel abrupt.
- Use \`theory_boost\` for topics **not** covered elsewhere (~10–15 sentences on those subjects only).
- **Research depth:** lean — list Prior coverage / assumed topics as "already known"; expand only \`theory_boost\` topics and practical comparison material.`;
  }
}

const REAL_WORLD_RULE = `### Real-world examples (all modes — mandatory)
- **No vacuum examples** (no generic Foo/Bar unless the roadmap names them).
- Examples must come from the **actual stack, product, or scenario** in the roadmap / application state.
- Calibrate difficulty to the **episode topic and series stage** — simple walkthroughs and advanced cases are both allowed when the roadmap calls for them.`;

export function buildNarrativeBalanceAppendix(
  video: Record<string, unknown> | undefined,
  priorCoverage?: string,
): string | undefined {
  const { balance, theoryBoost, practiceBoost } = readNarrativeFromVideo(video);
  const hasPrior = !!priorCoverage?.trim();

  const lines: string[] = [
    '## Narrative balance (mandatory)',
    '',
    `Active mode: **${balance}**`,
    '',
    REAL_WORLD_RULE,
    '',
    modeInstructions(balance),
  ];

  if (hasPrior) {
    lines.push(
      '',
      '### Prior coverage (do not re-teach from scratch)',
      'The following reflects knowledge viewers are assumed to already have from other channel content:',
      '',
      priorCoverage!.trim(),
    );
  }

  lines.push(
    '',
    '### Topic overrides',
    '',
    '**theory_boost** (deeper theory ~10–15 sentences on these topics only):',
    formatBoostList(theoryBoost),
    '',
    '**practice_boost** (extra real-world practice, comparisons, and results on these topics):',
    formatBoostList(practiceBoost),
  );

  return lines.join('\n');
}

/** Typed helper when video is already parsed. */
export function buildNarrativeBalanceAppendixFromVideo(
  video: Video,
  priorCoverage?: string,
): string {
  return buildNarrativeBalanceAppendix(video as Record<string, unknown>, priorCoverage) ?? '';
}
