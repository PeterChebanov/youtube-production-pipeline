import path from 'node:path';
import {
  EditManifestSchema,
  ProductionPlanSchema,
  type EditManifest,
  type EditManifestEntry,
  type ProductionPlan,
  type ProductionScene,
} from '@ecpe/schemas';
import { codeRenderer, illustrationRenderer, mermaidRenderer, motionRenderer, terminalRenderer, browserRenderer, uiCardsRenderer } from './renderers.js';
import type { Renderer } from './types.js';

const RENDERERS: Record<string, Renderer> = {
  mermaid: mermaidRenderer,
  code: codeRenderer,
  terminal: terminalRenderer,
  browser: browserRenderer,
  'ui-cards': uiCardsRenderer,
  illustration: illustrationRenderer,
  motion: motionRenderer,
};

export function getRenderer(id: string): Renderer | undefined {
  return RENDERERS[id];
}

export function listRenderers(): string[] {
  return Object.keys(RENDERERS);
}

export interface RenderAssetsOptions {
  projectRoot: string;
  sceneId?: string;
}

export interface RenderAssetsResult {
  manifest: EditManifest;
  rendered: number;
  failed: number;
}

function sceneOutputPath(projectRoot: string, scene: ProductionScene, renderer: Renderer): string {
  const filename = `${scene.scene_id}${renderer.fileExtension}`;
  return path.join(projectRoot, 'assets', renderer.assetSubdir, filename);
}

function relativeAssetPath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

export async function renderAssets(
  plan: ProductionPlan,
  options: RenderAssetsOptions,
): Promise<RenderAssetsResult> {
  const validated = ProductionPlanSchema.parse(plan);
  const projectRoot = path.resolve(options.projectRoot);
  const scenes = options.sceneId
    ? validated.scenes.filter((s) => s.scene_id === options.sceneId)
    : validated.scenes;

  if (options.sceneId && scenes.length === 0) {
    throw new Error(`Scene not found in production plan: ${options.sceneId}`);
  }

  const entries: EditManifestEntry[] = [];
  let rendered = 0;
  let failed = 0;

  for (const scene of scenes) {
    const renderer = getRenderer(scene.renderer);
    if (!renderer) {
      failed += 1;
      entries.push({
        timecode_in: scene.start_timecode,
        timecode_out: scene.end_timecode,
        duration_sec: scene.duration_sec,
        segment_ids: scene.segment_ids,
        narration_excerpt: scene.narration_excerpt,
        asset_path: '',
        renderer: scene.renderer,
        visual: scene.visual,
        status: 'failed',
        insert_hint: scene.insert_hint,
        error: `Unknown renderer: ${scene.renderer}`,
      });
      continue;
    }

    const outputPath = sceneOutputPath(projectRoot, scene, renderer);
    const result = await renderer.render(scene, outputPath);

    if (result.ok && result.paths[0]) {
      rendered += 1;
      entries.push({
        timecode_in: scene.start_timecode,
        timecode_out: scene.end_timecode,
        duration_sec: scene.duration_sec,
        segment_ids: scene.segment_ids,
        narration_excerpt: scene.narration_excerpt,
        asset_path: relativeAssetPath(projectRoot, result.paths[0]),
        renderer: scene.renderer,
        visual: scene.visual,
        status: 'ok',
        insert_hint: scene.insert_hint,
      });
    } else {
      failed += 1;
      entries.push({
        timecode_in: scene.start_timecode,
        timecode_out: scene.end_timecode,
        duration_sec: scene.duration_sec,
        segment_ids: scene.segment_ids,
        narration_excerpt: scene.narration_excerpt,
        asset_path: '',
        renderer: scene.renderer,
        visual: scene.visual,
        status: 'failed',
        insert_hint: scene.insert_hint,
        error: result.error ?? 'Render failed',
      });
    }
  }

  const manifest = EditManifestSchema.parse({ version: 1, entries });
  return { manifest, rendered, failed };
}
