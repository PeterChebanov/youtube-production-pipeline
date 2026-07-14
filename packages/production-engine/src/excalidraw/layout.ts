/** Vertical gap band height as % of canvas (~60px @ typical body height). */
export const SKETCH_CONNECTOR_BAND_V_PCT = 8.5;
/** Horizontal gap band width as % of canvas. */
export const SKETCH_CONNECTOR_BAND_H_PCT = 11;

/** @deprecated Use SKETCH_CONNECTOR_BAND_V_PCT */
export const SKETCH_CONNECTOR_BAND_PCT = SKETCH_CONNECTOR_BAND_V_PCT;

/** 12-column sketch grid with 9% horizontal / 10% vertical safe margins. */
export const SKETCH_GRID_COLS = 12;
export const SKETCH_MARGIN_X_PCT = 9;
export const SKETCH_MARGIN_Y_PCT = 10;

export interface SketchElement {
  type: string;
  label?: string;
  text?: string;
  annotation?: string;
  icon?: string;
  position?: string;
}

export interface SketchChainItem {
  box: SketchElement;
  arrowLabel?: string;
}

export interface SketchNodePlacement {
  index: number;
  box: SketchElement;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export interface SketchConnectorPlacement {
  fromIndex: number;
  toIndex: number;
  label?: string;
  direction: 'down' | 'right' | 'up';
}

export interface SketchConnectorBandPlacement {
  fromIndex: number;
  toIndex: number;
  label?: string;
  direction: 'down' | 'right';
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export interface SketchLayoutPlan {
  kind: string;
  nodes: SketchNodePlacement[];
  connectors: SketchConnectorPlacement[];
  bands: SketchConnectorBandPlacement[];
  scale: number;
}

export function parseSketchChain(elements: SketchElement[]): SketchChainItem[] {
  const items: SketchChainItem[] = [];
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

function cellToPct(col: number, colSpan: number, row: number, rowSpan: number): SketchNodePlacement['leftPct'] extends number ? Pick<SketchNodePlacement, 'leftPct' | 'topPct' | 'widthPct' | 'heightPct'> : never {
  const colW = (100 - 2 * SKETCH_MARGIN_X_PCT) / SKETCH_GRID_COLS;
  const rowH = 8;
  return {
    leftPct: SKETCH_MARGIN_X_PCT + col * colW,
    topPct: SKETCH_MARGIN_Y_PCT + row * rowH,
    widthPct: colSpan * colW,
    heightPct: rowSpan * rowH,
  };
}

function layoutFlowVertical(chain: SketchChainItem[]): SketchNodePlacement[] {
  const n = chain.length;
  if (n === 0) return [];
  const colSpan = n <= 2 ? 8 : n <= 4 ? 7 : 6;
  const colW = (100 - 2 * SKETCH_MARGIN_X_PCT) / SKETCH_GRID_COLS;
  const col = (SKETCH_GRID_COLS - colSpan) / 2;
  const bandCount = Math.max(0, n - 1);
  const bandTotal = bandCount * SKETCH_CONNECTOR_BAND_V_PCT;
  const usableH = 100 - 2 * SKETCH_MARGIN_Y_PCT - bandTotal;
  const nodeH = usableH / n;

  let top = SKETCH_MARGIN_Y_PCT;
  return chain.map((item, i) => {
    const placement = {
      index: i,
      box: item.box,
      leftPct: SKETCH_MARGIN_X_PCT + col * colW,
      topPct: top,
      widthPct: colSpan * colW,
      heightPct: nodeH,
    };
    top += nodeH;
    if (i < n - 1) top += SKETCH_CONNECTOR_BAND_V_PCT;
    return placement;
  });
}

function layoutPipelineHorizontal(chain: SketchChainItem[]): SketchNodePlacement[] {
  const n = chain.length;
  if (n === 0) return [];
  const colW = (100 - 2 * SKETCH_MARGIN_X_PCT) / SKETCH_GRID_COLS;
  const rowSpan = n <= 2 ? 3 : 2;
  const row = 4;
  const rowH = 8;
  const rowTop = SKETCH_MARGIN_Y_PCT + row * rowH;
  const rowHeight = rowSpan * rowH;

  if (n === 2) {
    const nodeW = 4 * colW;
    const bandW = SKETCH_CONNECTOR_BAND_H_PCT;
    const totalW = nodeW * 2 + bandW;
    const startLeft = (100 - totalW) / 2;
    return chain.map((item, i) => ({
      index: i,
      box: item.box,
      leftPct: i === 0 ? startLeft : startLeft + nodeW + bandW,
      topPct: rowTop,
      widthPct: nodeW,
      heightPct: rowHeight,
    }));
  }
  const colSpan = Math.min(3, Math.floor(10 / n));
  const gap = 1;
  const totalSpan = n * colSpan + (n - 1) * gap;
  const startCol = (SKETCH_GRID_COLS - totalSpan) / 2;
  return chain.map((item, i) => {
    const col = startCol + i * (colSpan + gap);
    return { index: i, box: item.box, ...cellToPct(col, colSpan, row, rowSpan) };
  });
}

function layoutDecisionTree(chain: SketchChainItem[]): SketchNodePlacement[] {
  const nodes: SketchNodePlacement[] = [];
  if (chain.length === 0) return nodes;

  const colW = (100 - 2 * SKETCH_MARGIN_X_PCT) / SKETCH_GRID_COLS;
  const band = SKETCH_CONNECTOR_BAND_V_PCT;
  const usable = 100 - 2 * SKETCH_MARGIN_Y_PCT - band * 2;
  const h0 = usable * 0.24;
  const h1 = usable * 0.28;
  const h2 = usable * 0.28;

  let top = SKETCH_MARGIN_Y_PCT;
  nodes.push({
    index: 0,
    box: chain[0]!.box,
    leftPct: SKETCH_MARGIN_X_PCT + 2 * colW,
    topPct: top,
    widthPct: 8 * colW,
    heightPct: h0,
  });
  top += h0 + band;

  if (chain.length > 1) {
    nodes.push({
      index: 1,
      box: chain[1]!.box,
      leftPct: SKETCH_MARGIN_X_PCT + 1 * colW,
      topPct: top,
      widthPct: 10 * colW,
      heightPct: h1,
    });
    top += h1 + band;
  }
  if (chain.length > 2) {
    nodes.push({
      index: 2,
      box: chain[2]!.box,
      leftPct: SKETCH_MARGIN_X_PCT + 1 * colW,
      topPct: top,
      widthPct: 5 * colW,
      heightPct: h2,
    });
  }
  if (chain.length > 3) {
    nodes.push({
      index: 3,
      box: chain[3]!.box,
      leftPct: SKETCH_MARGIN_X_PCT + 6 * colW,
      topPct: top,
      widthPct: 5 * colW,
      heightPct: h2,
    });
  }
  for (let i = 4; i < chain.length; i++) {
    const col = i % 2 === 0 ? 1 : 6;
    const row = 7 + Math.floor((i - 4) / 2) * 3;
    nodes.push({ index: i, box: chain[i]!.box, ...cellToPct(col, 5, row, 2) });
  }
  return nodes;
}

function connectorsForChain(
  chain: SketchChainItem[],
  direction: 'down' | 'right',
): SketchConnectorPlacement[] {
  const out: SketchConnectorPlacement[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    out.push({
      fromIndex: i,
      toIndex: i + 1,
      label: chain[i + 1]?.arrowLabel,
      direction,
    });
  }
  return out;
}

/** Branching connectors: root → hub, hub → leaves (not leaf → leaf). */
function connectorsForDecisionTree(chain: SketchChainItem[]): SketchConnectorPlacement[] {
  const out: SketchConnectorPlacement[] = [];
  if (chain.length < 2) return out;
  out.push({
    fromIndex: 0,
    toIndex: 1,
    label: chain[1]?.arrowLabel,
    direction: 'down',
  });
  if (chain.length >= 3) {
    out.push({
      fromIndex: 1,
      toIndex: 2,
      label: chain[2]?.arrowLabel,
      direction: 'down',
    });
  }
  if (chain.length >= 4) {
    out.push({ fromIndex: 1, toIndex: 3, direction: 'down' });
  }
  return out;
}

export function resolveSketchLayoutKind(layout: string, elements: SketchElement[]): string {
  const normalized = layout.trim().toLowerCase();
  if (normalized === 'pipeline_horizontal') return 'pipeline_horizontal';
  if (normalized === 'flow_vertical' || normalized === 'flowchart_vertical') return 'flow_vertical';
  if (normalized === 'decision_tree') {
    const chain = parseSketchChain(elements);
    if (chain.length >= 3 && /trade|lower-|✓|✗/i.test(chain.map((c) => c.box.position || c.box.label || '').join(' '))) {
      return 'decision_tree';
    }
    return chain.length <= 4 ? 'flow_vertical' : 'decision_tree';
  }
  if (elements.some((e) => e.type === 'flow')) return 'comparison_horizontal';
  if (elements.some((e) => e.type === 'question')) return 'decision_tree';
  const chain = parseSketchChain(elements);
  if (chain.length <= 2) return 'pipeline_horizontal';
  if (chain.length <= 4) return 'flow_vertical';
  return 'decision_tree';
}

function buildConnectorBands(
  nodes: SketchNodePlacement[],
  connectors: SketchConnectorPlacement[],
): SketchConnectorBandPlacement[] {
  const byIndex = new Map(nodes.map((n) => [n.index, n]));
  const gapMap = new Map<string, SketchConnectorBandPlacement>();

  for (const c of connectors) {
    const from = byIndex.get(c.fromIndex);
    const to = byIndex.get(c.toIndex);
    if (!from || !to) continue;

    const key = c.direction === 'right' ? `h:${c.fromIndex}` : `v:${c.fromIndex}`;
    const existing = gapMap.get(key);

    if (c.direction === 'right') {
      if (!existing) {
        gapMap.set(key, {
          fromIndex: c.fromIndex,
          toIndex: c.toIndex,
          label: c.label,
          direction: 'right',
          leftPct: from.leftPct + from.widthPct,
          topPct: Math.min(from.topPct, to.topPct),
          widthPct: SKETCH_CONNECTOR_BAND_H_PCT,
          heightPct: Math.max(from.heightPct, to.heightPct),
        });
      } else if (c.label && !existing.label) {
        existing.label = c.label;
      }
      continue;
    }

    if (!existing) {
      const left = Math.min(from.leftPct, to.leftPct);
      const right = Math.max(from.leftPct + from.widthPct, to.leftPct + to.widthPct);
      gapMap.set(key, {
        fromIndex: c.fromIndex,
        toIndex: c.toIndex,
        label: c.label,
        direction: 'down',
        leftPct: left,
        topPct: from.topPct + from.heightPct,
        widthPct: right - left,
        heightPct: SKETCH_CONNECTOR_BAND_V_PCT,
      });
    } else if (c.label && !existing.label) {
      existing.label = c.label;
      existing.widthPct = Math.max(
        existing.widthPct,
        Math.max(from.leftPct + from.widthPct, to.leftPct + to.widthPct) -
          Math.min(from.leftPct, to.leftPct),
      );
    }
  }
  return [...gapMap.values()];
}

export function buildSketchLayoutPlan(layout: string, elements: SketchElement[]): SketchLayoutPlan {
  const kind = resolveSketchLayoutKind(layout, elements);
  const chain = parseSketchChain(elements);
  const blockCount = chain.length;
  const scale = sparseScaleForCount(blockCount);

  let nodes: SketchNodePlacement[];
  let direction: 'down' | 'right' = 'down';

  switch (kind) {
    case 'pipeline_horizontal':
      nodes = layoutPipelineHorizontal(chain);
      direction = 'right';
      break;
    case 'decision_tree':
      nodes = layoutDecisionTree(chain);
      direction = 'down';
      break;
    case 'flow_vertical':
    default:
      nodes = layoutFlowVertical(chain);
      direction = 'down';
      break;
  }

  const connectors =
    kind === 'decision_tree'
      ? connectorsForDecisionTree(chain)
      : connectorsForChain(chain, direction);

  return {
    kind,
    nodes,
    connectors,
    bands: buildConnectorBands(nodes, connectors),
    scale,
  };
}

/** Scale up sketch boards with few blocks so they fill the 1080p frame. */
export function sparseScaleForCount(blockCount: number): number {
  if (blockCount <= 2) return 1.28;
  if (blockCount <= 3) return 1.12;
  if (blockCount <= 4) return 0.98;
  if (blockCount <= 5) return 0.92;
  return 0.88;
}

export function sparseScaleCandidates(blockCount: number): number[] {
  const primary = sparseScaleForCount(blockCount);
  const out: number[] = [primary];
  if (primary > 1.15) out.push(1.12);
  if (primary > 1.0) out.push(1.0);
  return [...new Set(out)];
}

export function countSketchBlocks(elements: { type: string }[]): number {
  return elements.filter((e) => e.type !== 'connector' && e.type !== 'arrow').length;
}
