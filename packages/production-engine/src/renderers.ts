import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import type { RenderResult, Renderer } from './types.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

function mmdcPath(): string {
  const entry = require.resolve('@mermaid-js/mermaid-cli');
  return path.join(path.dirname(entry), 'cli.js');
}

async function writeHtmlAsset(outputPath: string, body: string, title: string): Promise<RenderResult> {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
  .wrap { padding: 32px; max-width: 1200px; margin: 0 auto; }
</style></head><body><div class="wrap">${body}</div></body></html>`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  return { ok: true, paths: [outputPath] };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const mermaidRenderer: Renderer = {
  id: 'mermaid',
  assetSubdir: 'diagrams',
  fileExtension: '.svg',

  async render(scene, outputPath): Promise<RenderResult> {
    const source = scene.data.source;
    if (typeof source !== 'string' || !source.trim()) {
      return { ok: false, paths: [], error: 'mermaid scene requires data.source' };
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    const inputPath = `${outputPath}.mmd`;

    try {
      await writeFile(inputPath, source, 'utf8');
      await execFileAsync(process.execPath, [mmdcPath(), '-i', inputPath, '-o', outputPath], {
        timeout: 120_000,
      });
      return { ok: true, paths: [outputPath] };
    } catch (err) {
      return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
    } finally {
      await unlink(inputPath).catch(() => undefined);
    }
  },
};

export const codeRenderer: Renderer = {
  id: 'code',
  assetSubdir: 'code',
  fileExtension: '.html',

  async render(scene, outputPath): Promise<RenderResult> {
    const code = scene.data.code;
    const language = scene.data.language;
    if (typeof code !== 'string' || !code.trim()) {
      return { ok: false, paths: [], error: 'code scene requires data.code' };
    }
    if (typeof language !== 'string' || !language.trim()) {
      return { ok: false, paths: [], error: 'code scene requires data.language' };
    }

    try {
      const { getSingletonHighlighter } = await import('shiki');
      const highlighter = await getSingletonHighlighter({
        themes: ['github-dark'],
        langs: [language],
      });
      const highlighted = highlighter.codeToHtml(code, { lang: language, theme: 'github-dark' });
      return writeHtmlAsset(outputPath, highlighted, scene.scene_id);
    } catch (err) {
      return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export const terminalRenderer: Renderer = {
  id: 'terminal',
  assetSubdir: 'terminal',
  fileExtension: '.html',

  async render(scene, outputPath): Promise<RenderResult> {
    const lines = scene.data.lines;
    if (!Array.isArray(lines) || lines.length === 0) {
      return { ok: false, paths: [], error: 'terminal scene requires data.lines array' };
    }
    const title = typeof scene.data.title === 'string' ? scene.data.title : 'Terminal';
    const body = `<div style="font-family: ui-monospace, monospace; background:#111; padding:24px; border-radius:12px; line-height:1.5;">
      <div style="color:#94a3b8; margin-bottom:12px;">${escapeHtml(title)}</div>
      ${lines.map((l) => `<div>${escapeHtml(String(l))}</div>`).join('')}
    </div>`;
    return writeHtmlAsset(outputPath, body, title);
  },
};

export const browserRenderer: Renderer = {
  id: 'browser',
  assetSubdir: 'browser',
  fileExtension: '.png',

  async render(scene, outputPath): Promise<RenderResult> {
    const url = typeof scene.data.url === 'string' ? scene.data.url : '';
    const html = typeof scene.data.html === 'string' ? scene.data.html : '';
    const title = typeof scene.data.title === 'string' ? scene.data.title : scene.scene_id;

    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      if (url) {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      } else {
        await page.setContent(
          `<html><body style="font-family:system-ui;padding:40px;background:#f8fafc;">${html || `<h1>${escapeHtml(title)}</h1>`}</body></html>`,
        );
      }
      await mkdir(path.dirname(outputPath), { recursive: true });
      await page.screenshot({ path: outputPath, fullPage: false });
      await browser.close();
      return { ok: true, paths: [outputPath] };
    } catch (err) {
      const fallbackPath = outputPath.replace(/\.png$/, '.html');
      const body = `<h1>${escapeHtml(title)}</h1><p>URL: ${escapeHtml(url || 'n/a')}</p>${html}`;
      const result = await writeHtmlAsset(fallbackPath, body, title);
      if (result.ok) {
        return {
          ok: true,
          paths: result.paths,
          error: `Playwright unavailable, wrote HTML fallback: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export const uiCardsRenderer: Renderer = {
  id: 'ui-cards',
  assetSubdir: 'ui-cards',
  fileExtension: '.html',

  async render(scene, outputPath): Promise<RenderResult> {
    const title = typeof scene.data.title === 'string' ? scene.data.title : scene.scene_id;
    const cards = scene.data.cards;
    if (!Array.isArray(cards) || cards.length === 0) {
      return { ok: false, paths: [], error: 'ui-cards scene requires data.cards array' };
    }
    const body = `<h1 style="margin-bottom:24px;">${escapeHtml(title)}</h1>
      <div style="display:grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap:16px;">
      ${cards
        .map((c) => {
          const card = c as { heading?: string; body?: string };
          return `<div style="background:#1e293b;padding:20px;border-radius:12px;">
            <h3 style="margin:0 0 8px;">${escapeHtml(card.heading ?? '')}</h3>
            <p style="margin:0;opacity:.9;">${escapeHtml(card.body ?? '')}</p>
          </div>`;
        })
        .join('')}
      </div>`;
    return writeHtmlAsset(outputPath, body, title);
  },
};

export const illustrationRenderer: Renderer = {
  id: 'illustration',
  assetSubdir: 'illustrations',
  fileExtension: '.prompt.txt',

  async render(scene, outputPath): Promise<RenderResult> {
    const prompt = scene.data.prompt;
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return { ok: false, paths: [], error: 'illustration scene requires data.prompt' };
    }
    const style =
      typeof scene.data.style_notes === 'string' ? `\n\nStyle: ${scene.data.style_notes}` : '';
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${prompt.trim()}${style}`, 'utf8');
    return { ok: true, paths: [outputPath] };
  },
};

export const motionRenderer: Renderer = {
  id: 'motion',
  assetSubdir: 'motion',
  fileExtension: '.json',

  async render(scene, outputPath): Promise<RenderResult> {
    const spec = {
      scene_id: scene.scene_id,
      template: scene.data.template ?? 'fade-title',
      title: scene.data.title ?? '',
      subtitle: scene.data.subtitle ?? '',
      note: 'Import into Motion Canvas template (post-render step)',
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(spec, null, 2), 'utf8');
    return { ok: true, paths: [outputPath] };
  },
};
