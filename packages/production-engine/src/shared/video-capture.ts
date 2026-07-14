import type { Page } from 'playwright';
import { mkdir, unlink } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

function ffmpegPath(): string | null {
  try {
    const p = require('ffmpeg-static') as string | null;
    return p && p.length > 0 ? p : null;
  } catch {
    return null;
  }
}

async function convertWebmToMp4(webmPath: string, mp4Path: string): Promise<void> {
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) throw new Error('ffmpeg-static not available');
  await execFileAsync(
    ffmpeg,
    ['-y', '-i', webmPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4Path],
    { timeout: 180_000 },
  );
}

export interface CaptureHtmlToMp4Options {
  html: string;
  outputPath: string;
  /** Fixed delay, or async resolver after `beforeWait` (e.g. from revealed item count). */
  waitMs: number | ((page: Page) => Promise<number>);
  beforeWait?: (page: Page) => Promise<void>;
  /** Final-frame PNG/JPEG after full reveal (same basename in static/ folder). */
  staticOutputPath?: string;
}

export async function captureHtmlToMp4(options: CaptureHtmlToMp4Options): Promise<string | undefined> {
  const { html, outputPath, waitMs, beforeWait, staticOutputPath } = options;
  await mkdir(path.dirname(outputPath), { recursive: true });
  if (staticOutputPath) await mkdir(path.dirname(staticOutputPath), { recursive: true });

  const tempDir = await mkdtemp(path.join(tmpdir(), 'ecpe-capture-'));
  let webmPath: string | undefined;

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: tempDir, size: { width: 1920, height: 1080 } },
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 90_000 });
    if (beforeWait) await beforeWait(page);
    const delay = typeof waitMs === 'function' ? await waitMs(page) : waitMs;
    await page.waitForTimeout(delay);

    if (staticOutputPath) {
      await page.screenshot({ path: staticOutputPath, type: 'png' });
    }

    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();

    if (!video) throw new Error('Playwright did not record video');
    webmPath = await video.path();
    await convertWebmToMp4(webmPath, outputPath);
    return staticOutputPath;
  } finally {
    if (webmPath) await unlink(webmPath).catch(() => undefined);
  }
}
