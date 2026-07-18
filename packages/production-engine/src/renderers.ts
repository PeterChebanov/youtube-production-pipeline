import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RenderContext, RenderResult, Renderer } from './types.js';
import {
  resolveTheme,
  buildBrandDocument,
  panelCardCss,
  type VisualTheme,
} from './themes/index.js';
import { detectAndBuildBrowserHtml } from './browser/tree-html.js';
import { buildCodePanelHtml, type CodePart } from './code/panel-html.js';
import { planCodeLayout, planTerminalLayout } from './code/layout.js';
import { renderExcalidrawPng, renderExcalidrawMp4 } from './excalidraw/render.js';
import { renderMotionMp4 } from './motion/render.js';
import { renderMermaidPng, renderMermaidMp4 } from './mermaid/render.js';
import { renderUiCardsHtml, renderUiCardsMp4 } from './ui-cards/render.js';
import {
  assertPageLooksLikeBroll,
  captureHtmlFileToPng,
  FRAME_HEIGHT,
  FRAME_WIDTH,
} from './shared/html-png.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function themeOrDefault(context?: RenderContext): VisualTheme {
  return context?.theme ?? resolveTheme();
}

function preferHtmlMock(html: string): boolean {
  return Boolean(html.trim());
}

function isLiveHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function colorizeTerminalLine(line: string): string {
  const s = escapeHtml(line);
  if (/^\$/.test(line)) return `<span class="prompt">${s}</span>`;
  if (/error|fail|fatal/i.test(line)) return `<span class="err">${s}</span>`;
  if (/✓|success|done|ok\b/i.test(line)) return `<span class="ok">${s}</span>`;
  if (/warn/i.test(line)) return `<span class="warn">${s}</span>`;
  if (/^#/.test(line)) return `<span class="comment">${s}</span>`;
  return s;
}

export const mermaidRenderer: Renderer = {
  id: 'mermaid',
  assetSubdir: 'diagrams',
  fileExtension: '.png',

  async render(scene, outputPath, context): Promise<RenderResult> {
    const source = scene.data.source;
    if (typeof source !== 'string' || !source.trim()) {
      return { ok: false, paths: [], error: 'mermaid scene requires data.source' };
    }
    try {
      if (context?.animated) {
        return await renderMermaidMp4(source, outputPath, scene.scene_id, context);
      }
      return await renderMermaidPng(source, outputPath, context, scene.scene_id);
    } catch (err) {
      return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export const codeRenderer: Renderer = {
  id: 'code',
  assetSubdir: 'code',
  fileExtension: '.html',

  async render(scene, outputPath, context): Promise<RenderResult> {
    const code = scene.data.code;
    const language = scene.data.language;
    if (typeof code !== 'string' || !code.trim()) {
      return { ok: false, paths: [], error: 'code scene requires data.code' };
    }
    if (typeof language !== 'string' || !language.trim()) {
      return { ok: false, paths: [], error: 'code scene requires data.language' };
    }

    const theme = themeOrDefault(context);
    const shikiTheme = theme.codeTheme === 'github-light' ? 'github-light' : 'tokyo-night';

    try {
      const { getSingletonHighlighter } = await import('shiki');
      const highlighter = await getSingletonHighlighter({
        themes: ['github-light', 'github-dark', 'tokyo-night'],
        langs: [language],
      });

      const plan = planCodeLayout(code);
      const codeParts: CodePart[] = [];
      for (let i = 0; i < plan.parts.length; i++) {
        const highlighted = highlighter.codeToHtml(plan.parts[i]!, {
          lang: language,
          theme: shikiTheme,
        });
        codeParts.push({
          label: plan.parts.length > 1 ? `Part ${i + 1}` : '',
          html: highlighted,
        });
      }

      const html = buildCodePanelHtml(scene, codeParts, plan.fontSize, language, theme);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, html, 'utf8');

      const staticPath = context?.staticOutputPath;
      if (staticPath) {
        await captureHtmlFileToPng(outputPath, staticPath);
      }

      return {
        ok: true,
        paths: [outputPath],
        staticPath,
      };
    } catch (err) {
      return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export const terminalRenderer: Renderer = {
  id: 'terminal',
  assetSubdir: 'terminal',
  fileExtension: '.html',

  async render(scene, outputPath, context): Promise<RenderResult> {
    const lines = scene.data.lines;
    if (!Array.isArray(lines) || lines.length === 0) {
      return { ok: false, paths: [], error: 'terminal scene requires data.lines array' };
    }
    const title = typeof scene.data.title === 'string' ? scene.data.title : 'Terminal';
    const theme = themeOrDefault(context);
    const caption =
      typeof scene.data.caption === 'string' ? scene.data.caption : (scene.purpose ?? '');
    const lineStrings = lines.map((l) => String(l));
    const plan = planTerminalLayout(lineStrings);
    const multi = plan.columns === 2;

    const renderLines = (group: string[]) =>
      group.map((l) => `<div class="term-line">${colorizeTerminalLine(l)}</div>`).join('');

    const columnsHtml = plan.lineGroups
      .map(
        (group, i) => `
        <div class="term-col">
          ${multi ? `<div class="term-part-label">Part ${i + 1}</div>` : ''}
          ${renderLines(group)}
        </div>`,
      )
      .join('');

    const css = `
    ${panelCardCss(theme)}
    .term-body {
      font-family: ui-monospace, 'SF Mono', Menlo, monospace;
      background: #0d1117; padding: 24px 28px;
      line-height: 1.55; font-size: ${plan.fontSize}px;
      display: ${multi ? 'grid' : 'block'};
      grid-template-columns: ${multi ? '1fr 1fr' : '1fr'};
      gap: ${multi ? '24px' : '0'};
    }
    .term-part-label {
      font-size: 18px; font-weight: 700; color: ${theme.accent};
      margin-bottom: 12px;
    }
    .term-line { margin: 3px 0; white-space: pre-wrap; word-break: break-word; }
    .prompt { color: #7ee787; } .ok { color: #3fb950; } .err { color: #f85149; }
    .warn { color: #d29922; } .comment { color: #8b949e; }
    .panel { width: 100%; }
    `;

    const body = `
    <div class="panel">
      <div class="panel-chrome">
        <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
        <span class="panel-filename">${escapeHtml(title)}</span>
      </div>
      ${caption ? `<div class="panel-caption">${escapeHtml(caption)}</div>` : ''}
      <div class="panel-body term-body">${columnsHtml}</div>
    </div>`;

    const html = buildBrandDocument(title, css, body);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, 'utf8');

    try {
      const staticPath = context?.staticOutputPath;
      if (staticPath) {
        await captureHtmlFileToPng(outputPath, staticPath);
      }
      return { ok: true, paths: [outputPath], staticPath };
    } catch (err) {
      return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export const browserRenderer: Renderer = {
  id: 'browser',
  assetSubdir: 'browser',
  fileExtension: '.png',

  async render(scene, outputPath, context): Promise<RenderResult> {
    const url = typeof scene.data.url === 'string' ? scene.data.url : '';
    const html = typeof scene.data.html === 'string' ? scene.data.html : '';
    const title = typeof scene.data.title === 'string' ? scene.data.title : scene.scene_id;
    const caption = typeof scene.data.caption === 'string' ? scene.data.caption : scene.purpose;
    const theme = themeOrDefault(context);

    if (!preferHtmlMock(html) && !isLiveHttpUrl(url)) {
      return {
        ok: false,
        paths: [],
        error:
          'browser scene requires data.html (preferred mock) or an http(s) data.url — ' +
          'do not use file:// or bare repo paths',
      };
    }

    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
      });

      try {
        // Always prefer HTML mock when present — live GET to POST APIs yields 405.
        if (preferHtmlMock(html)) {
          const treeDoc = detectAndBuildBrowserHtml(html, title, theme, caption);
          const doc =
            treeDoc ??
            buildBrandDocument(
              title,
              panelCardCss(theme),
              `<div class="panel" style="padding:40px;font-size:32px;">${html || `<h1>${escapeHtml(title)}</h1>`}</div>`,
            );
          await page.setContent(doc, { waitUntil: 'load' });
        } else {
          await page.goto(url.trim(), { waitUntil: 'networkidle', timeout: 30_000 });
        }

        await page.waitForTimeout(400);
        await assertPageLooksLikeBroll(page);
        await mkdir(path.dirname(outputPath), { recursive: true });
        await page.screenshot({ path: outputPath, fullPage: false, type: 'png' });
        return { ok: true, paths: [outputPath] };
      } finally {
        await browser.close();
      }
    } catch (err) {
      return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export const uiCardsRenderer: Renderer = {
  id: 'ui-cards',
  assetSubdir: 'ui-cards',
  fileExtension: '.html',

  async render(scene, outputPath, context): Promise<RenderResult> {
    const cards = scene.data.cards;
    if (!Array.isArray(cards) || cards.length === 0) {
      return { ok: false, paths: [], error: 'ui-cards scene requires data.cards array' };
    }
    try {
      if (context?.animated) {
        return await renderUiCardsMp4(scene, outputPath, context);
      }
      return await renderUiCardsHtml(scene, outputPath, context);
    } catch (err) {
      return { ok: false, paths: [], error: err instanceof Error ? err.message : String(err) };
    }
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

export const excalidrawRenderer: Renderer = {
  id: 'excalidraw',
  assetSubdir: 'excalidraw',
  fileExtension: '.png',

  async render(scene, outputPath, context): Promise<RenderResult> {
    if (context?.animated) {
      return renderExcalidrawMp4(scene, outputPath, context);
    }
    return renderExcalidrawPng(scene, outputPath, context);
  },
};

export const motionRenderer: Renderer = {
  id: 'motion',
  assetSubdir: 'motion',
  fileExtension: '.mp4',

  async render(scene, outputPath, context): Promise<RenderResult> {
    return renderMotionMp4(scene, outputPath, context);
  },
};
