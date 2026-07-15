import type { NarrationBlock, NarrationSegments, ProductionPlan, ProductionScene } from '@ecpe/schemas';

export const MAX_HOLD_SEC = 42;
export const MIN_HOLD_SEC = 8;
export const MAX_MOTION_VIDEO_SEC = 45;

const DENSITY_RENDERERS = new Set(['motion', 'ui-cards']);
const SPARSE_HOLD_THRESHOLD_SEC = 30;

export interface PlanValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b);
}

export function minScenesForBlock(blockDurationSec: number): number {
  if (blockDurationSec <= MAX_HOLD_SEC) return 1;
  const ratio = blockDurationSec / MAX_HOLD_SEC;
  const floor = Math.floor(ratio);
  // 252s / 42s ≈ 6.005 — do not force a 7th scene for sub-2% overrun (LLM retry churn).
  if (floor >= 1 && ratio - floor < 0.02) return floor;
  return Math.ceil(ratio);
}

export function minStepsForHold(holdSec: number): number {
  if (holdSec <= SPARSE_HOLD_THRESHOLD_SEC) return 2;
  // ~1 step per 10–11s at the 42s cap keeps 4 rich beats per scene realistic for the LLM.
  return Math.max(4, ceilDiv(holdSec, 11));
}

export function formatPlanLimitsTable(segments: NarrationSegments): string {
  const lines = [
    '## Plan limits (mandatory — violations fail validation)',
    '',
    '| block_id | ~sec | min scenes | max hold/scene |',
    '| --- | ---: | ---: | ---: |',
  ];

  for (const block of segments.blocks) {
    const sec = Math.round(block.estimated_duration_sec);
    const minScenes = minScenesForBlock(block.estimated_duration_sec);
    lines.push(`| ${block.block_id} | ${sec} | ${minScenes} | ${MAX_HOLD_SEC} |`);
  }

  lines.push('');
  lines.push(
    'Split long blocks into multiple scenes. One scene must not cover more than ~42 seconds of narration.',
  );
  lines.push('Every sentence index in each block must appear in exactly one scene span.');

  return lines.join('\n');
}

function parseMotionSteps(data: Record<string, unknown>): unknown[] {
  const steps = data.steps;
  return Array.isArray(steps) ? steps : [];
}

function parseUiCards(data: Record<string, unknown>): unknown[] {
  const cards = data.cards;
  return Array.isArray(cards) ? cards : [];
}

function stepIsRich(step: Record<string, unknown>): boolean {
  const label = String(step.label ?? step.heading ?? '').trim();
  const visual = String(step.visual ?? '').trim();
  const annotation = String(step.annotation ?? '').trim();
  const body = String(step.body ?? '').trim();

  if (!label) return false;
  if (visual.length >= 8 || annotation.length >= 8 || body.length >= 8) return true;
  if (label.split(/\s+/).length >= 3 && label.length >= 12) return true;
  return false;
}

function countDensityItems(scene: ProductionScene): number {
  const data = scene.data;
  if (scene.renderer === 'motion') return parseMotionSteps(data).length;
  if (scene.renderer === 'ui-cards') return parseUiCards(data).length;
  return 0;
}

function validateSceneDensity(scene: ProductionScene, errors: string[]): void {
  if (!DENSITY_RENDERERS.has(scene.renderer)) return;

  const hold = scene.estimated_hold_sec;
  const items = countDensityItems(scene);
  const minItems = minStepsForHold(hold);

  if (hold > MAX_HOLD_SEC) {
    errors.push(
      `${scene.scene_id}: estimated_hold_sec ${hold}s exceeds max ${MAX_HOLD_SEC}s — split into more scenes.`,
    );
  }

  if (hold < MIN_HOLD_SEC && hold > 0) {
    errors.push(
      `${scene.scene_id}: estimated_hold_sec ${hold}s is below min ${MIN_HOLD_SEC}s — merge or extend narration_span.`,
    );
  }

  if (hold > SPARSE_HOLD_THRESHOLD_SEC && items < minItems) {
    errors.push(
      `${scene.scene_id}: ${scene.renderer} hold ${hold}s needs at least ${minItems} steps/cards (has ${items}). Add content from narration_span or split scene.`,
    );
  }

  const rawItems =
    scene.renderer === 'motion' ? parseMotionSteps(scene.data) : parseUiCards(scene.data);

  for (let i = 0; i < rawItems.length; i++) {
    const step = rawItems[i] as Record<string, unknown>;
    if (!stepIsRich(step)) {
      errors.push(
        `${scene.scene_id}: step/card ${i + 1} is too sparse (need label + visual/annotation/body from narration, not a single word).`,
      );
    }
  }
}

function parseExcalidrawElements(data: Record<string, unknown>): Record<string, unknown>[] {
  const raw = data.elements;
  if (Array.isArray(raw) && raw.length > 0) return raw as Record<string, unknown>[];

  const boxes = data.boxes;
  if (!Array.isArray(boxes)) return [];

  return boxes.map((item) => {
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

function excalidrawWordCount(elements: Record<string, unknown>[]): number {
  return elements
    .filter((e) => e.type === 'box' || e.type === 'workflow')
    .reduce((n, e) => {
      const label = String(e.label ?? e.text ?? '');
      return n + label.split(/\s+/).filter(Boolean).length;
    }, 0);
}

function minVisualUnitsForHold(holdSec: number): number {
  return Math.max(2, Math.ceil(holdSec / 3));
}

function validateExcalidrawScene(scene: ProductionScene, errors: string[], warnings: string[]): void {
  const elements = parseExcalidrawElements(scene.data);
  if (elements.length === 0) {
    errors.push(`${scene.scene_id}: excalidraw requires non-empty data.elements array.`);
    return;
  }

  const boxes = elements.filter((e) => e.type === 'box' || e.type === 'workflow');
  const layout = String(scene.data.layout ?? '');

  if (layout === 'decision_tree') {
    const hasDecision = elements.some(
      (e) => e.type === 'question' || e.type === 'branch_yes' || e.type === 'branch_no',
    );
    if (!hasDecision && boxes.length === 0) {
      errors.push(
        `${scene.scene_id}: decision_tree needs question/branch_yes/branch_no OR use flow_vertical with box elements.`,
      );
    }
  }

  if (boxes.length === 0 && !elements.some((e) => e.type === 'flow' || e.type === 'question')) {
    errors.push(`${scene.scene_id}: excalidraw has no renderable box/flow/question elements.`);
  }

  const minUnits = minVisualUnitsForHold(scene.estimated_hold_sec);
  if (scene.estimated_hold_sec > 8 && boxes.length > 0 && boxes.length < minUnits) {
    warnings.push(
      `${scene.scene_id}: excalidraw hold ${scene.estimated_hold_sec}s has ${boxes.length} box(es) — aim for ${minUnits}+ with icons/annotations.`,
    );
  }

  const words = excalidrawWordCount(elements);
  if (boxes.length <= 4 && words <= 18 && !elements.some((e) => e.icon)) {
    warnings.push(
      `${scene.scene_id}: sparse excalidraw (${words} words) — add icon per box for visual density.`,
    );
  }
}

function validateMermaidScene(scene: ProductionScene, errors: string[], warnings: string[]): void {
  const source = scene.data.source;
  if (typeof source !== 'string' || !source.trim()) {
    errors.push(`${scene.scene_id}: mermaid requires data.source.`);
    return;
  }

  if (/\bgraph\s+LR\b/i.test(source) || /\bflowchart\s+LR\b/i.test(source)) {
    warnings.push(
      `${scene.scene_id}: mermaid uses LR layout — prefer graph TD (top-down) for readability.`,
    );
  }

  const nodeMatches = source.match(/\[[^\]]+\]/g) ?? [];
  if (nodeMatches.length <= 4 && scene.estimated_hold_sec > 8) {
    warnings.push(
      `${scene.scene_id}: sparse mermaid (${nodeMatches.length} nodes) — add data.icons or richer node labels.`,
    );
  }
}

function validateVisualScene(scene: ProductionScene, errors: string[], warnings: string[]): void {
  if (scene.renderer === 'excalidraw') validateExcalidrawScene(scene, errors, warnings);
  if (scene.renderer === 'mermaid') validateMermaidScene(scene, errors, warnings);
}

function validateBlockCoverage(
  block: NarrationBlock,
  scenes: ProductionScene[],
  errors: string[],
): void {
  const indices = block.sentences.map((s) => s.index);
  const covered = new Map<number, number>();

  for (const scene of scenes) {
    if (scene.sentence_start > scene.sentence_end) {
      errors.push(
        `${scene.scene_id}: sentence_start ${scene.sentence_start} > sentence_end ${scene.sentence_end}.`,
      );
      continue;
    }
    for (let i = scene.sentence_start; i <= scene.sentence_end; i++) {
      covered.set(i, (covered.get(i) ?? 0) + 1);
    }
  }

  for (const idx of indices) {
    const count = covered.get(idx) ?? 0;
    if (count === 0) {
      errors.push(`${block.block_id}: sentence ${idx} not covered by any scene.`);
    } else if (count > 1) {
      errors.push(`${block.block_id}: sentence ${idx} covered by ${count} scenes (must be exactly 1).`);
    }
  }

  const minScenes = minScenesForBlock(block.estimated_duration_sec);
  if (scenes.length < minScenes) {
    errors.push(
      `${block.block_id}: ${scenes.length} scene(s) for ~${Math.round(block.estimated_duration_sec)}s — need at least ${minScenes}.`,
    );
  }
}

export function validateProductionPlan(
  plan: ProductionPlan,
  segments: NarrationSegments,
): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const blockMap = new Map(segments.blocks.map((b) => [b.block_id, b]));

  for (const block of segments.blocks) {
    const blockScenes = plan.scenes
      .filter((s) => s.block_id === block.block_id)
      .sort((a, b) => a.scene_order - b.scene_order);

    if (blockScenes.length === 0) {
      errors.push(`${block.block_id}: no scenes — block must have at least one visual.`);
      continue;
    }

    validateBlockCoverage(block, blockScenes, errors);

    if (block.estimated_duration_sec > 90) {
      const renderers = new Set(blockScenes.map((s) => s.renderer));
      if (renderers.size < 2) {
        warnings.push(
          `${block.block_id}: long block (~${Math.round(block.estimated_duration_sec)}s) uses only one renderer (${[...renderers].join(', ')}). Consider mixing mermaid/motion/code.`,
        );
      }
    }

    for (const scene of blockScenes) {
      if (!blockMap.has(scene.block_id)) {
        errors.push(`${scene.scene_id}: unknown block_id "${scene.block_id}".`);
      }
      validateSceneDensity(scene, errors);
      validateVisualScene(scene, errors, warnings);
    }
  }

  for (const scene of plan.scenes) {
    if (!blockMap.has(scene.block_id)) {
      errors.push(`${scene.scene_id}: block_id "${scene.block_id}" not in narration-segments.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function formatValidationFixPrompt(errors: string[], warnings: string[]): string {
  const lines = [
    '---',
    'Production plan VALIDATION FAILED. Fix every issue and return ONLY corrected JSON (version 2).',
    '',
    '### Errors (must fix)',
    ...errors.map((e) => `- ${e}`),
  ];
  if (warnings.length > 0) {
    lines.push('', '### Warnings (fix when possible)', ...warnings.map((w) => `- ${w}`));
  }
  lines.push(
    '',
    'Rules reminder:',
    `- Max ${MAX_HOLD_SEC}s estimated_hold_sec per scene`,
    '- Split long blocks; ~2–4 sentences per scene',
    '- motion/ui-cards: each step/card needs label + detail from narration_span',
    '- excalidraw: use flow_vertical + box elements (not bare arrow labels); decision_tree needs question/branches',
    '- mermaid: prefer graph TD; sparse diagrams need icons in data.icons',
    '- Cover every sentence exactly once',
  );
  return lines.join('\n');
}
