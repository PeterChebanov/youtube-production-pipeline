import type { Page } from 'playwright';

export const MERMAID_FLOWCHART_SVG = '.mermaid svg.flowchart';

/** Usable diagram area inside 1920×1080 (small margin only). */
export const DIAGRAM_SAFE_WIDTH = 1860;
export const DIAGRAM_SAFE_HEIGHT = 1000;

export interface DiagramBounds {
  width: number;
  height: number;
  fits: boolean;
}

/** Read intrinsic diagram size from SVG viewBox (CSS width:100% lies to Playwright). */
export async function readDiagramIntrinsicSize(page: Page): Promise<{ width: number; height: number }> {
  return page.locator(MERMAID_FLOWCHART_SVG).evaluate((svg) => {
    const el = svg as unknown as {
      viewBox?: { baseVal: { width: number; height: number } };
      getBoundingClientRect: () => { width: number; height: number };
    };
    const vb = el.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      return { width: vb.width, height: vb.height };
    }
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
}

/** Set SVG to its natural viewBox pixel size so measurements are truthful. */
export async function normalizeDiagramSvgSize(page: Page): Promise<void> {
  await page.locator(MERMAID_FLOWCHART_SVG).evaluate((svg) => {
    const el = svg as unknown as {
      viewBox?: { baseVal: { width: number; height: number } };
      style: { width: string; height: string; maxWidth: string };
      setAttribute: (k: string, v: string) => void;
    };
    const vb = el.viewBox?.baseVal;
    if (!vb || vb.width <= 0 || vb.height <= 0) return;
    el.style.width = `${vb.width}px`;
    el.style.height = `${vb.height}px`;
    el.style.maxWidth = 'none';
    el.setAttribute('width', String(vb.width));
    el.setAttribute('height', String(vb.height));
  });
}

/** Scale to fill safe area — upscale when diagram is smaller, downscale when larger. */
export function scaleToFit(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(DIAGRAM_SAFE_WIDTH / width, DIAGRAM_SAFE_HEIGHT / height);
}

export function effectiveDiagramArea(width: number, height: number): number {
  const scale = scaleToFit(width, height);
  return width * scale * height * scale;
}

export async function measureDiagramBounds(page: Page): Promise<DiagramBounds> {
  const svg = page.locator(MERMAID_FLOWCHART_SVG);
  if ((await svg.count()) === 0) return { width: 0, height: 0, fits: false };

  await normalizeDiagramSvgSize(page);
  const intrinsic = await readDiagramIntrinsicSize(page);
  const scale = scaleToFit(intrinsic.width, intrinsic.height);
  const width = intrinsic.width * scale;
  const height = intrinsic.height * scale;

  return {
    width,
    height,
    fits: width <= DIAGRAM_SAFE_WIDTH + 1 && height <= DIAGRAM_SAFE_HEIGHT + 1,
  };
}

export async function applyDiagramScale(page: Page, scale: number): Promise<void> {
  await normalizeDiagramSvgSize(page);
  await page.locator('.diagram-scaler').evaluate(
    (el, s) => {
      const node = el as { style: { transform: string; transformOrigin: string } };
      if (Math.abs(s - 1) < 0.001) {
        node.style.transform = '';
        node.style.transformOrigin = '';
      } else {
        node.style.transform = `scale(${s})`;
        node.style.transformOrigin = 'center center';
      }
    },
    scale,
  );
}

export async function fitDiagramToViewport(page: Page): Promise<number> {
  const intrinsic = await readDiagramIntrinsicSize(page);
  const scale = scaleToFit(intrinsic.width, intrinsic.height);
  await applyDiagramScale(page, scale);
  return scale;
}
