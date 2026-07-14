import { applyMermaidLayout } from '../mermaid/layout.js';

export const DIAGRAM_PALETTE_IDS = [
  'dark-branded',
  'pastel-complement',
  'high-contrast',
  'light-pro',
] as const;

export type DiagramPaletteId = (typeof DIAGRAM_PALETTE_IDS)[number];

export interface MermaidThemeVars {
  theme: 'base' | 'dark' | 'neutral';
  themeVariables: Record<string, string>;
  fontSize: string;
}

export const DIAGRAM_PALETTES: Record<DiagramPaletteId, MermaidThemeVars> = {
  'dark-branded': {
    theme: 'base',
    fontSize: '20px',
    themeVariables: {
      darkMode: 'true',
      background: 'transparent',
      primaryColor: '#ff943a',
      primaryTextColor: '#ffffff',
      primaryBorderColor: '#ffbc6e',
      secondaryColor: '#0f766e',
      secondaryTextColor: '#f0fdfa',
      secondaryBorderColor: '#14b8a6',
      tertiaryColor: '#1e3a5f',
      tertiaryTextColor: '#e2e8f0',
      tertiaryBorderColor: '#38bdf8',
      lineColor: '#2dd4bf',
      textColor: '#f8fafc',
      mainBkg: '#fb923c',
      nodeBorder: '#fdba74',
      clusterBkg: 'rgba(15,23,42,0.6)',
      clusterBorder: '#14b8a6',
      titleColor: '#f0c14b',
      edgeLabelBackground: 'rgba(6,12,28,0.9)',
      nodeTextColor: '#ffffff',
      fontSize: '20px',
    },
  },
  'pastel-complement': {
    theme: 'base',
    fontSize: '20px',
    themeVariables: {
      darkMode: 'false',
      background: 'transparent',
      primaryColor: '#ffedd5',
      primaryTextColor: '#9a3412',
      primaryBorderColor: '#fb923c',
      secondaryColor: '#ccfbf1',
      secondaryTextColor: '#134e4a',
      secondaryBorderColor: '#14b8a6',
      tertiaryColor: '#e0e7ff',
      tertiaryTextColor: '#3730a3',
      tertiaryBorderColor: '#818cf8',
      lineColor: '#0d9488',
      textColor: '#1e293b',
      mainBkg: '#fed7aa',
      nodeBorder: '#ea580c',
      clusterBkg: '#f1f5f9',
      clusterBorder: '#cbd5e1',
      titleColor: '#0f766e',
      edgeLabelBackground: '#faf8f5',
      nodeTextColor: '#134e4a',
    },
  },
  'high-contrast': {
    theme: 'base',
    fontSize: '20px',
    themeVariables: {
      darkMode: 'true',
      background: 'transparent',
      primaryColor: '#166534',
      primaryTextColor: '#ffffff',
      primaryBorderColor: '#22c55e',
      secondaryColor: '#991b1b',
      secondaryTextColor: '#ffffff',
      secondaryBorderColor: '#ef4444',
      tertiaryColor: '#0f766e',
      tertiaryTextColor: '#ffffff',
      tertiaryBorderColor: '#14b8a6',
      lineColor: '#f97316',
      textColor: '#ffffff',
      mainBkg: '#14532d',
      nodeBorder: '#4ade80',
      clusterBkg: 'rgba(23,23,23,0.7)',
      clusterBorder: '#525252',
      titleColor: '#fbbf24',
      edgeLabelBackground: 'rgba(0,0,0,0.85)',
      nodeTextColor: '#ffffff',
    },
  },
  'light-pro': {
    theme: 'neutral',
    fontSize: '20px',
    themeVariables: {
      darkMode: 'false',
      background: 'transparent',
      primaryColor: '#ffedd5',
      primaryTextColor: '#9a3412',
      primaryBorderColor: '#ea580c',
      secondaryColor: '#e0f2fe',
      secondaryTextColor: '#0c4a6e',
      secondaryBorderColor: '#0284c7',
      lineColor: '#0369a1',
      textColor: '#0f172a',
      mainBkg: '#fdba74',
      nodeBorder: '#ea580c',
      clusterBkg: '#f8fafc',
      clusterBorder: '#cbd5e1',
      titleColor: '#0f172a',
      edgeLabelBackground: '#ffffff',
      nodeTextColor: '#0f172a',
    },
  },
};

export const DEFAULT_DIAGRAM_PALETTE: DiagramPaletteId = 'dark-branded';

export function resolveDiagramPalette(id?: string): DiagramPaletteId {
  if (id && id in DIAGRAM_PALETTES) return id as DiagramPaletteId;
  return DEFAULT_DIAGRAM_PALETTE;
}

/** Strip LLM pastel inline styles — renderer applies palette instead. */
export function sanitizeMermaidSource(source: string): string {
  let s = source
    .split('\n')
    .filter((line) => !/^\s*style\s+\w+\s+fill:/i.test(line))
    .filter((line) => !/^\s*classDef\s+/i.test(line))
    .filter((line) => !/^\s*class\s+/i.test(line))
    .join('\n');

  s = applyMermaidLayout(s);

  s = s.replace(/(\b\w+)\[([^\]"\n]+)\]/g, (_m, id: string, label: string) => {
    const trimmed = label.trim();
    if (/[&<>#%]/.test(trimmed) || trimmed.includes(':')) {
      return `${id}["${trimmed.replace(/"/g, "'")}"]`;
    }
    return `${id}[${trimmed}]`;
  });

  s = s.replace(/(\b\w+)\{([^}"\n]+)\}/g, (_m, id: string, label: string) => {
    const trimmed = label.trim();
    if (/[&<>#%?]/.test(trimmed)) {
      return `${id}{"${trimmed.replace(/"/g, "'")}"}`;
    }
    return `${id}{${trimmed}}`;
  });

  return enhanceMermaidShapes(s.trim());
}

/** Round rects → stadium, queries → circles, outputs → hexagons; keep diamonds. */
export function enhanceMermaidShapes(source: string): string {
  let s = source;

  // Stadium / rounded rectangles: B[label] or B["label"]
  s = s.replace(/(\b\w+)\["([^"]+)"\]/g, (_m, id: string, label: string) => {
    if (/query|user|input/i.test(label)) return `${id}(("${label}"))`;
    if (/return|answer|result|synth/i.test(label)) return `${id}{{"${label}"}}`;
    return `${id}(["${label}"])`;
  });
  s = s.replace(/(\b\w+)\[([^\]"\n]+)\]/g, (_m, id: string, label: string) => {
    const t = label.trim();
    if (/query|user|input/i.test(t)) return `${id}(("${t}"))`;
    if (/return|answer|result|synth/i.test(t)) return `${id}{{${t}}}`;
    return `${id}(["${t}"])`;
  });

  return s;
}
