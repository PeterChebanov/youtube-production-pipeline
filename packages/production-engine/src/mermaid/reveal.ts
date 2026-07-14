import type { Page } from 'playwright';
import { MERMAID_FLOWCHART_SVG } from './fit.js';

export const MERMAID_REVEAL_STEP_DELAY_SEC = 1.15;
export const MERMAID_REVEAL_FADE_SEC = 0.6;

export const MERMAID_REVEAL_CSS = `
  @keyframes mermaid-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .mermaid svg.flowchart g.node,
  .mermaid svg.flowchart g.edgePaths path,
  .mermaid svg.flowchart g.edgeLabel {
    opacity: 0;
  }
`;

export interface MermaidGraphEdge {
  from: string;
  to: string;
}

export interface MermaidRevealStep {
  edges: MermaidGraphEdge[];
  nodes: string[];
}

/** Parse node ids and directed edges from mermaid flowchart source. */
export function parseMermaidFlowchart(source: string): {
  edges: MermaidGraphEdge[];
  nodeIds: string[];
} {
  const nodeIds = new Set<string>();
  const edges: MermaidGraphEdge[] = [];

  for (const rawLine of source.split('\n')) {
    const line = rawLine.split('%%')[0]?.trim() ?? '';
    if (!line || line.startsWith('graph ') || line.startsWith('flowchart ')) continue;
    if (/^(classDef|class|style|linkStyle|click|subgraph)\b/i.test(line)) continue;

    const nodeRef = line.match(
      /^\s*([A-Za-z][A-Za-z0-9_]*)(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?/,
    );
    if (nodeRef) nodeIds.add(nodeRef[1]);

    const edgeMatch = line.match(
      /^\s*([A-Za-z][A-Za-z0-9_]*)(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?\s*--+>(?:\|[^|]*\|)?\s*([A-Za-z][A-Za-z0-9_]*)/,
    );
    if (edgeMatch) {
      nodeIds.add(edgeMatch[1]);
      nodeIds.add(edgeMatch[2]);
      edges.push({ from: edgeMatch[1], to: edgeMatch[2] });
    }
  }

  return { edges, nodeIds: [...nodeIds] };
}

/** Build node → edge(s) → node reveal steps; sibling branches can batch. */
export function buildMermaidRevealSteps(source: string): MermaidRevealStep[] {
  const { edges, nodeIds } = parseMermaidFlowchart(source);
  if (nodeIds.length === 0) return [];

  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, string[]>();
  for (const id of nodeIds) {
    incoming.set(id, new Set());
    outgoing.set(id, []);
  }
  for (const e of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    if (!incoming.has(e.to)) incoming.set(e.to, new Set());
    outgoing.get(e.from)!.push(e.to);
    incoming.get(e.to)!.add(e.from);
  }

  const roots = nodeIds.filter((id) => incoming.get(id)?.size === 0);
  if (roots.length === 0) roots.push(nodeIds[0]);

  const steps: MermaidRevealStep[] = [];
  const visited = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;

    const parents = [...(incoming.get(node) ?? [])].filter((p) => visited.has(p));
    if (parents.length > 0) {
      steps.push({
        edges: parents.map((from) => ({ from, to: node })),
        nodes: [],
      });
    }
    steps.push({ edges: [], nodes: [node] });
    visited.add(node);

    const children = (outgoing.get(node) ?? []).filter((c) => !visited.has(c));
    if (children.length > 1) {
      steps.push({
        edges: children.map((to) => ({ from: node, to })),
        nodes: [],
      });
      steps.push({ edges: [], nodes: children });
      for (const child of children) {
        visited.add(child);
        for (const grandchild of outgoing.get(child) ?? []) {
          if (!visited.has(grandchild)) queue.push(grandchild);
        }
      }
    } else {
      for (const child of children) queue.push(child);
    }
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) steps.push({ edges: [], nodes: [id] });
  }

  return steps;
}

export function mermaidRevealStepCount(source: string): number {
  const steps = buildMermaidRevealSteps(source);
  return steps.length > 0 ? steps.length : 4;
}

export async function applyMermaidFlowReveal(
  page: Page,
  source: string,
): Promise<number> {
  const steps = buildMermaidRevealSteps(source);
  if (steps.length === 0) return 0;

  await page.locator(MERMAID_FLOWCHART_SVG).evaluate(
    (svg, payload) => {
      const { steps: revealSteps, stepDelaySec, fadeSec } = payload as {
        steps: MermaidRevealStep[];
        stepDelaySec: number;
        fadeSec: number;
      };

      const root = svg as unknown as {
        querySelectorAll: (sel: string) => ArrayLike<{ id: string; style: { opacity: string; animation: string } }>;
      };
      const nodeEls = Array.from(root.querySelectorAll('g.node'));
      const pathEls = Array.from(root.querySelectorAll('g.edgePaths path'));
      const labelEls = Array.from(root.querySelectorAll('g.edgeLabel'));

      const findNode = (id: string) => nodeEls.find((n) => n.id.includes(`flowchart-${id}-`));

      const findEdge = (from: string, to: string) =>
        pathEls.find((p) => {
          const pid = p.id;
          return pid.includes(`L_${from}_${to}_`) || pid.includes(`L-${from}-${to}-`);
        });

      const edgeIndex = (from: string, to: string) =>
        pathEls.findIndex((p) => {
          const pid = p.id;
          return pid.includes(`L_${from}_${to}_`) || pid.includes(`L-${from}-${to}-`);
        });

      const hide = (el: { style: { opacity: string; animation: string } }) => {
        el.style.opacity = '0';
        el.style.animation = 'none';
      };

      const reveal = (el: { style: { opacity: string; animation: string } }, delaySec: number) => {
        el.style.opacity = '0';
        el.style.animation = `mermaid-fade-in ${fadeSec}s ease-out ${delaySec}s forwards`;
      };

      for (const el of [...nodeEls, ...pathEls, ...labelEls]) hide(el);

      for (let i = 0; i < revealSteps.length; i++) {
        const step = revealSteps[i];
        const delaySec = i * stepDelaySec;
        const touchedLabels = new Set<number>();

        for (const edge of step.edges) {
          const path = findEdge(edge.from, edge.to);
          if (path) reveal(path, delaySec);
          const idx = edgeIndex(edge.from, edge.to);
          if (idx >= 0 && labelEls[idx] && !touchedLabels.has(idx)) {
            reveal(labelEls[idx], delaySec);
            touchedLabels.add(idx);
          }
        }

        for (const nodeId of step.nodes) {
          const nodeEl = findNode(nodeId);
          if (nodeEl) reveal(nodeEl, delaySec);
        }
      }
    },
    {
      steps,
      stepDelaySec: MERMAID_REVEAL_STEP_DELAY_SEC,
      fadeSec: MERMAID_REVEAL_FADE_SEC,
    },
  );

  return steps.length;
}

/** Icons are embedded in node labels before layout (see labels.ts). No overlay injection. */
export async function injectMermaidNodeIcons(
  _page: Page,
  _source: string,
  _sceneId: string,
  _animated = true,
): Promise<void> {
  // no-op — inline icons are part of g.node bbox via embedMermaidInlineIcons()
}
