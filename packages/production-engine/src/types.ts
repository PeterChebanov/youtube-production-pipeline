import type { RendererId } from '@ecpe/schemas';
import type { VisualTheme, DiagramPaletteId } from './themes/index.js';
import type { RevealAnimationId } from './animations/reveal.js';

export interface RenderResult {
  ok: boolean;
  paths: string[];
  /** Final-frame static capture (PNG) when MP4 reveal completes. */
  staticPath?: string;
  error?: string;
}

export interface RenderContext {
  theme: VisualTheme;
  diagramPalette?: DiagramPaletteId;
  /** When true, animatable renderers output MP4 with step-reveal. */
  animated?: boolean;
  revealAnimation?: RevealAnimationId;
  /** Target path for post-reveal static screenshot. */
  staticOutputPath?: string;
}

export interface Renderer {
  id: RendererId;
  assetSubdir: string;
  fileExtension: string;
  render(
    scene: import('@ecpe/schemas').ProductionScene,
    outputPath: string,
    context?: RenderContext,
  ): Promise<RenderResult>;
}
