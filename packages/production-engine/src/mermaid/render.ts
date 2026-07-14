import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { RenderContext, RenderResult } from '../types.js';
import {
  BRAND_FRAME_CSS,
  DIAGRAM_PALETTES,
  resolveDiagramPalette,
  sanitizeMermaidSource,
  type MermaidThemeVars,
} from '../themes/index.js';
import {
  DIAGRAM_SAFE_HEIGHT,
  DIAGRAM_SAFE_WIDTH,
  MERMAID_FLOWCHART_SVG,
  applyDiagramScale,
  effectiveDiagramArea,
  normalizeDiagramSvgSize,
  readDiagramIntrinsicSize,
  scaleToFit,
} from './fit.js';
import { isMermaidHorizontal } from './layout.js';
import {
  applyDiagramNodeTransparency,
  DIAGRAM_NODE_TRANSPARENCY_CSS,
} from './transparency.js';
import { captureHtmlToMp4 } from '../shared/video-capture.js';
import { animatedDurationSec } from '../animations/reveal.js';
import { formatFrameQAIssues, hasHardFailures, runFrameQA } from '../shared/layout-validate.js';
import {
  applyMermaidFlowReveal,
  MERMAID_REVEAL_CSS,
  mermaidRevealStepCount,
  MERMAID_REVEAL_STEP_DELAY_SEC,
} from './reveal.js';
import { embedMermaidInlineIcons, MERMAID_INLINE_ICON_CSS } from './labels.js';

interface MermaidLayoutTier {
  fontSize: string;
  rankSpacing: number;
  nodeSpacing: number;
  padding: number;
}

/** Largest font first — pick tier with max effective on-screen size, not first that fits without scale. */
const LAYOUT_TIERS: MermaidLayoutTier[] = [
  { fontSize: '22px', rankSpacing: 52, nodeSpacing: 44, padding: 20 },
  { fontSize: '20px', rankSpacing: 48, nodeSpacing: 40, padding: 18 },
  { fontSize: '18px', rankSpacing: 40, nodeSpacing: 34, padding: 16 },
  { fontSize: '16px', rankSpacing: 34, nodeSpacing: 28, padding: 14 },
];

/** Wider spacing for LR timelines — fill 16:9 horizontal safe area. */
const LAYOUT_TIERS_LR: MermaidLayoutTier[] = [
  { fontSize: '22px', rankSpacing: 64, nodeSpacing: 160, padding: 28 },
  { fontSize: '20px', rankSpacing: 56, nodeSpacing: 140, padding: 24 },
  { fontSize: '18px', rankSpacing: 48, nodeSpacing: 120, padding: 20 },
  { fontSize: '16px', rankSpacing: 40, nodeSpacing: 100, padding: 18 },
];

const DIAGRAM_DECOR_CSS = `
  .diagram-decor {
    position: absolute;
    inset: 9% 7%;
    z-index: 0;
    pointer-events: none;
    border-left: 1px solid rgba(94, 234, 212, 0.1);
    border-right: 1px solid rgba(94, 234, 212, 0.1);
    background-image:
      radial-gradient(circle, rgba(94, 234, 212, 0.14) 1px, transparent 1px),
      linear-gradient(rgba(94, 234, 212, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(94, 234, 212, 0.035) 1px, transparent 1px);
    background-size: 28px 28px, 56px 56px, 56px 56px;
    mask-image: radial-gradient(ellipse 88% 78% at 50% 50%, black 30%, transparent 100%);
  }
  .diagram-main { position: relative; z-index: 1; }
`;

function prepareMermaidSource(source: string, sceneId: string): string {
  const sanitized = sanitizeMermaidSource(source);
  return embedMermaidInlineIcons(sanitized, sceneId);
}

function buildMermaidHtml(
  source: string,
  palette: MermaidThemeVars,
  tier: MermaidLayoutTier,
  sceneId: string,
  animated = false,
): string {
  const cleaned = prepareMermaidSource(source, sceneId);
  const themeVars = { ...palette.themeVariables, fontSize: tier.fontSize };
  const themeVarsJson = JSON.stringify(themeVars);
  const sourceJson = JSON.stringify(cleaned);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>
  ${BRAND_FRAME_CSS}
  ${DIAGRAM_NODE_TRANSPARENCY_CSS}
  ${MERMAID_INLINE_ICON_CSS}
  ${animated ? MERMAID_REVEAL_CSS : ''}
  ${DIAGRAM_DECOR_CSS}
  .diagram-wrap {
    position:relative; z-index:1;
    width:100%; height:100%;
    display:flex; align-items:center; justify-content:center;
    padding: 28px 56px;
    overflow: hidden;
  }
  .diagram-main { flex: 1; display:flex; align-items:center; justify-content:center; width: 100%; height: 100%; }
  .diagram-scaler {
    display: flex; align-items: center; justify-content: center;
    max-width: ${DIAGRAM_SAFE_WIDTH}px;
    max-height: ${DIAGRAM_SAFE_HEIGHT}px;
  }
  .mermaid { display: inline-block; width: max-content; max-width: none; }
  .mermaid svg.flowchart { display: block; width: auto !important; height: auto !important; max-width: none !important; }
</style></head>
<body>
  <div class="brand-layer"></div>
  <div class="diagram-wrap">
    <div class="diagram-decor" aria-hidden="true"></div>
    <div class="diagram-main">
      <div class="diagram-scaler">
        <pre class="mermaid" id="mm-src"></pre>
      </div>
    </div>
  </div>
<script>
  document.getElementById('mm-src').textContent = ${sourceJson};
  mermaid.initialize({
    startOnLoad: true,
    theme: '${palette.theme}',
    themeVariables: ${themeVarsJson},
    securityLevel: 'loose',
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
      padding: ${tier.padding},
      nodeSpacing: ${tier.nodeSpacing},
      rankSpacing: ${tier.rankSpacing},
    },
  });
</script>
</body></html>`;
}

async function waitForMermaidSvg(page: Page): Promise<void> {
  await page.waitForSelector(MERMAID_FLOWCHART_SVG, { timeout: 90_000, state: 'attached' });
  await page.waitForTimeout(500);
}

interface TierEvaluation {
  tier: MermaidLayoutTier;
  bounds: { width: number; height: number; fits: boolean };
  scale: number;
  area: number;
}

async function evaluateTier(
  page: Page,
  html: string,
  tier: MermaidLayoutTier,
  _sceneId: string,
): Promise<TierEvaluation> {
  await page.setContent(html, { waitUntil: 'networkidle', timeout: 90_000 });
  await waitForMermaidSvg(page);
  await normalizeDiagramSvgSize(page);
  const intrinsic = await readDiagramIntrinsicSize(page);
  const scale = scaleToFit(intrinsic.width, intrinsic.height);
  return {
    tier,
    bounds: {
      width: intrinsic.width * scale,
      height: intrinsic.height * scale,
      fits: true,
    },
    scale,
    area: effectiveDiagramArea(intrinsic.width, intrinsic.height),
  };
}

async function pickBestTier(
  page: Page,
  source: string,
  palette: MermaidThemeVars,
  sceneId: string,
): Promise<TierEvaluation> {
  const cleaned = sanitizeMermaidSource(source);
  const tiers = isMermaidHorizontal(cleaned) ? LAYOUT_TIERS_LR : LAYOUT_TIERS;
  let best: TierEvaluation | null = null;
  for (const tier of tiers) {
    const html = buildMermaidHtml(source, palette, tier, sceneId, false);
    const result = await evaluateTier(page, html, tier, sceneId);
    if (!best || result.area > best.area) best = result;
  }
  return (
    best ?? {
      tier: tiers[0],
      bounds: { width: 0, height: 0, fits: false },
      scale: 1,
      area: 0,
    }
  );
}

async function prepareDiagramPage(
  page: Page,
  source: string,
  palette: MermaidThemeVars,
  chosen: TierEvaluation,
  sceneId: string,
  animated: boolean,
): Promise<void> {
  const html = buildMermaidHtml(source, palette, chosen.tier, sceneId, animated);
  await page.setContent(html, { waitUntil: 'networkidle', timeout: 90_000 });
  await waitForMermaidSvg(page);
  await applyDiagramNodeTransparency(page);
  await normalizeDiagramSvgSize(page);
  await applyDiagramScale(page, chosen.scale);
}

export async function renderMermaidPng(
  source: string,
  outputPath: string,
  context?: RenderContext,
  sceneId = 'mermaid',
): Promise<RenderResult> {
  const paletteId = resolveDiagramPalette(context?.diagramPalette);
  const palette = DIAGRAM_PALETTES[paletteId];

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const chosen = await pickBestTier(page, source, palette, sceneId);
    await prepareDiagramPage(page, source, palette, chosen, sceneId, false);

    await page.waitForTimeout(200);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await page.screenshot({ path: outputPath, fullPage: false, type: 'png' });
    return { ok: true, paths: [outputPath] };
  } finally {
    await browser.close();
  }
}

export async function renderMermaidMp4(
  source: string,
  outputPath: string,
  _sceneId: string,
  context?: RenderContext,
): Promise<RenderResult> {
  const paletteId = resolveDiagramPalette(context?.diagramPalette);
  const palette = DIAGRAM_PALETTES[paletteId];

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const chosen = await pickBestTier(page, source, palette, _sceneId);
    await browser.close();

    const stepCount = mermaidRevealStepCount(source);
    const finalHtml = buildMermaidHtml(source, palette, chosen.tier, _sceneId, true);

    await captureHtmlToMp4({
      html: finalHtml,
      outputPath,
      waitMs: async () =>
        Math.round(animatedDurationSec(stepCount, MERMAID_REVEAL_STEP_DELAY_SEC, 2.2) * 1000) + 500,
      beforeWait: async (capturePage) => {
        await waitForMermaidSvg(capturePage);
        await applyDiagramNodeTransparency(capturePage);
        await normalizeDiagramSvgSize(capturePage);
        await applyDiagramScale(capturePage, chosen.scale);
        await applyMermaidFlowReveal(capturePage, source);
        let qa = await runFrameQA(capturePage, 'mermaid');
        if (hasHardFailures(qa)) {
          await applyDiagramScale(capturePage, chosen.scale * 0.88);
          qa = await runFrameQA(capturePage, 'mermaid');
        }
        if (qa.blockCount === 0) {
          throw new Error(`mermaid ${_sceneId}: empty diagram — ${formatFrameQAIssues(qa)}`);
        }
        if (hasHardFailures(qa)) {
          throw new Error(`mermaid ${_sceneId}: ${formatFrameQAIssues(qa)}`);
        }
      },
      staticOutputPath: context?.staticOutputPath,
    });

    return { ok: true, paths: [outputPath], staticPath: context?.staticOutputPath };
  } catch (err) {
    return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
  }
}
