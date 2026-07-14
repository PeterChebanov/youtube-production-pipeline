/** Available vertical space for code inside 1080p frame (px, approximate). */
const CODE_VIEWPORT_LINES: Record<number, number> = {
  22: 20,
  20: 24,
  18: 28,
  16: 34,
};

export interface CodeLayoutPlan {
  fontSize: number;
  parts: string[];
}

function findSplitPoint(lines: string[]): number {
  const mid = Math.ceil(lines.length / 2);
  for (let offset = 0; offset <= 10; offset++) {
    const after = mid + offset;
    if (after < lines.length && lines[after]?.trim() === '') return after + 1;
    const before = mid - offset;
    if (before > 0 && lines[before - 1]?.trim() === '') return before;
  }
  // Prefer split before a comment or blank-ish logical block
  for (let offset = 0; offset <= 6; offset++) {
    const idx = mid + offset;
    if (idx < lines.length && /^#\s*=+/.test(lines[idx])) return idx;
    if (idx < lines.length && /^#\s+\d+\./.test(lines[idx])) return idx;
  }
  return mid;
}

function maxLinesForFont(fontSize: number): number {
  return CODE_VIEWPORT_LINES[fontSize] ?? Math.floor(400 / (fontSize * 1.55));
}

export function planCodeLayout(code: string): CodeLayoutPlan {
  const lines = code.split('\n');
  const lineCount = lines.length;

  for (const fontSize of [22, 20, 18, 16]) {
    const capacity = maxLinesForFont(fontSize);
    if (lineCount <= capacity) {
      return { fontSize, parts: [code] };
    }
  }

  const fontSize = 16;
  const capacity = maxLinesForFont(fontSize);
  if (lineCount <= capacity * 2) {
    const splitAt = findSplitPoint(lines);
    return {
      fontSize,
      parts: [lines.slice(0, splitAt).join('\n'), lines.slice(splitAt).join('\n')],
    };
  }

  // Very long code: split into thirds at logical breaks
  const split1 = findSplitPoint(lines);
  const rest = lines.slice(split1);
  const split2Local = findSplitPoint(rest);
  return {
    fontSize: 14,
    parts: [
      lines.slice(0, split1).join('\n'),
      rest.slice(0, split2Local).join('\n'),
      rest.slice(split2Local).join('\n'),
    ].filter((p) => p.trim().length > 0),
  };
}

export interface TerminalLayoutPlan {
  fontSize: number;
  columns: 1 | 2;
  lineGroups: string[][];
}

export function planTerminalLayout(lines: string[]): TerminalLayoutPlan {
  const nonEmpty = lines.length;
  for (const fontSize of [26, 22, 20, 18]) {
    const capacity = fontSize >= 22 ? 18 : fontSize >= 20 ? 22 : 26;
    if (nonEmpty <= capacity) {
      return { fontSize, columns: 1, lineGroups: [lines] };
    }
  }

  const mid = Math.ceil(lines.length / 2);
  let splitAt = mid;
  for (let i = 0; i < 6; i++) {
    if (lines[mid + i]?.trim() === '') {
      splitAt = mid + i + 1;
      break;
    }
    if (lines[mid - i]?.trim() === '') {
      splitAt = mid - i;
      break;
    }
  }

  return {
    fontSize: 18,
    columns: 2,
    lineGroups: [lines.slice(0, splitAt), lines.slice(splitAt)],
  };
}
