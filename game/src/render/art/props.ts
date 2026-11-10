// TEMPORARY STUB - replaced by the real prop artwork.
import type { ParticleKind } from './types';

export function paintSlingshotBack(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineCap = 'round';
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -170);
  ctx.lineTo(36, -298);
  ctx.stroke();
  ctx.restore();
}

export function paintSlingshotFront(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = '#a66d35';
  ctx.lineCap = 'round';
  ctx.lineWidth = 30;
  ctx.beginPath();
  ctx.moveTo(0, -170);
  ctx.lineTo(-30, -292);
  ctx.stroke();
  ctx.restore();
}

const PARTICLE_COLORS: Record<ParticleKind, string> = {
  splinter: '#d9a05b',
  woodchip: '#b8763a',
  shard: 'rgba(190, 235, 250, 0.8)',
  rock: '#8a9097',
  dust: 'rgba(230, 220, 200, 0.7)',
  smoke: 'rgba(60, 60, 60, 0.7)',
  spark: '#ffe27a',
  star: '#fff3a0',
  feather: '#ffffff',
  fire: '#ff8a1f',
};

export function paintParticle(ctx: CanvasRenderingContext2D, kind: ParticleKind, _variant: number, color?: string): void {
  ctx.save();
  ctx.fillStyle = color ?? PARTICLE_COLORS[kind];
  ctx.beginPath();
  if (kind === 'splinter') ctx.rect(-28, -5, 56, 10);
  else if (kind === 'shard' || kind === 'rock' || kind === 'woodchip') {
    ctx.moveTo(-20, 14);
    ctx.lineTo(4, -22);
    ctx.lineTo(22, 12);
    ctx.closePath();
  } else ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
