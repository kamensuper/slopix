/**
 * Dev gallery for block materials, the slingshot and particles.
 *   ?view=game                  every material, shape and damage stage at gameplay scale
 *   ?view=zoom&mat=wood         one material, zoomed (stages in rows)
 *   ?view=sling                 the slingshot, zoomed and at gameplay scale
 *   ?view=particles             every particle kind and variant
 * Paint timings are printed in the corner (and to the console as `paint-ms`).
 */
import { MATERIALS, RENDER, SLING } from '../src/core/config';
import type { BlockMaterial, BlockShape } from '../src/core/types';
import { paintBlock } from '../src/render/art/blocks';
import { paintParticle, paintSlingshotBack, paintSlingshotFront } from '../src/render/art/props';
import { PARTICLE_HALF, PARTICLE_VARIANTS, type BlockSpec, type DamageStage, type ParticleKind } from '../src/render/art/types';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'game';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const dpr = window.devicePixelRatio || 1;
const W = window.innerWidth;
const H = window.innerHeight;
canvas.width = W * dpr;
canvas.height = H * dpr;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
const ctx = canvas.getContext('2d')!;
ctx.scale(dpr, dpr);

/** Same resolution as the game's sprite cache. */
const SPRITE = RENDER.spritePxPerMeter / 100;
const timings: number[] = [];

function sprite(spec: BlockSpec, stage: DamageStage, seed: number): HTMLCanvasElement {
  const pad = 6;
  const c = document.createElement('canvas');
  c.width = Math.ceil((spec.w + pad * 2) * SPRITE);
  c.height = Math.ceil((spec.h + pad * 2) * SPRITE);
  const g = c.getContext('2d')!;
  g.scale(SPRITE, SPRITE);
  g.translate(spec.w / 2 + pad, spec.h / 2 + pad);
  const t0 = performance.now();
  paintBlock(g, spec, stage, seed);
  timings.push(performance.now() - t0);
  return c;
}

/** Draws a block centred at (x, y) at `scale` CSS px per design unit, through a sprite like the game. */
function block(spec: BlockSpec, stage: DamageStage, seed: number, x: number, y: number, scale: number, angle = 0): void {
  const c = sprite(spec, stage, seed);
  const k = scale / SPRITE;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(k, k);
  ctx.drawImage(c, -c.width / 2, -c.height / 2);
  ctx.restore();
}

function label(text: string, x: number, y: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(text, x, y);
}

function backdrop(): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#58c0f5');
  g.addColorStop(1, '#c9f0ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

interface ShapeDef {
  name: string;
  shape: BlockShape;
  w: number;
  h: number;
  flip?: boolean;
}

const SHAPES: ShapeDef[] = [
  { name: 'plank 2.9x0.25', shape: 'rect', w: 290, h: 25 },
  { name: 'post', shape: 'rect', w: 25, h: 200 },
  { name: 'square 0.8', shape: 'rect', w: 80, h: 80 },
  { name: 'beam 1.6x0.4', shape: 'rect', w: 160, h: 40 },
  { name: 'tri', shape: 'tri', w: 200, h: 100 },
  { name: 'wedge', shape: 'wedge', w: 100, h: 100 },
  { name: 'circle', shape: 'circle', w: 80, h: 80 },
];

const MATS = Object.keys(MATERIALS) as BlockMaterial[];

function drawGame(): void {
  backdrop();
  const scale = 0.42;
  ctx.fillStyle = '#5aa83a';
  let y = 40;
  for (const material of MATS) {
    label(material, 10, y + 12);
    let x = 90;
    for (const s of SHAPES) {
      if (material === 'tnt' && s.shape !== 'rect') continue;
      for (let stage = 0 as DamageStage; stage <= 3; stage = (stage + 1) as DamageStage) {
        const cx = x + (s.w * scale) / 2;
        block({ shape: s.shape, material, w: s.w, h: s.h, flip: s.flip }, stage, 1 + (stage % 4), cx, y + 45, scale);
        x += s.w * scale + 8;
      }
      x += 18;
    }
    y += 105;
  }
  // A small structure in each material, as it would stand in a level.
  y += 20;
  let x = 60;
  for (const material of MATS.filter((m) => m !== 'tnt')) {
    const base = y + 120;
    const s = scale;
    block({ shape: 'rect', material, w: 25, h: 200 }, 0, 1, x + 12 * s, base - 100 * s, s);
    block({ shape: 'rect', material, w: 25, h: 200 }, 1, 2, x + 250 * s, base - 100 * s, s);
    block({ shape: 'rect', material, w: 290, h: 25 }, 0, 3, x + 131 * s, base - 212 * s, s);
    block({ shape: 'tri', material, w: 200, h: 100 }, 0, 4, x + 131 * s, base - 275 * s, s);
    block({ shape: 'rect', material, w: 80, h: 80 }, 2, 1, x + 131 * s, base - 40 * s, s);
    block({ shape: 'rect', material: 'tnt', w: 80, h: 80 }, 0, 2, x + 300 * s, base - 40 * s, s);
    ctx.fillStyle = '#4f9a32';
    ctx.fillRect(x - 20, base, 360 * s + 30, 6);
    x += 320;
  }
}

function drawZoom(material: BlockMaterial): void {
  backdrop();
  const scale = 1;
  let y = 30;
  for (let stage = 0 as DamageStage; stage <= 3; stage = (stage + 1) as DamageStage) {
    label(`stage ${stage}`, 10, y + 16);
    let x = 80;
    let rowH = 0;
    for (const s of SHAPES) {
      if (material === 'tnt' && s.shape !== 'rect') continue;
      block({ shape: s.shape, material, w: s.w, h: s.h, flip: s.flip }, stage, 1 + ((stage + x) % 4), x + (s.w * scale) / 2, y + 110, scale);
      x += s.w * scale + 26;
      rowH = Math.max(rowH, s.h);
    }
    // Seeds side by side.
    for (let seed = 1; seed <= 4; seed++) {
      block({ shape: 'rect', material, w: 80, h: 80 }, stage, seed, x + 40, y + 60, 0.9);
      block({ shape: 'rect', material, w: 120, h: 25 }, stage, seed, x + 60, y + 150, 0.9);
      x += 130;
    }
    y += 235;
  }
}

function drawSling(): void {
  backdrop();
  ctx.fillStyle = '#6cbf45';
  ctx.fillRect(0, H - 160, W, 160);
  const parts = (x: number, y: number, scale: number, birdR: number): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const t0 = performance.now();
    paintSlingshotBack(ctx);
    // Stand-in bird at the pouch.
    ctx.beginPath();
    ctx.arc(SLING.anchor.x * 100, -SLING.anchor.y * 100, birdR, 0, Math.PI * 2);
    ctx.fillStyle = '#e23b2e';
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#2b1a12';
    ctx.stroke();
    paintSlingshotFront(ctx);
    timings.push(performance.now() - t0);
    // Fork tips from the config, for alignment.
    for (const tip of [SLING.forkBack, SLING.forkFront]) {
      ctx.beginPath();
      ctx.arc(tip.x * 100, -tip.y * 100, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#00e5ff';
      ctx.fill();
    }
    ctx.restore();
  };
  parts(320, H - 160, 2.4, 40);
  parts(800, H - 160, 1.2, 40);
  parts(1060, H - 160, 0.42, 40);
  // Without the bird.
  ctx.save();
  ctx.translate(1300, H - 160);
  ctx.scale(1.2, 1.2);
  paintSlingshotBack(ctx);
  paintSlingshotFront(ctx);
  ctx.restore();
}

const KINDS: ParticleKind[] = ['splinter', 'woodchip', 'shard', 'rock', 'metal', 'dust', 'smoke', 'spark', 'glint', 'flash', 'star', 'feather', 'fire'];

function drawParticles(): void {
  ctx.fillStyle = '#7d9cb3';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e9d9b8';
  ctx.fillRect(W / 2, 0, W / 2, H);
  const size = PARTICLE_HALF * 2;
  const cell = 74;
  KINDS.forEach((kind, row) => {
    const y = 30 + row * cell;
    label(kind, 8, y + 6);
    for (let half = 0; half < 2; half++) {
      for (let v = 0; v < PARTICLE_VARIANTS; v++) {
        const x = 110 + half * (W / 2) + v * cell;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(cell / size, cell / size);
        if (['spark', 'glint', 'flash', 'fire'].includes(kind) && half === 0) ctx.globalCompositeOperation = 'lighter';
        const color = kind === 'dust' ? (half === 0 ? '#ffffff' : '#d8c9a3') : kind === 'feather' ? (half === 0 ? '#e23b2e' : '#58b7ee') : undefined;
        paintParticle(ctx, kind, v, color);
        ctx.restore();
      }
      // Gameplay size: about 0.3 m at 40 px/m.
      for (let v = 0; v < PARTICLE_VARIANTS; v++) {
        const x = 420 + half * (W / 2) + v * 26;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(14 / size, 14 / size);
        if (['spark', 'glint', 'flash', 'fire'].includes(kind) && half === 0) ctx.globalCompositeOperation = 'lighter';
        paintParticle(ctx, kind, v, kind === 'dust' ? '#d8c9a3' : undefined);
        ctx.restore();
      }
    }
  });
}

async function main(): Promise<void> {
  await document.fonts?.ready;
  if (view === 'zoom') drawZoom((params.get('mat') ?? 'wood') as BlockMaterial);
  else if (view === 'sling') drawSling();
  else if (view === 'particles') drawParticles();
  else drawGame();
  if (timings.length > 0) {
    const max = Math.max(...timings);
    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    const text = `paint-ms avg ${avg.toFixed(2)} max ${max.toFixed(2)} n ${timings.length}`;
    console.log(text);
    ctx.fillStyle = '#2b1a12cc';
    ctx.fillRect(8, H - 26, 300, 20);
    label(text, 14, H - 11);
  }
}

void main();
