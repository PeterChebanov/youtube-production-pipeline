import type { ProductionScene } from '@ecpe/schemas';
import type { VisualTheme } from '../themes/index.js';
import { resolveTheme } from '../themes/index.js';
import { BRAND_FRAME_CSS } from '../themes/background.js';
import {
  buildSketchLayoutPlan,
  countSketchBlocks,
  parseSketchChain,
  sparseScaleForCount,
  type SketchConnectorPlacement,
  type SketchConnectorBandPlacement,
  type SketchElement,
  type SketchNodePlacement,
} from './layout.js';
import { revealAnimationCss, pickRevealAnimation, revealItemStyle } from '../animations/reveal.js';
import {
  createRevealStamp,
  revealAttrs,
  revealBlockAttrs,
  type RevealStamp,
} from '../animations/stamp.js';
import { resolveIconName, sketchIconBadgeHtml } from '../icons/index.js';
import { sketchRoughScript } from './rough-script.js';
import {
  accentuateSketchHtml,
  annotationTone,
  shortenSketchLabel,
} from './text-format.js';
import { resolveSketchFillStyle } from './block-style.js';
import { sketchBlockTimings, sketchConnectorDelay } from './reveal-timing.js';
import { SLIDE_TITLE_BAND_MIN_PX, SLIDE_TITLE_FONT_PX } from '../themes/slide-title.js';

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

interface SpecElement extends SketchElement {
  steps?: string[];
  total?: string;
  examples?: string[];
  text?: string;
}

function parseElements(data: Record<string, unknown>): SpecElement[] {
  let raw = data.elements;
  if (!Array.isArray(raw) || raw.length === 0) {
    const boxes = data.boxes;
    if (Array.isArray(boxes)) {
      raw = boxes.map((item) => {
        const box = item as Record<string, unknown>;
        return {
          type: 'box',
          label: box.label,
          annotation: box.annotation,
          icon: box.icon,
          text: box.text,
        };
      });
    }
  }
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

function boxIconHtml(box: SketchElement, sceneId: string, index: number, size: number): string {
  const name = resolveIconName({
    explicit: box.icon,
    variant: 'sketch',
    seed: `${sceneId}:box:${index}`,
    textParts: [box.label, box.text, box.annotation],
  });
  return sketchIconBadgeHtml(name, size);
}

function sketchRevealInnerAttrs(
  stamp: RevealStamp,
  blockIndex: number,
  className: string,
): string {
  if (!stamp.enabled) return `class="${className}"`;
  const { contentDelay } = sketchBlockTimings(blockIndex);
  const anim = pickRevealAnimation(stamp.sceneId, blockIndex * 2);
  stamp.blockIndex = Math.max(stamp.blockIndex, blockIndex + 1);
  stamp.index = Math.max(stamp.index, blockIndex * 2 + 1);
  return `class="${className} reveal-item reveal-${anim}" style="${revealItemStyle(anim, contentDelay)}"`;
}

function renderSketchNode(
  stamp: RevealStamp,
  placement: SketchNodePlacement,
  sceneId: string,
  scale: number,
  layoutKind: string,
  total: number,
  animated: boolean,
): string {
  const box = placement.box;
  const rawLabel = box.label || box.text || `Step ${placement.index + 1}`;
  const label = accentuateSketchHtml(escapeHtml(shortenSketchLabel(rawLabel)));
  const annTone = box.annotation
    ? annotationTone(rawLabel, box.annotation)
    : 'neutral';
  const ann = box.annotation
    ? `<div class="sketch-annotation sketch-annotation-${annTone}">${accentuateSketchHtml(escapeHtml(shortenSketchLabel(box.annotation)))}</div>`
    : '';
  const fillStyle = resolveSketchFillStyle(box, placement.index, total, layoutKind);
  const { frameDelay } = sketchBlockTimings(placement.index);
  const style = `left:${placement.leftPct.toFixed(3)}%;top:${placement.topPct.toFixed(3)}%;width:${placement.widthPct.toFixed(3)}%;height:${placement.heightPct.toFixed(3)}%`;
  const iconSize = Math.round(48 * scale);
  const innerAttrs = animated
    ? sketchRevealInnerAttrs(stamp, placement.index, 'sketch-node-inner')
    : 'class="sketch-node-inner"';
  const frameDelayAttr = animated ? ` data-frame-delay="${frameDelay.toFixed(3)}"` : '';
  return `<div class="sketch-node" data-node="${placement.index}" data-fill="${fillStyle}"${frameDelayAttr} style="${style}">
    <div ${innerAttrs}>
      <div class="sketch-box-head">
        <div class="sketch-box-icon">${boxIconHtml(box, sceneId, placement.index, iconSize)}</div>
        <div class="sketch-box-label">${label}</div>
      </div>
      ${ann}
    </div>
  </div>`;
}

function connectorPayload(
  connectors: SketchConnectorPlacement[],
  stamp: RevealStamp,
): string {
  const payload = connectors.map((c) => {
    const stepIndex = c.fromIndex * 2 + 1;
    stamp.index = Math.max(stamp.index, stepIndex + 2);
    return {
      from: c.fromIndex,
      to: c.toIndex,
      dir: c.direction,
      label: c.label ?? '',
      delay: sketchConnectorDelay(c.fromIndex),
    };
  });
  return JSON.stringify(payload);
}

function renderConnectorBand(
  band: SketchConnectorBandPlacement,
  animated: boolean,
): string {
  const style = `left:${band.leftPct.toFixed(3)}%;top:${band.topPct.toFixed(3)}%;width:${band.widthPct.toFixed(3)}%;height:${band.heightPct.toFixed(3)}%`;
  const label = band.label
    ? `<div class="sketch-band-label">${escapeHtml(band.label)}</div>`
    : '';
  const dirCls = band.direction === 'right' ? 'sketch-connector-band-h' : 'sketch-connector-band-v';
  const delay = sketchConnectorDelay(band.fromIndex);
  const attrs = animated
    ? `class="sketch-connector-band ${dirCls} reveal-item" style="animation: sketchConnShow 0.5s ease ${delay}s forwards; opacity:0; ${style}"`
    : `class="sketch-connector-band ${dirCls}" style="${style}"`;
  return `<div ${attrs} data-conn-from="${band.fromIndex}" data-dir="${band.direction}">
    <div class="sketch-band-label-zone">${label}</div>
    <div class="sketch-band-arrow-zone" aria-hidden="true"></div>
  </div>`;
}

function renderGridCanvas(
  layout: string,
  elements: SpecElement[],
  stamp: RevealStamp,
  sceneId: string,
  scale: number,
  animated: boolean,
): string {
  const plan = buildSketchLayoutPlan(layout, elements);
  type CanvasItem = { top: number; html: string };
  const items: CanvasItem[] = [];

  for (const n of plan.nodes) {
    items.push({
      top: n.topPct,
      html: renderSketchNode(stamp, n, sceneId, scale, plan.kind, plan.nodes.length, animated),
    });
  }
  for (const b of plan.bands) {
    items.push({ top: b.topPct, html: renderConnectorBand(b, animated) });
  }
  items.sort((a, b) => a.top - b.top);

  const connectorsJson = connectorPayload(plan.connectors, stamp);

  return `<div class="sketch-grid-canvas" data-animated="${animated ? 'true' : 'false'}" data-connectors='${connectorsJson.replace(/'/g, '&#39;')}'>
    ${items.map((i) => i.html).join('')}
    <svg class="sketch-overlay" aria-hidden="true"></svg>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/roughjs@4.6.6/bundled/rough.js"></script>
  <script>${sketchRoughScript()}</script>`;
}

function buildSketchCss(theme: VisualTheme, scale = 1, animated = false): string {
  const bodyLabel = Math.round(38 * scale);
  const bodyAnn = Math.round(27 * scale);
  const connLabel = Math.round(22 * scale);
  return `
  ${animated ? revealAnimationCss() : ''}
  ${BRAND_FRAME_CSS}
  @font-face {
    font-family: 'Excalifont';
    src: url('https://excalidraw.nyc3.cdn.digitaloceanspaces.com/fonts/Excalifont-Regular.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  body.sketch-mode .sketch-dot-layer {
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background-image: radial-gradient(circle, rgba(210, 220, 240, 0.16) 1.2px, transparent 1.2px);
    background-size: 20px 20px;
  }
  body.sketch-mode .brand-layer { z-index: 0; }
  body.sketch-mode .brand-layer::after { z-index: 1; }
  body.sketch-mode .frame { z-index: 2; }
  @keyframes sketchFrameDraw { from { opacity: 0; } to { opacity: 1; } }
  @keyframes sketchConnShow { from { opacity: 0; } to { opacity: 1; } }
  .sketch-content {
    display: flex; flex-direction: column;
    justify-content: flex-start; align-items: stretch;
    flex: 1; min-height: 0; width: 100%; gap: ${px(12, scale)};
  }
  .sketch-title-band {
    flex-shrink: 0; width: 100%; padding: 0 9%;
    min-height: ${SLIDE_TITLE_BAND_MIN_PX}px; margin-bottom: ${px(8, scale)};
  }
  h1.title {
    font-family: 'Excalifont', 'Segoe Print', cursive;
    font-size: ${SLIDE_TITLE_FONT_PX}px; font-weight: 400; margin: 0;
    color: ${theme.sketchTitle}; letter-spacing: 0.01em; line-height: 1.1;
  }
  .sketch-body { flex: 1; min-height: 0; width: 100%; position: relative; }
  .sketch-grid-canvas {
    position: relative; width: 100%; height: 100%; min-height: ${px(620, scale)};
  }
  .sketch-node {
    position: absolute; box-sizing: border-box; display: flex;
    align-items: stretch; justify-content: stretch; overflow: hidden;
  }
  .sketch-node-inner {
    width: 100%; height: 100%; display: flex; flex-direction: column;
    justify-content: center; gap: ${px(8, scale)};
    padding: ${px(14, scale)} ${px(18, scale)}; box-sizing: border-box;
    font-family: 'Excalifont', 'Segoe Print', cursive;
    color: ${theme.textPrimary}; background: transparent; border: none;
    box-shadow: none;
  }
  .sketch-box-head {
    display: flex; align-items: center; gap: ${px(12, scale)}; width: 100%;
  }
  .sketch-box-icon { line-height: 0; flex-shrink: 0; }
  .sketch-box-label {
    flex: 1; text-align: left; font-size: ${bodyLabel}px;
    font-weight: 400; line-height: 1.32;
  }
  .sketch-annotation {
    font-size: ${bodyAnn}px; color: #d4d4d8;
    line-height: 1.4; text-align: left;
  }
  .sketch-annotation-negative { color: #fcd9a0; }
  .sketch-annotation-positive { color: #a7f3d0; }
  .sketch-accent-positive { color: ${theme.sketchAccentGreen}; font-weight: 600; }
  .sketch-accent-negative { color: ${theme.sketchGold}; font-weight: 600; }
  .sketch-connector-band {
    position: absolute; box-sizing: border-box; z-index: 3;
    display: flex; flex-direction: column; align-items: stretch;
    pointer-events: none; overflow: hidden;
  }
  .sketch-band-label-zone {
    flex: 0 0 45%; display: flex; align-items: center; justify-content: center;
  }
  .sketch-band-arrow-zone { flex: 1 1 55%; min-height: ${px(32, scale)}; }
  .sketch-band-label {
    font-family: 'Excalifont', cursive; font-size: ${connLabel}px;
    color: #e8edf5; text-align: center; line-height: 1.2;
    max-width: 92%;
  }
  .sketch-overlay {
    position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 4;
  }
  .sketch-rough-connector { opacity: 0; }
  .cols { display: flex; gap: ${px(28, scale)}; align-items: stretch; flex: 1; padding: 0 9%; }
  .col { flex: 1; display: flex; flex-direction: column; justify-content: center; max-width: 46%; }
  .flow-card {
    border: none; border-radius: 0; padding: ${px(20, scale)};
    background: transparent; box-shadow: none; margin-bottom: ${px(12, scale)};
    font-family: 'Excalifont', cursive;
  }
  .flow-label { font-size: ${bodyLabel}px; color: ${theme.accent}; margin-bottom: ${px(8, scale)}; }
  .flow-step {
    font-size: ${Math.round(30 * scale)}px; line-height: 1.4; padding: ${px(4, scale)} 0;
    color: ${theme.textPrimary};
  }
  .flow-total { font-size: ${Math.round(32 * scale)}px; margin-top: ${px(10, scale)}; color: ${theme.accentAlt}; }
  .annotation {
    border: none; padding: ${px(16, scale)}; font-size: ${Math.round(30 * scale)}px;
    background: transparent; color: #d4d4d8; text-align: center;
    font-family: 'Excalifont', cursive;
  }
  .decision-layout { display: flex; flex-direction: column; gap: ${px(24, scale)}; flex: 1; padding: 0 9%; }
  .question-banner {
    padding: ${px(18, scale)} ${px(24, scale)}; background: transparent; border: none;
    text-align: center; font-size: ${Math.round(34 * scale)}px; font-family: 'Excalifont', cursive;
    box-shadow: none;
  }
  .branches-row { display: flex; gap: ${px(24, scale)}; justify-content: center; }
  .branch {
    flex: 1; max-width: 46%; padding: ${px(16, scale)}; background: transparent; border: none;
    font-family: 'Excalifont', cursive;
  }
  .branch-label { font-size: ${Math.round(34 * scale)}px; margin-bottom: ${px(8, scale)}; }
  .example { font-size: ${bodyAnn}px; line-height: 1.4; }
  body.layout-compact h1.title { font-size: ${Math.round(SLIDE_TITLE_FONT_PX * 0.82)}px; }
  body.layout-compact .sketch-box-label { font-size: ${Math.round(bodyLabel * 0.82)}px; }
  body.layout-dense .sketch-box-label { font-size: ${Math.round(bodyLabel * 0.88)}px; }
  body.layout-dense .sketch-annotation { font-size: ${Math.round(bodyAnn * 0.9)}px; }
  body.layout-dense h1.title { font-size: ${Math.round(SLIDE_TITLE_FONT_PX * 0.88)}px; }
`;
}

function renderComparisonHorizontal(elements: SpecElement[], stamp: RevealStamp, sceneId: string, scale: number): string {
  const flows = elements.filter((e) => e.type === 'flow');
  const annotation = elements.find((e) => e.type === 'annotation');
  const cols = flows
    .map((flow, i) => {
      const steps = (flow.steps ?? []).map((s) => `<div class="flow-step">${escapeHtml(s)}</div>`).join('');
      const iconName = resolveIconName({
        explicit: flow.icon,
        variant: 'sketch',
        seed: `${sceneId}:flow:${i}`,
        textParts: [flow.label, ...(flow.steps ?? [])],
      });
      return `<div class="col"><div ${revealBlockAttrs(stamp, 'flow-card')}>
        <div class="sketch-box-icon">${boxIconHtml({ type: 'box', icon: iconName, label: flow.label }, sceneId, i, Math.round(36 * scale))}</div>
        <div class="flow-label">${escapeHtml(flow.label ?? 'Flow')}</div>${steps}
        ${flow.total ? `<div class="flow-total">${escapeHtml(flow.total)}</div>` : ''}
      </div></div>`;
    })
    .join('');
  const ann = annotation?.text ? `<div ${revealAttrs(stamp, 'annotation')}>${escapeHtml(annotation.text)}</div>` : '';
  return `<div class="cols">${cols}</div>${ann}`;
}

function renderQuestionDecision(elements: SpecElement[], stamp: RevealStamp): string {
  const question = elements.find((e) => e.type === 'question');
  const yes = elements.find((e) => e.type === 'branch_yes');
  const no = elements.find((e) => e.type === 'branch_no');
  const annotation = elements.find((e) => e.type === 'annotation');
  const branch = (b: SpecElement | undefined, cls: string) => {
    if (!b) return '';
    const examples = (b.examples ?? []).map((ex) => `<div class="example">${escapeHtml(ex)}</div>`).join('');
    return `<div ${revealBlockAttrs(stamp, `branch ${cls}`)}>
      <div class="branch-label">${escapeHtml(b.label ?? '')}</div>${examples}
    </div>`;
  };
  return `<div class="decision-layout">
    ${question ? `<div ${revealBlockAttrs(stamp, 'question-banner')}>${escapeHtml(question.text ?? '')}</div>` : ''}
    <div class="branches-row">${branch(yes, 'branch-yes')}${branch(no, 'branch-no')}</div>
    ${annotation?.text ? `<div ${revealAttrs(stamp, 'annotation')}>${escapeHtml(annotation.text)}</div>` : ''}
  </div>`;
}

function renderSketchBody(
  layoutKind: string,
  elements: SpecElement[],
  stamp: RevealStamp,
  sceneId: string,
  scale: number,
  animated: boolean,
): string {
  if (elements.some((e) => e.type === 'flow')) {
    return renderComparisonHorizontal(elements, stamp, sceneId, scale);
  }
  if (elements.some((e) => e.type === 'question')) {
    return renderQuestionDecision(elements, stamp);
  }
  const layout = asString(layoutKind, 'flow_vertical');
  const chain = parseSketchChain(elements);
  if (chain.length === 0) return '';
  return renderGridCanvas(layout, elements, stamp, sceneId, scale, animated);
}

export function excalidrawRevealItemCount(scene: ProductionScene, animated: boolean): number {
  if (!animated) return 0;
  const elements = parseElements(scene.data);
  const stamp = createRevealStamp(scene.scene_id, true);
  const layout = asString(scene.data.layout, 'flow_vertical');
  renderSketchBody(layout, elements, stamp, scene.scene_id, sparseScaleForCount(countSketchBlocks(elements)), animated);
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
  const layout = asString(scene.data.layout, 'flow_vertical');
  const title = humanizeTitle(scene);
  const blockCount = countSketchBlocks(elements);
  const scale = scaleOverride ?? sparseScaleForCount(blockCount);
  const stamp = createRevealStamp(scene.scene_id, animated);
  const body = renderSketchBody(layout, elements, stamp, scene.scene_id, scale, animated);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<style>${buildSketchCss(theme, scale, animated)}</style></head>
<body class="sketch-mode${blockCount >= 4 ? ' layout-dense' : ''}">
  <div class="brand-layer"></div>
  <div class="sketch-dot-layer" aria-hidden="true"></div>
  <div class="frame"><div class="frame-inner sketch-content">
    <div class="sketch-title-band"><h1 class="title">${escapeHtml(title)}</h1></div>
    <div class="sketch-body">${body}</div>
  </div></div>
</body></html>`;
}
