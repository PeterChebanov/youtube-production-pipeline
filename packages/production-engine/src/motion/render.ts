import type { ProductionScene } from '@ecpe/schemas';
import type { RenderContext, RenderResult } from '../types.js';
import { buildMotionHtml } from './html.js';
import { resolveTheme } from '../themes/index.js';
import { captureHtmlToMp4 } from '../shared/video-capture.js';
import { formatFrameQAIssues, hasHardFailures, runFrameQA } from '../shared/layout-validate.js';

async function motionContentOverflows(page: import('playwright').Page): Promise<boolean> {
  return page.locator('.stage').evaluate((stage) => {
    const el = stage as { scrollHeight: number; clientHeight: number };
    return el.scrollHeight > el.clientHeight + 2;
  });
}

async function runMotionQA(page: import('playwright').Page): Promise<ReturnType<typeof runFrameQA>> {
  return runFrameQA(page, 'motion');
}

async function layoutZigzagConnectors(page: import('playwright').Page): Promise<void> {
  const hasZig = await page.locator('.zig-canvas').count();
  if (hasZig === 0) return;
  await page.evaluate(() => {
    const fn = (globalThis as { __ecpeLayoutZigConnectors?: () => void }).__ecpeLayoutZigConnectors;
    if (typeof fn === 'function') fn();
  });
}

async function applyMotionLayoutFixes(page: import('playwright').Page): Promise<void> {
  const isVerticalPipeline = (await page.locator('.pipeline-vertical-stage').count()) > 0;
  if (isVerticalPipeline) {
    await layoutZigzagConnectors(page);
    return;
  }
  if (await motionContentOverflows(page)) {
    await page.locator('body').evaluate((el) => el.classList.add('layout-compact'));
    await page.waitForTimeout(200);
  }
  await layoutZigzagConnectors(page);
}

export async function renderMotionMp4(
  scene: ProductionScene,
  outputPath: string,
  context?: RenderContext,
): Promise<RenderResult> {
  const theme = context?.theme ?? resolveTheme();
  const { html, durationSec } = buildMotionHtml(scene, theme);
  const waitMs = Math.round(durationSec * 1000) + 800;

  try {
    await captureHtmlToMp4({
      html,
      outputPath,
      waitMs,
      beforeWait: async (page) => {
        const isVerticalPipeline = (await page.locator('.pipeline-vertical-stage').count()) > 0;
        await applyMotionLayoutFixes(page);
        let qa = await runMotionQA(page);

        if (!isVerticalPipeline && hasHardFailures(qa)) {
          await page.locator('body').evaluate((el) => el.classList.add('layout-compact'));
          await page.waitForTimeout(200);
          await applyMotionLayoutFixes(page);
          qa = await runMotionQA(page);
        }

        if (!isVerticalPipeline && hasHardFailures(qa)) {
          await page.locator('body').evaluate((el) => {
            el.classList.add('layout-compact');
            el.classList.add('layout-tight');
          });
          await page.waitForTimeout(200);
          await layoutZigzagConnectors(page);
          qa = await runMotionQA(page);
        }

        if (qa.blockCount === 0) {
          throw new Error(`motion ${scene.scene_id}: no blocks rendered — ${formatFrameQAIssues(qa)}`);
        }
        if (hasHardFailures(qa)) {
          throw new Error(`motion ${scene.scene_id}: ${formatFrameQAIssues(qa)}`);
        }
      },
      staticOutputPath: context?.staticOutputPath,
    });
    return {
      ok: true,
      paths: [outputPath],
      staticPath: context?.staticOutputPath,
    };
  } catch (err) {
    return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
  }
}
