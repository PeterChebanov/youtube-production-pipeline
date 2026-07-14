import { BRAND_ORANGE } from '../themes/accents.js';
import { SLIDE_TITLE_FONT_PX } from '../themes/slide-title.js';
import { iconBadgeHtml, resolveIconName } from '../icons/index.js';
import {
  ZIG_BLOCK_ANIM_SEC,
  ZIG_CONN_DRAW_SEC,
  ZIG_GAP_AFTER_BLOCK_SEC,
  zigzagConnectorCss,
  zigzagConnectorScript,
} from './zigzag-connectors.js';

/** Motion block icon badge scale (RULE-G01 cosmetic). */
export const MOTION_ICON_BADGE_SCALE = 1.5;

export interface MotionStep {
  label: string;
  visual?: string;
  annotation?: string;
  value?: string;
  color?: string;
  icon?: string;
}

export type MotionTemplateId =
  | 'pipeline-horizontal'
  | 'pipeline-vertical'
  | 'reading-zigzag'
  | 'sparse-panel'
  | 'step-reveal-diagram'
  | 'stagger-grid'
  | 'split-track'
  | 'timeline-horizontal'
  | 'pipeline-timeline'
  | 'cost-comparison-reveal'
  | 'comparison-reveal'
  | 'card-stagger'
  | 'title-card'
  | 'fade-title'
  | 'kinetic-text'
  | 'kinetic-emphasis';

const ROTATING_TEMPLATES: MotionTemplateId[] = [
  'pipeline-horizontal',
  'pipeline-vertical',
  'reading-zigzag',
  'step-reveal-diagram',
  'stagger-grid',
  'split-track',
  'sparse-panel',
];

const TEMPLATE_ALIASES: Record<string, MotionTemplateId> = {
  'timeline-horizontal': 'pipeline-horizontal',
  'pipeline-timeline': 'pipeline-horizontal',
  'card-stagger': 'stagger-grid',
  'zigzag-flow': 'reading-zigzag',
  'flow_vertical': 'pipeline-vertical',
};

function hashSceneId(sceneId: string): number {
  let h = 0;
  for (let i = 0; i < sceneId.length; i++) h = (h * 31 + sceneId.charCodeAt(i)) >>> 0;
  return h;
}

function stepWordCount(steps: MotionStep[]): number {
  return steps.reduce(
    (n, s) => n + [s.label, s.visual, s.annotation].filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length,
    0,
  );
}

const PIPELINE_TEMPLATE_IDS = new Set<MotionTemplateId>([
  'pipeline-horizontal',
  'pipeline-vertical',
  'timeline-horizontal',
  'pipeline-timeline',
  'sparse-panel',
  'split-track',
  'reading-zigzag',
]);

export function pickMotionTemplate(
  sceneId: string,
  stepCount: number,
  requested?: string,
  steps: MotionStep[] = [],
): MotionTemplateId {
  if (requested) {
    const alias = (TEMPLATE_ALIASES[requested] ?? requested) as MotionTemplateId;
    if (PIPELINE_TEMPLATE_IDS.has(alias) || ROTATING_TEMPLATES.includes(alias) || alias === 'step-reveal-diagram') {
      if (alias === 'pipeline-vertical' && stepCount >= 5) return 'split-track';
      return alias;
    }
  }
  const words = stepWordCount(steps);
  if (stepCount >= 3 && stepCount <= 4) return 'pipeline-horizontal';
  if (stepCount === 5) return 'split-track';
  if (stepCount <= 4 && words <= 24) return 'pipeline-vertical';
  if (stepCount <= 3) return 'step-reveal-diagram';
  if (stepCount >= 7) return 'split-track';
  const idx = hashSceneId(sceneId) % ROTATING_TEMPLATES.length;
  return ROTATING_TEMPLATES[idx]!;
}

export interface PipelineMetrics {
  nodeW: number;
  nodeH: number;
  labelSize: number;
  visualSize: number;
  noteSize: number;
  arrowSize: number;
  gap: number;
  rows: number;
}

export function computePipelineMetrics(stepCount: number, layout: 'horizontal' | 'vertical'): PipelineMetrics {
  const canvasW = 1760;
  const canvasH = layout === 'horizontal' ? 760 : 820;
  const arrowSize = 40;
  const gap = layout === 'vertical' && stepCount >= 5 ? 10 : 16;

  if (layout === 'vertical') {
    const canvasH = stepCount >= 5 ? 700 : 820;
    const nodeH = Math.min(stepCount >= 5 ? 108 : 140, Math.floor((canvasH - (stepCount - 1) * (arrowSize + gap)) / stepCount));
    const nodeW = Math.min(canvasW, stepCount >= 5 ? 920 : canvasW);
    const labelSize = nodeH > 110 ? 26 : nodeH > 90 ? 22 : 20;
    return { nodeW, nodeH: Math.max(72, nodeH), labelSize, visualSize: labelSize - 2, noteSize: labelSize - 4, arrowSize, gap, rows: stepCount };
  }

  const rows = stepCount <= 4 ? 1 : 2;
  const perRow = rows === 1 ? stepCount : Math.ceil(stepCount / 2);
  const nodeW = Math.floor((canvasW - (perRow - 1) * (arrowSize + gap)) / perRow);
  const nodeH = rows === 1 ? Math.min(260, canvasH - 20) : Math.floor((canvasH - gap) / 2) - 12;
  const labelSize = nodeW > 360 ? 26 : nodeW > 300 ? 24 : nodeW > 240 ? 22 : 20;
  return {
    nodeW: Math.max(220, nodeW),
    nodeH: Math.max(120, nodeH),
    labelSize,
    visualSize: Math.max(18, labelSize - 2),
    noteSize: Math.max(16, labelSize - 4),
    arrowSize,
    gap,
    rows,
  };
}

export interface ZigzagMetrics extends PipelineMetrics {
  connHeight: number;
}

function computeZigzagMetrics(stepCount: number): ZigzagMetrics {
  const connHeight = stepCount <= 4 ? 42 : 36;
  return {
    nodeW: 0,
    nodeH: 0,
    labelSize: 40,
    visualSize: 22,
    noteSize: 18,
    arrowSize: 40,
    gap: 6,
    rows: stepCount,
    connHeight,
  };
}

function zigzagTimings(stepCount: number): { blockDelays: number[]; connDelays: number[] } {
  const blockDelays: number[] = [];
  const connDelays: number[] = [];
  blockDelays[0] = 0.7;
  for (let i = 0; i < stepCount - 1; i++) {
    connDelays[i] = blockDelays[i]! + ZIG_BLOCK_ANIM_SEC + ZIG_GAP_AFTER_BLOCK_SEC;
    blockDelays[i + 1] = connDelays[i]! + ZIG_CONN_DRAW_SEC;
  }
  return { blockDelays, connDelays };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stepIconHtml(step: MotionStep, sceneId: string, index: number, badgeSize: number): string {
  const name = resolveIconName({
    explicit: step.icon,
    variant: 'motion',
    seed: `${sceneId}:step:${index}`,
    textParts: [step.label, step.visual, step.annotation],
  });
  return iconBadgeHtml(name, { size: badgeSize });
}

function zigzagNodeHtml(step: MotionStep, m: ZigzagMetrics, sceneId: string, index: number): string {
  const badgeSize = Math.round(44 * MOTION_ICON_BADGE_SCALE);
  const labelSize = m.labelSize;
  const visualSize = m.visualSize;
  const noteSize = m.noteSize;
  const hasBody = Boolean(step.visual || step.annotation);
  return `<div class="pipe-node pipe-node-zig">
    <div class="pipe-head">
      <div class="pipe-icon">${stepIconHtml(step, sceneId, index, badgeSize)}</div>
      <div class="pipe-label" style="font-size:${labelSize}px">${escapeHtml(step.label)}</div>
    </div>
    ${hasBody ? '<div class="pipe-divider" aria-hidden="true"></div>' : ''}
    <div class="pipe-body">
      ${step.visual ? `<div class="pipe-visual" style="font-size:${visualSize}px">${escapeHtml(step.visual)}</div>` : ''}
      ${step.annotation ? `<div class="pipe-note" style="font-size:${noteSize}px">${escapeHtml(step.annotation)}</div>` : ''}
    </div>
  </div>`;
}

function pipelineNodeHtml(
  step: MotionStep,
  m: PipelineMetrics,
  delay: number,
  sceneId: string,
  index: number,
  extraClass = '',
  animate = true,
): string {
  const badgeSize = Math.round(Math.min(38, m.labelSize + 10) * MOTION_ICON_BADGE_SCALE);
  const labelSize = m.labelSize + 2;
  const visualSize = m.visualSize + 2;
  const noteSize = m.noteSize + 2;
  const anim = animate
    ? `animation:fadeUp 0.55s ease ${delay}s forwards;opacity:0;transform:translateY(18px);`
    : 'opacity:1;transform:none;';
  return `<div class="pipe-node ${extraClass}" style="${anim}width:${m.nodeW}px;min-height:${m.nodeH}px">
    <div class="pipe-head">
      <div class="pipe-icon">${stepIconHtml(step, sceneId, index, badgeSize)}</div>
      <div class="pipe-label" style="font-size:${labelSize}px">${escapeHtml(step.label)}</div>
    </div>
    <div class="pipe-body">
      ${step.visual ? `<div class="pipe-visual" style="font-size:${visualSize}px">${escapeHtml(step.visual)}</div>` : ''}
      ${step.annotation ? `<div class="pipe-note" style="font-size:${noteSize}px">${escapeHtml(step.annotation)}</div>` : ''}
    </div>
  </div>`;
}

function arrowHtml(delay: number, direction: 'right' | 'down' | 'diag'): string {
  const sym = direction === 'down' ? '↓' : direction === 'diag' ? '↘' : '→';
  return `<div class="pipe-arrow pipe-arrow-${direction}" style="animation:fadeUp 0.35s ease ${delay}s forwards;font-size:${direction === 'down' ? 36 : 32}px">${sym}</div>`;
}

export function buildPipelineHorizontalHtml(
  title: string,
  steps: MotionStep[],
  stepDelaySec: number,
  sceneId: string,
): string {
  const m = computePipelineMetrics(steps.length, 'horizontal');
  const rows = m.rows;
  const perRow = rows === 1 ? steps.length : Math.ceil(steps.length / 2);
  const rowChunks: MotionStep[][] = [];
  if (rows === 1) rowChunks.push(steps);
  else {
    rowChunks.push(steps.slice(0, perRow));
    rowChunks.push(steps.slice(perRow));
  }

  let globalIdx = 0;
  const rowsHtml = rowChunks
    .map((rowSteps) => {
      const parts: string[] = [];
      rowSteps.forEach((step, i) => {
        const delay = 0.7 + globalIdx * stepDelaySec;
        parts.push(pipelineNodeHtml(step, m, delay, sceneId, globalIdx));
        if (i < rowSteps.length - 1) parts.push(arrowHtml(delay + 0.55, 'right'));
        globalIdx++;
      });
      return `<div class="pipe-row" style="gap:${m.gap}px">${parts.join('')}</div>`;
    })
    .join(rowChunks.length > 1 ? `<div class="pipe-row-spacer" style="height:${m.gap}px"><div class="pipe-arrow pipe-arrow-down" style="animation:fadeUp 0.35s ease ${0.7 + rowChunks[0].length * stepDelaySec}s forwards;font-size:36px;opacity:0">↓</div></div>` : '');

  return `<div class="stage pipeline-stage">
    <div class="title">${escapeHtml(title)}</div>
    <div class="pipe-canvas pipe-canvas-h">${rowsHtml}</div>
  </div>`;
}

export function buildPipelineVerticalHtml(
  title: string,
  steps: MotionStep[],
  stepDelaySec: number,
  sceneId: string,
): string {
  const m = computePipelineMetrics(steps.length, 'vertical');
  const parts: string[] = [];
  steps.forEach((step, i) => {
    const delay = 0.7 + i * stepDelaySec;
    parts.push(pipelineNodeHtml(step, m, delay, sceneId, i, 'pipe-node-v'));
    if (i < steps.length - 1) parts.push(arrowHtml(delay + 0.55, 'down'));
  });
  return `<div class="stage pipeline-stage${steps.length >= 5 ? ' pipeline-many' : ''}">
    <div class="title">${escapeHtml(title)}</div>
    <div class="pipe-canvas pipe-canvas-v" style="gap:${m.gap}px;width:${m.nodeW}px">${parts.join('')}</div>
  </div>`;
}

/** Vertical reading zigzag — L-shaped connectors with draw-on reveal between alternating columns. */
export function buildReadingZigzagHtml(
  title: string,
  steps: MotionStep[],
  stepDelaySec: number,
  sceneId: string,
): string {
  void stepDelaySec;
  const m = computeZigzagMetrics(steps.length);
  const { blockDelays, connDelays } = zigzagTimings(steps.length);
  const rows = steps
    .map((step, i) => {
      const side = i % 2 === 0 ? 'left' : 'right';
      const blockDelay = blockDelays[i] ?? 0.7;
      return `<div class="zig-row">
        <div class="zig-block-wrap zig-${side}" data-step="${i}" style="animation:zigFadeIn ${ZIG_BLOCK_ANIM_SEC}s ease ${blockDelay}s forwards">
          ${zigzagNodeHtml(step, m, sceneId, i)}
        </div>
      </div>`;
    })
    .join('');

  const connDelaysJson = JSON.stringify(connDelays);

  return `<div class="stage pipeline-stage zig-stage">
    <div class="title">${escapeHtml(title)}</div>
    <div class="zig-canvas" data-conn-delays='${connDelaysJson}'>
      <div class="zig-stack">${rows}</div>
      <svg class="zig-overlay" aria-hidden="true"></svg>
    </div>
    <script>${zigzagConnectorScript()}</script>
  </div>`;
}

/** Sparse narration: vertical stack with in-block icons (no side rail). */
export function buildSparsePanelHtml(
  title: string,
  steps: MotionStep[],
  stepDelaySec: number,
  sceneId: string,
): string {
  return buildPipelineVerticalHtml(title, steps, stepDelaySec, sceneId);
}

export function buildSplitTrackHtml(
  title: string,
  steps: MotionStep[],
  stepDelaySec: number,
  sceneId: string,
): string {
  const splitAt = Math.ceil(steps.length / 2);
  const left = steps.slice(0, splitAt);
  const right = steps.slice(splitAt);
  const m = computePipelineMetrics(Math.max(left.length, right.length), 'vertical');

  const col = (colSteps: MotionStep[], offset: number) => {
    const parts: string[] = [];
    colSteps.forEach((step, i) => {
      const delay = 0.7 + (offset + i) * stepDelaySec;
      parts.push(pipelineNodeHtml(step, m, delay, sceneId, offset + i, 'pipe-node-v'));
      if (i < colSteps.length - 1) parts.push(arrowHtml(delay + 0.55, 'down'));
    });
    return `<div class="split-col" style="gap:${m.gap}px">${parts.join('')}</div>`;
  };

  return `<div class="stage pipeline-stage">
    <div class="title">${escapeHtml(title)}</div>
    <div class="split-canvas">
      ${col(left, 0)}
      <div class="split-bridge" style="animation:fadeUp 0.5s ease ${0.7 + splitAt * stepDelaySec}s forwards">↕</div>
      ${col(right, splitAt)}
    </div>
  </div>`;
}

export function pipelineLayoutCss(theme: { cardBg: string; cardBorder: string; textPrimary: string; textSecondary: string }): string {
  return `
  .pipeline-stage .title { margin-bottom: 32px; }
  .pipeline-many .title { margin-bottom: 40px; font-size: ${SLIDE_TITLE_FONT_PX}px; }
  .pipeline-many .pipe-node { min-height: 88px !important; }
  .pipeline-many .pipe-visual, .pipeline-many .pipe-note { font-size: 15px !important; }
  .pipe-canvas { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; min-height: 0; }
  .pipe-canvas-h { gap: 20px; }
  .pipe-row { display: flex; align-items: center; justify-content: center; width: 100%; flex-wrap: nowrap; }
  .pipe-canvas-v { display: flex; flex-direction: column; align-items: stretch; align-self: center; margin: 0 auto; }
  .pipe-node {
    background: ${theme.cardBg}; border: 2px solid ${theme.cardBorder};
    border-left: 5px solid ${BRAND_ORANGE}; border-radius: 16px;
    padding: 18px 22px; opacity: 0; transform: translateY(18px);
    display: flex; flex-direction: column; gap: 10px; flex-shrink: 0;
    box-shadow: 0 8px 28px rgba(0,0,0,0.28);
    justify-content: center;
  }
  .pipe-head {
    display: flex; align-items: center; gap: 14px; width: 100%;
  }
  .pipe-icon { margin-bottom: 0; opacity: 1; flex-shrink: 0; line-height: 0; overflow: visible; }
  .pipe-icon .ecpe-icon-badge { display: inline-flex; overflow: hidden; }
  .pipe-icon .ecpe-icon-badge svg { display: block; filter: none; box-shadow: none; }
  .pipe-label { flex: 1; text-align: center; font-weight: 700; color: ${theme.textPrimary}; line-height: 1.2; }
  .pipe-body { display: flex; flex-direction: column; gap: 8px; width: 100%; text-align: center; align-items: center; justify-content: center; flex: 1; }
  .pipe-visual { color: ${theme.textSecondary}; line-height: 1.4; max-width: 96%; }
  .pipe-note { color: ${theme.textSecondary}; line-height: 1.45; max-width: 96%; }
  .pipe-node-v { width: 100% !important; }
  .pipe-node-zig {
    width: 100% !important; max-width: none; min-height: unset !important;
    padding: 16px 20px; opacity: 1 !important; transform: none !important; box-sizing: border-box;
  }
  .pipe-node-zig .pipe-head { gap: 16px; }
  .pipe-node-zig .pipe-label { text-align: left; flex: 1; line-height: 1.15; }
  .pipe-node-zig .pipe-body { text-align: left; align-items: flex-start; gap: 10px; flex: 0; }
  .pipe-node-zig .pipe-visual { line-height: 1.55; max-width: none; }
  .pipe-node-zig .pipe-note { line-height: 1.65; max-width: none; margin-top: 2px; }
  .pipe-node-zig .pipe-divider {
    width: 100%; height: 1px; background: rgba(248, 250, 252, 0.14); margin: 4px 0 2px;
  }
  .pipe-arrow { color: ${BRAND_ORANGE}; font-weight: 700; opacity: 0; flex-shrink: 0; }
  .zig-stage { justify-content: flex-start !important; }
  .zig-stage .title { margin-bottom: 16px; font-size: ${SLIDE_TITLE_FONT_PX}px; flex-shrink: 0; padding: 0 10%; box-sizing: border-box; }
  .zig-canvas { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; width: 100%; min-height: 0; overflow: hidden; box-sizing: border-box; }
  ${zigzagConnectorCss()}
  .sparse-panel { flex: 1; display: flex; gap: 48px; align-items: center; justify-content: center; width: 100%; padding: 0 40px; }
  .sparse-main { flex: 0 0 56%; display: flex; flex-direction: column; align-items: stretch; }
  .sparse-rail { flex: 0 0 34%; display: flex; flex-direction: column; gap: 20px; align-items: center; justify-content: center; }
  .icon-tile {
    width: 128px; height: 128px; border-radius: 24px;
    background: rgba(10, 18, 35, 0.75); border: 2px solid ${BRAND_ORANGE};
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transform: scale(0.9);
    box-shadow: 0 8px 28px rgba(0,0,0,0.28);
  }
  .split-canvas { flex: 1; display: grid; grid-template-columns: 1fr 56px 1fr; gap: 28px; align-items: center; width: 100%; padding: 0 32px; }
  .split-col { display: flex; flex-direction: column; align-items: stretch; }
  .split-bridge { font-size: 40px; color: ${BRAND_ORANGE}; text-align: center; opacity: 0; font-weight: 700; }
  body.zig-body .stage { padding: 36px 0 32px !important; }
  body.layout-compact .pipeline-stage .title { margin-bottom: 16px; font-size: ${Math.round(SLIDE_TITLE_FONT_PX * 0.82)}px; }
  body.layout-compact .pipe-node { padding: 12px 16px; }
  body.layout-compact .pipe-label { font-size: 18px !important; }
  body.layout-compact .pipe-visual, body.layout-compact .pipe-note { font-size: 14px !important; }
  body.layout-compact .pipe-canvas-h .pipe-row { gap: 10px !important; }
  body.layout-compact .pipe-node { min-height: 72px !important; }
  body.layout-tight .stage { padding: 28px 48px 36px !important; }
  body.layout-tight .title { margin-bottom: 12px !important; font-size: ${Math.round(SLIDE_TITLE_FONT_PX * 0.72)}px !important; }
  body.layout-tight .steps, body.layout-tight .steps-columns { gap: 8px !important; max-height: 820px !important; }
  body.layout-tight .step { padding: 10px 12px !important; }
  body.layout-tight .pipe-node { padding: 10px 14px !important; min-height: 64px !important; }
  body.layout-tight .pipe-canvas-h .pipe-row { gap: 8px !important; }
  `;
}
