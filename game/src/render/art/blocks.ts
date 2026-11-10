/**
 * Block artwork. Each material has its own painter (wood, stone, glass, metal, TNT); this module
 * dispatches to them and owns the exact physics silhouette. Pieces are cached as sprites, so the
 * painters can afford detail, but they stay inside the collision shape (outlines spill <= 3 units).
 */
import { paintGlass } from './blockGlass';
import { paintMetal } from './blockMetal';
import { paintStone } from './blockStone';
import { paintTnt } from './blockTnt';
import { paintWood } from './blockWood';
import { blockGeo } from './materialUtil';
import type { BlockSpec, DamageStage } from './types';

/** Adds the exact collision silhouette of a block, centred on the origin. */
export function blockPath(ctx: CanvasRenderingContext2D, spec: BlockSpec): void {
  const hw = spec.w / 2;
  const hh = spec.h / 2;
  ctx.beginPath();
  if (spec.shape === 'circle') {
    ctx.arc(0, 0, hw, 0, Math.PI * 2);
  } else if (spec.shape === 'tri') {
    ctx.moveTo(-hw, hh);
    ctx.lineTo(hw, hh);
    ctx.lineTo(0, -hh);
    ctx.closePath();
  } else if (spec.shape === 'wedge') {
    const s = spec.flip ? -1 : 1;
    ctx.moveTo(-hw * s, hh);
    ctx.lineTo(hw * s, hh);
    ctx.lineTo(-hw * s, -hh);
    ctx.closePath();
  } else {
    ctx.rect(-hw, -hh, spec.w, spec.h);
  }
}

export function paintBlock(ctx: CanvasRenderingContext2D, spec: BlockSpec, stage: DamageStage, seed: number): void {
  const geo = blockGeo(spec);
  switch (spec.material) {
    case 'wood':
      paintWood(ctx, geo, stage, seed);
      break;
    case 'stone':
      paintStone(ctx, geo, stage, seed);
      break;
    case 'glass':
      paintGlass(ctx, geo, stage, seed);
      break;
    case 'metal':
      paintMetal(ctx, geo, stage, seed);
      break;
    case 'tnt':
      paintTnt(ctx, geo, stage, seed);
      break;
  }
}
