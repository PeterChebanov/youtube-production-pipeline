import { pickRevealAnimation, revealItemStyle } from '../animations/reveal.js';

export interface RevealStamp {
  sceneId: string;
  enabled: boolean;
  index: number;
  /** Monotonic block index for paired block→arrow timing. */
  blockIndex: number;
}

const REVEAL_STEP_SEC = 0.85;
const REVEAL_BASE_SEC = 0.45;
const BLOCK_ANIM_SEC = 0.65;
const ARROW_LAG_SEC = 0.55;

export function createRevealStamp(sceneId: string, enabled: boolean): RevealStamp {
  return { sceneId, enabled, index: 0, blockIndex: 0 };
}

export function revealAttrs(stamp: RevealStamp, className: string): string {
  if (!stamp.enabled) return `class="${className}"`;
  const anim = pickRevealAnimation(stamp.sceneId, stamp.index);
  const delay = REVEAL_BASE_SEC + stamp.index * REVEAL_STEP_SEC;
  stamp.index += 1;
  return `class="${className} reveal-item reveal-${anim}" style="${revealItemStyle(anim, delay)}"`;
}

/** Block entrance — icon inside block shares this step. */
export function revealBlockAttrs(stamp: RevealStamp, className: string): string {
  if (!stamp.enabled) return `class="${className}"`;
  const bi = stamp.blockIndex;
  const anim = pickRevealAnimation(stamp.sceneId, bi * 2);
  const delay = REVEAL_BASE_SEC + bi * REVEAL_STEP_SEC;
  stamp.blockIndex += 1;
  stamp.index = Math.max(stamp.index, bi * 2 + 1);
  return `class="${className} reveal-item reveal-${anim}" style="${revealItemStyle(anim, delay)}"`;
}

/** Outgoing arrow after preceding block finishes animating. */
export function revealArrowAttrs(stamp: RevealStamp, className: string): string {
  if (!stamp.enabled) return `class="${className}"`;
  const bi = stamp.blockIndex - 1;
  const stepIndex = bi * 2 + 1;
  const anim = pickRevealAnimation(stamp.sceneId, stepIndex);
  const delay = REVEAL_BASE_SEC + bi * REVEAL_STEP_SEC + ARROW_LAG_SEC;
  stamp.index = Math.max(stamp.index, stepIndex + 1);
  return `class="${className} reveal-item reveal-${anim}" style="${revealItemStyle(anim, delay, 0.45)}"`;
}

export function countRevealItems(stamp: RevealStamp): number {
  return stamp.index;
}

export function revealSequenceDurationSec(stamp: RevealStamp, holdTailSec = 1.8): number {
  if (!stamp.enabled || stamp.index <= 0) return 4;
  const lastDelay = REVEAL_BASE_SEC + (stamp.index - 1) * REVEAL_STEP_SEC;
  return Math.min(Math.max(lastDelay + BLOCK_ANIM_SEC + holdTailSec, 4), 90);
}
