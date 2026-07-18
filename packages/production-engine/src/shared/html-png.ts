import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';

export const FRAME_WIDTH = 1920;
export const FRAME_HEIGHT = 1080;

/** Patterns that mean the browser captured an API/error page instead of B-roll. */
const INVALID_PAGE_PATTERNS: RegExp[] = [
  /Method Not Allowed/i,
  /Pretty-print/i,
  /Internal Server Error/i,
  /Cannot GET\s+\//i,
  /Cannot POST\s+\//i,
  /404 Not Found/i,
  /This site can.?t be reached/i,
  /ERR_CONNECTION_REFUSED/i,
  /net::ERR_/i,
  /^\s*\{\s*"detail"\s*:/i,
];

export async function assertPageLooksLikeBroll(page: Page): Promise<void> {
  const text = ((await page.locator('body').innerText().catch(() => '')) || '').trim();
  const title = await page.title().catch(() => '');
  const combined = `${title}\n${text}`;

  for (const re of INVALID_PAGE_PATTERNS) {
    if (re.test(combined)) {
      throw new Error(
        `Browser capture looks like an error/API page (matched ${re}): ` +
          `${text.slice(0, 160).replace(/\s+/g, ' ')}`,
      );
    }
  }

  // Raw JSON error bodies are tiny; real B-roll panels have substantial copy.
  if (text.length > 0 && text.length < 40 && /^\s*\{[\s\S]*\}\s*$/.test(text)) {
    throw new Error(
      `Browser capture looks like a raw JSON error body: ${text.slice(0, 160)}`,
    );
  }
}

/**
 * Render HTML document to a 1920×1080 PNG (DaVinci-ready still).
 * HTML source is unchanged — this is the static companion under assets/.../static/.
 */
export async function captureHtmlFileToPng(
  htmlFilePath: string,
  pngPath: string,
): Promise<void> {
  await mkdir(path.dirname(pngPath), { recursive: true });
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    });
    const href = pathToFileUrl(htmlFilePath);
    await page.goto(href, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: pngPath, type: 'png', fullPage: false });
  } finally {
    await browser.close();
  }
}

export async function captureHtmlStringToPng(
  html: string,
  pngPath: string,
  options?: { validateBroll?: boolean },
): Promise<void> {
  await mkdir(path.dirname(pngPath), { recursive: true });
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(200);
    if (options?.validateBroll !== false) {
      await assertPageLooksLikeBroll(page);
    }
    await page.screenshot({ path: pngPath, type: 'png', fullPage: false });
  } finally {
    await browser.close();
  }
}

function pathToFileUrl(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (process.platform === 'win32') {
    return `file:///${resolved.replace(/\\/g, '/')}`;
  }
  return `file://${resolved}`;
}
