import type { ProductionScene } from '@ecpe/schemas';
import type { VisualTheme } from '../themes/index.js';
import { buildBrandDocument, panelCardCss } from '../themes/frame.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export interface CodePart {
  label: string;
  html: string;
}

function inferFilename(scene: ProductionScene, language: string): string {
  const explicit = asString(scene.data.filename);
  if (explicit) return explicit;
  const visual = scene.visual?.replace(/_/g, '-');
  const extMap: Record<string, string> = {
    python: 'py',
    typescript: 'ts',
    javascript: 'js',
    yaml: 'yml',
    json: 'json',
    bash: 'sh',
  };
  const ext = extMap[language] ?? language;
  if (visual) return `${visual}.${ext}`;
  return `snippet.${ext}`;
}

function inferCaption(scene: ProductionScene, code: string): string {
  const explicit = asString(scene.data.caption);
  if (explicit) return explicit;
  if (scene.purpose) return scene.purpose;
  const firstLines = code.split('\n').slice(0, 3);
  for (const line of firstLines) {
    const m = line.match(/^#\s*(.+)/);
    if (m && m[1].length > 8) return m[1].trim();
  }
  return scene.visual?.replace(/_/g, ' ') ?? scene.scene_id;
}

function inferFooter(code: string): string {
  const lines = code.split('\n').filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^#\s*(.+)/);
    if (m && m[1].length > 10) return m[1].trim();
  }
  return '';
}

export function buildCodePanelHtml(
  scene: ProductionScene,
  parts: CodePart[],
  fontSize: number,
  language: string,
  theme: VisualTheme,
): string {
  const code = asString(scene.data.code);
  const filename = inferFilename(scene, language);
  const caption = inferCaption(scene, code);
  const footer = inferFooter(code);
  const multi = parts.length > 1;

  const columnsClass = parts.length >= 3 ? 'code-columns code-columns-3' : 'code-columns';

  const partsHtml = parts
    .map(
      (part) => `
      <div class="code-part">
        ${part.label ? `<div class="code-part-label">${escapeHtml(part.label)}</div>` : ''}
        ${part.html}
      </div>`,
    )
    .join('');

  const css = `
  ${panelCardCss(theme)}
  .code-panel { width: 100%; max-width: 1680px; margin: 0 auto; }
  .panel-body pre, .panel-body code {
    font-family: 'SF Mono', ui-monospace, Menlo, monospace !important;
    font-size: ${fontSize}px !important;
    line-height: 1.5 !important;
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    text-align: left !important;
    white-space: pre !important;
  }
  .panel-body .shiki {
    background: #0d1117 !important;
    border-radius: 12px;
    padding: 20px 24px !important;
    overflow: visible !important;
  }
  .panel-body { overflow: visible; padding-bottom: 16px; }
  .code-columns {
    display: grid;
    grid-template-columns: repeat(${parts.length}, 1fr);
    gap: 20px;
    align-items: start;
  }
  .code-part-label {
    font-size: 20px; font-weight: 700; color: ${theme.accent};
    margin-bottom: 10px; letter-spacing: 0.02em;
  }
  .code-part { min-width: 0; }
`;

  const body = `
  <div class="code-panel panel">
    <div class="panel-chrome">
      <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
      <span class="panel-filename">${escapeHtml(filename)}</span>
      ${multi ? `<span class="panel-filename" style="margin-left:auto;opacity:.7">Part 1–${parts.length}</span>` : ''}
    </div>
    <div class="panel-caption">${escapeHtml(caption)}</div>
    <div class="panel-body ${multi ? columnsClass : ''}">${partsHtml}</div>
    ${footer ? `<div class="panel-footer">→ ${escapeHtml(footer)}</div>` : ''}
  </div>`;

  return buildBrandDocument(filename, css, body);
}
