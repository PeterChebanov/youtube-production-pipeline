/** Max chars injected into LLM prompts (safety cap after section selection). */
export const APPLICATION_STATE_MAX_INJECT_CHARS = 14_000;

/** Implemented bullets kept in prompt injection; rest summarized. */
export const APPLICATION_STATE_MAX_IMPLEMENTED_BULLETS = 12;

const INJECT_SECTION_ORDER = [
  'Repository',
  'Project tree',
  'Concepts introduced',
  'Decisions',
  'Not yet built',
  'Implemented',
] as const;

const PROTECTED_SECTIONS = new Set<string>([
  'Repository',
  'Project tree',
  'Concepts introduced',
  'Decisions',
]);

export interface ApplicationStateInjectMeta {
  originalChars: number;
  injectedChars: number;
  compacted: boolean;
  omittedImplementedBullets: number;
}

export interface ApplicationStateInjectResult {
  text: string;
  meta: ApplicationStateInjectMeta;
}

/** Split application-state.md body by `##` section headers. */
export function parseApplicationStateSections(markdown: string): Record<string, string> {
  const sections: Record<string, string[]> = {};
  let current: string | null = null;

  for (const line of markdown.split('\n')) {
    const match = line.match(/^## (.+)$/);
    if (match) {
      current = match[1]!.trim();
      sections[current] = [];
      continue;
    }
    if (current) sections[current]!.push(line);
  }

  const out: Record<string, string> = {};
  for (const [name, lines] of Object.entries(sections)) {
    const body = lines.join('\n').trim();
    if (body) out[name] = body;
  }
  return out;
}

function bulletLines(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s/.test(l));
}

function compactImplementedSection(body: string): { text: string; omitted: number } {
  const bullets = bulletLines(body);
  if (bullets.length <= APPLICATION_STATE_MAX_IMPLEMENTED_BULLETS) {
    return { text: body, omitted: 0 };
  }

  const kept = bullets.slice(0, APPLICATION_STATE_MAX_IMPLEMENTED_BULLETS);
  const omitted = bullets.length - kept.length;
  const note = `- _…and ${omitted} more implemented item(s) — see project tree and prior episode folders_`;
  return { text: [...kept, note].join('\n'), omitted };
}

function compactGenericSection(body: string, maxChars: number): string {
  if (body.length <= maxChars) return body;
  return `${body.slice(0, maxChars).trimEnd()}\n\n_…section truncated for prompt injection_`;
}

function rebuildDocument(sections: Record<string, string>, title: string): string {
  const parts = [title];
  for (const name of INJECT_SECTION_ORDER) {
    const body = sections[name];
    if (!body?.trim()) continue;
    parts.push(`## ${name}`, body.trim());
  }
  return parts.join('\n\n').trim();
}

function trimToMaxCharsPreservingProtected(
  markdown: string,
  sections: Record<string, string>,
  maxChars: number,
): { text: string; compacted: boolean } {
  if (markdown.length <= maxChars) {
    return { text: markdown, compacted: false };
  }

  const next = { ...sections };
  if (next.Implemented) {
    const reducedBullets = bulletLines(next.Implemented).slice(0, 6);
    next.Implemented =
      reducedBullets.length > 0
        ? [
            ...reducedBullets,
            `- _…remaining implemented items omitted from prompt — see project tree_`,
          ].join('\n')
        : next.Implemented;
  }
  if (next['Not yet built']) {
    next['Not yet built'] = compactGenericSection(next['Not yet built'], 1200);
  }
  if (next.Decisions) {
    next.Decisions = compactGenericSection(next.Decisions, 2000);
  }

  let text = rebuildDocument(next, '# Application state (injected snapshot)');
  if (text.length <= maxChars) {
    return { text, compacted: true };
  }

  // Last resort: drop Implemented entirely; protected sections stay.
  delete next.Implemented;
  text = rebuildDocument(next, '# Application state (injected snapshot)');
  return { text, compacted: true };
}

/**
 * Prepare course memory for a pipeline stage.
 * episode-wrap receives the full document; other stages get a compact hot/warm slice.
 */
export function prepareApplicationStateForPrompt(
  markdown: string,
  stageId: string,
): ApplicationStateInjectResult {
  const original = markdown.trim();
  const emptyMeta: ApplicationStateInjectMeta = {
    originalChars: 0,
    injectedChars: 0,
    compacted: false,
    omittedImplementedBullets: 0,
  };
  if (!original) {
    return { text: '', meta: emptyMeta };
  }

  if (stageId === 'episode-wrap') {
    return {
      text: original,
      meta: {
        originalChars: original.length,
        injectedChars: original.length,
        compacted: false,
        omittedImplementedBullets: 0,
      },
    };
  }

  const parsed = parseApplicationStateSections(original);
  let omittedImplemented = 0;

  if (parsed.Implemented) {
    const compact = compactImplementedSection(parsed.Implemented);
    parsed.Implemented = compact.text;
    omittedImplemented = compact.omitted;
  }

  let text = rebuildDocument(parsed, '# Application state (injected snapshot)');
  const { text: capped, compacted: cappedFurther } = trimToMaxCharsPreservingProtected(
    text,
    parsed,
    APPLICATION_STATE_MAX_INJECT_CHARS,
  );
  text = capped;

  return {
    text,
    meta: {
      originalChars: original.length,
      injectedChars: text.length,
      compacted: omittedImplemented > 0 || cappedFurther,
      omittedImplementedBullets: omittedImplemented,
    },
  };
}

/** Rough token estimate for UI/logging (~4 chars per token for English/technical mix). */
export function estimateApplicationStateTokens(charCount: number): number {
  return Math.ceil(charCount / 4);
}

export function isProtectedApplicationStateSection(sectionName: string): boolean {
  return PROTECTED_SECTIONS.has(sectionName);
}
