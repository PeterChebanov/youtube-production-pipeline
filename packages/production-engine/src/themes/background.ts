import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../assets');

let cachedBrandPhotoUri: string | null = null;

/** Channel art (YouTube banner) as embedded data URI — darkened via overlay in CSS. */
export function brandPhotoDataUri(): string {
  if (!cachedBrandPhotoUri) {
    const buf = readFileSync(join(ASSETS_DIR, 'brand-background.png'));
    cachedBrandPhotoUri = `url("data:image/png;base64,${buf.toString('base64')}")`;
  }
  return cachedBrandPhotoUri;
}

/** +17% brighter background (lighter overlay). */
const OVERLAY_STANDARD =
  'linear-gradient(135deg, rgba(4,8,20,0.68) 0%, rgba(6,12,28,0.64) 45%, rgba(4,8,20,0.70) 100%)';

/** +10% brighter for UI cards (slightly more overlay than standard). */
const OVERLAY_UI_CARDS =
  'linear-gradient(135deg, rgba(4,8,20,0.74) 0%, rgba(6,12,28,0.70) 45%, rgba(4,8,20,0.76) 100%)';

function brandLayerCss(overlay: string): string {
  return `
  .brand-layer {
    position: fixed; inset: 0; z-index: 0;
    background-image: ${brandPhotoDataUri()};
    background-size: cover;
    background-position: center;
    pointer-events: none;
  }
  .brand-layer::after {
    content: '';
    position: absolute; inset: 0;
    background: ${overlay};
  }`;
}

export const BRAND_LAYER_CSS = brandLayerCss(OVERLAY_STANDARD);
export const BRAND_LAYER_UI_CSS = brandLayerCss(OVERLAY_UI_CARDS);

export const BRAND_BASE_GRADIENT =
  'linear-gradient(135deg, rgba(5,10,24,0.92) 0%, rgba(8,14,30,0.88) 50%, rgba(5,10,24,0.92) 100%)';

export const BRAND_FRAME_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1920px; height: 1080px; overflow: hidden;
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #060d1a;
    color: #f8fafc;
  }
  ${BRAND_LAYER_CSS}
  .frame {
    position: relative; z-index: 1;
    width: 100%; height: 100%;
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    padding: 40px 56px;
  }
  .frame-inner {
    width: 100%; max-width: 1720px;
    display: flex; flex-direction: column;
    justify-content: center;
    flex: 1;
    min-height: 0;
  }
`;

export const BRAND_FRAME_UI_CSS = BRAND_FRAME_CSS.replace(BRAND_LAYER_CSS, BRAND_LAYER_UI_CSS);

/** Motion uses same +17% brightness as standard. */
export const BRAND_MOTION_CSS = `
  ${brandLayerCss(OVERLAY_STANDARD)}
`;
