import type { ProductionPlan, ProductionScene } from '@ecpe/schemas';

/** JSON string fields where LLMs often emit unescaped inner double quotes. */
const QUOTE_SENSITIVE_KEYS = new Set(['narration_span', 'code', 'source', 'caption', 'html']);

function normalizeExcalidrawData(data: Record<string, unknown>): Record<string, unknown> {
  const elements = data.elements;
  if (Array.isArray(elements) && elements.length > 0) return data;

  const boxes = data.boxes;
  if (!Array.isArray(boxes) || boxes.length === 0) return data;

  const normalized = boxes.map((item) => {
    const box = item as Record<string, unknown>;
    return {
      type: 'box',
      label: box.label,
      annotation: box.annotation,
      icon: box.icon,
      text: box.text,
    };
  });

  const { boxes: _boxes, ...rest } = data;
  return { ...rest, elements: normalized };
}

function normalizeSceneData(scene: ProductionScene): ProductionScene {
  if (scene.renderer !== 'excalidraw') return scene;
  return {
    ...scene,
    data: normalizeExcalidrawData(scene.data),
  };
}

export function normalizeProductionPlan(plan: ProductionPlan): ProductionPlan {
  return {
    ...plan,
    scenes: plan.scenes.map(normalizeSceneData),
  };
}

/**
 * Escape inner `"` inside known LLM string fields so JSON.parse succeeds.
 * Without this, jsonrepair often returns a truncated plan (missing tail scenes).
 */
export function fixUnescapedQuotesInPlanJson(jsonText: string): string {
  let result = '';
  let i = 0;

  while (i < jsonText.length) {
    const slice = jsonText.slice(i);
    const keyMatch = slice.match(/^"([^"]+)": "/);
    if (!keyMatch) {
      result += jsonText[i];
      i += 1;
      continue;
    }

    const key = keyMatch[1];
    if (!QUOTE_SENSITIVE_KEYS.has(key)) {
      result += jsonText[i];
      i += 1;
      continue;
    }

    const prefix = keyMatch[0];
    result += prefix;
    i += prefix.length;

    let content = '';
    while (i < jsonText.length) {
      const ch = jsonText[i];
      if (ch === '\\') {
        content += jsonText.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === '"') {
        const rest = jsonText.slice(i + 1).trimStart();
        if (rest.length === 0 || rest[0] === ',' || rest[0] === '}' || rest[0] === ']') {
          result += `${content}"`;
          i += 1;
          break;
        }
        content += '\\"';
        i += 1;
        continue;
      }
      content += ch;
      i += 1;
    }
  }

  return result;
}

export function planLooksTruncated(plan: ProductionPlan, expectedBlockCount: number): boolean {
  const coveredBlocks = new Set(plan.scenes.map((s) => s.block_id));
  if (coveredBlocks.size < expectedBlockCount) return true;
  if (plan.scenes.length < expectedBlockCount) return true;
  return false;
}
