/** Reusable structure pieces for hand-built levels (all placed by bottom centre, return the top y). */
import type { BlockMaterial, PigVariant } from '../core/types';
import type { LevelBuilder } from './builder';

export interface HutOptions {
  w?: number;
  h?: number;
  /** Material of the posts. */
  mat?: BlockMaterial;
  /** Material of the lintel (defaults to the posts). */
  top?: BlockMaterial;
  roof?: BlockMaterial | null;
  pig?: PigVariant | null;
  thick?: number;
}

/** Two posts, a lintel, optionally a pig inside and a roof on top. */
export function hut(b: LevelBuilder, cx: number, bottom: number, o: HutOptions = {}): number {
  const w = o.w ?? 2.6;
  const h = o.h ?? 2;
  const mat = o.mat ?? 'wood';
  const t = o.thick ?? 0.25;
  b.post(mat, cx - w / 2 + t / 2, bottom, h, t);
  b.post(mat, cx + w / 2 - t / 2, bottom, h, t);
  if (o.pig) b.pig(o.pig, cx, bottom);
  let top = b.plank(o.top ?? mat, cx, bottom + h, w + 0.3);
  if (o.roof) top = b.tri(o.roof, cx, top, Math.min(2.4, w * 0.8), 1);
  return top;
}

/** Stacked huts; each floor may have its own materials and pig. */
export function tower(b: LevelBuilder, cx: number, bottom: number, floors: HutOptions[], roof: BlockMaterial | null = null): number {
  let top = bottom;
  floors.forEach((floor, i) => {
    top = hut(b, cx, top, { ...floor, roof: i === floors.length - 1 ? roof : null });
  });
  return top;
}

/** Solid wall of square blocks, `cols` wide and `rows` high. */
export function wall(b: LevelBuilder, x0: number, bottom: number, cols: number, rows: number, mat: BlockMaterial, size = 0.8): number {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) b.rect(mat, x0 + c * size + size / 2, bottom + r * size, size, size);
  return bottom + rows * size;
}
