import path from 'node:path';
import {
  EpisodeCodeBindingSchema,
  type EpisodeCodeBinding,
  type EpisodeCodeMapEntry,
  type ScriptSourceFocus,
} from '@ecpe/schemas';
import { defaultFocusForFunctionalStep } from './code-anchors.js';

export interface ParsedDemoEpisode {
  episode: number;
  title: string;
  git_checkpoint: string;
  episode_type?: string;
  goal?: string;
  done_when?: string;
  body: string;
}

const GIT_TAG = /\*\*Git tag:\*\*\s*`([^`]+)`/;
const EPISODE_GOAL = /^### Episode goal\s*\n([\s\S]*?)(?=\n### |\n---|\n## EP|\Z)/m;
const DONE_WHEN = /\*\*EP\d+ done when:\*\*\s*(.+)/i;
const FUNCTIONAL_STEP =
  /^#### Step \d+\s+[—–-]\s+`([^`]+)`\s+[·•]\s+functional\s*$/gm;
const OPS_STEP = /^#### Step \d+\s+[—–-]\s+(.+?)\s+[·•]\s+ops\s*$/gm;
const DO_LINE =
  /^-\s+\*\*Do:\*\*\s*(?:`([^`]+)`|(.+?))\s*$/gm;
const BASH_BLOCK = /```bash\n([\s\S]*?)```/g;

const IDE_DO_PATTERNS = [
  /^open /i,
  /^show /i,
  /^IDE/i,
  /in IDE/i,
  /in the IDE/i,
  /directory tree/i,
];

/** Split demo-by-episodes.md into per-episode sections. */
export function parseDemoByEpisodes(markdown: string): ParsedDemoEpisode[] {
  // Accept: ## EP02 — Title | ## EP02 - Title | ## EP02 Title | ## EP2 — Title
  const parts = markdown.split(/^##\s*EP0*(\d+)\s*(?:[—–-]\s*|(?=[^\n]))/m);
  if (parts.length < 3) return [];

  const episodes: ParsedDemoEpisode[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const episodeNum = Number(parts[i]);
    const rest = parts[i + 1];
    if (!rest || !Number.isFinite(episodeNum)) continue;

    const titleLine = rest.split('\n')[0]?.trim() ?? '';
    const body = rest.slice(titleLine.length).trim();
    const gitMatch = body.match(GIT_TAG) ?? rest.match(GIT_TAG);
    const goalMatch = body.match(EPISODE_GOAL);
    const doneMatch = body.match(DONE_WHEN);

    episodes.push({
      episode: episodeNum,
      title: titleLine || `Episode ${episodeNum}`,
      git_checkpoint: gitMatch?.[1]?.trim() ?? `ep${String(episodeNum).padStart(2, '0')}`,
      goal: goalMatch?.[1]?.trim(),
      done_when: doneMatch?.[1]?.trim(),
      body,
    });
  }
  return episodes.sort((a, b) => a.episode - b.episode);
}

export function getDemoEpisode(
  markdown: string,
  episodeNumber: number,
): ParsedDemoEpisode | undefined {
  return parseDemoByEpisodes(markdown).find((e) => e.episode === episodeNumber);
}

function extractFunctionalPaths(body: string): { path: string; purpose: string }[] {
  const out: { path: string; purpose: string }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(FUNCTIONAL_STEP.source, 'gm');
  while ((m = re.exec(body)) !== null) {
    const pathRaw = m[1]!.trim();
    for (const p of splitPaths(pathRaw)) {
      out.push({ path: p, purpose: path.basename(p) });
    }
  }
  return out;
}

function extractOpsScope(body: string): string[] {
  const scope: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(OPS_STEP.source, 'gm');
  while ((m = re.exec(body)) !== null) {
    const title = m[1]!;
    for (const match of title.matchAll(/`([^`]+)`/g)) {
      scope.push(match[1]!);
    }
    if (/docker-compose/i.test(title)) scope.push('docker-compose.yml');
    if (/dockerfile/i.test(title)) scope.push('Dockerfile');
    if (/pyproject/i.test(title)) scope.push('pyproject.toml');
  }
  return [...new Set(scope)];
}

function splitPaths(raw: string): string[] {
  return raw
    .split(/\s+and\s+|\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractDemoCommands(body: string): string[] {
  const commands: string[] = [];

  let m: RegExpExecArray | null;
  const doRe = new RegExp(DO_LINE.source, 'gm');
  while ((m = doRe.exec(body)) !== null) {
    const raw = (m[1] ?? m[2] ?? '').trim();
    for (const part of raw.split(/\s+then\s+/i)) {
      const cmd = part.trim();
      if (cmd && isTerminalCommand(cmd)) commands.push(cmd);
    }
  }

  const bashRe = new RegExp(BASH_BLOCK.source, 'g');
  while ((m = bashRe.exec(body)) !== null) {
    const block = m[1]!.trim();
    for (const line of block.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      if (/^(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|ORDER BY)/i.test(t)) continue;
      if (isTerminalCommand(t) && !t.endsWith('\\"') && !t.endsWith('"')) commands.push(t);
    }
  }

  return [...new Set(commands.filter((c) => c.length > 8))];
}

function isTerminalCommand(cmd: string): boolean {
  if (IDE_DO_PATTERNS.some((p) => p.test(cmd))) return false;
  if (cmd.startsWith('`') && cmd.endsWith('`')) return false;
  return /^(docker|curl|uv run|uv sync|python|make |git |npm |pnpm |pytest|psql)/i.test(cmd);
}

/** Generate cumulative new_scope from EP01..EPN. */
export function buildCumulativeScope(
  allEpisodes: ParsedDemoEpisode[],
  throughEpisode: number,
): string[] {
  const scope = new Set<string>();
  for (const ep of allEpisodes) {
    if (ep.episode > throughEpisode) break;
    for (const p of extractFunctionalPaths(ep.body)) scope.add(p.path);
    for (const p of extractOpsScope(ep.body)) scope.add(p);
  }
  return [...scope].sort();
}

/** Generate episode-code.json binding from one parsed demo episode. */
export function generateEpisodeCodeBinding(
  ep: ParsedDemoEpisode,
  allEpisodes: ParsedDemoEpisode[],
  options: { repoUrl?: string } = {},
): EpisodeCodeBinding {
  const functional = extractFunctionalPaths(ep.body);
  const opsScope = extractOpsScope(ep.body);
  const newScope = [...functional.map((f) => f.path), ...opsScope];

  const script_sources = functional.map((f) => ({
    path: f.path,
    purpose: f.purpose,
    focus: defaultFocusForFunctionalStep(f.path) as ScriptSourceFocus[],
  }));

  const demoSummary =
    ep.done_when?.slice(0, 500) ??
    ep.goal?.split('\n')[0]?.slice(0, 500) ??
    ep.title;

  return EpisodeCodeBindingSchema.parse({
    version: 1,
    repo_url: options.repoUrl ?? '',
    title: ep.title,
    has_code: functional.length > 0,
    git_checkpoint: ep.git_checkpoint,
    new_scope: newScope,
    cumulative_scope: buildCumulativeScope(allEpisodes, ep.episode),
    demo: {
      commands: extractDemoCommands(ep.body),
      summary: demoSummary,
    },
    script_sources,
    notes: `Generated from demo-by-episodes EP${String(ep.episode).padStart(2, '0')}`,
  });
}

export function generateEpisodeCodeFromMarkdown(
  markdown: string,
  episodeNumber: number,
  options: { repoUrl?: string } = {},
): EpisodeCodeBinding {
  const all = parseDemoByEpisodes(markdown);
  const ep = all.find((e) => e.episode === episodeNumber);
  if (!ep) {
    throw new Error(`Episode EP${String(episodeNumber).padStart(2, '0')} not found in demo-by-episodes file.`);
  }
  return generateEpisodeCodeBinding(ep, all, options);
}

/** Generate binding from a pasted section or full demo-by-episodes.md. */
export function generateEpisodeCodeFromDemoSection(
  markdown: string,
  episodeNumber: number,
  options: {
    repoUrl?: string;
    allEpisodesMarkdown?: string;
    /** Used when paste has no ## EP0N header — we synthesize one. */
    fallbackTitle?: string;
  } = {},
): EpisodeCodeBinding {
  const normalized = normalizeDemoWalkthroughPaste(markdown, episodeNumber, options.fallbackTitle);
  const allFromPaste = parseDemoByEpisodes(normalized);
  const allFromCourse = options.allEpisodesMarkdown
    ? parseDemoByEpisodes(options.allEpisodesMarkdown)
    : [];

  const mergedByEp = new Map<number, ParsedDemoEpisode>();
  for (const ep of [...allFromCourse, ...allFromPaste]) {
    mergedByEp.set(ep.episode, ep);
  }
  const all = [...mergedByEp.values()].sort((a, b) => a.episode - b.episode);

  let ep = all.find((e) => e.episode === episodeNumber);
  if (!ep && allFromPaste.length === 1 && allFromPaste[0]!.episode === episodeNumber) {
    ep = allFromPaste[0];
  }
  if (!ep) {
    const found = all.map((e) => `EP${String(e.episode).padStart(2, '0')}`).join(', ') || 'none';
    throw new Error(
      `Could not generate episode-code.json for EP${String(episodeNumber).padStart(2, '0')}. ` +
        `Paste the ## EP${String(episodeNumber).padStart(2, '0')} — … section from demo-by-episodes.md ` +
        `(or the full file). Found sections: ${found}.`,
    );
  }

  return generateEpisodeCodeBinding(ep, all.length > 0 ? all : [ep], options);
}

/**
 * Ensure paste is parseable as an EP section. If the user pasted body without
 * `## EP0N —`, prepend a synthetic header so generation still works.
 */
export function normalizeDemoWalkthroughPaste(
  markdown: string,
  episodeNumber: number,
  fallbackTitle?: string,
): string {
  const trimmed = markdown.trim();
  if (!trimmed) return trimmed;

  if (parseDemoByEpisodes(trimmed).length > 0) return trimmed;

  // Common: pasted from mid-section or lost the ## heading.
  const epLabel = `EP${String(episodeNumber).padStart(2, '0')}`;
  const title = fallbackTitle?.trim() || 'Episode';
  if (/^#+\s*/.test(trimmed)) {
    // Has some heading but not EP — wrap as-is under EP header.
    return `## ${epLabel} — ${title}\n\n${trimmed}`;
  }
  return `## ${epLabel} — ${title}\n\n${trimmed}`;
}

export function generateAllEpisodeCodes(
  markdown: string,
  options: { repoUrl?: string } = {},
): EpisodeCodeMapEntry[] {
  const all = parseDemoByEpisodes(markdown);
  return all.map((ep) => {
    const binding = generateEpisodeCodeBinding(ep, all, options);
    return {
      episode: ep.episode,
      title: binding.title,
      has_code: binding.has_code,
      git_checkpoint: binding.git_checkpoint,
      new_scope: binding.new_scope,
      cumulative_scope: binding.cumulative_scope,
      demo: binding.demo,
      script_sources: binding.script_sources,
      illustrative_allowed: binding.illustrative_allowed,
      notes: binding.notes,
    };
  });
}
