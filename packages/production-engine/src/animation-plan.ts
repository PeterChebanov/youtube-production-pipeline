import type { RendererId } from '@ecpe/schemas';

export const ANIMATABLE_RENDERERS: RendererId[] = ['mermaid', 'excalidraw', 'ui-cards'];
export const FIXED_STATIC_RENDERERS: RendererId[] = ['code', 'terminal', 'browser', 'illustration'];

export interface AnimationPlanStats {
  total_scenes: number;
  fixed_static: number;
  already_motion: number;
  animatable: number;
  target_motion_ratio: number;
  selected_animated: number;
  selected_static_animatable: number;
}

export interface AnimationPlan {
  animatedSceneIds: Set<string>;
  stats: AnimationPlanStats;
}

function sceneAnimatedFlag(scene: import('@ecpe/schemas').ProductionScene): boolean | undefined {
  const v = scene.data.animated;
  return typeof v === 'boolean' ? v : undefined;
}

/** All animatable scenes render as MP4 (+ static snapshot). motionRatio kept for stats only. */
export function buildAnimationPlan(
  scenes: import('@ecpe/schemas').ProductionScene[],
  motionRatio = 1,
): AnimationPlan {
  const fixedStatic = scenes.filter((s) =>
    FIXED_STATIC_RENDERERS.includes(s.renderer as RendererId),
  ).length;
  const alreadyMotion = scenes.filter((s) => s.renderer === 'motion').length;
  const animatableScenes = scenes.filter((s) =>
    ANIMATABLE_RENDERERS.includes(s.renderer as RendererId),
  );

  const animatedSceneIds = new Set<string>();
  for (const scene of scenes) {
    if (scene.renderer === 'motion') {
      if (sceneAnimatedFlag(scene) !== false) animatedSceneIds.add(scene.scene_id);
      continue;
    }
    if (ANIMATABLE_RENDERERS.includes(scene.renderer as RendererId)) {
      if (sceneAnimatedFlag(scene) !== false) animatedSceneIds.add(scene.scene_id);
    }
  }

  return {
    animatedSceneIds,
    stats: {
      total_scenes: scenes.length,
      fixed_static: fixedStatic,
      already_motion: alreadyMotion,
      animatable: animatableScenes.length,
      target_motion_ratio: Math.min(1, Math.max(0, motionRatio)),
      selected_animated: animatedSceneIds.size,
      selected_static_animatable: animatableScenes.length - animatedSceneIds.size,
    },
  };
}

export function outputExtension(renderer: RendererId, animated: boolean): string {
  if (renderer === 'motion') return '.mp4';
  if (renderer === 'illustration') return '.prompt.txt';
  if (renderer === 'code' || renderer === 'terminal') return '.html';
  if (renderer === 'browser') return '.png';
  if (!animated) {
    if (renderer === 'ui-cards') return '.html';
    return '.png';
  }
  if (ANIMATABLE_RENDERERS.includes(renderer)) return '.mp4';
  return '.png';
}

export function wantsStaticSnapshot(renderer: RendererId, animated: boolean): boolean {
  // code/terminal stay HTML for preview, but always emit DaVinci-ready PNG under static/
  if (renderer === 'code' || renderer === 'terminal') return true;
  return animated && (renderer === 'motion' || ANIMATABLE_RENDERERS.includes(renderer));
}
