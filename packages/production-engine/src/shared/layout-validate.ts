import type { Page } from 'playwright';
import {
  formatFrameQAIssues,
  hasHardFailures,
  runFrameQA,
  type FrameQAProfileId,
  type FrameQAResult,
} from './frame-qa.js';

export {
  MIN_FILL_RATIO,
  CENTER_MIN,
  CENTER_MAX,
  FRAME_SAFE_INSETS,
  FRAME_VIEWPORT,
} from './frame-qa.js';

/** @deprecated Use FrameQAResult from frame-qa.ts */
export interface LayoutQAResult {
  ok: boolean;
  fillRatio: number;
  centerX: number;
  centerY: number;
  centered: boolean;
  blockCount: number;
  overflowCount: number;
  bareTextCount: number;
  iconCount: number;
  issues: string[];
}

function toLegacyResult(result: FrameQAResult): LayoutQAResult {
  return {
    ok: result.ok,
    fillRatio: result.fillRatio,
    centerX: result.centerX,
    centerY: result.centerY,
    centered: result.centered,
    blockCount: result.blockCount,
    overflowCount: result.overflowCount,
    bareTextCount: 0,
    iconCount: 0,
    issues: result.checks.map((c) => c.message),
  };
}

export async function runLayoutQA(
  page: Page,
  viewport = { width: 1920, height: 1080 },
  profile: FrameQAProfileId = 'generic',
): Promise<LayoutQAResult> {
  const result = await runFrameQA(page, profile, viewport);
  return toLegacyResult(result);
}

export function formatLayoutQAIssues(result: LayoutQAResult): string {
  if (result.ok && result.issues.length === 0) return '';
  return result.issues.join('; ');
}

export { runFrameQA, formatFrameQAIssues, hasHardFailures, type FrameQAResult, type FrameQAProfileId };
