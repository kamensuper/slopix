import type { ThemeId } from '../../core/types';
import type { TerrainSpec } from './types';
export function paintTerrain(ctx: CanvasRenderingContext2D, _theme: ThemeId, spec: TerrainSpec, _seed: number): void {
  ctx.save();
  ctx.beginPath();
  if (spec.shape === 'poly' && spec.points) {
    spec.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  } else ctx.rect(-spec.w / 2, -spec.h / 2, spec.w, spec.h);
  ctx.fillStyle = '#7a5230';
  ctx.fill();
  ctx.restore();
}
