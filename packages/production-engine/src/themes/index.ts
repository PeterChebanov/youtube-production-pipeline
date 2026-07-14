export interface VisualTheme {
  id: string;
  label: string;
  /** Page/canvas background CSS */
  background: string;
  backgroundGrid: boolean;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentAlt: string;
  cardBg: string;
  cardBorder: string;
  /** Motion gradient body background */
  motionBg: string;
  /** Excalidraw sketch board */
  sketchBg: string;
  sketchGrid: boolean;
  sketchTitle: string;
  sketchAccentGreen: string;
  sketchAccentBlue: string;
  sketchGold: string;
  sketchSilver: string;
  /** Shiki theme id */
  codeTheme: string;
}

export const VISUAL_THEMES: Record<string, VisualTheme> = {
  'dark-blue': {
    id: 'dark-blue',
    label: 'Dark blue (default)',
    background: 'radial-gradient(ellipse at 20% 20%, #1e3a5f 0%, #0f172a 45%, #020617 100%)',
    backgroundGrid: false,
    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8',
    accent: '#38bdf8',
    accentAlt: '#818cf8',
    cardBg: 'rgba(30, 41, 59, 0.85)',
    cardBorder: 'rgba(148, 163, 184, 0.25)',
    motionBg: 'radial-gradient(ellipse at 20% 20%, #1e3a5f 0%, #0f172a 45%, #020617 100%)',
    sketchBg: 'linear-gradient(160deg, #0f1b33 0%, #132a4a 55%, #0b1628 100%)',
    sketchGrid: true,
    sketchTitle: '#e8c547',
    sketchAccentGreen: '#4ade80',
    sketchAccentBlue: '#60a5fa',
    sketchGold: '#f0c14b',
    sketchSilver: '#c0c8d4',
    codeTheme: 'github-dark',
  },
  'warm-dark': {
    id: 'warm-dark',
    label: 'Warm dark (gold accents)',
    background: 'linear-gradient(160deg, #0f1b33 0%, #1a2744 50%, #0b1628 100%)',
    backgroundGrid: true,
    textPrimary: '#faf6ee',
    textSecondary: '#c0c8d4',
    accent: '#f0c14b',
    accentAlt: '#e8a838',
    cardBg: 'rgba(20, 30, 55, 0.9)',
    cardBorder: 'rgba(240, 193, 75, 0.35)',
    motionBg: 'linear-gradient(160deg, #0f1b33 0%, #1a2744 50%, #0b1628 100%)',
    sketchBg: 'linear-gradient(160deg, #0f1b33 0%, #132a4a 55%, #0b1628 100%)',
    sketchGrid: true,
    sketchTitle: '#f0c14b',
    sketchAccentGreen: '#86efac',
    sketchAccentBlue: '#93c5fd',
    sketchGold: '#fcd34d',
    sketchSilver: '#d1d5db',
    codeTheme: 'github-dark',
  },
  'orange-white': {
    id: 'orange-white',
    label: 'Orange on white',
    background: '#fafafa',
    backgroundGrid: false,
    textPrimary: '#1c1917',
    textSecondary: '#57534e',
    accent: '#ea580c',
    accentAlt: '#dc2626',
    cardBg: '#ffffff',
    cardBorder: 'rgba(234, 88, 12, 0.35)',
    motionBg: 'linear-gradient(180deg, #fff7ed 0%, #ffffff 100%)',
    sketchBg: '#fffef8',
    sketchGrid: false,
    sketchTitle: '#ea580c',
    sketchAccentGreen: '#16a34a',
    sketchAccentBlue: '#2563eb',
    sketchGold: '#d97706',
    sketchSilver: '#6b7280',
    codeTheme: 'github-light',
  },
  'purple-dark': {
    id: 'purple-dark',
    label: 'Purple dark',
    background: 'radial-gradient(ellipse at 30% 20%, #2e1065 0%, #1e1b4b 50%, #0f0a1e 100%)',
    backgroundGrid: false,
    textPrimary: '#f5f3ff',
    textSecondary: '#c4b5fd',
    accent: '#a78bfa',
    accentAlt: '#e879f9',
    cardBg: 'rgba(46, 16, 101, 0.6)',
    cardBorder: 'rgba(167, 139, 250, 0.35)',
    motionBg: 'radial-gradient(ellipse at 30% 20%, #2e1065 0%, #1e1b4b 50%, #0f0a1e 100%)',
    sketchBg: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 55%, #0f0a1e 100%)',
    sketchGrid: true,
    sketchTitle: '#e9d5ff',
    sketchAccentGreen: '#86efac',
    sketchAccentBlue: '#93c5fd',
    sketchGold: '#fcd34d',
    sketchSilver: '#d8b4fe',
    codeTheme: 'github-dark',
  },
  'teal-dark': {
    id: 'teal-dark',
    label: 'Teal dark',
    background: 'radial-gradient(ellipse at 20% 30%, #134e4a 0%, #0f172a 55%, #020617 100%)',
    backgroundGrid: false,
    textPrimary: '#f0fdfa',
    textSecondary: '#99f6e4',
    accent: '#2dd4bf',
    accentAlt: '#22d3ee',
    cardBg: 'rgba(15, 45, 42, 0.75)',
    cardBorder: 'rgba(45, 212, 191, 0.3)',
    motionBg: 'radial-gradient(ellipse at 20% 30%, #134e4a 0%, #0f172a 55%, #020617 100%)',
    sketchBg: 'linear-gradient(160deg, #0f2d2a 0%, #134e4a 55%, #0b1628 100%)',
    sketchGrid: true,
    sketchTitle: '#5eead4',
    sketchAccentGreen: '#4ade80',
    sketchAccentBlue: '#67e8f9',
    sketchGold: '#fde68a',
    sketchSilver: '#cbd5e1',
    codeTheme: 'github-dark',
  },
  'minimal-light': {
    id: 'minimal-light',
    label: 'Minimal light',
    background: '#f1f5f9',
    backgroundGrid: false,
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    accent: '#0ea5e9',
    accentAlt: '#6366f1',
    cardBg: '#ffffff',
    cardBorder: 'rgba(15, 23, 42, 0.12)',
    motionBg: 'linear-gradient(180deg, #e2e8f0 0%, #f8fafc 100%)',
    sketchBg: '#ffffff',
    sketchGrid: true,
    sketchTitle: '#0f172a',
    sketchAccentGreen: '#15803d',
    sketchAccentBlue: '#1d4ed8',
    sketchGold: '#b45309',
    sketchSilver: '#64748b',
    codeTheme: 'github-light',
  },
};

export const DEFAULT_THEME_ID = 'dark-blue';

export function resolveTheme(themeId?: string): VisualTheme {
  if (themeId && VISUAL_THEMES[themeId]) return VISUAL_THEMES[themeId];
  return VISUAL_THEMES[DEFAULT_THEME_ID];
}

export function gridBackgroundCss(theme: VisualTheme): string {
  if (!theme.backgroundGrid && !theme.sketchGrid) return theme.background;
  const grid =
    'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.04) 39px, rgba(255,255,255,0.04) 40px),' +
    'repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.04) 39px, rgba(255,255,255,0.04) 40px)';
  return `${grid}, ${theme.sketchBg || theme.background}`;
}

export { brandPhotoDataUri, BRAND_BASE_GRADIENT, BRAND_LAYER_CSS, BRAND_LAYER_UI_CSS, BRAND_MOTION_CSS, BRAND_FRAME_CSS, BRAND_FRAME_UI_CSS } from './background.js';
export {
  DIAGRAM_PALETTE_IDS,
  DIAGRAM_PALETTES,
  DEFAULT_DIAGRAM_PALETTE,
  resolveDiagramPalette,
  sanitizeMermaidSource,
  type DiagramPaletteId,
  type MermaidThemeVars,
} from './palettes.js';
export { BRAND_ORANGE, BRAND_ORANGE_DEEP, BRAND_ORANGE_GLOW, BRAND_ORANGE_BORDER } from './accents.js';
export { buildBrandDocument, panelCardCss, type BrandFrameVariant } from './frame.js';
