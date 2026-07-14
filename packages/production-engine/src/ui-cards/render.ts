import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ProductionScene } from '@ecpe/schemas';
import type { RenderContext, RenderResult } from '../types.js';
import { resolveTheme } from '../themes/index.js';
import { captureHtmlToMp4 } from '../shared/video-capture.js';
import { animatedDurationSec } from '../animations/reveal.js';
import { buildUiCardsHtml, uiCardsRevealItemCount } from './html.js';

export async function renderUiCardsHtml(
  scene: ProductionScene,
  outputPath: string,
  context?: RenderContext,
): Promise<RenderResult> {
  const theme = context?.theme ?? resolveTheme();
  try {
    const html = buildUiCardsHtml(scene, theme, false);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, 'utf8');
    return { ok: true, paths: [outputPath] };
  } catch (err) {
    return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function renderUiCardsMp4(
  scene: ProductionScene,
  outputPath: string,
  context?: RenderContext,
): Promise<RenderResult> {
  const theme = context?.theme ?? resolveTheme();
  const itemCount = uiCardsRevealItemCount(scene, true);
  const fromItems = animatedDurationSec(itemCount);
  const holdCap =
    scene.estimated_hold_sec > 0 ? Math.min(scene.estimated_hold_sec, 45) : 45;
  const durationSec = Math.min(fromItems, holdCap);
  const waitMs = Math.round(durationSec * 1000) + 400;
  const html = buildUiCardsHtml(scene, theme, true);

  try {
    const staticPath = await captureHtmlToMp4({
      html,
      outputPath,
      waitMs,
      staticOutputPath: context?.staticOutputPath,
    });
    return { ok: true, paths: [outputPath], staticPath: staticPath ?? context?.staticOutputPath };
  } catch (err) {
    return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
  }
}
