/** Reusable sketch block fill styles (assign via data-fill on nodes). */
export type SketchFillStyle = 'outline' | 'accent' | 'accent-positive' | 'accent-caution';

const OUTLINE_STROKE = '#5eead4';
const ACCENT_STROKE = '#f0c14b';
const POSITIVE_STROKE = '#4ade80';
const CAUTION_STROKE = '#f97316';

export interface SketchFillSpec {
  style: SketchFillStyle;
  stroke: string;
  fill: string;
  fillStyle: 'solid' | 'hachure';
}

export const SKETCH_FILL_SPECS: Record<SketchFillStyle, SketchFillSpec> = {
  outline: {
    style: 'outline',
    stroke: OUTLINE_STROKE,
    fill: 'transparent',
    fillStyle: 'solid',
  },
  accent: {
    style: 'accent',
    stroke: ACCENT_STROKE,
    fill: 'rgba(240, 193, 75, 0.2)',
    fillStyle: 'solid',
  },
  'accent-positive': {
    style: 'accent-positive',
    stroke: POSITIVE_STROKE,
    fill: 'rgba(74, 222, 128, 0.18)',
    fillStyle: 'solid',
  },
  'accent-caution': {
    style: 'accent-caution',
    stroke: CAUTION_STROKE,
    fill: 'rgba(249, 115, 22, 0.18)',
    fillStyle: 'solid',
  },
};

export function resolveSketchFillStyle(
  box: { label?: string; text?: string; annotation?: string; position?: string },
  index: number,
  total: number,
  layoutKind: string,
): SketchFillStyle {
  const label = `${box.label ?? ''} ${box.text ?? ''} ${box.annotation ?? ''}`;
  const pos = (box.position ?? '').toLowerCase();

  if (/✗|expensive|unpredictable|wrong|failure/i.test(label) && /✗/.test(label)) {
    return 'accent-caution';
  }
  if (layoutKind === 'decision_tree' && index >= 2 && /✓/.test(label)) {
    return 'accent-positive';
  }
  if (layoutKind === 'decision_tree' && index >= 2 && /✗/.test(label)) {
    return 'accent-caution';
  }
  if (/escalation|retrieval failure, not generation/i.test(label)) return 'accent';
  if (layoutKind === 'flow_vertical' && index === total - 1) return 'accent';
  if (pos === 'bottom' || pos === 'lower-left' || pos === 'lower-right') return 'accent';
  return 'outline';
}

export function sketchFillSpec(style: SketchFillStyle): SketchFillSpec {
  return SKETCH_FILL_SPECS[style];
}
