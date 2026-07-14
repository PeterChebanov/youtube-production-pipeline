import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { ProductionScene } from '@ecpe/schemas';
import type { RenderContext, RenderResult } from '../types.js';
import {
  buildExcalidrawHtml,
  excalidrawRevealItemCount,
} from './html.js';
import { countSketchBlocks, sparseScaleCandidates } from './layout.js';
import { resolveTheme } from '../themes/index.js';
import { captureHtmlToMp4 } from '../shared/video-capture.js';
import { animatedDurationSec } from '../animations/reveal.js';
import {
  formatFrameQAIssues,
  hasHardFailures,
  runFrameQA,
} from '../shared/layout-validate.js';

const OVERLAP_SELECTORS =
  '.question-banner, .branch, .flow-card, .annotation, h1.title, .sketch-node-inner, .pipe-box';

async function waitForSketchDraw(page: Page): Promise<void> {
  const hasCanvas = (await page.locator('.sketch-grid-canvas').count()) > 0;
  if (!hasCanvas) return;
  try {
    await page.waitForFunction(
      () => typeof (globalThis as { __ecpeSketchRoughDraw?: () => void }).__ecpeSketchRoughDraw === 'function',
      { timeout: 8000 },
    );
    await page.evaluate(() => {
      (globalThis as { __ecpeSketchRoughDraw?: () => void }).__ecpeSketchRoughDraw?.();
    });
    await page.waitForTimeout(200);
  } catch {
    await page.waitForTimeout(400);
  }
}

async function detectLayoutOverlap(page: Page): Promise<boolean> {
  return page.locator(OVERLAP_SELECTORS).evaluateAll((elements) => {
    for (let i = 0; i < elements.length; i++) {
      const a = elements[i].getBoundingClientRect();
      if (a.width === 0 || a.height === 0) continue;
      for (let j = i + 1; j < elements.length; j++) {
        const b = elements[j].getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        const pad = 4;
        if (
          a.bottom - pad > b.top + pad &&
          a.top + pad < b.bottom - pad &&
          a.right - pad > b.left + pad &&
          a.left + pad < b.right - pad
        ) {
          return true;
        }
      }
    }
    return false;
  });
}

function sceneBlockCount(scene: ProductionScene): number {
  const raw = scene.data.elements;
  if (!Array.isArray(raw)) return 0;
  return countSketchBlocks(raw.map((item) => ({ type: String((item as Record<string, unknown>).type ?? '') })));
}

async function applyExcalidrawLayoutFixes(page: Page): Promise<void> {
  if (await detectLayoutOverlap(page)) {
    await page.locator('body').evaluate((el) => el.classList.add('layout-compact'));
    await page.waitForTimeout(200);
  }
  const qa = await runFrameQA(page, 'excalidraw');
  if (!qa.ok && qa.blockCount > 0) {
    await page.locator('body').evaluate((el) => el.classList.add('layout-compact'));
    await page.waitForTimeout(200);
  }
}

async function fitExcalidrawPage(
  page: Page,
  scene: ProductionScene,
  theme: ReturnType<typeof resolveTheme>,
  animated: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const blockCount = sceneBlockCount(scene);
  const scaleCandidates = sparseScaleCandidates(blockCount);
  let lastIssue = '';

  for (const scale of scaleCandidates) {
    const html = buildExcalidrawHtml(scene, theme, scale, animated);
    await page.setContent(html, { waitUntil: 'networkidle' });
    await waitForSketchDraw(page);
    await page.waitForTimeout(animated ? 80 : 300);
    await page.locator('body').evaluate((el) => el.classList.remove('layout-compact'));
    await applyExcalidrawLayoutFixes(page);

    const qa = await runFrameQA(page, 'excalidraw');
    lastIssue = formatFrameQAIssues(qa);

    if (qa.blockCount === 0) continue;
    if (!hasHardFailures(qa) && !(await detectLayoutOverlap(page))) return { ok: true };
    await page.locator('body').evaluate((el) => el.classList.add('layout-compact'));
    await page.waitForTimeout(150);
    const qa2 = await runFrameQA(page, 'excalidraw');
    lastIssue = formatFrameQAIssues(qa2);
    if (qa2.blockCount > 0 && !hasHardFailures(qa2) && !(await detectLayoutOverlap(page))) {
      return { ok: true };
    }
  }

  const html = buildExcalidrawHtml(scene, theme, 1, animated);
  await page.setContent(html, { waitUntil: 'networkidle' });
  await waitForSketchDraw(page);
  await page.waitForTimeout(200);
  await page.locator('body').evaluate((el) => el.classList.add('layout-compact'));
  await page.waitForTimeout(200);

  const finalQa = await runFrameQA(page, 'excalidraw');
  if (finalQa.blockCount === 0) {
    return { ok: false, error: `no blocks rendered — ${lastIssue || 'empty layout'}` };
  }
  if (!hasHardFailures(finalQa)) return { ok: true };
  return { ok: false, error: formatFrameQAIssues(finalQa) };
}

export async function renderExcalidrawPng(
  scene: ProductionScene,
  outputPath: string,
  context?: RenderContext,
): Promise<RenderResult> {
  const theme = context?.theme ?? resolveTheme();
  await mkdir(path.dirname(outputPath), { recursive: true });

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    const fit = await fitExcalidrawPage(page, scene, theme, false);
    if (!fit.ok) {
      await browser.close();
      return { ok: false, paths: [], error: `excalidraw ${scene.scene_id}: ${fit.error}` };
    }

    await page.screenshot({ path: outputPath, fullPage: false, type: 'png' });
    await browser.close();
    return { ok: true, paths: [outputPath] };
  } catch (err) {
    return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function renderExcalidrawMp4(
  scene: ProductionScene,
  outputPath: string,
  context?: RenderContext,
): Promise<RenderResult> {
  const theme = context?.theme ?? resolveTheme();
  const itemCount = excalidrawRevealItemCount(scene, true);
  const durationSec = animatedDurationSec(itemCount);
  const waitMs = Math.round(durationSec * 1000) + 400;

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    const fit = await fitExcalidrawPage(page, scene, theme, true);
    if (!fit.ok) {
      await browser.close();
      return { ok: false, paths: [], error: `excalidraw ${scene.scene_id}: ${fit.error}` };
    }

    const html = await page.content();
    await browser.close();

    const staticPath = await captureHtmlToMp4({
      html,
      outputPath,
      waitMs,
      beforeWait: async (capturePage) => {
        await capturePage.waitForTimeout(50);
        const qa = await runFrameQA(capturePage, 'excalidraw');
        if (qa.blockCount === 0 || hasHardFailures(qa)) {
          throw new Error(`excalidraw ${scene.scene_id}: ${formatFrameQAIssues(qa)}`);
        }
      },
      staticOutputPath: context?.staticOutputPath,
    });
    return { ok: true, paths: [outputPath], staticPath: staticPath ?? context?.staticOutputPath };
  } catch (err) {
    return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
  }
}
