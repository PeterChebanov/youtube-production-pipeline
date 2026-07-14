import type { Page } from 'playwright';

export const FRAME_VIEWPORT = { width: 1920, height: 1080 };

/** Matches BRAND_FRAME_CSS padding (40/56). */
export const FRAME_SAFE_INSETS = { top: 40, right: 56, bottom: 40, left: 56 };

/** Allow minor anti-alias / arrow glyph bleed outside strict safe rect. */
export const SAFE_CLIP_TOLERANCE_PX = 10;

export const MIN_FILL_RATIO = 0.7;
export const CENTER_MIN = 0.38;
export const CENTER_MAX = 0.62;
export const MIN_BLOCK_GAP_PX = 12;
export const OVERLAP_PAD_PX = 4;

export type FrameQAProfileId = 'excalidraw' | 'motion' | 'mermaid' | 'generic';

export interface FrameQAProfile {
  id: FrameQAProfileId;
  blockSelectors: string[];
  contentSelectors: string[];
  titleSelector?: string;
}

export const FRAME_QA_PROFILES: Record<FrameQAProfileId, FrameQAProfile> = {
  excalidraw: {
    id: 'excalidraw',
    blockSelectors: [
      '.sketch-node-inner',
      '.flow-card',
      '.branch',
      '.question-banner',
      '.pipe-box',
      '.annotation',
    ],
    contentSelectors: [
      'h1.title',
      '.sketch-node-inner',
      '.flow-card',
      '.branch',
      '.question-banner',
      '.sketch-rough-connector',
      '.pipe-box',
      '.annotation',
      '.tradeoff-row',
    ],
    titleSelector: 'h1.title',
  },
  motion: {
    id: 'motion',
    blockSelectors: ['.pipe-node', '.step', '.stagger-card', '.metric-card'],
    contentSelectors: ['.pipe-node', '.pipe-arrow', '.step', '.stagger-card', '.metric-card'],
    titleSelector: '.title',
  },
  mermaid: {
    id: 'mermaid',
    blockSelectors: ['.mermaid svg.flowchart'],
    contentSelectors: ['.mermaid svg.flowchart'],
  },
  generic: {
    id: 'generic',
    blockSelectors: [
      '.flow-card',
      '.pipe-box',
      '.sketch-node-inner',
      '.branch',
      '.question-banner',
      '.pipe-node',
      '.step',
      '.stagger-card',
      '.metric-card',
    ],
    contentSelectors: [
      '.flow-card',
      '.pipe-box',
      '.sketch-node-inner',
      '.branch',
      '.question-banner',
      '.pipe-node',
      '.step',
      '.stagger-card',
      '.metric-card',
      '.mermaid svg.flowchart',
    ],
  },
};

export interface FrameQACheck {
  id: string;
  severity: 'error' | 'warn';
  message: string;
}

export interface FrameQAResult {
  ok: boolean;
  profile: FrameQAProfileId;
  fillRatio: number;
  centerX: number;
  centerY: number;
  centered: boolean;
  blockCount: number;
  overflowCount: number;
  clipCount: number;
  overlapCount: number;
  titleOverlap: boolean;
  checks: FrameQACheck[];
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function safeRect(
  viewport = FRAME_VIEWPORT,
  insets = FRAME_SAFE_INSETS,
): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  return {
    left: insets.left,
    top: insets.top,
    right: viewport.width - insets.right,
    bottom: viewport.height - insets.bottom,
    width: viewport.width - insets.left - insets.right,
    height: viewport.height - insets.top - insets.bottom,
  };
}

function rectsOverlap(a: Rect, b: Rect, pad: number): boolean {
  return (
    a.bottom - pad > b.top + pad &&
    a.top + pad < b.bottom - pad &&
    a.right - pad > b.left + pad &&
    a.left + pad < b.right - pad
  );
}

async function collectRects(page: Page, selector: string): Promise<Rect[]> {
  if (!selector) return [];
  const count = await page.locator(selector).count();
  if (count === 0) return [];
  return page.locator(selector).evaluateAll((elements) =>
    elements
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width >= 2 && r.height >= 2)
      .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })),
  );
}

function countOutsideSafe(rects: Rect[], safe: ReturnType<typeof safeRect>, tolerance = SAFE_CLIP_TOLERANCE_PX): number {
  let n = 0;
  for (const r of rects) {
    if (
      r.left < safe.left - tolerance ||
      r.top < safe.top - tolerance ||
      r.right > safe.right + tolerance ||
      r.bottom > safe.bottom + tolerance
    ) {
      n += 1;
    }
  }
  return n;
}

function unionBbox(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.left);
    minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.right);
    maxY = Math.max(maxY, r.bottom);
  }
  return { left: minX, top: minY, right: maxX, bottom: maxY };
}

export async function runFrameQA(
  page: Page,
  profileId: FrameQAProfileId = 'generic',
  viewport = FRAME_VIEWPORT,
): Promise<FrameQAResult> {
  const profile = FRAME_QA_PROFILES[profileId];
  const safe = safeRect(viewport);
  const checks: FrameQACheck[] = [];

  const blockSel = profile.blockSelectors.join(',');
  const contentSel = profile.contentSelectors.join(',');

  const blockCount = blockSel ? await page.locator(blockSel).count() : 0;

  const overflowCount = blockSel
    ? await page.locator(blockSel).evaluateAll((elements) => {
        let count = 0;
        for (const el of elements) {
          if (el.scrollHeight > el.clientHeight + 3 || el.scrollWidth > el.clientWidth + 3) count += 1;
        }
        return count;
      })
    : 0;

  const contentRects = await collectRects(page, contentSel);
  const blockRects = await collectRects(page, blockSel);

  const clipCount = countOutsideSafe(contentRects, safe);
  const union = unionBbox(contentRects);
  const unionClipped =
    union !== null &&
    (union.left < safe.left - SAFE_CLIP_TOLERANCE_PX ||
      union.top < safe.top - SAFE_CLIP_TOLERANCE_PX ||
      union.right > safe.right + SAFE_CLIP_TOLERANCE_PX ||
      union.bottom > safe.bottom + SAFE_CLIP_TOLERANCE_PX);

  const bboxW = union ? Math.max(0, union.right - union.left) : 0;
  const bboxH = union ? Math.max(0, union.bottom - union.top) : 0;
  const fillRatio = contentRects.length > 0 ? (bboxW * bboxH) / (safe.width * safe.height) : 0;
  const centerX = union ? (union.left + union.right) / 2 / viewport.width : 0.5;
  const centerY = union ? (union.top + union.bottom) / 2 / viewport.height : 0.5;

  let overlapCount = 0;
  for (let i = 0; i < blockRects.length; i++) {
    for (let j = i + 1; j < blockRects.length; j++) {
      if (rectsOverlap(blockRects[i], blockRects[j], OVERLAP_PAD_PX)) overlapCount += 1;
    }
  }

  let titleOverlap = false;
  if (profile.titleSelector) {
    const titleRects = await collectRects(page, profile.titleSelector);
    const titleBox = titleRects[0];
    if (titleBox) {
      for (const b of blockRects) {
        if (rectsOverlap(titleBox, b, OVERLAP_PAD_PX)) {
          titleOverlap = true;
          break;
        }
      }
    }
  }

  if (blockCount === 0) {
    checks.push({ id: 'no_blocks', severity: 'error', message: 'no visible content blocks rendered' });
  }
  if (clipCount > 0) {
    checks.push({
      id: 'viewport_clip',
      severity: 'error',
      message: `${clipCount} element(s) outside safe zone`,
    });
  }
  if (unionClipped) {
    checks.push({
      id: 'bbox_clip',
      severity: 'error',
      message: 'content bounding box exceeds safe zone',
    });
  }
  if (titleOverlap) {
    checks.push({
      id: 'title_overlap',
      severity: 'error',
      message: 'title band overlaps content blocks',
    });
  }
  if (overlapCount > 0) {
    checks.push({
      id: 'block_overlap',
      severity: 'error',
      message: `${overlapCount} block pair(s) overlapping`,
    });
  }
  if (contentRects.length > 0 && fillRatio < MIN_FILL_RATIO) {
    checks.push({
      id: 'fill_low',
      severity: 'warn',
      message: `fill ${(fillRatio * 100).toFixed(0)}% < ${MIN_FILL_RATIO * 100}%`,
    });
  }
  const centered =
    centerX >= CENTER_MIN &&
    centerX <= CENTER_MAX &&
    centerY >= CENTER_MIN &&
    centerY <= CENTER_MAX;
  if (contentRects.length > 0 && !centered) {
    checks.push({
      id: 'off_center',
      severity: 'warn',
      message: `off-center (${(centerX * 100).toFixed(0)}%, ${(centerY * 100).toFixed(0)}%)`,
    });
  }
  if (overflowCount > 0) {
    checks.push({
      id: 'text_overflow',
      severity: 'warn',
      message: `${overflowCount} block(s) with text overflow`,
    });
  }

  return {
    ok: !checks.some((c) => c.severity === 'error') && checks.filter((c) => c.severity === 'warn').length === 0,
    profile: profileId,
    fillRatio,
    centerX,
    centerY,
    centered,
    blockCount,
    overflowCount,
    clipCount,
    overlapCount,
    titleOverlap,
    checks,
  };
}

export function hasHardFailures(result: FrameQAResult): boolean {
  return result.checks.some((c) => c.severity === 'error');
}

export function formatFrameQAIssues(result: FrameQAResult): string {
  if (result.checks.length === 0) return '';
  return result.checks.map((c) => c.message).join('; ');
}
