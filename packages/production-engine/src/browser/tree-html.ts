import type { VisualTheme } from '../themes/index.js';
import { buildBrandDocument, panelCardCss } from '../themes/frame.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function isTreeContent(text: string): boolean {
  return /[├└│]/.test(text) || /^\S+\/$/m.test(text);
}

const BLOCK_COLORS = ['#14b8a6', '#38bdf8', '#a78bfa', '#fb923c'];

function highlightTreeLine(line: string): string {
  const escaped = escapeHtml(line);
  let html = escaped;

  const blockMatch = line.match(/#\s*Block\s*(\d+)/i);
  if (blockMatch) {
    const n = parseInt(blockMatch[1], 10);
    const color = BLOCK_COLORS[(n - 1) % BLOCK_COLORS.length];
    html += ` <span class="badge" style="background:${color}22;color:${color};border:1px solid ${color}">Block ${n}</span>`;
  }

  if (/ingestion|storage|retrieval|generation/i.test(line)) {
    html = html.replace(
      /(ingestion|storage|retrieval|generation)/gi,
      `<span class="hl-folder">$1</span>`,
    );
  }

  if (/README|requirements|docker-compose/i.test(line)) {
    html = html.replace(
      /(README\.md|requirements\.txt|docker-compose\.yml)/g,
      `<span class="hl-file">$1</span>`,
    );
  }

  return html;
}

function parseCallouts(text: string): { treeLines: string[]; callouts: { text: string; tone: string }[] } {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const treeLines: string[] = [];
  const callouts: { text: string; tone: string }[] = [];

  for (const line of lines) {
    const stripped = stripHtmlTags(line);
    if (/^→|^-&gt;/.test(stripped) || /Skeleton|Tests as we build|miserable/i.test(stripped)) {
      const tone = /test|miserable|warn/i.test(stripped) ? 'warn' : 'info';
      callouts.push({ text: stripped.replace(/^→\s*/, ''), tone });
    } else if (!/^</.test(line) || /[├└│]/.test(stripped)) {
      treeLines.push(stripped);
    }
  }

  return { treeLines, callouts };
}

export function buildAnnotatedTreeHtml(
  rawHtml: string,
  title: string,
  theme: VisualTheme,
  caption?: string,
): string {
  const text = stripHtmlTags(rawHtml);
  const { treeLines, callouts } = parseCallouts(text);
  const rootLine = treeLines[0] || title;

  const treeHtml = treeLines
    .map((line, i) => {
      const cls = i === 0 ? 'tree-root' : 'tree-line';
      return `<div class="${cls}">${highlightTreeLine(line)}</div>`;
    })
    .join('');

  const calloutHtml = callouts
    .map((c) => {
      const cls = c.tone === 'warn' ? 'callout warn' : 'callout info';
      const icon = c.tone === 'warn' ? '⚠' : '💡';
      return `<div class="${cls}"><span class="callout-icon">${icon}</span><span>${escapeHtml(c.text)}</span></div>`;
    })
    .join('');

  const css = `
  ${panelCardCss(theme)}
  .panel { display: flex; flex-direction: column; min-height: 760px; max-height: 960px; }
  .repo-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 22px 32px 0; flex-shrink: 0;
  }
  .repo-title {
    font-size: 38px; font-weight: 700; color: ${theme.textPrimary};
    display: flex; align-items: center; gap: 14px;
  }
  .repo-badge {
    font-size: 18px; padding: 6px 14px; border-radius: 20px;
    background: rgba(20,184,166,0.15); color: ${theme.accent};
    border: 1px solid ${theme.accent};
    font-family: ui-monospace, monospace;
  }
  .repo-caption {
    padding: 12px 32px 0; font-size: 24px; color: ${theme.textSecondary};
    flex-shrink: 0;
  }
  .repo-layout {
    display: grid;
    grid-template-columns: 1fr ${callouts.length > 0 ? '380px' : '1fr'};
    gap: 24px;
    padding: 16px 32px 28px;
    flex: 1;
    min-height: 0;
    align-items: stretch;
  }
  .tree-panel {
    padding: 24px 28px;
    background: rgba(0,0,0,0.35);
    border-radius: 14px;
    border: 1px solid ${theme.cardBorder};
    font-family: 'SF Mono', ui-monospace, Menlo, monospace;
    font-size: 26px;
    line-height: 1.5;
    overflow: hidden;
  }
  .tree-root { color: ${theme.accent}; font-weight: 700; font-size: 30px; margin-bottom: 8px; }
  .tree-line { color: ${theme.textPrimary}; }
  .hl-folder { color: ${theme.accent}; font-weight: 600; }
  .hl-file { color: ${theme.sketchGold || '#f0c14b'}; }
  .badge {
    display: inline-block; font-size: 16px; padding: 2px 10px;
    border-radius: 8px; margin-left: 10px; vertical-align: middle;
    font-family: 'Segoe UI', system-ui, sans-serif;
  }
  .repo-sidebar {
    display: flex; flex-direction: column; gap: 16px;
    justify-content: center;
  }
  .sidebar-label {
    font-size: 18px; font-weight: 700; color: ${theme.textSecondary};
    text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;
  }
  .callout {
    padding: 18px 20px; border-radius: 14px; font-size: 22px;
    display: flex; align-items: flex-start; gap: 12px; line-height: 1.4;
  }
  .callout.info {
    background: rgba(20,184,166,0.15);
    border: 1px solid ${theme.accent};
    color: ${theme.textPrimary};
  }
  .callout.warn {
    background: rgba(239,68,68,0.12);
    border: 1px solid #f87171;
    color: #fecaca;
  }
  .callout-icon { font-size: 24px; flex-shrink: 0; }
`;

  const body = `
  <div class="panel">
    <div class="repo-header">
      <div class="repo-title">📁 ${escapeHtml(rootLine.replace(/\/$/, ''))}</div>
      <span class="repo-badge">GitHub</span>
    </div>
    ${caption ? `<div class="repo-caption">${escapeHtml(caption)}</div>` : ''}
    <div class="repo-layout">
      <div class="tree-panel">${treeHtml}</div>
      ${callouts.length > 0 ? `<aside class="repo-sidebar">
        <div class="sidebar-label">Notes</div>
        ${calloutHtml}
      </aside>` : ''}
    </div>
  </div>`;

  return buildBrandDocument(title, css, body);
}

export function detectAndBuildBrowserHtml(
  html: string,
  title: string,
  theme: VisualTheme,
  caption?: string,
): string | null {
  const text = stripHtmlTags(html);
  if (!isTreeContent(text)) return null;
  return buildAnnotatedTreeHtml(html, title, theme, caption);
}

export { isTreeContent };
