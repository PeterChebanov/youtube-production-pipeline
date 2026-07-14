export const DIAGRAM_NODE_FILL_RGB = '251, 146, 60';
export const DIAGRAM_NODE_STROKE_RGB = '234, 88, 12';

export const DIAGRAM_NODE_SOLID_CSS = `
  .mermaid svg.flowchart {
    background: transparent !important;
  }
  .mermaid svg g.node > path:not([fill="none"]),
  .mermaid svg g.node > rect:not([fill="none"]),
  .mermaid svg g.node > polygon:not([fill="none"]),
  .mermaid svg g.node > circle:not([fill="none"]),
  .mermaid svg g.node > ellipse:not([fill="none"]) {
    fill: rgb(${DIAGRAM_NODE_FILL_RGB}) !important;
    fill-opacity: 1 !important;
    stroke: rgb(${DIAGRAM_NODE_STROKE_RGB}) !important;
    stroke-opacity: 1 !important;
    stroke-width: 2px !important;
  }
  .mermaid svg .nodeLabel,
  .mermaid svg .label,
  .mermaid svg text {
    fill: #f8fafc !important;
    color: #f8fafc !important;
  }
  .mermaid .ecpe-icon-badge circle {
    fill: #0d1117 !important;
    stroke: #243044 !important;
    stroke-width: 1px !important;
  }
  .mermaid .ecpe-icon-badge path,
  .mermaid .ecpe-icon-badge line,
  .mermaid .ecpe-icon-badge polyline,
  .mermaid .ecpe-icon-badge ellipse {
    fill: none !important;
    stroke: #fb923c !important;
    stroke-width: 3px !important;
  }
`;

/** @deprecated Use DIAGRAM_NODE_SOLID_CSS — kept for import compat. */
export const DIAGRAM_NODE_TRANSPARENCY_CSS = DIAGRAM_NODE_SOLID_CSS;

import type { Page } from 'playwright';
import { MERMAID_FLOWCHART_SVG } from './fit.js';

/** Force solid orange fills on rendered Mermaid SVG nodes. */
export async function applyDiagramNodeTransparency(page: Page): Promise<void> {
  await page.locator(MERMAID_FLOWCHART_SVG).evaluate(
    (svg, cfg) => {
      const shapes = svg.querySelectorAll(
        'g.node path, g.node rect, g.node polygon, g.node circle, g.node ellipse',
      );
      for (let i = 0; i < shapes.length; i++) {
        const shape = shapes.item(i) as {
          getAttribute: (k: string) => string | null;
          setAttribute: (k: string, v: string) => void;
          closest: (sel: string) => unknown;
        };
        if (shape.closest('foreignObject, .ecpe-icon-badge, .mermaid-node-badge')) continue;
        const fill = shape.getAttribute('fill');
        if (!fill || fill === 'none' || fill === 'transparent') continue;
        shape.setAttribute('fill', `rgb(${cfg.fillRgb})`);
        shape.setAttribute('fill-opacity', '1');
        shape.setAttribute('stroke', `rgb(${cfg.strokeRgb})`);
        shape.setAttribute('stroke-opacity', '1');
      }
    },
    { fillRgb: DIAGRAM_NODE_FILL_RGB, strokeRgb: DIAGRAM_NODE_STROKE_RGB },
  );
}
