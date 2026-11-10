// TEMPORARY STUB - replaced by the real block artwork.
import type { BlockSpec, DamageStage } from './types';

const FILL = { wood: '#d9a05b', glass: 'rgba(170, 225, 245, 0.6)', stone: '#9aa0a6', tnt: '#c0392b' } as const;

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

export function paintBlock(ctx: CanvasRenderingContext2D, spec: BlockSpec, stage: DamageStage, _seed: number): void {
  ctx.save();
  blockPath(ctx, spec);
  ctx.fillStyle = FILL[spec.material];
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#2b1a12';
  ctx.stroke();
  ctx.lineWidth = 3;
  for (let i = 0; i < stage; i++) {
    ctx.beginPath();
    ctx.moveTo(-spec.w / 2 + (spec.w * (i + 1)) / 4, -spec.h / 2);
    ctx.lineTo(-spec.w / 2 + (spec.w * (i + 1)) / 4 + 6, spec.h / 2);
    ctx.stroke();
  }
  ctx.restore();
}
