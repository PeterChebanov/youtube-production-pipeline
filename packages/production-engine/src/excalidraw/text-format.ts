const NEGATIVE_RE =
  /\b(wrong|failure|expensive|unpredictable|escalat|nothing works|not generation|✗|less predictable|2–5×|2-5×)\b/i;
const POSITIVE_RE = /\b(✓|capable|searchable|more capable)\b/i;

/** Shorten long quoted labels for B-roll legibility. */
export function shortenSketchLabel(text: string): string {
  const t = text.trim();
  if (t.length <= 72) return t;

  const userMatch = t.match(/^User:\s*["'](.+?)["']\s*$/i);
  if (userMatch) {
    const q = userMatch[1]!;
    const core = q.replace(/\?+$/, '').trim();
    if (core.length > 42) {
      const words = core.split(/\s+/);
      return `User: "${words.slice(0, 6).join(' ')}…?"`;
    }
    return `User: "${core}?"`;
  }

  const quoteMatch = t.match(/^["'](.+?)["']\s*$/);
  if (quoteMatch && quoteMatch[1]!.length > 50) {
    const inner = quoteMatch[1]!;
    return `"${inner.slice(0, 44).trim()}…"`;
  }

  if (t.length > 80) return `${t.slice(0, 77).trim()}…`;
  return t;
}

/** System-wide: green = plus, orange/gold = minus. */
export function accentuateSketchHtml(escaped: string): string {
  return escaped
    .replace(/\b(✗|wrong|failure|expensive|unpredictable|less predictable)\b/gi, (m) =>
      `<span class="sketch-accent-negative">${m}</span>`,
    )
    .replace(/\b(✓|capable|searchable)\b/gi, (m) =>
      `<span class="sketch-accent-positive">${m}</span>`,
    );
}

export function annotationTone(label: string, annotation: string): 'neutral' | 'negative' | 'positive' {
  const blob = `${label} ${annotation}`;
  if (NEGATIVE_RE.test(blob)) return 'negative';
  if (POSITIVE_RE.test(blob)) return 'positive';
  return 'neutral';
}
