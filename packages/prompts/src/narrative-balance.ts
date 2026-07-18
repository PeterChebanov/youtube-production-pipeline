import { NARRATIVE_BALANCES, type Video } from '@ecpe/schemas';

export type NarrativeBalance = (typeof NARRATIVE_BALANCES)[number];

export interface NarrativeBalanceOptions {
  /** When true, use build-app time ratios (does not change ordinary-course instructions). */
  buildsApplication?: boolean;
}

/** Build-app target shares (practice = code walkthrough + ops + demo). */
export const BUILD_APP_BALANCE_TARGETS: Record<
  NarrativeBalance,
  { theoryMin: number; theoryMax: number; practiceMin: number; practiceMax: number; summary: string }
> = {
  'practice-first': {
    theoryMin: 0.25,
    theoryMax: 0.35,
    practiceMin: 0.65,
    practiceMax: 0.75,
    summary: '~65–75% practice (code + ops + demo), ~25–35% theory recap',
  },
  balanced: {
    theoryMin: 0.45,
    theoryMax: 0.55,
    practiceMin: 0.45,
    practiceMax: 0.55,
    summary: '~50% theory / ~50% practice',
  },
  'theory-first': {
    theoryMin: 0.6,
    theoryMax: 0.7,
    practiceMin: 0.3,
    practiceMax: 0.4,
    summary: '~65% theory / ~35% practice (still a build-app episode — not a pure lecture)',
  },
};

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

function ordinaryModeInstructions(balance: NarrativeBalance): string {
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
- Honor block structure and topic outline from the creator roadmap. Theory and practice in the same episode are both first-class — not detached side examples.
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

function buildAppModeInstructions(balance: NarrativeBalance): string {
  const targets = BUILD_APP_BALANCE_TARGETS[balance];
  const shared = `### Build-app balance targets (mandatory)
- Active time split: **${targets.summary}**
- **Practice** = what we build this episode: application code walkthrough, key imports/types/methods, ops/infra that supports it, and the hero demo declared up front.
- **Theory** = short refresh so the viewer can follow the code — architecture intent, what a technology does *in this app*, best practices tied to files we touch. **Not** a standalone lecture (those live in other courses).
- Episode topic defines the functional slice; stay inside that slice.
- Prefer Demo walkthrough file order over inventing a lecture outline.
- Record concepts you refresh so later episodes can callback (application-state Concepts introduced).`;

  switch (balance) {
    case 'practice-first':
      return `${shared}

### Default posture: practice-first (build-app)
- Viewer is **theoretically prepared** (Prior coverage + prior Concepts).
- Theory budget **25–35%** (model may pick within range): refresh only what this episode's code needs (e.g. what retrieve is, why chunk overlap exists) — **2–4 sentences per concept**, not a full teach.
- Remaining **65–75%**: file-by-file walkthrough of this episode's product logic + thin ops layer + on-camera result.
- Per important file: role in architecture → what it accomplishes → key non-stdlib imports/tools → main types/methods → transition.
- **Research depth:** implementation-first Must Know (files, APIs, schema, CLI/HTTP paths). Theory topics that are already in Prior coverage / Concepts = **callback only**.`;
    case 'balanced':
      return `${shared}

### Default posture: balanced (build-app)
- Partial prior knowledge.
- About **half** the episode explains concepts needed for this feature; about **half** walks the real implementation and demo.
- Still ground theory in *this* app's files — do not drift into ecosystem essays.
- **Research depth:** medium theory + full walkthrough readiness for Demo steps.`;
    case 'theory-first':
      return `${shared}

### Default posture: theory-first (build-app)
- Viewer may be new to this episode's topic — teach more — but this is still a **build-app** episode.
- About **65%** theory / mental models for the episode topic; about **35%** must still show real code, architecture in the repo, and a concrete result.
- Do **not** produce a pure lecture with token-limit essays and no walkthrough.
- **Research depth:** fuller concept coverage for the topic, then map each concept to the files/steps in Demo walkthrough.`;
  }
}

function modeInstructions(balance: NarrativeBalance, buildsApplication: boolean): string {
  return buildsApplication ? buildAppModeInstructions(balance) : ordinaryModeInstructions(balance);
}

const REAL_WORLD_RULE = `### Real-world examples (all modes — mandatory)
- **No vacuum examples** (no generic Foo/Bar unless the roadmap names them).
- Examples must come from the **actual stack, product, or scenario** in the roadmap / application state.
- Calibrate difficulty to the **episode topic and series stage** — simple walkthroughs and advanced cases are both allowed when the roadmap calls for them.`;

export function buildNarrativeBalanceAppendix(
  video: Record<string, unknown> | undefined,
  priorCoverage?: string,
  options?: NarrativeBalanceOptions,
): string | undefined {
  const { balance, theoryBoost, practiceBoost } = readNarrativeFromVideo(video);
  const buildsApplication = !!options?.buildsApplication;
  const hasPrior = !!priorCoverage?.trim();

  const lines: string[] = [
    '## Narrative balance (mandatory)',
    '',
    `Active mode: **${balance}**`,
    buildsApplication ? 'Course mode: **build-app** (ratios below apply only to build-app)' : 'Course mode: **ordinary**',
    '',
    REAL_WORLD_RULE,
    '',
    modeInstructions(balance, buildsApplication),
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
  options?: NarrativeBalanceOptions,
): string {
  return (
    buildNarrativeBalanceAppendix(video as Record<string, unknown>, priorCoverage, options) ?? ''
  );
}
