import type { VisualTheme } from './index.js';
import { BRAND_FRAME_CSS, BRAND_FRAME_UI_CSS } from './background.js';

export type BrandFrameVariant = 'standard' | 'ui-cards';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function frameCss(variant: BrandFrameVariant): string {
  return variant === 'ui-cards' ? BRAND_FRAME_UI_CSS : BRAND_FRAME_CSS;
}

export function buildBrandDocument(
  title: string,
  extraCss: string,
  body: string,
  variant: BrandFrameVariant = 'standard',
): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>${frameCss(variant)}${extraCss}</style></head>
<body>
  <div class="brand-layer"></div>
  <div class="frame"><div class="frame-inner">${body}</div></div>
</body></html>`;
}

export function panelCardCss(theme: VisualTheme): string {
  return `
  .panel {
    background: ${theme.cardBg};
    border: 1px solid ${theme.cardBorder};
    border-radius: 18px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.45);
    overflow: hidden;
    width: 100%;
  }
  .panel-chrome {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 20px;
    background: rgba(0,0,0,0.35);
    border-bottom: 1px solid ${theme.cardBorder};
  }
  .dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
  .dot-r { background: #ff5f57; } .dot-y { background: #febc2e; } .dot-g { background: #28c840; }
  .panel-filename {
    margin-left: 8px; font-size: 20px; color: ${theme.textSecondary};
    font-family: ui-monospace, monospace;
  }
  .panel-caption {
    padding: 18px 28px 0;
    font-size: 30px; font-weight: 600;
    color: ${theme.accent};
    line-height: 1.3;
  }
  .panel-body { padding: 20px 28px 28px; }
  .panel-footer {
    padding: 14px 28px 22px;
    font-size: 22px; color: ${theme.sketchGold || theme.accent};
    border-top: 1px dashed ${theme.cardBorder};
  }
`;
}
