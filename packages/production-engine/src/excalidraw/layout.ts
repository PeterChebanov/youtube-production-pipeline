/** Scale up sketch boards with few blocks so they fill the 1080p frame. */
export function sparseScaleForCount(blockCount: number): number {
  if (blockCount <= 3) return 1.2;
  if (blockCount <= 4) return 1.1;
  if (blockCount <= 5) return 1.0;
  return 0.92;
}

/** Try largest scale first; step down if elements overlap. */
export function sparseScaleCandidates(blockCount: number): number[] {
  const primary = sparseScaleForCount(blockCount);
  const out: number[] = [primary];
  if (primary > 1.15) out.push(1.15);
  if (primary > 1.0) out.push(1.0);
  return [...new Set(out)];
}

export function countSketchBlocks(elements: { type: string }[]): number {
  return elements.filter((e) => e.type !== 'connector' && e.type !== 'arrow').length;
}
