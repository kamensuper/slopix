// TEMPORARY STUB - replaced by the real environment artwork.
import type { ThemeId } from '../../core/types';
import type { DecorInfo, EnvView, TerrainSpec } from './types';

const SKY: Record<ThemeId, [string, string]> = {
  grasslands: ['#58c0f5', '#c9f0ff'],
  desert: ['#ffb85c', '#ffe9c4'],
  snowlands: ['#9fc8ee', '#e6f4ff'],
};
const GROUND: Record<ThemeId, [string, string]> = {
  grasslands: ['#6cc644', '#7a5230'],
  desert: ['#edc27a', '#c98b4a'],
  snowlands: ['#f4fbff', '#9db9d4'],
};

/** Non-colliding scenery available to level designers, keyed by kind. */
export const DECOR: Record<string, DecorInfo> = {};

export function paintSky(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView): void {
  const g = ctx.createLinearGradient(0, 0, 0, view.height);
  g.addColorStop(0, SKY[theme][0]);
  g.addColorStop(1, SKY[theme][1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.width, view.height);
}

export function paintGround(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView): void {
  if (view.groundY >= view.height) return;
  ctx.fillStyle = GROUND[theme][1];
  ctx.fillRect(0, view.groundY, view.width, view.height - view.groundY);
  ctx.fillStyle = GROUND[theme][0];
  ctx.fillRect(0, view.groundY, view.width, Math.max(4, view.zoom * 0.35));
}

export function paintForeground(_ctx: CanvasRenderingContext2D, _theme: ThemeId, _view: EnvView): void {}

export function paintTerrain(ctx: CanvasRenderingContext2D, theme: ThemeId, spec: TerrainSpec, _seed: number): void {
  ctx.save();
  ctx.beginPath();
  if (spec.shape === 'poly' && spec.points) {
    spec.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  } else {
    ctx.rect(-spec.w / 2, -spec.h / 2, spec.w, spec.h);
  }
  ctx.fillStyle = GROUND[theme][1];
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#2b1a12';
  ctx.stroke();
  ctx.restore();
}

export function paintDecor(_ctx: CanvasRenderingContext2D, _kind: string, _seed: number): void {}
