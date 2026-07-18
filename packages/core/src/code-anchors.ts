import path from 'node:path';
import type { ScriptSourceFocus } from '@ecpe/schemas';

export interface CodeAnchor {
  label: string;
  start_line: number;
  end_line: number;
  focus: ScriptSourceFocus['focus'];
}

const FULL_FILE_MAX_LINES = 80;

/** Resolve pedagogical focus hints to concrete line ranges in a source file. */
export function resolveCodeAnchors(
  fileContent: string,
  _relPath: string,
  focusHints: ScriptSourceFocus[],
): CodeAnchor[] {
  const lines = fileContent.split('\n');
  const anchors: CodeAnchor[] = [];

  if (focusHints.length === 0) {
    return [wholeFileAnchor(lines, 'full')];
  }

  for (const hint of focusHints) {
    if (hint.start_line != null && hint.end_line != null) {
      anchors.push({
        label: hint.label ?? hint.focus,
        start_line: hint.start_line,
        end_line: Math.min(hint.end_line, lines.length),
        focus: hint.focus,
      });
      continue;
    }

    if (hint.focus === 'full') {
      anchors.push(wholeFileAnchor(lines, 'full', hint.label));
      continue;
    }

    if (hint.focus === 'imports') {
      const block = findImportsBlock(lines);
      if (block) {
        anchors.push({ label: hint.label ?? 'Imports', ...block, focus: 'imports' });
      }
      continue;
    }

    if (hint.focus === 'types' || hint.focus === 'functions' || hint.focus === 'custom') {
      const autoLabels =
        hint.focus === 'types'
          ? findTopLevelNames(lines, 'class')
          : hint.focus === 'functions'
            ? findTopLevelNames(lines, 'def')
            : [];
      const tryLabels = hint.labels.length > 0 ? hint.labels : autoLabels;
      let matched = 0;
      for (const label of tryLabels) {
        const sym = findSymbolBlock(lines, label);
        if (sym) {
          matched++;
          anchors.push({
            // Prefer real symbol name; keep pedagogical label only when caller
            // supplied exactly one explicit label.
            label: hint.labels.length === 1 && hint.label ? hint.label : label,
            ...sym,
            focus: hint.focus === 'types' ? 'types' : hint.focus === 'functions' ? 'functions' : 'custom',
          });
        }
      }
      // Path-derived labels (e.g. Keyword from keyword.py) often miss real symbols
      // (keyword_search) — fall back to every top-level class/def in the file.
      if (matched === 0 && autoLabels.length > 0 && hint.labels.length > 0) {
        for (const label of autoLabels) {
          const sym = findSymbolBlock(lines, label);
          if (sym) {
            anchors.push({
              label,
              ...sym,
              focus: hint.focus === 'types' ? 'types' : 'functions',
            });
          }
        }
      }
      continue;
    }
  }

  // Imports-only maps are useless for walkthrough episodes — promote to full file
  // when no type/function anchors resolved (common when focus.labels were empty).
  const meaningful = anchors.filter((a) => a.focus !== 'imports');
  if (meaningful.length === 0) {
    return [wholeFileAnchor(lines, 'full')];
  }

  return dedupeAnchors(anchors);
}

function wholeFileAnchor(
  lines: string[],
  focus: ScriptSourceFocus['focus'],
  label?: string,
): CodeAnchor {
  const end = lines.length <= FULL_FILE_MAX_LINES ? lines.length : FULL_FILE_MAX_LINES;
  return {
    label: label ?? (lines.length <= FULL_FILE_MAX_LINES ? 'Full file' : `Top of file (1–${end})`),
    start_line: 1,
    end_line: end,
    focus,
  };
}

function findImportsBlock(lines: string[]): { start_line: number; end_line: number } | undefined {
  let start = 1;
  let end = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      if (end > 0) break;
      continue;
    }
    if (/^(import |from .+ import)/.test(trimmed)) {
      if (end === 0) start = i + 1;
      end = i + 1;
      continue;
    }
    if (end > 0) break;
    if (/^(class |def |async def |@)/.test(trimmed)) break;
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      end = i + 1;
      continue;
    }
  }
  if (end >= start) return { start_line: start, end_line: end };
  return { start_line: 1, end_line: Math.min(25, lines.length) };
}

function findTopLevelNames(lines: string[], kind: 'class' | 'def'): string[] {
  const names: string[] = [];
  const re =
    kind === 'class'
      ? /^class\s+([A-Za-z_][\w]*)\b/
      : /^(?:async\s+)?def\s+([A-Za-z_][\w]*)\b/;
  for (const line of lines) {
    if (/^\s/.test(line)) continue; // nested only
    const m = line.match(re);
    if (m?.[1]) names.push(m[1]);
  }
  return names;
}

function findSymbolBlock(
  lines: string[],
  symbol: string,
): { start_line: number; end_line: number } | undefined {
  const patterns = [
    new RegExp(`^class\\s+${escapeRegExp(symbol)}\\b`),
    new RegExp(`^def\\s+${escapeRegExp(symbol)}\\b`),
    new RegExp(`^async\\s+def\\s+${escapeRegExp(symbol)}\\b`),
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!patterns.some((p) => p.test(line))) continue;

    const baseIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    let end = i + 1;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (!next.trim()) {
        end = j + 1;
        continue;
      }
      const indent = next.match(/^(\s*)/)?.[1]?.length ?? 0;
      if (indent <= baseIndent && /^(class |def |async def |@)/.test(next.trim())) break;
      end = j + 1;
    }
    return { start_line: i + 1, end_line: end };
  }
  return undefined;
}

function dedupeAnchors(anchors: CodeAnchor[]): CodeAnchor[] {
  const seen = new Set<string>();
  const out: CodeAnchor[] = [];
  for (const a of anchors) {
    const key = `${a.start_line}-${a.end_line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.sort((a, b) => a.start_line - b.start_line);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sliceLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split('\n');
  return lines.slice(startLine - 1, endLine).join('\n');
}

/** Default focus hints from functional step type in demo-by-episodes. */
export function defaultFocusForFunctionalStep(stepTitle: string): ScriptSourceFocus[] {
  return [
    { focus: 'imports', labels: [], label: 'Imports' },
    { focus: 'types', labels: extractSymbolCandidates(stepTitle), label: 'Types & models' },
    { focus: 'functions', labels: extractSymbolCandidates(stepTitle), label: 'Functions' },
  ];
}

function extractSymbolCandidates(text: string): string[] {
  const out: string[] = [];
  const backtick = text.match(/`([^`]+)`/);
  const raw = (backtick?.[1] ?? text).trim();
  if (!raw) return [];
  const base = path.basename(raw, path.extname(raw));
  if (base && base !== 'py') {
    out.push(toPascalCase(base), toSnakeCase(base));
  }
  return [...new Set(out.filter(Boolean))];
}

function toPascalCase(s: string): string {
  return s
    .split(/[_\-.]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

function toSnakeCase(s: string): string {
  return s.replace(/\.[^.]+$/, '').replace(/[-.]/g, '_');
}

export function formatAnchorsAppendix(
  relPath: string,
  anchors: CodeAnchor[],
  purpose?: string,
): string {
  const lines = [`### \`${relPath}\`${purpose ? ` — ${purpose}` : ''}`];
  for (const a of anchors) {
    lines.push(`- **${a.label}** — lines ${a.start_line}–${a.end_line} (${a.focus})`);
  }
  return lines.join('\n');
}
