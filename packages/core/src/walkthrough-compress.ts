/**
 * Compress a full Demo walkthrough into a prompt-sized skeleton.
 * Keeps: goal, file order, key outcomes, money-shot verification.
 * Drops: long Context/architecture essays, full SQL dumps, repeated Expect walls.
 */
export function compressDemoWalkthroughForPrompt(markdown: string, maxChars = 7_500): string {
  const raw = markdown.trim();
  if (!raw) return '';
  if (raw.length <= maxChars) {
    // Still strip ultra-verbose verification tables when present
    return summarizeWalkthrough(raw, maxChars);
  }
  return summarizeWalkthrough(raw, maxChars);
}

function summarizeWalkthrough(markdown: string, maxChars: number): string {
  const lines: string[] = [];

  const title = markdown.match(/^##\s+(.+)$/m)?.[1]?.trim();
  if (title) lines.push(`### ${title}`);

  const git = markdown.match(/\*\*Git tag:\*\*\s*`([^`]+)`/);
  if (git) lines.push(`**Git tag:** \`${git[1]}\``);

  const goal = markdown.match(/### Episode goal\s*\n([\s\S]*?)(?=\n### |\n---|\n#### |\Z)/i);
  if (goal?.[1]?.trim()) {
    lines.push('', '### Episode goal', trimBlock(goal[1], 500));
  }

  const pipeline = markdown.match(/Pipeline in one line:\s*\*?\*?(.+?)(?:\n|$)/i);
  if (pipeline?.[1]) {
    lines.push('', `**Pipeline:** ${pipeline[1].replace(/\*\*/g, '').trim()}`);
  }

  lines.push('', '### Implementation spine (file order — teach these)');
  const steps = [...markdown.matchAll(/^#### Step (\d+)\s+[—–-]\s+(.+?)\s*$/gm)];
  for (const m of steps) {
    const stepNum = m[1];
    const heading = m[2].trim();
    const start = m.index ?? 0;
    const next = steps.find((s) => (s.index ?? 0) > start);
    const chunk = markdown.slice(start, next?.index ?? markdown.length);

    const kind = /·\s*(functional|ops|narrative)/i.exec(heading)?.[1]?.toLowerCase() ?? '';
    const pathMatch = heading.match(/`([^`]+)`/);
    const path = pathMatch?.[1];
    const outcome =
      chunk.match(/\*\*Outcome in our system\*\*\s*[—–-]\s*(.+)/i)?.[1]?.trim() ??
      chunk.match(/\*\*Outcome[^*]*\*\*\s*[—–-]\s*(.+)/i)?.[1]?.trim();
    const typesHint = summarizeTypes(chunk);

    if (kind === 'ops') {
      lines.push(
        `- **Step ${stepNum} · ops** — ${path ? `\`${path}\`` : heading.replace(/\s*·\s*ops/i, '').trim()}${outcome ? `: ${short(outcome, 120)}` : ''}`,
      );
    } else {
      lines.push(
        `- **Step ${stepNum}${kind ? ` · ${kind}` : ''}** — ${path ? `\`${path}\`` : heading}${typesHint ? ` · ${typesHint}` : ''}${outcome ? ` → ${short(outcome, 140)}` : ''}`,
      );
    }
  }

  lines.push('', '### Hero demo (show how the result *looks* — not only that a command passed)');
  const money =
    markdown.match(/money shot[\s\S]{0,80}/i) ??
    markdown.match(/### Verification[\s\S]*?(?=### Voice-over|### EP|\Z)/i);
  const verification = markdown.match(
    /### Verification\s*\n([\s\S]*?)(?=\n### Voice-over|\n##\s*EP\d|\n##\s+EP\d|$)/i,
  );
  if (verification?.[1]) {
    const bullets = extractDemoBullets(verification[1]);
    if (bullets.length > 0) {
      lines.push(...bullets.map((b) => `- ${b}`));
    } else if (money) {
      lines.push(`- ${short(money[0].replace(/\s+/g, ' '), 280)}`);
    }
  }

  const done = markdown.match(/\*\*EP\d+ done when:\*\*\s*(.+)/i);
  if (done?.[1]) lines.push('', `**Done when:** ${short(done[1], 220)}`);

  const voice = markdown.match(/### Voice-over\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (voice?.[1]?.trim()) {
    lines.push('', '### Voice-over cue', short(voice[1].trim(), 280));
  }

  lines.push(
    '',
    '_Full walkthrough lives in episode-authoring.yaml — this skeleton is the teaching spine. Do not expand into lectures outside these files/demo._',
  );

  let out = lines.join('\n').trim();
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars - 20).trimEnd()}\n…`;
  }
  return out;
}

function summarizeTypes(chunk: string): string {
  const block = chunk.match(/\*\*Types & functions\*\*\s*\n([\s\S]*?)(?=\n\*\*Outcome|\n---|\n#### |\Z)/i);
  if (!block?.[1]) return '';
  const names = [...block[1].matchAll(/`([A-Za-z_][\w.]*)`/g)].map((m) => m[1]);
  const uniq = [...new Set(names)].slice(0, 4);
  return uniq.length ? uniq.map((n) => `\`${n}\``).join(', ') : '';
}

function extractDemoBullets(verification: string): string[] {
  const out: string[] = [];

  // Format A: **1. Title** — meta
  const boldSteps = [
    ...verification.matchAll(
      /\*\*(\d+)\.\s+([^*]+?)\*\*[^\n]*\n([\s\S]*?)(?=\n\*\*\d+\.|\n### |\n##\s*EP\d|$)/g,
    ),
  ];
  // Format B: 1. **Title**
  const plainSteps = [
    ...verification.matchAll(
      /^(\d+)\.\s+\*\*(.+?)\*\*[^\n]*\n([\s\S]*?)(?=^\d+\.\s+\*\*|\Z)/gm,
    ),
  ];

  const steps =
    boldSteps.length > 0
      ? boldSteps.map((s) => ({ title: s[2].trim(), body: s[3] }))
      : plainSteps.map((s) => ({ title: s[2].trim(), body: s[3] }));

  for (const s of steps.slice(0, 10)) {
    const title = s.title;
    const body = s.body;
    const isMoney =
      /money shot|main educational check|educational check/i.test(title) ||
      /this is the \*\*money shot\*\*|this is the money shot/i.test(body);
    const doLine =
      body.match(/\*\*Do:\*\*\s*(.+)/i)?.[1]?.trim() ??
      body.match(/-\s+\*\*Do:\*\*\s*(.+)/i)?.[1]?.trim();
    const expect =
      body.match(/-\s+\*\*Expect[^*]*\*\*[:\s]*(.+)/i)?.[1]?.trim() ??
      body.match(/\*\*Expect[^*]*\*\*[:\s]*([^\n`]+)/i)?.[1]?.trim();
    const expectShort = expect
      ? short(expect.replace(/\s+/g, ' ').replace(/```[\s\S]*$/, '').trim(), isMoney ? 160 : 90)
      : isMoney
        ? 'show chunk text + visible overlap (not only row count)'
        : '';
    const prefix = isMoney ? '★ money-shot: ' : '';
    out.push(
      `${prefix}**${short(title, 80)}**${doLine ? ` — Do: ${short(doLine, 110)}` : ''}${expectShort ? ` → ${expectShort}` : ''}`,
    );
  }

  // Prefer money-shot + last meaningful checks near top of list
  out.sort((a, b) => Number(b.startsWith('★')) - Number(a.startsWith('★')));

  if (out.length === 0) {
    const dos = [...verification.matchAll(/\*\*Do:\*\*\s*(.+)/gi)].slice(0, 5);
    for (const d of dos) out.push(short(d[1].trim(), 160));
  }
  return out.slice(0, 8);
}

function trimBlock(text: string, max: number): string {
  const t = text.replace(/\n{3,}/g, '\n\n').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function short(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
