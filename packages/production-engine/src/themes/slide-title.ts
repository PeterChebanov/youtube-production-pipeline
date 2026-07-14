/** Unified slide title scale: ~5.5% band, font sized for optical match across renderers. */
export const FRAME_HEIGHT_PX = 1080;
export const SLIDE_TITLE_BAND_PCT = 0.06;
export const SLIDE_TITLE_BAND_MIN_PX = Math.round(FRAME_HEIGHT_PX * SLIDE_TITLE_BAND_PCT);
/** ~100px — handwriting (Excalifont) and sans-serif share one px size for cross-mode consistency. */
export const SLIDE_TITLE_FONT_PX = Math.round(FRAME_HEIGHT_PX * SLIDE_TITLE_BAND_PCT * 1.55);

export function slideTitleCss(extra = ''): string {
  return `
  .slide-title, h1.title, .title, .cards-title {
    font-size: ${SLIDE_TITLE_FONT_PX}px;
    font-weight: 700;
    line-height: 1.12;
    margin: 0;
    ${extra}
  }`;
}
