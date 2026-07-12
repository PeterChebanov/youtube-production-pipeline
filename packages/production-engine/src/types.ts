import type { RendererId } from '@ecpe/schemas';

export interface RenderResult {
  ok: boolean;
  paths: string[];
  error?: string;
}

export interface Renderer {
  id: RendererId;
  assetSubdir: string;
  fileExtension: string;
  render(scene: import('@ecpe/schemas').ProductionScene, outputPath: string): Promise<RenderResult>;
}
