import type { ProductionScene } from '@ecpe/schemas';
import type { VisualTheme } from '../themes/index.js';
import { buildBrandDocument } from '../themes/index.js';
import { iconSvg, resolveIconName } from '../icons/index.js';
import { SLIDE_TITLE_FONT_PX } from '../themes/slide-title.js';
import {
  BRAND_ORANGE,
  BRAND_ORANGE_DEEP,
  BRAND_ORANGE_GLOW,
} from '../themes/accents.js';
import { revealAnimationCss } from '../animations/reveal.js';
import { createRevealStamp, revealAttrs } from '../animations/stamp.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function uiCardsRevealItemCount(scene: ProductionScene, animated: boolean): number {
  if (!animated) return 0;
  const cards = scene.data.cards;
  if (!Array.isArray(cards)) return 1;
  return cards.length + 1;
}

export function buildUiCardsHtml(
  scene: ProductionScene,
  theme: VisualTheme,
  animated = false,
): string {
  const title = typeof scene.data.title === 'string' ? scene.data.title : scene.scene_id;
  const cards = scene.data.cards;
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error('ui-cards scene requires data.cards array');
  }

  const cols = cards.length <= 2 ? cards.length : cards.length <= 4 ? 2 : 3;
  const stamp = createRevealStamp(scene.scene_id, animated);

  const css = `
  ${animated ? revealAnimationCss() : ''}
  .cards-title {
    font-size: ${SLIDE_TITLE_FONT_PX}px; font-weight: 700; text-align: center;
    color: ${theme.textPrimary}; margin-bottom: 36px;
  }
  .cards-title::after {
    content: '';
    display: block;
    width: 140px; height: 5px; margin: 18px auto 0;
    border-radius: 3px;
    background: linear-gradient(90deg, ${BRAND_ORANGE}, ${BRAND_ORANGE_DEEP});
    box-shadow: 0 0 20px ${BRAND_ORANGE_GLOW};
  }
  .cards-grid {
    display: grid; grid-template-columns: repeat(${cols}, 1fr);
    gap: 28px; width: 100%; flex: 1; align-content: center;
  }
  .card {
    background: ${theme.cardBg}; padding: 32px 36px; border-radius: 18px;
    border: 1px solid ${theme.cardBorder};
    border-left: 5px solid ${BRAND_ORANGE};
    box-shadow: 0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 ${BRAND_ORANGE_GLOW};
    display: flex; flex-direction: column; justify-content: flex-start;
    min-height: 300px;
    position: relative;
    gap: 12px;
  }
  .card-icon { opacity: 0.95; flex-shrink: 0; }
  .card-head { display: flex; align-items: flex-start; gap: 16px; }
  .card-head h3 { flex: 1; }
  .card h3 {
    margin: 0 0 14px; font-size: 34px;
    color: ${BRAND_ORANGE};
    text-shadow: 0 0 20px ${BRAND_ORANGE_GLOW};
  }
  .card p { margin: 0; font-size: 26px; line-height: 1.45; color: ${theme.textSecondary}; }
  `;

  const body = `
  <h1 ${revealAttrs(stamp, 'cards-title')}>${escapeHtml(title)}</h1>
  <div class="cards-grid">
    ${cards
      .map((c, i) => {
        const card = c as { heading?: string; body?: string; icon?: string };
        const iconName = resolveIconName({
          explicit: card.icon,
          variant: 'ui',
          seed: `${scene.scene_id}:card:${i}`,
          textParts: [card.heading, card.body],
        });
        return `<div ${revealAttrs(stamp, 'card')}>
          <div class="card-icon">${iconSvg(iconName, 44)}</div>
          <div class="card-head">
            <h3>${escapeHtml(card.heading ?? '')}</h3>
          </div>
          <p>${escapeHtml(card.body ?? '')}</p>
        </div>`;
      })
      .join('')}
  </div>`;

  return buildBrandDocument(title, css, body, 'ui-cards');
}
