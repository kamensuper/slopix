/**
 * TNT: a red-painted plank crate with a framed lid, steel corner brackets and a worn "TNT" stencil.
 * The letters are built from stencil pieces (with the typical bridges), not from a font.
 */
import { clamp, Rng, TAU } from '../../core/math';
import { INK, MATERIAL_COLORS } from '../../core/palette';
import { edgeChips, carveChips, mixSeed, outlinePath, paintBevel, paintCracks, randomInside, rgba, walkCrack, type BlockGeo, type Crack } from './materialUtil';
import type { DamageStage } from './types';

const RED_LIGHT = '#e4573f';
const RED = MATERIAL_COLORS.tnt.base;
const RED_DARK = MATERIAL_COLORS.tnt.dark;
const FRAME = '#a42c20';
const STENCIL = MATERIAL_COLORS.tnt.light;
const STEEL = '#3d3f47';
const OUTLINE = 5;

export function paintTnt(ctx: CanvasRenderingContext2D, geo: BlockGeo, stage: DamageStage, seed: number): void {
  const salt = Math.round(geo.w * 29 + geo.h * 7);
  const rng = new Rng(mixSeed(seed, salt));
  const outline = outlinePath(geo, rng, 1.1);
  const hw = geo.w / 2;
  const hh = geo.h / 2;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.clip(outline);
  const body = ctx.createLinearGradient(-hw, -hh, hw, hh);
  body.addColorStop(0, RED_LIGHT);
  body.addColorStop(0.45, RED);
  body.addColorStop(1, RED_DARK);
  ctx.fillStyle = body;
  ctx.fillRect(-hw - 2, -hh - 2, geo.w + 4, geo.h + 4);

  const b = clamp(Math.min(geo.w, geo.h) * 0.15, 5, 14);
  if (geo.shape === 'rect' && Math.min(geo.w, geo.h) >= 30) {
    // Panel boards with seams, then the frame on top.
    ctx.beginPath();
    const boards = geo.w >= geo.h ? Math.max(2, Math.round(geo.h / 30)) : 2;
    for (let i = 1; i < boards; i++) {
      const y = -hh + (geo.h * i) / boards;
      ctx.moveTo(-hw, y);
      ctx.lineTo(hw, y + rng.range(-0.6, 0.6));
    }
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = rgba(RED_DARK, 0.85);
    ctx.stroke();
    grainLines(ctx, geo, rng, 'rgba(110, 20, 12, 0.3)');
    ctx.beginPath();
    ctx.rect(-hw - 3, -hh - 3, geo.w + 6, geo.h + 6);
    ctx.rect(-hw + b, -hh + b, geo.w - b * 2, geo.h - b * 2);
    ctx.fillStyle = FRAME;
    ctx.fill('evenodd');
    ctx.beginPath();
    ctx.rect(-hw + b, -hh + b, geo.w - b * 2, geo.h - b * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(RED_DARK, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-hw + b + 1.5, hh - b - 1);
    ctx.lineTo(-hw + b + 1.5, -hh + b + 1.5);
    ctx.lineTo(hw - b - 1, -hh + b + 1.5);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.stroke();
    stencil(ctx, geo.w - b * 2.6, geo.h - b * 2.6, rng);
    brackets(ctx, hw, hh, b);
  } else {
    grainLines(ctx, geo, rng, 'rgba(110, 20, 12, 0.3)');
    // Too small or not a box: just a hazard band.
    ctx.fillStyle = STENCIL;
    ctx.fillRect(-hw, -hh * 0.18, geo.w, hh * 0.36);
  }
  paintBevel(ctx, geo, clamp(geo.inradius * 0.2, 3, 5), 'rgba(255, 196, 160, 0.75)', 'rgba(70, 10, 6, 0.6)');
  if (stage > 0) {
    const damageRng = new Rng(mixSeed(seed, salt + 101));
    paintCracks(ctx, crateCracks(geo, damageRng), stage, '#3a0d08', 'rgba(255, 170, 140, 0.6)', 1.2);
    if (stage === 3) scorch(ctx, geo, damageRng);
  }
  ctx.restore();

  ctx.lineWidth = OUTLINE;
  ctx.strokeStyle = INK;
  ctx.stroke(outline);
  if (stage >= 2) carveChips(ctx, outline, edgeChips(geo, new Rng(mixSeed(seed, salt + 202))), stage, '#f0c48c', 1.45, INK, 3.5);
  ctx.restore();
}

function grainLines(ctx: CanvasRenderingContext2D, geo: BlockGeo, rng: Rng, color: string): void {
  ctx.beginPath();
  const n = clamp(Math.round(geo.h / 7), 3, 16);
  for (let i = 0; i < n; i++) {
    const y0 = rng.range(-0.5, 0.5) * geo.h;
    const x0 = -geo.w / 2 + rng.range(0, 0.4) * geo.w;
    const x1 = x0 + rng.range(0.3, 0.8) * geo.w;
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + (x1 - x0) * 0.3, y0 + rng.range(-2, 2), x0 + (x1 - x0) * 0.7, y0 + rng.range(-2, 2), x1, y0 + rng.range(-1, 1));
  }
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** "TNT" as stencil pieces, centred and fitted inside w x h. */
function stencil(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng): void {
  const lh = Math.min(h * 0.62, w / 2.5);
  const lw = lh * 0.74;
  const s = lh * 0.22;
  const gap = Math.max(1.2, lh * 0.055);
  const gapX = lw * 0.14;
  const total = lw * 3 + gapX * 2;
  const pieces = new Path2D();
  const tee = (x: number): void => {
    // Top bar split by a bridge on each side of the stem.
    const top = -lh / 2;
    pieces.rect(x, top, (lw - s) / 2 - gap, s);
    pieces.rect(x + (lw + s) / 2 + gap, top, (lw - s) / 2 - gap, s);
    pieces.rect(x + (lw - s) / 2, top, s, lh);
  };
  const en = (x: number): void => {
    const top = -lh / 2;
    pieces.rect(x, top, s, lh);
    pieces.rect(x + lw - s, top, s, lh);
    pieces.moveTo(x + s + gap, top);
    pieces.lineTo(x + s + gap + s * 0.9, top);
    pieces.lineTo(x + lw - s - gap, top + lh);
    pieces.lineTo(x + lw - s - gap - s * 0.9, top + lh);
    pieces.closePath();
  };
  const x0 = -total / 2;
  tee(x0);
  en(x0 + lw + gapX);
  tee(x0 + (lw + gapX) * 2);
  ctx.save();
  ctx.rotate(rng.range(-0.04, 0.04));
  // Drop shadow so the paint sits on the boards.
  ctx.translate(1.2, 1.4);
  ctx.fillStyle = 'rgba(80, 10, 5, 0.45)';
  ctx.fill(pieces);
  ctx.translate(-1.2, -1.4);
  ctx.fillStyle = STENCIL;
  ctx.fill(pieces);
  // Worn paint: flecks of red showing through.
  ctx.clip(pieces);
  ctx.beginPath();
  for (let i = 0; i < 14; i++) {
    const x = rng.range(-0.5, 0.5) * total;
    const y = rng.range(-0.5, 0.5) * lh;
    const r = rng.range(0.6, 1.8);
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fillStyle = rgba(RED, 0.75);
  ctx.fill();
  ctx.restore();
}

/** Steel corner brackets with a bolt each. */
function brackets(ctx: CanvasRenderingContext2D, hw: number, hh: number, b: number): void {
  const k = b * 1.7;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const cx = sx * hw;
    const cy = sy * hh;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - sx * k, cy);
    ctx.lineTo(cx, cy - sy * k);
    ctx.closePath();
    ctx.fillStyle = STEEL;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(160, 165, 175, 0.7)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - sx * k * 0.32, cy - sy * k * 0.32, Math.max(1.4, b * 0.17), 0, TAU);
    ctx.fillStyle = '#9da2ab';
    ctx.fill();
  }
}

function crateCracks(geo: BlockGeo, rng: Rng): Crack[] {
  const cracks: Crack[] = [];
  const width = clamp(geo.inradius * 0.12, 2.4, 4.5);
  for (let i = 0; i < 4; i++) {
    const [x, y] = randomInside(geo, rng, 4);
    const heading = rng.next() < 0.6 ? (rng.next() < 0.5 ? 0 : Math.PI) : rng.range(0, TAU);
    cracks.push({ pts: walkCrack(geo, x, y, heading, geo.w * 0.6, 7, 0.1, 0.25, rng), born: 1 + Math.min(2, i), width });
  }
  return cracks;
}

/** Soot from a near miss on the fuse. */
function scorch(ctx: CanvasRenderingContext2D, geo: BlockGeo, rng: Rng): void {
  const [x, y] = randomInside(geo, rng, 4);
  const r = Math.max(geo.w, geo.h) * 0.4;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(30, 10, 6, 0.55)');
  g.addColorStop(1, 'rgba(30, 10, 6, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(-geo.w / 2, -geo.h / 2, geo.w, geo.h);
}
