/**
 * Environment artwork: the three illustrated worlds (sky, parallax layers, ground, ambience),
 * terrain pieces and decor. The heavy lifting lives in the env*.ts modules; this file keeps the
 * stable entry points used by the renderer.
 */
import type { ThemeId } from '../../core/types';
import { envSeed } from './envDecor';
import { desertScene } from './envDesert';
import { grassScene } from './envGrass';
import { EnvRenderer, type SceneDef } from './envLayers';
import { snowScene } from './envSnow';
import type { EnvView } from './types';

export { DECOR, paintDecor, paintDecorGlow } from './envDecor';
export { paintTerrain } from './envTerrain';

export function sceneFor(theme: ThemeId): SceneDef {
  return theme === 'desert' ? desertScene() : theme === 'snowlands' ? snowScene() : grassScene();
}

const shared = new EnvRenderer(sceneFor);

function dprOf(ctx: CanvasRenderingContext2D): number {
  const t = ctx.getTransform();
  return Math.abs(t.a) || 1;
}

/** Sky, clouds and the parallax layers. Expects (and leaves) a CSS-pixel transform. */
export function paintSky(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView): void {
  const dpr = dprOf(ctx);
  ctx.save();
  shared.drawSky(ctx, theme, view, dpr, view.seed ?? envSeed(view.worldWidth));
  ctx.restore();
}

/** The ground strip below world y = 0, anchored to world x. */
export function paintGround(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView): void {
  const dpr = dprOf(ctx);
  ctx.save();
  shared.drawGround(ctx, theme, view, dpr);
  ctx.restore();
}

/** Subtle ambient particles (pollen and leaves, sand, snow) over the playfield. */
export function paintForeground(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView): void {
  const dpr = dprOf(ctx);
  ctx.save();
  shared.drawForeground(ctx, theme, view, dpr);
  ctx.restore();
}
