import { iconBadgeMermaidInline, resolveIconName } from '../icons/index.js';
import { parseMermaidFlowchart } from './reveal.js';

/** ~80% of typical mermaid pill height — badge reads as accent, not speck. */
export const MERMAID_INLINE_ICON_SIZE = 40;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function iconBadgeForMermaidLabel(name: string, size = MERMAID_INLINE_ICON_SIZE): string {
  return iconBadgeMermaidInline(name, size);
}

export function stripMermaidLabelText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parsePlainNodeLabels(source: string, nodeIds: string[]): string[] {
  return nodeIds.map((id) => {
    const stadium = source.match(new RegExp(`\\b${id}\\(\\["([^"]*)"`));
    if (stadium) return stripMermaidLabelText(stadium[1]);
    const quoted = source.match(new RegExp(`\\b${id}\\["([^"]+)"\\]`));
    if (quoted) return stripMermaidLabelText(quoted[1]);
    const plain = source.match(new RegExp(`\\b${id}\\[([^\\]\\n]+)\\]`));
    if (plain) return stripMermaidLabelText(plain[1]);
    return id;
  });
}

function buildInlineLabelHead(labelText: string, badgeHtml: string): string {
  const text = escapeHtmlText(labelText);
  return `<span class=mermaid-node-head><span class=mermaid-node-badge>${badgeHtml}</span><span class=mermaid-node-text>${text}</span></span>`;
}

/**
 * Embed icon badges inside each node's HTML label before mermaid layout runs.
 * Icons are part of the node bbox — edges connect node boundaries, not free-floating tiles.
 */
export function embedMermaidInlineIcons(source: string, sceneId: string): string {
  const { nodeIds } = parseMermaidFlowchart(source);
  if (nodeIds.length === 0) return source;

  const labels = parsePlainNodeLabels(source, nodeIds);
  let s = source;

  for (let i = 0; i < nodeIds.length; i++) {
    const id = nodeIds[i];
    const label = labels[i] ?? id;
    if (!label || /mermaid-node-head/.test(label)) continue;

    const badge = iconBadgeForMermaidLabel(
      resolveIconName({
        variant: 'motion',
        seed: `${sceneId}:mermaid:${i}`,
        textParts: [label],
      }),
    );
    const head = buildInlineLabelHead(label, badge);
    const esc = escapeRegex(label);

    const stadium = new RegExp(`(\\b${id})\\(\\["${esc}"\\]\\)`, 'g');
    if (stadium.test(s)) {
      s = s.replace(stadium, `$1(["${head}"])`);
      continue;
    }

    const quoted = new RegExp(`(\\b${id})\\["${esc}"\\]`, 'g');
    if (quoted.test(s)) {
      s = s.replace(quoted, `$1(["${head}"])`);
      continue;
    }

    const plain = new RegExp(`(\\b${id})\\[${esc}\\]`, 'g');
    s = s.replace(plain, `$1(["${head}"])`);
  }

  return s;
}

export const MERMAID_INLINE_ICON_CSS = `
  .mermaid .mermaid-node-head {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    justify-content: center;
    white-space: nowrap;
    line-height: 1.2;
  }
  .mermaid .mermaid-node-badge {
    display: inline-flex;
    flex-shrink: 0;
    line-height: 0;
    overflow: visible;
  }
  .mermaid .mermaid-node-badge .ecpe-icon-badge {
    display: block;
    overflow: visible;
    vertical-align: middle;
  }
  .mermaid .mermaid-node-text {
    color: #f8fafc;
    font-weight: 600;
  }
`;
