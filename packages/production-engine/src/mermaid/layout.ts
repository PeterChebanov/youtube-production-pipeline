import { parseMermaidFlowchart } from './reveal.js';

export function isMermaidHorizontal(source: string): boolean {
  return /^\s*(graph|flowchart)\s+LR\b/im.test(source.trim());
}

function replaceGraphDirection(source: string, to: 'LR' | 'TD' | 'TB'): string {
  return source.replace(/^\s*(graph|flowchart)\s+(TD|TB|LR|RL|BT)\b/im, `$1 ${to}`);
}

/** Longest forward chain length on solid edges (main reading path). */
function longestChainLength(nodeIds: string[], edges: { from: string; to: string }[]): number {
  if (nodeIds.length === 0) return 0;
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    incoming.set(id, new Set());
  }
  for (const e of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    if (!incoming.has(e.to)) incoming.set(e.to, new Set());
    outgoing.get(e.from)!.push(e.to);
    incoming.get(e.to)!.add(e.from);
  }

  const roots = nodeIds.filter((id) => incoming.get(id)?.size === 0);
  const start = roots.length > 0 ? roots : [nodeIds[0]];

  const walk = (id: string, visited: Set<string>): number => {
    if (visited.has(id)) return 0;
    visited.add(id);
    const children = outgoing.get(id) ?? [];
    if (children.length === 0) return 1;
    return 1 + Math.max(...children.map((c) => walk(c, new Set(visited))), 0);
  };

  return Math.max(...start.map((r) => walk(r, new Set())), nodeIds.length > 0 ? 1 : 0);
}

function stripSelfLoopAnnotations(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.split('%%')[0]?.trim() ?? '';
      const selfLoop = t.match(/^([A-Za-z][A-Za-z0-9_]*)\s+-\.[^>]*->\s*\1\s*$/);
      return !selfLoop;
    })
    .join('\n');
}

/**
 * Pick layout direction for 16:9 readability (RULE-D01):
 * - Keep LR graphs horizontal (do not collapse to vertical strip)
 * - Convert simple forward chains in TD/TB to LR (LTR timeline)
 */
export function applyMermaidLayout(source: string): string {
  let s = stripSelfLoopAnnotations(source.trim());
  const { nodeIds, edges } = parseMermaidFlowchart(s);
  const n = nodeIds.length;

  if (n >= 2 && n <= 6) {
    const chain = longestChainLength(nodeIds, edges);
    const isSimpleChain = chain >= n - 1 && chain >= 2;
    if (isSimpleChain) {
      s = replaceGraphDirection(s, 'LR');
    }
  }

  if (/^\s*(graph|flowchart)\s+RL\b/im.test(s)) {
    s = replaceGraphDirection(s, 'LR');
  }
  if (/^\s*(graph|flowchart)\s+BT\b/im.test(s)) {
    s = replaceGraphDirection(s, 'TD');
  }

  return s;
}
