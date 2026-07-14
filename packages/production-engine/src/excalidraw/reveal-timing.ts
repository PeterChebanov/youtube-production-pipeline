/** Excalidraw: frame + content overlap — max ~0.2s empty outline before text appears. */
export const SKETCH_FRAME_BASE_SEC = 0.05;
export const SKETCH_STEP_SEC = 0.85;
export const SKETCH_CONTENT_LAG_SEC = 0.15;
export const SKETCH_FRAME_DRAW_SEC = 0.28;
export const SKETCH_CONNECTOR_LAG_SEC = 0.42;

export function sketchBlockTimings(blockIndex: number): {
  frameDelay: number;
  contentDelay: number;
} {
  const frameDelay = SKETCH_FRAME_BASE_SEC + blockIndex * SKETCH_STEP_SEC;
  return {
    frameDelay,
    contentDelay: frameDelay + SKETCH_CONTENT_LAG_SEC,
  };
}

export function sketchConnectorDelay(fromBlockIndex: number): number {
  const { contentDelay } = sketchBlockTimings(fromBlockIndex);
  return contentDelay + SKETCH_CONNECTOR_LAG_SEC;
}
