import type { ProductionScene } from '@ecpe/schemas';
import type { VisualTheme } from '../themes/index.js';
import { resolveTheme } from '../themes/index.js';
import { BRAND_MOTION_CSS } from '../themes/background.js';
import { BRAND_ORANGE, BRAND_ORANGE_DEEP, BRAND_ORANGE_GLOW } from '../themes/accents.js';
import { iconBadgeHtml, iconSvg, resolveIconName } from '../icons/index.js';
import { planStepRevealLayout, splitStepsForColumns, type StepRevealLayoutPlan } from './layout.js';
import {
  buildPipelineHorizontalHtml,
  buildPipelineVerticalHtml,
  buildReadingZigzagHtml,
  buildSparsePanelHtml,
  buildSplitTrackHtml,
  pickMotionTemplate,
  pipelineLayoutCss,
  MOTION_ICON_BADGE_SCALE,
  type MotionStep,
  type MotionTemplateId,
} from './templates.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

interface StepLayout {
  gap: number;
  pad: number;
  titleSize: number;
  labelSize: number;
  numSize: number;
  noteSize: number;
  stagePad: string;
}

function parseSteps(data: Record<string, unknown>): MotionStep[] {
  const raw = data.steps;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const step = item as Record<string, unknown>;
    return {
      label: asString(step.label),
      visual: asString(step.visual),
      annotation: asString(step.annotation),
      value: asString(step.value),
      color: asString(step.color),
      icon: asString(step.icon),
    };
  });
}

function stepLayoutVars(count: number): StepLayout {
  if (count <= 3) {
    return { gap: 18, pad: 22, titleSize: 48, labelSize: 28, numSize: 52, noteSize: 17, stagePad: '48px 72px 64px' };
  }
  if (count <= 5) {
    return { gap: 12, pad: 14, titleSize: 40, labelSize: 22, numSize: 40, noteSize: 15, stagePad: '40px 64px 56px' };
  }
  return { gap: 8, pad: 10, titleSize: 34, labelSize: 18, numSize: 34, noteSize: 13, stagePad: '36px 56px 48px' };
}

function stepRevealLayoutToStepLayout(plan: StepRevealLayoutPlan): StepLayout {
  return {
    gap: plan.gap,
    pad: plan.pad,
    titleSize: plan.titleSize,
    labelSize: plan.labelSize,
    numSize: plan.numSize,
    noteSize: plan.noteSize,
    stagePad: plan.stagePad,
  };
}

const MAX_MOTION_VIDEO_SEC = 45;

export function motionDurationSec(scene: ProductionScene): number {
  const steps = parseSteps(scene.data);
  const stepBased = steps.length > 0 ? steps.length * 2.8 + 2 : 6;
  const holdHint =
    scene.estimated_hold_sec > 0
      ? Math.min(Math.max(scene.estimated_hold_sec, 4), MAX_MOTION_VIDEO_SEC)
      : MAX_MOTION_VIDEO_SEC;

  if (steps.length > 0) {
    return Math.min(Math.max(stepBased, 4), holdHint, MAX_MOTION_VIDEO_SEC);
  }
  return Math.min(holdHint, MAX_MOTION_VIDEO_SEC);
}

function buildStyles(theme: VisualTheme, layout: StepLayout, revealPlan?: StepRevealLayoutPlan): string {
  const visualSize = revealPlan?.visualSize ?? layout.noteSize + 4;
  return `
  ${BRAND_MOTION_CSS}
  ${pipelineLayoutCss(theme)}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1920px; height: 1080px; overflow: hidden;
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #060d1a;
    color: ${theme.textPrimary};
  }
  .stage {
    position: relative; z-index: 1;
    width: 100%; height: 100%; padding: ${layout.stagePad};
    display: flex; flex-direction: column; overflow: hidden;
  }
  .title {
    font-size: ${layout.titleSize}px; font-weight: 700; letter-spacing: -0.02em;
    opacity: 0; animation: fadeUp 0.8s ease forwards;
    margin-bottom: 28px; flex-shrink: 0;
    color: ${theme.textPrimary};
  }
  .subtitle {
    font-size: ${Math.round(layout.titleSize * 0.52)}px; color: ${theme.textSecondary};
    margin-top: -16px; margin-bottom: 24px; flex-shrink: 0;
    opacity: 0; animation: fadeUp 0.8s ease 0.3s forwards;
  }
  .steps {
    display: flex; flex-direction: column; gap: ${layout.gap}px;
    flex: 1; justify-content: center; min-height: 0; overflow: hidden;
    max-height: calc(1080px - ${layout.titleSize + 80}px);
    width: 100%;
  }
  .steps-columns {
    display: grid; grid-template-columns: 1fr 1fr; gap: ${layout.gap}px ${layout.gap + 12}px;
    flex: 1; align-content: center; min-height: 0; overflow: hidden;
    max-height: calc(1080px - ${layout.titleSize + 80}px);
    width: 100%;
  }
  .steps-col {
    display: flex; flex-direction: column; gap: ${layout.gap}px;
    min-height: 0;
  }
  .step {
    display: grid; grid-template-columns: ${layout.numSize}px 1fr; gap: 16px; align-items: start;
    background: ${theme.cardBg}; border: 1px solid ${theme.cardBorder};
    border-left: 4px solid ${BRAND_ORANGE};
    border-radius: 14px; padding: ${layout.pad}px ${layout.pad + 4}px;
    opacity: 0.22; transform: translateX(0); flex-shrink: 0;
  }
  .step-num {
    width: ${layout.numSize}px; height: ${layout.numSize}px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: ${Math.round(layout.numSize * 0.42)}px; font-weight: 700; color: #fff7ed;
    background: linear-gradient(135deg, ${BRAND_ORANGE}, ${BRAND_ORANGE_DEEP});
    box-shadow: 0 4px 16px ${BRAND_ORANGE_GLOW};
  }
  .step-num .ecpe-icon { stroke: #fff7ed; }
  .step-label { font-size: ${layout.labelSize}px; font-weight: 600; margin-bottom: 4px; line-height: 1.25; }
  .step-visual { font-size: ${visualSize}px; color: ${theme.textSecondary}; margin-bottom: 6px; line-height: 1.35; }
  .step-note { font-size: ${layout.noteSize}px; color: ${theme.textSecondary}; line-height: 1.45; white-space: pre-line; }
  .cards-row { display: flex; gap: 24px; justify-content: center; align-items: stretch; flex: 1; min-height: 0; }
  .metric-card {
    flex: 1; max-width: 420px; border-radius: 18px; padding: 32px;
    background: ${theme.cardBg}; border: 2px solid ${theme.cardBorder};
    opacity: 0; transform: scale(0.92); text-align: center;
  }
  .metric-label { font-size: 22px; color: ${theme.textSecondary}; margin-bottom: 12px; }
  .metric-value { font-size: 52px; font-weight: 800; line-height: 1.1; }
  .stagger-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:20px; flex:1; align-content:center; padding: 0 24px; }
  .stagger-card {
    background:${theme.cardBg}; border:1px solid ${theme.cardBorder}; border-left:4px solid ${BRAND_ORANGE};
    border-radius:14px; padding:28px; opacity:0; transform:scale(0.9);
  }
  .stagger-icon { margin-bottom: 0; flex-shrink: 0; line-height: 0; }
  .stagger-head {
    display: flex; align-items: center; gap: 12px; width: 100%; margin-bottom: 10px;
  }
  .stagger-head .step-label { margin-bottom: 0; flex: 1; text-align: center; }
  .kinetic-line {
    font-size: 56px; font-weight: 700; text-align: center; margin: auto;
    opacity: 0; transform: translateY(30px); color: ${theme.textPrimary};
  }
  body.layout-compact .title { font-size: ${Math.round(layout.titleSize * 0.88)}px !important; }
  body.layout-compact .step-label { font-size: ${Math.round(layout.labelSize * 0.9)}px !important; }
  body.layout-compact .step-note { font-size: ${Math.round(layout.noteSize * 0.9)}px !important; }
  body.layout-compact .step-visual { font-size: ${Math.round(visualSize * 0.9)}px !important; }
  body.layout-compact .steps-columns { gap: ${Math.max(8, layout.gap - 4)}px ${Math.max(10, layout.gap + 4)}px; }
  body.layout-compact .steps, body.layout-compact .steps-columns { max-height: 860px !important; }
  body.layout-tight .title { font-size: 30px !important; margin-bottom: 12px !important; }
  body.layout-tight .steps, body.layout-tight .steps-columns { gap: 8px !important; max-height: 800px !important; }
  body.layout-tight .step { padding: 8px 10px !important; }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(18px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideIn { to { opacity: 1; transform: translateX(0); } }
  @keyframes popIn { to { opacity: 1; transform: scale(1); } }
`;
}

function renderStep(step: MotionStep, index: number, stepDelaySec: number, numSize: number, sceneId: string): string {
  const delay = 1.2 + index * stepDelaySec;
  const color = step.color || '';
  const iconName = resolveIconName({
    explicit: step.icon,
    variant: 'ui',
    seed: `${sceneId}:step:${index}`,
    textParts: [step.label, step.visual, step.annotation],
  });
  const numContent = step.icon
    ? iconSvg(iconName, Math.round(numSize * 0.55 * MOTION_ICON_BADGE_SCALE), '#fff7ed')
    : String(index + 1);
  return `<div class="step" style="animation: slideIn 0.7s ease ${delay}s forwards${color ? `; border-color:${color}55` : ''}">
    <div class="step-num">${numContent}</div>
    <div>
      <div class="step-label">${escapeHtml(step.label)}</div>
      ${step.visual ? `<div class="step-visual">${escapeHtml(step.visual)}</div>` : ''}
      ${step.annotation ? `<div class="step-note">${escapeHtml(step.annotation)}</div>` : ''}
    </div>
  </div>`;
}

function buildStepRevealHtml(
  title: string,
  steps: MotionStep[],
  stepDelaySec: number,
  revealPlan: StepRevealLayoutPlan,
  layout: StepLayout,
  sceneId: string,
): string {
  if (revealPlan.columns === 2) {
    const { left, right } = splitStepsForColumns(steps);
    const leftHtml = left.map((s, i) => renderStep(s, i, stepDelaySec, layout.numSize, sceneId)).join('');
    const rightHtml = right
      .map((s, i) => renderStep(s, left.length + i, stepDelaySec, layout.numSize, sceneId))
      .join('');
    return `<div class="stage">
      <div class="title">${escapeHtml(title)}</div>
      <div class="steps-columns">
        <div class="steps-col">${leftHtml}</div>
        <div class="steps-col">${rightHtml}</div>
      </div>
    </div>`;
  }

  const stepHtml = steps.map((s, i) => renderStep(s, i, stepDelaySec, layout.numSize, sceneId)).join('');
  return `<div class="stage">
    <div class="title">${escapeHtml(title)}</div>
    <div class="steps">${stepHtml}</div>
  </div>`;
}

function buildComparisonHtml(title: string, steps: MotionStep[], stepDelaySec: number): string {
  const cards = steps
    .map((step, i) => {
      const delay = 1 + i * stepDelaySec;
      const color = step.color || BRAND_ORANGE;
      return `<div class="metric-card" style="animation: popIn 0.6s ease ${delay}s forwards; border-color: ${color}55;">
        <div class="metric-label">${escapeHtml(step.label)}</div>
        <div class="metric-value" style="color: ${color}">${escapeHtml(step.value || step.visual || '')}</div>
      </div>`;
    })
    .join('');

  return `<div class="stage">
    <div class="title">${escapeHtml(title)}</div>
    <div class="cards-row">${cards}</div>
  </div>`;
}

function buildStaggerGridHtml(title: string, steps: MotionStep[], stepDelaySec: number, sceneId: string): string {
  const cards = steps
    .map((step, i) => {
      const delay = 0.6 + i * stepDelaySec * 0.7;
      const iconName = resolveIconName({
        explicit: step.icon,
        variant: 'motion',
        seed: `${sceneId}:grid:${i}`,
        textParts: [step.label, step.visual, step.annotation],
      });
      return `<div class="stagger-card" style="animation:popIn 0.5s ease ${delay}s forwards">
        <div class="stagger-head">
          <div class="stagger-icon">${iconBadgeHtml(iconName, { size: Math.round(38 * MOTION_ICON_BADGE_SCALE) })}</div>
          <div class="step-label">${escapeHtml(step.label)}</div>
        </div>
        ${step.visual ? `<div class="step-visual">${escapeHtml(step.visual)}</div>` : ''}
        ${step.annotation ? `<div class="step-note">${escapeHtml(step.annotation)}</div>` : ''}
      </div>`;
    })
    .join('');
  return `<div class="stage"><div class="title">${escapeHtml(title)}</div><div class="stagger-grid">${cards}</div></div>`;
}

function buildTitleCardHtml(title: string, subtitle: string): string {
  return `<div class="stage" style="justify-content: center; align-items: center; text-align: center;">
    <div class="title" style="font-size: 72px; animation-delay: 0.2s;">${escapeHtml(title)}</div>
    ${subtitle ? `<div class="subtitle" style="font-size: 36px;">${escapeHtml(subtitle)}</div>` : ''}
  </div>`;
}

function buildKineticTextHtml(title: string, subtitle: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  const wordSpans = words
    .map((word, i) => {
      const delay = 0.4 + i * 0.35;
      return `<span class="kinetic-line" style="display:inline-block;margin:0 12px;animation:fadeUp 0.5s ease ${delay}s forwards">${escapeHtml(word)}</span>`;
    })
    .join('');

  return `<div class="stage" style="justify-content: center; align-items: center; text-align: center;">
    <div style="max-width: 1400px; line-height: 1.3;">${wordSpans}</div>
    ${subtitle ? `<div class="subtitle" style="margin-top: 48px;">${escapeHtml(subtitle)}</div>` : ''}
  </div>`;
}

const PIPELINE_TEMPLATES = new Set<MotionTemplateId>([
  'pipeline-horizontal',
  'pipeline-vertical',
  'reading-zigzag',
  'sparse-panel',
  'split-track',
  'timeline-horizontal',
  'pipeline-timeline',
]);

export function buildMotionHtml(
  scene: ProductionScene,
  themeInput?: VisualTheme,
): { html: string; durationSec: number } {
  const theme = themeInput ?? resolveTheme();
  const requested = asString(scene.data.template);
  const title = asString(scene.data.title, scene.visual || scene.scene_id);
  const subtitle = asString(scene.data.subtitle);
  const steps = parseSteps(scene.data);
  const template = pickMotionTemplate(scene.scene_id, steps.length, requested || undefined, steps);

  const durationSec = motionDurationSec(scene);
  const stepDelaySec = steps.length > 0 ? Math.max(1.4, (durationSec - 2) / steps.length) : 2;

  const isStepReveal = template === 'step-reveal-diagram';
  const revealPlan = isStepReveal ? planStepRevealLayout(steps) : undefined;
  const layout = revealPlan ? stepRevealLayoutToStepLayout(revealPlan) : stepLayoutVars(steps.length);

  let body: string;
  switch (template) {
    case 'cost-comparison-reveal':
    case 'comparison-reveal':
      body = buildComparisonHtml(title, steps, stepDelaySec);
      break;
    case 'pipeline-horizontal':
    case 'timeline-horizontal':
    case 'pipeline-timeline':
      body = buildPipelineHorizontalHtml(title, steps, stepDelaySec, scene.scene_id);
      break;
    case 'pipeline-vertical':
      body = buildPipelineVerticalHtml(title, steps, stepDelaySec, scene.scene_id);
      break;
    case 'reading-zigzag':
      body = buildReadingZigzagHtml(title, steps, stepDelaySec, scene.scene_id);
      break;
    case 'sparse-panel':
      body = buildSparsePanelHtml(title, steps, stepDelaySec, scene.scene_id);
      break;
    case 'split-track':
      body = buildSplitTrackHtml(title, steps, stepDelaySec, scene.scene_id);
      break;
    case 'stagger-grid':
    case 'card-stagger':
      body = buildStaggerGridHtml(title, steps, stepDelaySec, scene.scene_id);
      break;
    case 'title-card':
    case 'fade-title':
      body = buildTitleCardHtml(title, subtitle);
      break;
    case 'kinetic-text':
    case 'kinetic-emphasis':
      body = buildKineticTextHtml(title || asString(scene.data.text, scene.scene_id), subtitle);
      break;
    case 'step-reveal-diagram':
    default:
      body = buildStepRevealHtml(
        title,
        steps,
        stepDelaySec,
        revealPlan ?? planStepRevealLayout(steps),
        layout,
        scene.scene_id,
      );
      break;
  }

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<style>${buildStyles(theme, layout, revealPlan)}</style></head>
<body class="${template === 'reading-zigzag' ? 'zig-body pipeline-body' : PIPELINE_TEMPLATES.has(template) ? 'pipeline-body' : ''}"><div class="brand-layer"></div>${body}</body></html>`;

  return { html, durationSec };
}
