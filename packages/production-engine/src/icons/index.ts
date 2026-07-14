import { ICON_CATALOG, ICON_NAMES } from './catalog.js';

export type IconVariant = 'ui' | 'motion' | 'sketch';

const UI_KEYWORD_RULES: [RegExp, string[]][] = [
  [/embed|chunk|vector|ingest|storage|pgvector/i, ['database', 'layers', 'archive']],
  [/retriev|search|rerank|similarity/i, ['search', 'scan', 'filter']],
  [/generat|llm|gpt|claude|answer|stream/i, ['brain', 'sparkles', 'wand']],
  [/observ|log|metric|monitor|latency|cost/i, ['eye', 'chart', 'gauge']],
  [/pipeline|flow|step|process|async/i, ['workflow', 'route', 'git']],
  [/agent|bot|automat|tool.?call/i, ['bot', 'cpu', 'wand']],
  [/human|team|user|support|ticket|customer|escalat/i, ['users', 'handshake', 'headphones']],
  [/cost|dollar|saving|roi|price|\$/i, ['dollar', 'wallet', 'chart']],
  [/architect|block|system|component/i, ['layers', 'blocks', 'network']],
  [/code|api|json|typescript|python/i, ['code', 'terminal', 'file']],
  [/terminal|cli|npm|docker/i, ['terminal', 'server', 'package']],
  [/security|guard|shield/i, ['shield', 'lock', 'fingerprint']],
  [/compar|versus|vs\b|trade/i, ['scale', 'chart', 'target']],
  [/cloud|deploy|infra/i, ['cloud', 'server', 'globe']],
  [/file|document|markdown|export/i, ['file', 'clipboard', 'book']],
  [/message|chat|query|question/i, ['message', 'help', 'mail']],
  [/performance|speed|fast|budget|latency/i, ['gauge', 'zap', 'timer']],
  [/git|repo|github/i, ['git', 'branch', 'code']],
  [/cpu|compute|model/i, ['cpu', 'brain', 'atom']],
  [/cancel|subscription|billing/i, ['ticket', 'wallet', 'ban']],
  [/wrong|fail|error|hallucin/i, ['warning', 'ban', 'bug']],
  [/future|later|roadmap|evolution/i, ['rocket', 'trending', 'route']],
];

const MOTION_KEYWORD_RULES: [RegExp, string[]][] = [
  [/embed|chunk|vector|ingest/i, ['package', 'database', 'inbox']],
  [/retriev|search|rerank/i, ['binoculars', 'radar', 'crosshair']],
  [/generat|llm|answer|stream/i, ['lightbulb', 'sparkles', 'pen']],
  [/observ|monitor|metric/i, ['activity', 'target', 'compass']],
  [/pipeline|flow|step/i, ['route', 'network', 'plug']],
  [/agent|bot|tool/i, ['bot', 'hammer', 'tool']],
  [/human|support|escalat/i, ['handshake', 'phone', 'megaphone']],
  [/cost|dollar|budget/i, ['wallet', 'trending', 'chart']],
  [/architect|block|system/i, ['blocks', 'puzzle', 'map']],
  [/code|api|json/i, ['code', 'terminal', 'wrench']],
  [/security|guard/i, ['shield', 'lock', 'key']],
  [/compar|versus|trade/i, ['scale', 'target', 'chart']],
  [/cloud|deploy/i, ['cloud', 'upload', 'globe']],
  [/file|document/i, ['file', 'book', 'clipboard']],
  [/message|query|question/i, ['message', 'help', 'mic']],
  [/performance|speed|latency/i, ['timer', 'gauge', 'zap']],
  [/future|later|evolution/i, ['rocket', 'star', 'trending']],
  [/narrow|domain|faq/i, ['target', 'book', 'flag']],
  [/password|reset/i, ['key', 'lock', 'refresh']],
];

const SKETCH_KEYWORD_RULES: [RegExp, string[]][] = [
  [/embed|chunk|vector|ingest/i, ['archive', 'box', 'layers']],
  [/retriev|search|wrong|chunk/i, ['search', 'filter', 'scan']],
  [/generat|llm|answer|fluent|wrong/i, ['brain', 'message', 'warning']],
  [/pipeline|flow|step|now|later/i, ['workflow', 'route', 'arrow-down']],
  [/agent|bot|tool|react/i, ['bot', 'wand', 'tool']],
  [/human|escalat|support|user/i, ['users', 'handshake', 'phone']],
  [/cost|expensive|latency|budget/i, ['dollar', 'timer', 'gauge']],
  [/capable|multi.?step|predict/i, ['puzzle', 'brain', 'target']],
  [/trade|versus|vs\b/i, ['scale', 'chart', 'check-circle']],
  [/cancel|subscription|billing/i, ['ban', 'ticket', 'wallet']],
  [/document|docs|search/i, ['book', 'file', 'search']],
  [/database|query|db/i, ['database', 'server', 'cpu']],
  [/clarif|question|ask/i, ['help', 'message', 'mic']],
  [/security|guard/i, ['shield', 'lock', 'eye']],
  [/future|tool.?use/i, ['rocket', 'sparkles', 'wand']],
];

const VARIANT_FALLBACKS: Record<IconVariant, string[]> = {
  ui: ['layers', 'workflow', 'sparkles', 'search', 'brain', 'shield', 'gauge', 'database'],
  motion: ['network', 'compass', 'activity', 'route', 'puzzle', 'radar', 'target', 'package'],
  sketch: ['pen', 'lightbulb', 'map', 'flag', 'bookmark', 'compass', 'atom', 'palette'],
};

const VARIANT_RULES: Record<IconVariant, [RegExp, string[]][]> = {
  ui: UI_KEYWORD_RULES,
  motion: MOTION_KEYWORD_RULES,
  sketch: SKETCH_KEYWORD_RULES,
};

/** Remap weak explicit icons when step text gives stronger semantics. */
const EXPLICIT_CONTEXT_REMAP: Record<string, { re: RegExp; icon: string }[]> = {
  search: [{ re: /retriev|rag|vector|chunk|embed|similar|rerank/i, icon: 'binoculars' }],
  brain: [{ re: /generat|llm|gpt|answer|stream|token/i, icon: 'sparkles' }],
  nodes: [{ re: /determin|fixed|sequenc|pipeline/i, icon: 'workflow' }],
  workflow: [{ re: /determin|fixed|sequenc|predictable|hardcoded/i, icon: 'route' }],
};

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

function normalizeIconName(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, '-');
  return ICON_CATALOG[key] ? key : 'circle-dot';
}

function pickCandidate(candidates: string[], seed: string, variant: IconVariant): string {
  const offset = variant === 'sketch' ? 3 : variant === 'motion' ? 7 : 0;
  const idx = (hashSeed(seed) + offset) % candidates.length;
  return normalizeIconName(candidates[idx] ?? 'circle-dot');
}

export interface ResolveIconOptions {
  explicit?: unknown;
  variant?: IconVariant;
  seed?: string;
  textParts?: (string | undefined)[];
}

export function resolveIconName(
  explicitOrOptions?: unknown,
  ...legacyTextParts: (string | undefined)[]
): string {
  let opts: ResolveIconOptions;
  if (
    explicitOrOptions &&
    typeof explicitOrOptions === 'object' &&
    !Array.isArray(explicitOrOptions) &&
    ('variant' in explicitOrOptions || 'textParts' in explicitOrOptions || 'seed' in explicitOrOptions)
  ) {
    opts = explicitOrOptions as ResolveIconOptions;
  } else {
    opts = {
      explicit: explicitOrOptions,
      textParts: legacyTextParts,
      variant: 'ui',
    };
  }

  const variant = opts.variant ?? 'ui';
  const seed = opts.seed ?? opts.textParts?.filter(Boolean).join(' ') ?? 'default';
  const haystack = (opts.textParts ?? []).filter(Boolean).join(' ');

  if (typeof opts.explicit === 'string' && opts.explicit.trim()) {
    const explicit = normalizeIconName(opts.explicit);
    const remaps = EXPLICIT_CONTEXT_REMAP[explicit];
    if (remaps) {
      for (const { re, icon } of remaps) {
        if (re.test(haystack)) return normalizeIconName(icon);
      }
    }
    return explicit;
  }

  for (const [re, candidates] of VARIANT_RULES[variant]) {
    if (re.test(haystack)) return pickCandidate(candidates, seed, variant);
  }

  const fallbacks = VARIANT_FALLBACKS[variant];
  return pickCandidate(fallbacks, seed, variant);
}

export function iconSvg(name: string, size = 36, color = '#fb923c'): string {
  const key = normalizeIconName(name);
  const paths = ICON_CATALOG[key] ?? ICON_CATALOG['circle-dot'];
  return `<svg class="ecpe-icon" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export interface IconBadgeOptions {
  size?: number;
  iconColor?: string;
  /** Solid fill — no semi-transparent overlay on colored blocks. */
  bg?: string;
  border?: string;
  className?: string;
  glyphRatio?: number;
  glyphStroke?: number;
}

/** Opaque dark badge on orange blocks — matches video background tone. */
export const BADGE_BG_SOLID = '#0d1117';
export const BADGE_BORDER_RING = '#243044';
export const BADGE_ICON_ORANGE = '#fb923c';
/** Glyph occupies ~60% of circle diameter (readable at YouTube scale). */
export const BADGE_GLYPH_RATIO = 0.6;
/** Thicker stroke survives H.264 compression. */
export const BADGE_GLYPH_STROKE = 3;

/**
 * Vector icon glyph only (transparent canvas — lives inside circle badge).
 */
function iconGlyphSvg(
  name: string,
  size: number,
  color: string,
  strokeWidth = BADGE_GLYPH_STROKE,
): string {
  const key = normalizeIconName(name);
  const paths = ICON_CATALOG[key] ?? ICON_CATALOG['circle-dot'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block">${paths}</svg>`;
}

/**
 * Circle badge: solid opaque fill, border-radius circle, glyph centered.
 * Shadow/filter on container only — never on glyph alone.
 */
export function iconBadgeHtml(name: string, opts: IconBadgeOptions = {}): string {
  const size = opts.size ?? 36;
  const ratio = opts.glyphRatio ?? BADGE_GLYPH_RATIO;
  const iconSize = Math.max(16, Math.round(size * ratio));
  const iconColor = opts.iconColor ?? BADGE_ICON_ORANGE;
  const bg = opts.bg ?? BADGE_BG_SOLID;
  const border = opts.border ?? BADGE_BORDER_RING;
  const stroke = opts.glyphStroke ?? BADGE_GLYPH_STROKE;
  const cls = opts.className ?? 'ecpe-icon-badge';
  const glyph = iconGlyphSvg(name, iconSize, iconColor, stroke);
  return `<span class="${cls}" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;min-width:${size}px;min-height:${size}px;border-radius:50%;background:${bg};border:1px solid ${border};overflow:hidden;flex-shrink:0;line-height:0;box-shadow:none">${glyph}</span>`;
}

/**
 * Mermaid foreignObject: single SVG layer (circle + glyph), opaque fill.
 * Icon stays inline in node label — one bbox with the block, no overlay.
 */
export function iconBadgeMermaidInline(name: string, size = 40): string {
  const bg = BADGE_BG_SOLID;
  const border = BADGE_BORDER_RING;
  const iconColor = BADGE_ICON_ORANGE;
  const key = normalizeIconName(name);
  const paths = ICON_CATALOG[key] ?? ICON_CATALOG['circle-dot'];
  const r = size / 2;
  const pad = 1;
  const scale = (size * BADGE_GLYPH_RATIO) / 24;
  const off = (size - 24 * scale) / 2;
  return `<svg xmlns='http://www.w3.org/2000/svg' class='ecpe-icon-badge' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}' aria-hidden='true' style='display:block;flex-shrink:0'><circle cx='${r}' cy='${r}' r='${r - pad}' fill='${bg}' stroke='${border}' stroke-width='1'/><g transform='translate(${off.toFixed(2)},${off.toFixed(2)}) scale(${scale.toFixed(4)})' fill='none' stroke='${iconColor}' stroke-width='${BADGE_GLYPH_STROKE}' stroke-linecap='round' stroke-linejoin='round'>${paths}</g></svg>`;
}

/** @deprecated Use iconBadgeHtml — kept for imports */
export function iconBadgeSvg(name: string, opts: IconBadgeOptions = {}): string {
  return iconBadgeHtml(name, opts);
}

export function sketchIconBadgeHtml(name: string, size = 36): string {
  return iconBadgeSvg(name, {
    size,
    iconColor: '#5eead4',
    bg: '#0d1117',
    border: '#0f766e',
  });
}

/** Sketch-style icons for excalidraw — teal stroke, slightly heavier weight. */
export function sketchIconSvg(name: string, size = 44, color = '#5eead4'): string {
  const key = normalizeIconName(name);
  const paths = ICON_CATALOG[key] ?? ICON_CATALOG['circle-dot'];
  return `<svg class="ecpe-sketch-icon" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export function listIconNames(): string[] {
  return ICON_NAMES;
}
