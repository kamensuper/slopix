/**
 * Wood: warm planks, posts and timber blocks with flowing grain that bends around knots, end grain
 * on the short sides, bevelled edges and log slices for round pieces. Damage splits along the grain
 * first, then snaps across it and finally loses chips.
 */
import { clamp, Rng, TAU } from '../../core/math';
import { INK } from '../../core/palette';
import {
  blobPath,
  boxGradient,
  carveChips,
  circleSteps,
  edgeChips,
  insideGeo,
  mixSeed,
  outlinePath,
  paintBevel,
  paintCracks,
  rgba,
  walkCrack,
  type BlockGeo,
  type Crack,
} from './materialUtil';
import type { DamageStage } from './types';

interface WoodTones {
  light: string;
  base: string;
  dark: string;
  grain: string;
  grainLight: string;
  end: string;
  ring: string;
  knot: string;
  bevelLight: string;
  bevelDark: string;
  crack: string;
  lip: string;
  fresh: string;
}

/** Four close siblings so that a structure does not look cut from a single board. */
const TONES: readonly WoodTones[] = [
  { light: '#f0c27f', base: '#d9a05b', dark: '#b07035', grain: '#9a5a26', grainLight: '#f7d9a6', end: '#e7b678', ring: '#a8682f', knot: '#7a4419', bevelLight: '#ffe3b0', bevelDark: '#86501f', crack: '#4a2510', lip: '#f6d29c', fresh: '#f6d7a2' },
  { light: '#eab577', base: '#cf9150', dark: '#a5632c', grain: '#8e4f1f', grainLight: '#f2cf98', end: '#e0aa6c', ring: '#9c5d28', knot: '#6f3c15', bevelLight: '#ffdca4', bevelDark: '#7c4819', crack: '#45210d', lip: '#f0c98f', fresh: '#f3d09a' },
  { light: '#f4cb8d', base: '#dfaa66', dark: '#b8793d', grain: '#a2632d', grainLight: '#fae0b2', end: '#ecc086', ring: '#ae6f36', knot: '#80491d', bevelLight: '#ffe8bc', bevelDark: '#8c5625', crack: '#4d2811', lip: '#f9dcac', fresh: '#f9dfb0' },
  { light: '#e8b06f', base: '#c98a49', dark: '#9d5d28', grain: '#86491b', grainLight: '#eec790', end: '#dba266', ring: '#955624', knot: '#683712', bevelLight: '#fbd59b', bevelDark: '#764316', crack: '#411e0b', lip: '#ecc386', fresh: '#efc994' },
];

const OUTLINE = 5;

export function woodTones(seed: number): WoodTones {
  return TONES[(seed - 1) & 3] as WoodTones;
}

export function paintWood(ctx: CanvasRenderingContext2D, geo: BlockGeo, stage: DamageStage, seed: number): void {
  const t = woodTones(seed);
  const salt = Math.round(geo.w * 7 + geo.h * 13);
  const rng = new Rng(mixSeed(seed, salt));
  const outline = outlinePath(geo, rng, 1.3);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.clip(outline);
  if (geo.shape === 'circle') paintLogFace(ctx, geo, t, rng);
  else paintBoard(ctx, geo, t, rng);
  paintBevel(ctx, geo, geo.shape === 'circle' ? 4 : clamp(geo.inradius * 0.3, 3.2, 6.5), t.bevelLight, t.bevelDark);
  if (stage > 0) {
    const damageRng = new Rng(mixSeed(seed, salt + 101));
    paintCracks(ctx, woodCracks(geo, damageRng), stage, t.crack, t.lip, 1.3);
    if (stage === 3) bruise(ctx, geo, damageRng);
  }
  ctx.restore();

  ctx.lineWidth = OUTLINE;
  ctx.strokeStyle = INK;
  ctx.stroke(outline);
  if (stage >= 2) carveChips(ctx, outline, edgeChips(geo, new Rng(mixSeed(seed, salt + 202))), stage, t.fresh, 1.45, INK, 3.5);
  ctx.restore();
}

// ---------------------------------------------------------------- boards

interface Knot {
  x: number;
  y: number;
  r: number;
}

/** Planks, posts, squares, triangles and wedges. Texture is laid out along the long axis. */
function paintBoard(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: WoodTones, rng: Rng): void {
  ctx.fillStyle = boxGradient(ctx, geo.w, geo.h, [
    [0, t.light],
    [0.42, t.base],
    [1, t.dark],
  ]);
  ctx.fillRect(-geo.w / 2 - 2, -geo.h / 2 - 2, geo.w + 4, geo.h + 4);

  const vertical = geo.shape === 'rect' && geo.h > geo.w * 1.15;
  const L = vertical ? geo.h : geo.w;
  const T = vertical ? geo.w : geo.h;
  ctx.save();
  if (vertical) ctx.rotate(Math.PI / 2);

  // Broad streaks of slightly different colour along the grain.
  for (let i = 0; i < 3; i++) {
    const y = rng.range(-0.5, 0.5) * T;
    ctx.fillStyle = rgba(i % 2 === 0 ? t.dark : t.light, 0.18);
    ctx.fillRect(-L / 2, y - T * 0.08, L, T * rng.range(0.08, 0.2));
  }

  const knot: Knot | null = L >= 55 && rng.next() < 0.8 ? { x: rng.range(-0.32, 0.32) * L, y: rng.range(-0.18, 0.18) * T, r: clamp(T * 0.26, 4, 12) } : null;
  grain(ctx, L, T, knot, t, rng);
  if (knot) paintKnot(ctx, knot, t);

  const plank = geo.shape === 'rect' && L / T >= 1.8;
  if (plank) {
    endGrain(ctx, -L / 2, 1, T, t, rng);
    endGrain(ctx, L / 2, -1, T, t, rng);
  } else if (geo.shape === 'rect') {
    // Timber blocks are pinned with four dowels.
    const inset = clamp(Math.min(L, T) * 0.17, 7, 16);
    const r = clamp(Math.min(L, T) * 0.045, 2.2, 4);
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const x = sx * (L / 2 - inset);
      const y = sy * (T / 2 - inset);
      ctx.beginPath();
      ctx.arc(x, y, r + 1.1, 0, TAU);
      ctx.fillStyle = rgba(t.crack, 0.55);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 0.3, y - 0.3, r, 0, TAU);
      ctx.fillStyle = t.end;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU);
      ctx.fillStyle = rgba(t.grainLight, 0.9);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Flowing grain lines; wide boards get "cathedral" arches, every line bends around the knot. */
function grain(ctx: CanvasRenderingContext2D, L: number, T: number, knot: Knot | null, t: WoodTones, rng: Rng): void {
  const n = clamp(Math.round(T / 5.2), 3, 15);
  const step = 7;
  const amp = T * rng.range(0.025, 0.05);
  const freq = TAU / (L * rng.range(0.6, 1.3));
  const phase = rng.range(0, TAU);
  const arch = T >= 45 ? { x: rng.range(-0.2, 0.2) * L, w: L * rng.range(0.16, 0.26), h: T * rng.range(0.22, 0.34) } : null;
  const dark = new Path2D();
  const light = new Path2D();
  for (let i = 0; i < n; i++) {
    const y0 = -T / 2 + ((i + rng.range(0.25, 0.75)) / n) * T;
    const start = rng.next() < 0.7 ? -L / 2 - 4 : rng.range(-0.45, 0.1) * L;
    const end = rng.next() < 0.7 ? L / 2 + 4 : rng.range(-0.1, 0.45) * L;
    const lift = arch ? arch.h * (1 - Math.abs((i + 0.5) / n - 0.5) * 1.6) : 0;
    const path = i % 3 === 1 ? light : dark;
    for (let x = start, k = 0; x <= end; x += step, k++) {
      let y = y0 + amp * Math.sin(x * freq + phase + i * 0.4) + amp * 0.5 * Math.sin(x * freq * 2.7 + i);
      if (arch) y -= lift * Math.exp(-(((x - arch.x) / arch.w) ** 2));
      if (knot) {
        const d = y0 - knot.y;
        const reach = knot.r * 2.4 - Math.abs(d);
        if (reach > 0) y += Math.sign(d || 1) * reach * 0.75 * Math.exp(-(((x - knot.x) / (knot.r * 2.6)) ** 2));
      }
      if (k === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
  }
  ctx.lineWidth = clamp(T * 0.05, 1.1, 2.2);
  ctx.strokeStyle = rgba(t.grain, 0.5);
  ctx.stroke(dark);
  ctx.lineWidth = clamp(T * 0.04, 0.9, 1.6);
  ctx.strokeStyle = rgba(t.grainLight, 0.55);
  ctx.stroke(light);
}

/** A knot: an elongated, ringed lens of darker wood that the grain flows around. */
function paintKnot(ctx: CanvasRenderingContext2D, k: Knot, t: WoodTones): void {
  const lens = (rx: number, ry: number): void => {
    ctx.beginPath();
    ctx.moveTo(k.x - rx, k.y);
    ctx.quadraticCurveTo(k.x, k.y - ry * 1.5, k.x + rx, k.y);
    ctx.quadraticCurveTo(k.x, k.y + ry * 1.5, k.x - rx, k.y);
    ctx.closePath();
  };
  lens(k.r * 2.1, k.r * 0.85);
  ctx.fillStyle = rgba(t.grain, 0.22);
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = rgba(t.grain, 0.55);
  ctx.stroke();
  lens(k.r * 1.25, k.r * 0.55);
  ctx.fillStyle = rgba(t.knot, 0.8);
  ctx.fill();
  lens(k.r * 0.55, k.r * 0.26);
  ctx.fillStyle = rgba(t.crack, 0.75);
  ctx.fill();
}

/** End grain on a short side: a darker cap with growth-ring arcs and a chamfer line. */
function endGrain(ctx: CanvasRenderingContext2D, x: number, dir: 1 | -1, T: number, t: WoodTones, rng: Rng): void {
  const e = clamp(T * 0.42, 5, 13);
  const x0 = Math.min(x, x + dir * e);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, -T / 2 - 2, e, T + 4);
  ctx.clip();
  ctx.fillStyle = t.end;
  ctx.fillRect(x0, -T / 2 - 2, e, T + 4);
  const cx = x - dir * T * rng.range(0.6, 1.1);
  const cy = rng.range(-0.35, 0.35) * T;
  const first = Math.abs(x - cx) - e * 0.1;
  ctx.beginPath();
  for (let r = first; r < first + e * 1.6; r += 3.2) {
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, TAU);
  }
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = rgba(t.ring, 0.7);
  ctx.stroke();
  // A short check (drying crack) running in from the edge.
  if (rng.next() < 0.6) {
    const y = rng.range(-0.3, 0.3) * T;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * e * 0.75, y + rng.range(-1.5, 1.5));
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = rgba(t.crack, 0.6);
    ctx.stroke();
  }
  ctx.restore();
  const seam = x + dir * e;
  ctx.beginPath();
  ctx.moveTo(seam, -T / 2);
  ctx.lineTo(seam + dir * 0.4, T / 2);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = rgba(t.grain, 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(seam + dir * 1.6, -T / 2);
  ctx.lineTo(seam + dir * 2, T / 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(t.bevelLight, 0.55);
  ctx.stroke();
}

// ---------------------------------------------------------------- log slices

function paintLogFace(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: WoodTones, rng: Rng): void {
  const R = geo.radius;
  const bark = clamp(R * 0.13, 5, 11);
  ctx.fillStyle = '#6b3f1d';
  ctx.fillRect(-R - 2, -R - 2, R * 2 + 4, R * 2 + 4);
  // Bark ridges.
  ctx.beginPath();
  const ridges = Math.round((TAU * R) / 9);
  for (let i = 0; i < ridges; i++) {
    const a = (i / ridges) * TAU + rng.range(-0.05, 0.05);
    const r0 = R - bark * rng.range(0.2, 0.7);
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * (R + 2), Math.sin(a) * (R + 2));
  }
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#4a2a12';
  ctx.stroke();

  const inner = R - bark;
  const face = ctx.createRadialGradient(-inner * 0.3, -inner * 0.3, inner * 0.1, 0, 0, inner);
  face.addColorStop(0, t.light);
  face.addColorStop(0.7, t.end);
  face.addColorStop(1, t.base);
  ctx.beginPath();
  blobPath(ctx, 0, 0, inner, inner, circleSteps(inner), 0.04, rng);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = rgba(t.dark, 0.9);
  ctx.stroke();

  // Growth rings around a slightly off-centre pith.
  const px = rng.range(-0.12, 0.12) * inner;
  const py = rng.range(-0.12, 0.12) * inner;
  const rings = clamp(Math.round(inner / 6), 3, 10);
  const path = new Path2D();
  for (let i = 1; i <= rings; i++) {
    const r = (inner * 0.92 * i) / (rings + 0.3);
    const shrink = 1 - (Math.hypot(px, py) / inner) * (i / rings);
    blobPath(path, px * (1 - i / rings), py * (1 - i / rings), r * shrink, r * shrink, circleSteps(r), 0.05, rng);
  }
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = rgba(t.ring, 0.6);
  ctx.stroke(path);
  ctx.beginPath();
  ctx.arc(px, py, clamp(inner * 0.06, 1.5, 3), 0, TAU);
  ctx.fillStyle = t.knot;
  ctx.fill();
}

// ---------------------------------------------------------------- damage

function woodCracks(geo: BlockGeo, rng: Rng): Crack[] {
  const cracks: Crack[] = [];
  if (geo.shape === 'circle') {
    // Logs check radially, from the pith outwards.
    const R = geo.radius;
    const width = clamp(R * 0.09, 2.5, 5);
    for (let i = 0; i < 5; i++) {
      const a = rng.range(0, TAU);
      const pts = walkCrack(geo, Math.cos(a) * R * 0.08, Math.sin(a) * R * 0.08, a, R * 1.1, 6, 0.08, 0.25, rng);
      cracks.push({ pts, born: i < 2 ? 1 + i : i < 4 ? 2 + (i % 2) : 3, width: width * (i < 2 ? 1 : 0.7) });
    }
    return cracks;
  }
  const vertical = geo.shape === 'rect' && geo.h > geo.w * 1.15;
  const L = vertical ? geo.h : geo.w;
  const T = vertical ? geo.w : geo.h;
  const along = vertical ? Math.PI / 2 : 0;
  // Converts (u along the grain, v across it) to block space.
  const at = (u: number, v: number): [number, number] => (vertical ? [-v, u] : [u, v]);
  const width = clamp(T * 0.13, 2.4, 5);
  const rect = geo.shape === 'rect';
  // First point inside the silhouette when walking in from one end at cross-grain offset v.
  const fromEnd = (v: number, dir: 1 | -1): [number, number] => {
    for (let u = (-dir * L) / 2 + dir; Math.abs(u) < L / 2; u += dir * 2) {
      const [x, y] = at(u, v);
      if (insideGeo(geo, x, y, 0.5)) return [x, y];
    }
    return at(0, v);
  };

  // Splits run in from the ends along the grain.
  const [ax, ay] = fromEnd(rect ? rng.range(-0.3, 0.3) * T : T * rng.range(0.2, 0.35), 1);
  cracks.push({ pts: walkCrack(geo, ax, ay, along, L * 0.5, 9, 0.04, 0.1, rng), born: 1, width });
  const [bx, by] = fromEnd(rect ? rng.range(-0.3, 0.3) * T : T * rng.range(0.25, 0.4), -1);
  cracks.push({ pts: walkCrack(geo, bx, by, along + Math.PI, L * 0.42, 9, 0.04, 0.1, rng), born: 2, width: width * 0.85 });

  // Then the piece snaps across the grain: a ragged break from one face.
  const u = rng.range(-0.22, 0.22) * L * (rect ? 1 : 0.6);
  const fromTop = rect && rng.next() < 0.5;
  const [cx, cy] = at(u, fromTop ? -T / 2 + 1 : T / 2 - 1);
  const [ox, oy] = at(u, 0);
  const across = Math.atan2(oy - cy, ox - cx);
  const breakPts = walkCrack(geo, cx, cy, across, T * 1.45, clamp(T / 6, 3.5, 9), 0.15, 0.55, rng);
  const snap: Crack = { pts: breakPts, born: 2, width: width * 1.25 };
  cracks.push(snap);
  // The break tears along the grain both ways.
  const mid = Math.min(breakPts.length / 2 - 1, 2);
  const mx = breakPts[mid * 2] as number;
  const my = breakPts[mid * 2 + 1] as number;
  cracks.push({ pts: walkCrack(geo, mx, my, along, L * 0.3, 8, 0.05, 0.14, rng), born: 3, width: width * 0.8, parent: snap, at: mid });
  cracks.push({ pts: walkCrack(geo, mx, my, along + Math.PI, L * 0.24, 8, 0.05, 0.14, rng), born: 3, width: width * 0.7, parent: snap, at: mid });
  if (rect && L / T < 1.8) {
    // Blocks and triangles also split from a corner.
    const [dx, dy] = at(L * 0.45, -T * 0.45);
    cracks.push({ pts: walkCrack(geo, dx, dy, Math.atan2(-dy, -dx), Math.hypot(dx, dy) * 1.1, 7, 0.12, 0.3, rng), born: 1, width });
  }
  return cracks;
}

/** Last stage: the timber is bruised dark around the break. */
function bruise(ctx: CanvasRenderingContext2D, geo: BlockGeo, rng: Rng): void {
  const r = Math.max(geo.w, geo.h) * 0.45;
  const x = rng.range(-0.2, 0.2) * geo.w;
  const y = rng.range(-0.2, 0.2) * geo.h;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(60, 28, 10, 0.28)');
  g.addColorStop(1, 'rgba(60, 28, 10, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(-geo.w / 2, -geo.h / 2, geo.w, geo.h);
}
