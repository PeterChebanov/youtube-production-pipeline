import type { ProductionScene } from '@ecpe/schemas';
import type { VisualTheme } from '../themes/index.js';
import { resolveTheme } from '../themes/index.js';
import { BRAND_FRAME_CSS } from '../themes/background.js';
import { countSketchBlocks, sparseScaleForCount } from './layout.js';
import { revealAnimationCss } from '../animations/reveal.js';
import {
  createRevealStamp,
  revealArrowAttrs,
  revealAttrs,
  revealBlockAttrs,
  type RevealStamp,
} from '../animations/stamp.js';
import { resolveIconName, sketchIconBadgeHtml, sketchIconSvg } from '../icons/index.js';

function px(value: number, scale: number): string {
  return `${Math.round(value * scale)}px`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x));
}

interface SpecElement {
  type: string;
  label?: string;
  text?: string;
  steps?: string[];
  total?: string;
  examples?: string[];
  annotation?: string;
  icon?: string;
  position?: string;
  id?: string;
  from?: string;
  to?: string;
}

interface ChainItem {
  box: SpecElement;
  arrowLabel?: string;
}

type SketchLayoutKind =
  | 'comparison_horizontal'
  | 'decision_tree'
  | 'flow_vertical'
  | 'box_chain'
  | 'u_shape'
  | 'compact_vertical'
  | 'pipeline_horizontal';

function parseElements(data: Record<string, unknown>): SpecElement[] {
  const raw = data.elements;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const el = item as Record<string, unknown>;
    return {
      type: asString(el.type),
      label: asString(el.label),
      text: asString(el.text),
      steps: asStringArray(el.steps),
      total: asString(el.total),
      examples: asStringArray(el.examples),
      annotation: asString(el.annotation),
      icon: asString(el.icon),
      position: asString(el.position),
      id: asString(el.id),
      from: asString(el.from),
      to: asString(el.to),
    };
  });
}

function humanizeTitle(scene: ProductionScene): string {
  const explicit = asString(scene.data.title);
  if (explicit && !explicit.includes('_') && !/^scene-\d+/i.test(explicit)) {
    return explicit;
  }
  const raw = explicit || scene.visual || scene.scene_id;
  return raw
    .replace(/_/g, ' ')
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (lower === 'vs' && i > 0) return 'vs';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function wordCount(elements: SpecElement[]): number {
  return elements
    .filter((e) => e.type === 'box' || e.type === 'workflow')
    .reduce((n, b) => n + (b.label || b.text || '').split(/\s+/).filter(Boolean).length, 0);
}


function resolveSketchLayout(layout: string, elements: SpecElement[]): SketchLayoutKind {
  const normalized = layout.trim().toLowerCase();
  if (normalized === 'comparison_horizontal' || normalized === 'comparison_two_column') {
    return 'comparison_horizontal';
  }
  if (normalized === 'flow_vertical' || normalized === 'flowchart_vertical') {
    return autoPickChainLayout(elements);
  }
  if (normalized === 'u_shape' || normalized === 'p_shape') return 'u_shape';
  if (normalized === 'compact_vertical' || normalized === 'fade_stack') return 'compact_vertical';
  if (normalized === 'decision_tree') {
    if (elements.some((e) => e.type === 'question' || e.type === 'branch_yes' || e.type === 'branch_no')) {
      return 'decision_tree';
    }
    return autoPickChainLayout(elements);
  }
  if (normalized === 'pipeline_horizontal') return 'pipeline_horizontal';
  if (elements.some((e) => e.type === 'flow')) return 'comparison_horizontal';
  if (elements.some((e) => e.type === 'question')) return 'decision_tree';
  if (elements.some((e) => e.type === 'box' || e.type === 'workflow')) return autoPickChainLayout(elements);
  return 'pipeline_horizontal';
}

function parseBoxChain(elements: SpecElement[]): ChainItem[] {
  const items: ChainItem[] = [];
  let pendingArrow: string | undefined;

  for (const el of elements) {
    if (el.type === 'arrow' || el.type === 'connector') {
      pendingArrow = el.label || el.text || pendingArrow;
      continue;
    }
    if (el.type === 'box' || el.type === 'workflow') {
      items.push({ box: el, arrowLabel: pendingArrow });
      pendingArrow = undefined;
    }
  }
  return items;
}

function autoPickChainLayout(elements: SpecElement[]): 'flow_vertical' | 'u_shape' | 'compact_vertical' {
  const chain = parseBoxChain(elements);
  const count = chain.length;
  const words = wordCount(elements);
  if (count <= 4 && words <= 32) return 'flow_vertical';
  if (count <= 6) return 'u_shape';
  return 'compact_vertical';
}

function shapeForLabel(label: string, index: number): string {
  const len = label.length;
  if (len > 48) return '';
  if (len > 30) return ' shape-pill';
  if (len <= 22 && index % 4 === 2) return ' shape-circle';
  if (len <= 18 && index % 6 === 4) return ' shape-diamond';
  return index % 3 === 1 ? ' shape-pill' : '';
}

function boxIconHtml(box: SpecElement, sceneId: string, index: number): string {
  const name = resolveIconName({
    explicit: box.icon,
    variant: 'sketch',
    seed: `${sceneId}:box:${index}`,
    textParts: [box.label, box.text, box.annotation],
  });
  return sketchIconBadgeHtml(name, 36);
}

function renderSketchBox(
  stamp: RevealStamp,
  box: SpecElement,
  sceneId: string,
  index: number,
  extraClass = '',
): string {
  const label = box.label || box.text || `Step ${index + 1}`;
  const shape = shapeForLabel(label, index);
  const ann = box.annotation
    ? `<div class="sketch-annotation">${escapeHtml(box.annotation)}</div>`
    : '';
  return `<div ${revealBlockAttrs(stamp, `sketch-box${shape} ${extraClass}`.trim())}>
    <div class="sketch-box-head">
      <div class="sketch-box-icon">${boxIconHtml(box, sceneId, index)}</div>
      <div class="sketch-box-label">${escapeHtml(label)}</div>
    </div>
    ${ann}
  </div>`;
}

function renderArrowStep(
  stamp: RevealStamp,
  label?: string,
  direction: 'down' | 'right' | 'up' = 'down',
): string {
  const sym = direction === 'down' ? '↓' : direction === 'up' ? '↑' : '→';
  const caption = label ? `<span class="chain-arrow-caption">${escapeHtml(label)}</span>` : '';
  return `<div ${revealArrowAttrs(stamp, `chain-arrow chain-arrow-${direction}`)}>
    <span class="chain-arrow-glyph">${sym}</span>${caption}
  </div>`;
}

function renderTradeoffRow(boxes: SpecElement[], stamp: RevealStamp, sceneId: string, startIndex: number): string {
  const cols = boxes
    .map((box, i) => renderSketchBox(stamp, box, sceneId, startIndex + i, 'tradeoff-col'))
    .join('');
  return `<div class="tradeoff-row">${cols}</div>`;
}

function renderFlowVertical(
  elements: SpecElement[],
  stamp: RevealStamp,
  sceneId: string,
): string {
  const chain = parseBoxChain(elements);
  if (chain.length === 0) return '';

  const tradeoffCandidates = chain.filter((c) => /lower-(left|right)|trade|✓|✗/i.test(c.box.position || c.box.label || ''));
  const useTradeoffRow = tradeoffCandidates.length >= 2;
  const mainChain = useTradeoffRow ? chain.slice(0, -2) : chain;
  const tradeoffBoxes = useTradeoffRow ? chain.slice(-2).map((c) => c.box) : [];

  const mainHtml = mainChain
    .map((item, i) => {
      const align = i % 2 === 0 ? 'align-left' : 'align-right';
      const arrow =
        i < mainChain.length - 1 || tradeoffBoxes.length > 0
          ? renderArrowStep(stamp, item.arrowLabel, 'down')
          : '';
      return `<div class="chain-item ${align}">${renderSketchBox(stamp, item.box, sceneId, i)}${arrow}</div>`;
    })
    .join('');

  const tradeoffHtml = tradeoffBoxes.length > 0 ? renderTradeoffRow(tradeoffBoxes, stamp, sceneId, mainChain.length) : '';
  const standaloneAnn = elements.find((e) => e.type === 'annotation');
  const annHtml = standaloneAnn?.text
    ? `<div ${revealAttrs(stamp, 'annotation')}>${escapeHtml(standaloneAnn.text)}</div>`
    : '';

  return `<div class="chain-canvas chain-canvas-zigzag">${mainHtml}${tradeoffHtml}${annHtml}</div>`;
}

function renderCompactVertical(
  elements: SpecElement[],
  stamp: RevealStamp,
  sceneId: string,
): string {
  const chain = parseBoxChain(elements);
  if (chain.length === 0) return '';

  const items = chain
    .map((item, i) => {
      const arrow = i < chain.length - 1 ? renderArrowStep(stamp, item.arrowLabel, 'down') : '';
      return `<div class="chain-item chain-item-center">${renderSketchBox(stamp, item.box, sceneId, i)}${arrow}</div>`;
    })
    .join('');

  return `<div class="chain-canvas chain-canvas-compact">${items}</div>`;
}

function renderUShape(
  elements: SpecElement[],
  stamp: RevealStamp,
  sceneId: string,
): string {
  const chain = parseBoxChain(elements);
  if (chain.length === 0) return '';

  const splitAt = Math.ceil(chain.length / 2);
  const leftChain = chain.slice(0, splitAt);
  const rightChain = [...chain.slice(splitAt)].reverse();

  const renderCol = (col: ChainItem[], direction: 'down' | 'up', offset: number) => {
    return col
      .map((item, i) => {
        const idx = offset + i;
        const arrow =
          i < col.length - 1 ? renderArrowStep(stamp, item.arrowLabel, direction) : '';
        const hero = chain.length >= 5 && idx === Math.floor(chain.length / 2) ? ' sketch-box-hero' : '';
        return `<div class="chain-item chain-item-center">${renderSketchBox(stamp, item.box, sceneId, idx, hero.trim())}${arrow}</div>`;
      })
      .join('');
  };

  const bridge =
    rightChain.length > 0
      ? `<div class="u-bridge">${renderArrowStep(stamp, undefined, 'right')}</div>`
      : '';

  return `<div class="u-shape-canvas">
    <div class="u-col u-col-left">${renderCol(leftChain, 'down', 0)}</div>
    ${bridge}
    <div class="u-col u-col-right">${renderCol(rightChain, 'up', splitAt)}</div>
  </div>`;
}

function renderBoxChain(elements: SpecElement[], stamp: RevealStamp, sceneId: string, kind: SketchLayoutKind): string {
  switch (kind) {
    case 'u_shape':
      return renderUShape(elements, stamp, sceneId);
    case 'compact_vertical':
      return renderCompactVertical(elements, stamp, sceneId);
    case 'flow_vertical':
    case 'box_chain':
    default:
      return renderFlowVertical(elements, stamp, sceneId);
  }
}

function buildSketchCss(theme: VisualTheme, scale = 1, animated = false): string {
  return `
  ${animated ? revealAnimationCss() : ''}
  ${BRAND_FRAME_CSS}
  .sketch-content {
    display: flex; flex-direction: column;
    justify-content: flex-start; align-items: center;
    flex: 1; min-height: 0;
    width: 100%; gap: ${px(16, scale)};
  }
  .sketch-title-band {
    flex-shrink: 0;
    width: 100%;
    min-height: ${px(88, scale)};
    margin-bottom: ${px(12, scale)};
    padding-bottom: ${px(8, scale)};
  }
  h1.title {
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: ${px(44, scale)}; font-weight: 700; margin: 0;
    color: ${theme.sketchTitle};
    letter-spacing: -0.02em;
  }
  .sketch-body {
    flex: 1; min-height: 0; width: 100%;
    display: flex; flex-direction: column; justify-content: center;
  }
  .cols { display: flex; gap: ${px(32, scale)}; align-items: stretch; flex: 1; min-height: 0; width: 100%; justify-content: center; }
  .col { flex: 1; display: flex; flex-direction: column; justify-content: center; max-width: 48%; }
  .flow-card {
    border: 2px solid ${theme.cardBorder};
    border-radius: ${px(20, scale)};
    padding: ${px(28, scale)} ${px(32, scale)};
    background: rgba(10, 18, 35, 0.75);
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    margin-bottom: ${px(16, scale)};
  }
  .flow-card.alt { border-color: ${theme.accent}; }
  .flow-label {
    font-size: ${px(30, scale)}; font-weight: 700; margin-bottom: ${px(12, scale)};
    color: ${theme.accent};
  }
  .flow-step {
    font-size: ${px(24, scale)}; line-height: 1.4; padding: ${px(8, scale)} 0 ${px(8, scale)} ${px(20, scale)};
    border-left: 4px solid ${theme.sketchSilver}; margin: ${px(6, scale)} 0;
    color: ${theme.textPrimary};
  }
  .flow-total { font-size: ${px(26, scale)}; font-weight: 700; margin-top: ${px(14, scale)}; color: ${theme.accentAlt}; }
  .annotation {
    border: 2px dashed ${theme.sketchGold}; border-radius: ${px(16, scale)}; padding: ${px(20, scale)} ${px(26, scale)};
    font-size: ${px(24, scale)}; line-height: 1.4;
    background: rgba(240, 193, 75, 0.08); flex-shrink: 0;
    white-space: pre-line; color: ${theme.textPrimary}; text-align: center; max-width: 90%;
  }
  .decision-layout {
    display: flex; flex-direction: column; gap: ${px(32, scale)};
    flex: 1; justify-content: center; min-height: 0; width: 100%;
  }
  .question-banner {
    align-self: center; max-width: ${px(860, scale)}; width: 100%;
    padding: ${px(24, scale)} ${px(34, scale)}; border: 3px solid ${theme.sketchGold};
    border-radius: ${px(22, scale)}; background: rgba(8, 14, 30, 0.72);
    text-align: center; font-size: ${px(26, scale)}; line-height: 1.45;
    flex-shrink: 0;
  }
  .question-icon { color: ${theme.sketchGold}; font-size: ${px(20, scale)}; margin-bottom: ${px(10, scale)}; letter-spacing: 4px; }
  .branches-row { display: flex; gap: ${px(32, scale)}; flex: 1; align-items: stretch; min-height: 0; width: 100%; justify-content: center; }
  .branch {
    flex: 1; max-width: 46%; padding: ${px(20, scale)} ${px(24, scale)}; border-radius: ${px(18, scale)};
    background: rgba(10, 18, 35, 0.65);
    border: 1px solid ${theme.cardBorder};
  }
  .branch-label { font-size: ${px(28, scale)}; font-weight: 700; margin-bottom: ${px(12, scale)}; }
  .branch-yes { border-color: ${theme.sketchAccentGreen}; }
  .branch-yes .branch-label { color: ${theme.sketchAccentGreen}; }
  .branch-no { border-color: ${theme.sketchAccentBlue}; }
  .branch-no .branch-label { color: ${theme.sketchAccentBlue}; }
  .example {
    font-size: ${px(22, scale)}; line-height: 1.4; padding: ${px(8, scale)} 0 ${px(8, scale)} ${px(16, scale)};
    border-left: 3px solid ${theme.sketchSilver};
  }
  .split-sketch {
    display: flex; flex: 1; gap: ${px(40, scale)}; align-items: center; justify-content: center;
    width: 100%; min-height: 0;
  }
  .chain-canvas {
    flex: 1; display: flex; flex-direction: column; gap: ${px(14, scale)};
    justify-content: center; min-height: 0; width: 100%;
  }
  .chain-canvas-zigzag { max-width: 92%; align-self: center; }
  .chain-canvas-compact { gap: ${px(10, scale)}; max-width: 78%; align-self: center; }
  .chain-item { display: flex; flex-direction: column; gap: ${px(10, scale)}; max-width: 100%; }
  .chain-item.align-left { align-self: flex-start; margin-left: 4%; max-width: 88%; }
  .chain-item.align-right { align-self: flex-end; margin-right: 4%; max-width: 88%; }
  .chain-item-center { align-self: center; max-width: 86%; }
  .u-shape-canvas {
    flex: 1; display: flex; gap: ${px(36, scale)}; align-items: stretch;
    justify-content: center; width: 100%; min-height: 0; padding: 0 ${px(24, scale)};
  }
  .u-col {
    flex: 1; max-width: 42%; display: flex; flex-direction: column;
    gap: ${px(12, scale)}; justify-content: center;
  }
  .u-col-right { justify-content: flex-end; }
  .u-bridge {
    flex: 0 0 ${px(48, scale)}; display: flex; align-items: flex-end;
    justify-content: center; padding-bottom: ${px(24, scale)};
  }
  .sketch-box-hero { border-color: ${theme.accent}; box-shadow: 0 0 28px rgba(251,146,60,0.22); }
  .chain-arrow {
    display: flex; flex-direction: column; align-items: center; gap: ${px(4, scale)};
    color: ${theme.sketchGold}; font-size: ${px(30, scale)}; font-weight: 700;
    margin: ${px(4, scale)} 0;
  }
  ${animated ? `.chain-arrow.reveal-item { opacity: 0 !important; }` : ''}
  .chain-arrow-caption { font-size: ${px(18, scale)}; color: ${theme.textSecondary}; font-weight: 500; }
  .sketch-box {
    border: 2px solid ${theme.cardBorder}; border-radius: ${px(18, scale)};
    padding: ${px(20, scale)} ${px(26, scale)};
    font-size: ${px(26, scale)}; background: rgba(10, 18, 35, 0.82);
    text-align: left; color: ${theme.textPrimary};
    display: flex; flex-direction: column; gap: ${px(8, scale)};
    box-shadow: 0 8px 22px rgba(0,0,0,0.3);
    word-break: break-word; overflow-wrap: anywhere;
    min-width: ${px(280, scale)}; max-width: 100%;
  }
  .sketch-box.shape-pill { border-radius: 999px; border-color: ${theme.accent}; text-align: center; }
  .sketch-box.shape-circle {
    border-radius: 50%; min-width: ${px(220, scale)}; min-height: ${px(220, scale)};
    max-width: ${px(340, scale)}; aspect-ratio: 1;
    align-items: center; justify-content: center; text-align: center;
    border-color: ${theme.sketchAccentBlue}; padding: ${px(28, scale)};
  }
  .sketch-box.shape-diamond {
    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
    padding: ${px(40, scale)} ${px(48, scale)}; min-width: ${px(240, scale)};
    border-color: ${theme.sketchGold}; text-align: center;
  }
  .sketch-box-head {
    display: flex; align-items: center; gap: ${px(12, scale)}; width: 100%;
  }
  .sketch-box-icon { line-height: 0; opacity: 1; flex-shrink: 0; }
  .sketch-box-label { flex: 1; text-align: center; font-weight: 600; line-height: 1.35; }
  .sketch-annotation { font-size: ${px(20, scale)}; color: ${theme.textSecondary}; line-height: 1.35; }
  .tradeoff-row { display: flex; gap: ${px(24, scale)}; justify-content: center; width: 100%; margin-top: ${px(8, scale)}; }
  .tradeoff-col { flex: 1; max-width: 46%; }
  .pipeline { display: flex; align-items: center; gap: ${px(14, scale)}; flex-wrap: wrap; justify-content: center; flex: 1; width: 100%; }
  .pipe-box {
    border: 2px solid ${theme.cardBorder}; border-radius: ${px(18, scale)}; padding: ${px(20, scale)} ${px(28, scale)};
    font-size: ${px(26, scale)}; background: rgba(10, 18, 35, 0.75); min-width: ${px(200, scale)}; text-align: center;
    color: ${theme.textPrimary}; word-break: break-word;
  }
  body.layout-compact h1.title { font-size: ${px(36, scale)}; }
  body.layout-compact .flow-label, body.layout-compact .branch-label { font-size: ${px(24, scale)}; }
  body.layout-compact .chain-canvas { gap: ${px(8, scale)}; }
  body.layout-compact .sketch-box { font-size: ${px(20, scale)}; padding: ${px(14, scale)} ${px(18, scale)}; }
  body.layout-compact .sketch-box.shape-circle { min-width: ${px(190, scale)}; min-height: ${px(190, scale)}; }
`;
}

function renderComparisonHorizontal(elements: SpecElement[], stamp: RevealStamp, sceneId: string): string {
  const flows = elements.filter((e) => e.type === 'flow');
  const annotation = elements.find((e) => e.type === 'annotation');

  const cols = flows
    .map((flow, i) => {
      const steps = (flow.steps ?? [])
        .map((s) => `<div class="flow-step">${escapeHtml(s)}</div>`)
        .join('');
      const iconName = resolveIconName({
        explicit: flow.icon,
        variant: 'sketch',
        seed: `${sceneId}:flow:${i}`,
        textParts: [flow.label, ...(flow.steps ?? [])],
      });
      return `<div class="col">
        <div ${revealBlockAttrs(stamp, `flow-card ${i % 2 ? 'alt' : ''}`)}>
          <div class="sketch-box-icon">${sketchIconSvg(iconName, 36)}</div>
          <div class="flow-label">${escapeHtml(flow.label ?? 'Flow')}</div>
          ${steps}
          ${flow.total ? `<div class="flow-total">${escapeHtml(flow.total)}</div>` : ''}
        </div>
      </div>`;
    })
    .join('');

  const ann = annotation?.text
    ? `<div ${revealAttrs(stamp, 'annotation')}>${escapeHtml(annotation.text)}</div>`
    : '';

  return `<div class="cols">${cols}</div>${ann}`;
}

function renderDecisionTree(elements: SpecElement[], stamp: RevealStamp): string {
  const question = elements.find((e) => e.type === 'question');
  const yes = elements.find((e) => e.type === 'branch_yes');
  const no = elements.find((e) => e.type === 'branch_no');
  const annotation = elements.find((e) => e.type === 'annotation');

  const renderBranch = (branch: SpecElement | undefined, cls: string) => {
    if (!branch) return '';
    const examples = (branch.examples ?? [])
      .map((ex) => `<div class="example">${escapeHtml(ex)}</div>`)
      .join('');
    return `<div ${revealBlockAttrs(stamp, `branch ${cls}`)}>
      <div class="branch-label">${escapeHtml(branch.label ?? '')}</div>
      ${examples}
    </div>`;
  };

  return `<div class="decision-layout">
    ${question ? `<div ${revealBlockAttrs(stamp, 'question-banner')}>
      <div class="question-icon">◆ DECISION ◆</div>
      <div>${escapeHtml(question.text ?? '')}</div>
    </div>` : ''}
    <div class="branches-row">
      ${renderBranch(yes, 'branch-yes')}
      ${renderBranch(no, 'branch-no')}
    </div>
    ${annotation?.text ? `<div ${revealAttrs(stamp, 'annotation')}>${escapeHtml(annotation.text)}</div>` : ''}
  </div>`;
}

function renderPipelineHorizontal(elements: SpecElement[], stamp: RevealStamp, sceneId: string): string {
  const boxes = elements.filter((e) => e.type === 'box' || e.type === 'workflow');
  const parts: string[] = [];

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    parts.push(renderSketchBox(stamp, box, sceneId, i, 'pipe-box'));
    if (i < boxes.length - 1) parts.push(renderArrowStep(stamp, undefined, 'right'));
  }

  const annotation = elements.find((e) => e.type === 'annotation');
  return `<div class="pipeline">${parts.join('')}</div>
    ${annotation?.text ? `<div ${revealAttrs(stamp, 'annotation')}>${escapeHtml(annotation.text)}</div>` : ''}`;
}

function renderSketchBody(
  layout: SketchLayoutKind,
  elements: SpecElement[],
  stamp: RevealStamp,
  sceneId: string,
): string {
  switch (layout) {
    case 'comparison_horizontal':
      return renderComparisonHorizontal(elements, stamp, sceneId);
    case 'decision_tree':
      return renderDecisionTree(elements, stamp);
    case 'flow_vertical':
    case 'box_chain':
    case 'u_shape':
    case 'compact_vertical':
      return renderBoxChain(elements, stamp, sceneId, layout);
    case 'pipeline_horizontal':
    default:
      return renderPipelineHorizontal(elements, stamp, sceneId);
  }
}

export function excalidrawRevealItemCount(scene: ProductionScene, animated: boolean): number {
  if (!animated) return 0;
  const elements = parseElements(scene.data);
  const stamp = createRevealStamp(scene.scene_id, true);
  const layout = resolveSketchLayout(asString(scene.data.layout, 'pipeline_horizontal'), elements);
  renderSketchBody(layout, elements, stamp, scene.scene_id);
  return stamp.index;
}

export function buildExcalidrawHtml(
  scene: ProductionScene,
  themeInput?: VisualTheme,
  scaleOverride?: number,
  animated = false,
): string {
  const theme = themeInput ?? resolveTheme();
  const elements = parseElements(scene.data);
  const layout = resolveSketchLayout(asString(scene.data.layout, 'pipeline_horizontal'), elements);
  const title = humanizeTitle(scene);
  const blockCount = countSketchBlocks(elements);
  const scale = scaleOverride ?? sparseScaleForCount(blockCount);
  const stamp = createRevealStamp(scene.scene_id, animated);
  const body = renderSketchBody(layout, elements, stamp, scene.scene_id);
  const compactClass = layout === 'compact_vertical' ? ' layout-compact' : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<style>${buildSketchCss(theme, scale, animated)}</style></head>
<body class="${compactClass.trim()}">
  <div class="brand-layer"></div>
  <div class="frame"><div class="frame-inner sketch-content">
    <div class="sketch-title-band"><h1 class="title">${escapeHtml(title)}</h1></div>
    <div class="sketch-body">${body}</div>
  </div></div>
</body></html>`;
}
