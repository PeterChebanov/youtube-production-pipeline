import { ICON_CATALOG, ICON_NAMES } from './catalog.js';

export type IconVariant = 'ui' | 'motion' | 'sketch';

/** Plan / LLM aliases → catalog keys (unknown names used to collapse into circle-dot). */
export const ICON_ALIASES: Record<string, string> = {
  'map-pin': 'map-pin',
  pin: 'map-pin',
  'x-circle': 'circle-x',
  'x-octagon': 'circle-x',
  times: 'circle-x',
  'alert-triangle': 'warning',
  alert: 'circle-alert',
  'circle-alert': 'circle-alert',
  sliders: 'sliders-horizontal',
  'sliders-horizontal': 'sliders-horizontal',
  repeat: 'repeat-2',
  'repeat-2': 'repeat-2',
  refresh: 'refresh',
  'git-branch': 'git-branch',
  branch: 'git-branch',
  'dollar-sign': 'dollar-sign',
  dollar: 'dollar',
  unlock: 'lock-open',
  'lock-open': 'lock-open',
  funnel: 'filter',
  'pie-chart': 'chart',
  'check-circle': 'check-circle',
  'circle-check': 'circle-check',
  cog: 'settings',
  gear: 'settings',
  sparkles: 'sparkles',
  sparkle: 'sparkle',
};

const UI_KEYWORD_RULES: [RegExp, string[]][] = [
  [/embed|chunk|vector|ingest|storage|pgvector/i, ['database', 'layers', 'archive', 'boxes', 'hard-drive']],
  [/retriev|search|rerank|similarity|semantic/i, ['search', 'scan', 'filter', 'scan-search', 'binoculars', 'text-search']],
  [/generat|llm|gpt|claude|answer|stream/i, ['brain', 'sparkles', 'wand', 'brain-circuit', 'wand-sparkles', 'bot-message-square']],
  [/observ|log|metric|monitor|latency|cost/i, ['eye', 'chart', 'gauge', 'activity', 'radar', 'telescope']],
  [/pipeline|flow|step|process|async/i, ['workflow', 'route', 'git', 'waypoints', 'combine', 'split']],
  [/agent|bot|automat|tool.?call/i, ['bot', 'cpu', 'wand', 'bot-message-square', 'sparkle', 'wrench']],
  [/human|team|user|support|ticket|customer|escalat/i, ['users', 'handshake', 'headphones', 'user', 'life-buoy']],
  [/cost|dollar|saving|roi|price|\$/i, ['dollar', 'dollar-sign', 'wallet', 'chart', 'trending', 'calculator']],
  [/architect|block|system|component/i, ['layers', 'blocks', 'network', 'component', 'boxes', 'circuit-board']],
  [/code|api|json|typescript|python/i, ['code', 'terminal', 'file', 'file-code', 'brackets', 'binary']],
  [/terminal|cli|npm|docker/i, ['terminal', 'server', 'package', 'container', 'hard-drive']],
  [/security|guard|shield/i, ['shield', 'lock', 'fingerprint', 'shield-check', 'lock-open']],
  [/compar|versus|vs\b|trade/i, ['scale', 'chart', 'target', 'git-compare', 'equal']],
  [/cloud|deploy|infra/i, ['cloud', 'server', 'globe', 'factory', 'server-cog']],
  [/file|document|markdown|export/i, ['file', 'clipboard', 'book', 'folder', 'book-open']],
  [/message|chat|query|question/i, ['message', 'help', 'mail', 'send', 'bot-message-square']],
  [/performance|speed|fast|budget|latency/i, ['gauge', 'zap', 'timer', 'power', 'flame']],
  [/git|repo|github/i, ['git', 'git-branch', 'code', 'git-merge', 'git-compare']],
  [/cpu|compute|model/i, ['cpu', 'brain', 'atom', 'brain-circuit', 'circuit-board']],
  [/cancel|subscription|billing/i, ['ticket', 'wallet', 'ban', 'circle-x']],
  [/wrong|fail|error|hallucin|irrelevant|poor/i, ['warning', 'ban', 'bug', 'circle-x', 'circle-alert']],
  [/future|later|roadmap|evolution/i, ['rocket', 'trending', 'route', 'telescope', 'sprout']],
];

const MOTION_KEYWORD_RULES: [RegExp, string[]][] = [
  [/embed|chunk|vector|ingest/i, ['package', 'database', 'inbox', 'boxes', 'package-open']],
  [/retriev|search|rerank/i, ['binoculars', 'radar', 'crosshair', 'scan-search', 'search-check']],
  [/generat|llm|answer|stream/i, ['lightbulb', 'sparkles', 'pen', 'wand-sparkles', 'brain-circuit']],
  [/observ|monitor|metric/i, ['activity', 'target', 'compass', 'telescope', 'radar']],
  [/pipeline|flow|step/i, ['route', 'network', 'plug', 'waypoints', 'iteration-ccw']],
  [/agent|bot|tool/i, ['bot', 'hammer', 'tool', 'bot-message-square', 'wrench']],
  [/human|support|escalat/i, ['handshake', 'phone', 'megaphone', 'life-buoy', 'users']],
  [/cost|dollar|budget/i, ['wallet', 'trending', 'chart', 'dollar-sign', 'calculator']],
  [/architect|block|system/i, ['blocks', 'puzzle', 'map', 'component', 'boxes']],
  [/code|api|json/i, ['code', 'terminal', 'wrench', 'brackets', 'file-code']],
  [/security|guard/i, ['shield', 'lock', 'key', 'shield-check', 'fingerprint']],
  [/compar|versus|trade/i, ['scale', 'target', 'chart', 'git-compare', 'equal']],
  [/cloud|deploy/i, ['cloud', 'upload', 'globe', 'server-cog', 'factory']],
  [/file|document/i, ['file', 'book', 'clipboard', 'folder', 'book-open']],
  [/message|query|question/i, ['message', 'help', 'mic', 'send', 'radio']],
  [/performance|speed|latency/i, ['timer', 'gauge', 'zap', 'power', 'flame']],
  [/future|later|evolution/i, ['rocket', 'star', 'trending', 'sprout', 'telescope']],
  [/narrow|domain|faq/i, ['target', 'book', 'flag', 'goal', 'pin']],
  [/password|reset/i, ['key', 'lock', 'refresh', 'lock-open', 'unlock']],
];

const SKETCH_KEYWORD_RULES: [RegExp, string[]][] = [
  [/embed|chunk|vector|ingest|meaning.?space|cosine|region/i, [
    'archive', 'box', 'layers', 'orbit', 'diamond', 'map-pin', 'locate', 'globe', 'waypoints', 'atom',
  ]],
  [/retriev|search|wrong|chunk|quality|gate|optimize/i, [
    'search', 'filter', 'scan', 'scan-search', 'binoculars', 'text-search', 'search-check', 'goal', 'aperture', 'telescope',
  ]],
  [/generat|llm|answer|fluent|wrong|decides|agent/i, [
    'brain', 'message', 'warning', 'brain-circuit', 'sparkles', 'bot', 'wand-sparkles', 'bot-message-square', 'cpu', 'sparkle',
  ]],
  [/pipeline|flow|step|now|later|iterate|again|depends/i, [
    'workflow', 'route', 'arrow-down', 'repeat-2', 'iteration-ccw', 'refresh', 'waypoints', 'git-branch', 'split', 'combine',
  ]],
  [/agent|bot|tool|react|api|call/i, [
    'bot', 'wand', 'tool', 'server', 'plug', 'cable', 'unplug', 'server-cog', 'hard-drive', 'cpu',
  ]],
  [/human|escalat|support|user|use.?case/i, [
    'users', 'handshake', 'phone', 'lightbulb', 'life-buoy', 'graduation-cap', 'megaphone', 'user', 'heart', 'thumbs-up',
  ]],
  [/cost|expensive|latency|budget|higher|dollar/i, [
    'dollar', 'dollar-sign', 'timer', 'gauge', 'trending', 'calculator', 'wallet', 'percent', 'scale', 'weight',
  ]],
  [/capable|multi.?step|predict|complex|observ/i, [
    'puzzle', 'brain', 'target', 'eye', 'microscope', 'radar', 'list-checks', 'clipboard-check', 'shield-check', 'history',
  ]],
  [/trade|versus|vs\b|power|bottleneck|fix|tune/i, [
    'scale', 'chart', 'check-circle', 'sliders-horizontal', 'settings', 'wrench', 'equal', 'git-compare', 'toggle-left', 'sigma',
  ]],
  [/cancel|subscription|billing/i, ['ban', 'ticket', 'wallet', 'circle-x', 'circle-alert']],
  [/document|docs|search|password|reset|forgot|shipping/i, [
    'book', 'file', 'search', 'key', 'lock', 'package', 'truck', 'ship', 'shopping-bag', 'tag',
  ]],
  [/database|query|db|server/i, ['database', 'server', 'cpu', 'hard-drive', 'database-zap', 'binary']],
  [/clarif|question|ask|when/i, ['help', 'message', 'mic', 'info', 'circle-alert', 'languages']],
  [/security|guard/i, ['shield', 'lock', 'eye', 'shield-check', 'fingerprint', 'lock-open']],
  [/future|tool.?use|research|dynamic/i, [
    'rocket', 'sparkles', 'wand', 'sprout', 'flask', 'microscope', 'telescope', 'leaf', 'flame', 'orbit',
  ]],
  [/good|useful|check|solved/i, [
    'check-circle', 'circle-check', 'thumbs-up', 'award', 'trophy', 'sparkle', 'shield-check',
  ]],
  [/irrelevant|poor|fail|error/i, ['circle-x', 'ban', 'warning', 'circle-alert', 'bug', 'trash']],
];

const VARIANT_FALLBACKS: Record<IconVariant, string[]> = {
  ui: [
    'layers', 'workflow', 'sparkles', 'search', 'brain', 'shield', 'gauge', 'database',
    'route', 'puzzle', 'compass', 'atom', 'flag', 'bookmark', 'lightbulb', 'pen',
  ],
  motion: [
    'network', 'compass', 'activity', 'route', 'puzzle', 'radar', 'target', 'package',
    'waypoints', 'orbit', 'telescope', 'sparkle', 'goal', 'milestone',
  ],
  sketch: [
    'pen', 'lightbulb', 'map', 'flag', 'bookmark', 'compass', 'atom', 'palette',
    'sparkle', 'orbit', 'goal', 'milestone', 'leaf', 'feather', 'diamond', 'gem',
    'aperture', 'anchor', 'telescope', 'microscope', 'waypoints', 'sprout',
  ],
};

const VARIANT_RULES: Record<IconVariant, [RegExp, string[]][]> = {
  ui: UI_KEYWORD_RULES,
  motion: MOTION_KEYWORD_RULES,
  sketch: SKETCH_KEYWORD_RULES,
};

/** Remap weak explicit icons when step text gives stronger semantics. */
const EXPLICIT_CONTEXT_REMAP: Record<string, { re: RegExp; icon: string }[]> = {
  search: [{ re: /retriev|rag|vector|chunk|embed|similar|rerank|quality/i, icon: 'binoculars' }],
  brain: [{ re: /generat|llm|gpt|answer|stream|token|decides/i, icon: 'sparkles' }],
  nodes: [{ re: /determin|fixed|sequenc|pipeline/i, icon: 'workflow' }],
  workflow: [{ re: /determin|fixed|sequenc|predictable|hardcoded/i, icon: 'route' }],
  target: [
    { re: /optim|search|first/i, icon: 'goal' },
    { re: /meaning|region|close/i, icon: 'locate' },
    { re: /depend|next|action/i, icon: 'waypoints' },
  ],
};

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

function normalizeIconName(name: string): string {
  const raw = name.trim().toLowerCase().replace(/\s+/g, '-');
  const aliased = ICON_ALIASES[raw] ?? raw;
  return ICON_CATALOG[aliased] ? aliased : 'circle-dot';
}

function pickCandidate(candidates: string[], seed: string, variant: IconVariant): string {
  const valid = candidates.map(normalizeIconName).filter((n) => n !== 'circle-dot' || candidates.length === 1);
  const pool = valid.length > 0 ? valid : candidates.map(normalizeIconName);
  const offset = variant === 'sketch' ? 3 : variant === 'motion' ? 7 : 0;
  const idx = (hashSeed(seed) + offset) % pool.length;
  return pool[idx] ?? 'circle-dot';
}

/** Ranked candidate list for a block (best semantic matches first). */
export function collectIconCandidates(opts: ResolveIconOptions): string[] {
  const variant = opts.variant ?? 'ui';
  const seed = opts.seed ?? opts.textParts?.filter(Boolean).join(' ') ?? 'default';
  const haystack = (opts.textParts ?? []).filter(Boolean).join(' ');
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (name: string) => {
    const n = normalizeIconName(name);
    if (seen.has(n)) return;
    // Prefer not leading with the generic fallback.
    if (n === 'circle-dot' && out.length > 0) return;
    seen.add(n);
    out.push(n);
  };

  if (typeof opts.explicit === 'string' && opts.explicit.trim()) {
    const explicit = normalizeIconName(opts.explicit);
    const remaps = EXPLICIT_CONTEXT_REMAP[explicit] ?? EXPLICIT_CONTEXT_REMAP[opts.explicit.trim().toLowerCase()];
    if (remaps) {
      for (const { re, icon } of remaps) {
        if (re.test(haystack)) push(icon);
      }
    }
    push(explicit);
  }

  for (const [re, candidates] of VARIANT_RULES[variant]) {
    if (!re.test(haystack)) continue;
    // Stable but varied order within the matched bucket.
    const rotated = [...candidates];
    const rot = hashSeed(seed) % Math.max(1, rotated.length);
    for (let i = 0; i < rotated.length; i++) push(rotated[(i + rot) % rotated.length]!);
  }

  for (const fb of VARIANT_FALLBACKS[variant]) push(fb);

  // Broad catalog tail so dense scenes still get unique glyphs.
  const catalogOffset = hashSeed(`${seed}:catalog`) % ICON_NAMES.length;
  for (let i = 0; i < ICON_NAMES.length; i++) {
    const name = ICON_NAMES[(i + catalogOffset) % ICON_NAMES.length]!;
    if (name === 'circle-dot' || name === 'circle') continue;
    push(name);
  }

  if (out.length === 0) push('circle-dot');
  return out;
}

export interface ResolveIconOptions {
  explicit?: unknown;
  variant?: IconVariant;
  seed?: string;
  textParts?: (string | undefined)[];
  /** Icons already claimed in this scene — skip them. */
  used?: ReadonlySet<string>;
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
    ('variant' in explicitOrOptions ||
      'textParts' in explicitOrOptions ||
      'seed' in explicitOrOptions ||
      'used' in explicitOrOptions)
  ) {
    opts = explicitOrOptions as ResolveIconOptions;
  } else {
    opts = {
      explicit: explicitOrOptions,
      textParts: legacyTextParts,
      variant: 'ui',
    };
  }

  const candidates = collectIconCandidates(opts);
  const used = opts.used;

  // Prefer first unused semantic candidate (explicit / keyword rank).
  for (const c of candidates) {
    if (!used || !used.has(c)) return c;
  }

  const variant = opts.variant ?? 'ui';
  const seed = opts.seed ?? opts.textParts?.filter(Boolean).join(' ') ?? 'default';
  return pickCandidate(candidates, seed, variant);
}

/** Per-scene allocator: semantic pick + unique icons within one render. */
export function createSceneIconAllocator(variant: IconVariant = 'sketch') {
  const used = new Set<string>();
  return {
    used,
    resolve(opts: Omit<ResolveIconOptions, 'used' | 'variant'> & { variant?: IconVariant }): string {
      const name = resolveIconName({ ...opts, variant: opts.variant ?? variant, used });
      used.add(name);
      return name;
    },
  };
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
