export const REVEAL_ANIMATION_IDS = [
  'fade-up',
  'slide-left',
  'pop-in',
  'scale-in',
  'blur-in',
  'rise-glow',
] as const;

export type RevealAnimationId = (typeof REVEAL_ANIMATION_IDS)[number];

export function pickRevealAnimation(sceneId: string, index: number): RevealAnimationId {
  let hash = 0;
  const key = `${sceneId}:${index}`;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return REVEAL_ANIMATION_IDS[hash % REVEAL_ANIMATION_IDS.length];
}

export function revealAnimationCss(): string {
  return `
  .reveal-item {
    opacity: 0;
    animation-fill-mode: forwards;
    animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes reveal-fade-up {
    from { opacity: 0; transform: translateY(28px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes reveal-slide-left {
    from { opacity: 0; transform: translateX(48px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes reveal-pop-in {
    from { opacity: 0; transform: scale(0.88); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes reveal-scale-in {
    from { opacity: 0; transform: scale(0.72); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes reveal-blur-in {
    from { opacity: 0; filter: blur(10px); transform: scale(0.96); }
    to { opacity: 1; filter: blur(0); transform: scale(1); }
  }
  @keyframes reveal-rise-glow {
    from { opacity: 0; transform: translateY(20px); box-shadow: 0 0 0 rgba(251,146,60,0); }
    to { opacity: 1; transform: translateY(0); box-shadow: 0 0 24px rgba(251,146,60,0.18); }
  }
  .reveal-fade-up { animation-name: reveal-fade-up; }
  .reveal-slide-left { animation-name: reveal-slide-left; }
  .reveal-pop-in { animation-name: reveal-pop-in; }
  .reveal-scale-in { animation-name: reveal-scale-in; }
  .reveal-blur-in { animation-name: reveal-blur-in; }
  .reveal-rise-glow { animation-name: reveal-rise-glow; }
`;
}

export function revealItemStyle(
  animation: RevealAnimationId,
  delaySec: number,
  durationSec = 0.65,
): string {
  return `animation: reveal-${animation} ${durationSec}s cubic-bezier(0.22, 1, 0.36, 1) ${delaySec}s forwards; opacity:0;`;
}

export function animatedDurationSec(itemCount: number, stepDelaySec = 0.9, holdTailSec = 1.8): number {
  if (itemCount <= 0) return 4;
  return Math.min(Math.max(itemCount * stepDelaySec + holdTailSec, 4), 90);
}
