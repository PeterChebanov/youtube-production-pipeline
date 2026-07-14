export interface MotionStepInput {
  label: string;
  visual?: string;
  annotation?: string;
}

export interface StepRevealLayoutPlan {
  columns: 1 | 2;
  titleSize: number;
  labelSize: number;
  numSize: number;
  noteSize: number;
  visualSize: number;
  gap: number;
  pad: number;
  stagePad: string;
}

const STAGE_HEIGHT = 1080;
const TITLE_BLOCK = 120;
const STAGE_VERTICAL_PAD = 100;

function estimateStepLines(step: MotionStepInput): number {
  let lines = 1;
  if (step.visual?.trim()) lines += 1;
  if (step.annotation?.trim()) {
    lines += step.annotation.split('\n').filter((l) => l.trim()).length;
  }
  return lines;
}

function totalContentLines(steps: MotionStepInput[]): number {
  return steps.reduce((sum, s) => sum + estimateStepLines(s), 0);
}

interface FontTier {
  titleSize: number;
  labelSize: number;
  numSize: number;
  noteSize: number;
  visualSize: number;
  gap: number;
  pad: number;
}

const FONT_TIERS: FontTier[] = [
  { titleSize: 48, labelSize: 30, numSize: 56, noteSize: 22, visualSize: 24, gap: 18, pad: 22 },
  { titleSize: 44, labelSize: 26, numSize: 48, noteSize: 20, visualSize: 22, gap: 14, pad: 18 },
  { titleSize: 40, labelSize: 24, numSize: 44, noteSize: 18, visualSize: 20, gap: 12, pad: 16 },
  { titleSize: 36, labelSize: 22, numSize: 40, noteSize: 16, visualSize: 18, gap: 10, pad: 14 },
];

function estimateBlockHeight(lines: number, tier: FontTier): number {
  const lineH = tier.noteSize * 1.45;
  const contentH = lines * lineH + tier.labelSize + tier.pad * 2 + 8;
  return contentH + tier.numSize * 0.1;
}

function pickFontTier(steps: MotionStepInput[], columns: 1 | 2): FontTier {
  const rows = columns === 2 ? Math.ceil(steps.length / 2) : steps.length;
  const linesPerStep = steps.map(estimateStepLines);
  const maxLines = Math.max(...linesPerStep, 1);
  const available = STAGE_HEIGHT - TITLE_BLOCK - STAGE_VERTICAL_PAD;

  for (const tier of FONT_TIERS) {
    const rowH = estimateBlockHeight(maxLines, tier);
    const totalH = rows * rowH + (rows - 1) * tier.gap;
    if (totalH <= available) return tier;
  }
  return FONT_TIERS[FONT_TIERS.length - 1];
}

export function planStepRevealLayout(steps: MotionStepInput[]): StepRevealLayoutPlan {
  const count = steps.length;
  const totalLines = totalContentLines(steps);

  let columns: 1 | 2 = 1;
  if (count >= 4 || (count >= 3 && totalLines > 10)) columns = 2;
  if (count >= 7) columns = 2;

  const tier = pickFontTier(steps, columns);

  return {
    columns,
    titleSize: tier.titleSize,
    labelSize: tier.labelSize,
    numSize: tier.numSize,
    noteSize: tier.noteSize,
    visualSize: tier.visualSize,
    gap: tier.gap,
    pad: tier.pad,
    stagePad: columns === 2 ? '36px 48px 40px' : '40px 64px 48px',
  };
}

export function splitStepsForColumns<T>(steps: T[]): { left: T[]; right: T[] } {
  const splitAt = Math.ceil(steps.length / 2);
  return { left: steps.slice(0, splitAt), right: steps.slice(splitAt) };
}
