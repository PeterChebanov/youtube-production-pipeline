export { getRenderer, listRenderers, renderAssets } from './execute.js';
export type { RenderAssetsOptions, RenderAssetsResult } from './execute.js';
export { buildAnimationPlan, outputExtension, wantsStaticSnapshot, ANIMATABLE_RENDERERS, FIXED_STATIC_RENDERERS } from './animation-plan.js';
export type { AnimationPlan, AnimationPlanStats } from './animation-plan.js';
export type { RenderContext, RenderResult, Renderer } from './types.js';
export { resolveTheme, VISUAL_THEMES, DEFAULT_THEME_ID } from './themes/index.js';
export type { VisualTheme } from './themes/index.js';
export {
  DIAGRAM_PALETTE_IDS,
  DIAGRAM_PALETTES,
  DEFAULT_DIAGRAM_PALETTE,
  resolveDiagramPalette,
  type DiagramPaletteId,
} from './themes/index.js';
