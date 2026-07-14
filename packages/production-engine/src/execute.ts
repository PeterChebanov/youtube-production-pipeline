import { unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  EditManifestSchema,
  ProductionPlanSchema,
  type EditManifest,
  type EditManifestEntry,
  type ProductionPlan,
  type ProductionScene,
} from '@ecpe/schemas';
import {
  codeRenderer,
  excalidrawRenderer,
  illustrationRenderer,
  mermaidRenderer,
  motionRenderer,
  terminalRenderer,
  browserRenderer,
  uiCardsRenderer,
} from './renderers.js';
import {
  buildAnimationPlan,
  outputExtension,
  wantsStaticSnapshot,
  type AnimationPlanStats,
} from './animation-plan.js';
import type { RendererId } from '@ecpe/schemas';
import type { Renderer } from './types.js';
import { resolveTheme } from './themes/index.js';

const RENDERERS: Record<string, Renderer> = {
  mermaid: mermaidRenderer,
  excalidraw: excalidrawRenderer,
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
  /** Render only scenes whose renderer is in this list. */
  renderers?: string[];
  /** When partial render, merge into existing manifest entries. */
  previousManifestEntries?: EditManifestEntry[];
  themeId?: string;
  diagramPalette?: import('./themes/index.js').DiagramPaletteId;
  /** Legacy — animatable scenes always render MP4 + static snapshot. */
  motionRatio?: number;
  animationSeed?: string;
}

export interface RenderAssetsResult {
  manifest: EditManifest;
  rendered: number;
  failed: number;
  animationStats?: AnimationPlanStats;
}

function sceneOutputPath(
  projectRoot: string,
  scene: ProductionScene,
  renderer: Renderer,
  extension: string,
): string {
  const filename = `${scene.scene_id}${extension}`;
  return path.join(projectRoot, 'assets', renderer.assetSubdir, filename);
}

function staticSnapshotPath(
  projectRoot: string,
  renderer: Renderer,
  sceneId: string,
): string {
  return path.join(projectRoot, 'assets', renderer.assetSubdir, 'static', `${sceneId}.png`);
}

const STALE_EXTENSIONS = ['.png', '.svg', '.html', '.mp4', '.webm', '.prompt.txt'] as const;

async function removeStaleSceneAssets(
  projectRoot: string,
  sceneId: string,
  renderer: Renderer,
): Promise<void> {
  const dir = path.join(projectRoot, 'assets', renderer.assetSubdir);
  const staticDir = path.join(dir, 'static');
  await Promise.all([
    ...STALE_EXTENSIONS.map((ext) =>
      unlink(path.join(dir, `${sceneId}${ext}`)).catch(() => undefined),
    ),
    unlink(path.join(staticDir, `${sceneId}.png`)).catch(() => undefined),
  ]);
}

function relativeAssetPath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function sceneToManifestEntry(
  scene: ProductionScene,
  assetPath: string,
  status: EditManifestEntry['status'],
  error?: string,
  staticAssetPath?: string,
): EditManifestEntry {
  return {
    block_id: scene.block_id,
    scene_order: scene.scene_order,
    sentence_start: scene.sentence_start,
    sentence_end: scene.sentence_end,
    narration_span: scene.narration_span,
    estimated_hold_sec: scene.estimated_hold_sec,
    asset_path: assetPath,
    static_asset_path: staticAssetPath,
    renderer: scene.renderer,
    visual: scene.visual,
    status,
    insert_hint: scene.insert_hint,
    error,
  };
}

function manifestEntryKey(entry: EditManifestEntry): string {
  return `${entry.block_id}:${entry.scene_order}`;
}

/** Keep untouched scenes when re-rendering a subset (sceneId or renderers filter). */
function mergeManifestEntries(
  previous: EditManifestEntry[],
  rendered: EditManifestEntry[],
): EditManifestEntry[] {
  const byKey = new Map(rendered.map((e) => [manifestEntryKey(e), e]));
  const merged = previous.map((e) => byKey.get(manifestEntryKey(e)) ?? e);
  const prevKeys = new Set(previous.map(manifestEntryKey));
  for (const e of rendered) {
    if (!prevKeys.has(manifestEntryKey(e))) merged.push(e);
  }
  return merged;
}

export async function renderAssets(
  plan: ProductionPlan,
  options: RenderAssetsOptions,
): Promise<RenderAssetsResult> {
  const validated = ProductionPlanSchema.parse(plan);
  const projectRoot = path.resolve(options.projectRoot);
  let scenes = validated.scenes;
  if (options.sceneId) {
    scenes = scenes.filter((s) => s.scene_id === options.sceneId);
  } else if (options.renderers?.length) {
    const allowed = new Set(options.renderers);
    scenes = scenes.filter((s) => allowed.has(s.renderer));
  }

  if (options.sceneId && scenes.length === 0) {
    throw new Error(`Scene not found in production plan: ${options.sceneId}`);
  }
  if (options.renderers?.length && scenes.length === 0) {
    throw new Error(`No scenes match renderer filter: ${options.renderers.join(', ')}`);
  }

  const entries: EditManifestEntry[] = [];
  let rendered = 0;
  let failed = 0;

  const animationPlan = buildAnimationPlan(validated.scenes, options.motionRatio ?? 1);

  const baseContext = {
    theme: resolveTheme(options.themeId),
    diagramPalette: options.diagramPalette,
  };

  for (const scene of scenes) {
    const renderer = getRenderer(scene.renderer);
    if (!renderer) {
      failed += 1;
      entries.push(
        sceneToManifestEntry(scene, '', 'failed', `Unknown renderer: ${scene.renderer}`),
      );
      continue;
    }

    const rendererId = scene.renderer as RendererId;
    const animated = animationPlan.animatedSceneIds.has(scene.scene_id);
    const extension = outputExtension(rendererId, animated);
    const outputPath = sceneOutputPath(projectRoot, scene, renderer, extension);
    const staticPath = wantsStaticSnapshot(rendererId, animated)
      ? staticSnapshotPath(projectRoot, renderer, scene.scene_id)
      : undefined;

    await removeStaleSceneAssets(projectRoot, scene.scene_id, renderer);
    const result = await renderer.render(scene, outputPath, {
      ...baseContext,
      animated: animated || undefined,
      staticOutputPath: staticPath,
    });

    if (result.ok && result.paths[0]) {
      rendered += 1;
      const relStatic =
        result.staticPath ?? (staticPath ? relativeAssetPath(projectRoot, staticPath) : undefined);
      entries.push(
        sceneToManifestEntry(
          scene,
          relativeAssetPath(projectRoot, result.paths[0]),
          'ok',
          undefined,
          relStatic,
        ),
      );
    } else {
      failed += 1;
      entries.push(
        sceneToManifestEntry(scene, '', 'failed', result.error ?? 'Render failed'),
      );
    }
  }

  const mergedEntries =
    options.previousManifestEntries?.length && (options.sceneId || options.renderers?.length)
      ? mergeManifestEntries(options.previousManifestEntries, entries)
      : entries;

  const manifest = EditManifestSchema.parse({ version: 2, entries: mergedEntries });
  return {
    manifest,
    rendered,
    failed,
    animationStats: animationPlan.stats,
  };
}
