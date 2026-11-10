/**
 * Prop artwork: the slingshot (see propSlingshot.ts) and every particle sprite (see fxParticles.ts).
 */
import { paintParticleArt } from './fxParticles';
import { paintSlingshotBackArt, paintSlingshotFrontArt } from './propSlingshot';
import type { ParticleKind } from './types';

/** Trunk and far fork arm (behind the bird). Origin = base centre on the ground, 100 units per metre. */
export function paintSlingshotBack(ctx: CanvasRenderingContext2D): void {
  paintSlingshotBackArt(ctx);
}

/** Near fork arm and the fork binding (in front of the bird). */
export function paintSlingshotFront(ctx: CanvasRenderingContext2D): void {
  paintSlingshotFrontArt(ctx);
}

export function paintParticle(ctx: CanvasRenderingContext2D, kind: ParticleKind, variant: number, color?: string): void {
  paintParticleArt(ctx, kind, variant, color);
}
