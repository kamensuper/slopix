/**
 * Metal: riveted steel girders, plates and balls. Brushed surface with a restrained specular band,
 * flanges, bolts, scratches and a touch of rust. Damage dents the surface, pops rivets, bends the
 * edges and finally tears the plate.
 */
import { clamp, Rng, TAU } from '../../core/math';
import { INK } from '../../core/palette';
import {
  boxGradient,
  insetPolygon,
  mixSeed,
  outlinePath,
  paintBevel,
  perimeterPoint,
  randomInside,
  rgba,
  walkCrack,
  addTapered,
  type BlockGeo,
  type Chip,
  carveChips,
} from './materialUtil';
import type { DamageStage } from './types';

interface MetalTones {
  spec: string;
  light: string;
  base: string;
  dark: string;
  deep: string;
  rivet: string;
  rust: string;
}

const TONES: readonly MetalTones[] = [
  // Cool blue steel, darker and more contrasted than stone so the two never read alike.
  { spec: '#f2f8ff', light: '#b4c7da', base: '#7189a3', dark: '#465b72', deep: '#2f3e50', rivet: '#9fb4c9', rust: '#a4572c' },
  { spec: '#f0f6fc', light: '#afc2d4', base: '#6c839c', dark: '#43576c', deep: '#2c3a4b', rivet: '#9aaec2', rust: '#9c5228' },
  { spec: '#f4f9ff', light: '#b9cbdd', base: '#768ea8', dark: '#4a6078', deep: '#324256', rivet: '#a4b8cc', rust: '#a8592e' },
  { spec: '#eef4fa', light: '#aabdcf', base: '#687f97', dark: '#405367', deep: '#2a3747', rivet: '#96aabd', rust: '#985026' },
];

const OUTLINE = 5.5;

interface Rivet {
  x: number;
  y: number;
  r: number;
  /** First damage stage at which the rivet has popped out (4 = never). */
  pops: number;
}

export function paintMetal(ctx: CanvasRenderingContext2D, geo: BlockGeo, stage: DamageStage, seed: number): void {
  const t = TONES[(seed - 1) & 3] as MetalTones;
  const salt = Math.round(geo.w * 3 + geo.h * 23);
  const rng = new Rng(mixSeed(seed, salt));
  const damageRng = new Rng(mixSeed(seed, salt + 101));
  const outline = outlinePath(geo, rng, 0.5);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.clip(outline);
  let rivets: Rivet[];
  if (geo.shape === 'circle') rivets = paintBall(ctx, geo, t, rng);
  else rivets = paintPlate(ctx, geo, t, rng);
  for (const r of rivets) r.pops = damageRng.next() < 0.5 ? 2 + Math.floor(damageRng.next() * 2) : 4;
  wear(ctx, geo, t, rng);
  paintBevel(ctx, geo, geo.shape === 'circle' ? 4 : clamp(geo.inradius * 0.28, 3, 5.5), rgba(t.spec, 0.9), rgba(t.deep, 0.9));
  for (const r of rivets) paintRivet(ctx, r, r.pops <= stage, t);
  if (stage > 0) dents(ctx, geo, stage, t, damageRng);
  if (stage === 3) tear(ctx, geo, t, new Rng(mixSeed(seed, salt + 202)));
  ctx.restore();

  ctx.lineWidth = OUTLINE;
  ctx.strokeStyle = INK;
  ctx.stroke(outline);
  if (stage >= 2 && geo.shape !== 'circle') carveChips(ctx, outline, bends(geo, new Rng(mixSeed(seed, salt + 303))), stage, t.light, 1.6, INK, 3.5);
  ctx.restore();
}

// ---------------------------------------------------------------- surfaces

function paintPlate(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: MetalTones, rng: Rng): Rivet[] {
  const hw = geo.w / 2;
  const hh = geo.h / 2;
  // Brushed steel: a restrained specular band a quarter of the way across, then falling off into shade.
  ctx.fillStyle = boxGradient(ctx, geo.w, geo.h, [
    [0, t.light],
    [0.2, t.spec],
    [0.34, t.light],
    [0.62, t.base],
    [1, t.dark],
  ]);
  ctx.fillRect(-hw - 2, -hh - 2, geo.w + 4, geo.h + 4);
  brushed(ctx, geo, t, rng);

  const rivets: Rivet[] = [];
  const vertical = geo.shape === 'rect' && geo.h > geo.w * 1.6;
  const horizontal = geo.shape === 'rect' && geo.w > geo.h * 1.6;
  if (vertical || horizontal) {
    // Girder: flanges along both long sides and a rivet line down the web.
    const L = vertical ? geo.h : geo.w;
    const T = vertical ? geo.w : geo.h;
    const flange = clamp(T * 0.2, 3.5, 12);
    ctx.save();
    if (vertical) ctx.rotate(Math.PI / 2);
    for (const side of [-1, 1]) {
      const y = side * (T / 2 - flange);
      ctx.beginPath();
      ctx.moveTo(-L / 2, y);
      ctx.lineTo(L / 2, y);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = rgba(t.deep, 0.75);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-L / 2, y + 1.6);
      ctx.lineTo(L / 2, y + 1.6);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = rgba(t.spec, 0.6);
      ctx.stroke();
    }
    // Shadow under the top flange gives the web some depth.
    ctx.fillStyle = rgba(t.deep, 0.18);
    ctx.fillRect(-L / 2, -T / 2 + flange + 1, L, clamp(T * 0.12, 1.5, 5));
    ctx.restore();
    const r = clamp(T * 0.13, 2.4, 4.4);
    const spacing = clamp(T * 1.25, 22, 40);
    const count = Math.max(2, Math.floor((L - 16) / spacing));
    for (let i = 0; i < count; i++) {
      const u = (i - (count - 1) / 2) * ((L - 20) / Math.max(1, count - 1));
      rivets.push(vertical ? { x: 0, y: u, r, pops: 4 } : { x: u, y: 0, r, pops: 4 });
    }
  } else {
    // Plate: a pressed border and bolts in the corners.
    const inset = clamp(geo.inradius * 0.28, 5, 14);
    const inner = insetPolygon(geo.pts, inset);
    ctx.beginPath();
    for (let i = 0; i < inner.length; i += 2) ctx.lineTo(inner[i] as number, inner[i + 1] as number);
    ctx.closePath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(t.deep, 0.55);
    ctx.stroke();
    ctx.save();
    ctx.translate(1.3, 1.6);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(t.spec, 0.55);
    ctx.stroke();
    ctx.restore();
    // Cross brace on large square plates.
    if (geo.shape === 'rect' && geo.inradius > 28) {
      const k = inset * 1.6;
      ctx.beginPath();
      ctx.moveTo(-hw + k, -hh + k);
      ctx.lineTo(hw - k, hh - k);
      ctx.moveTo(hw - k, -hh + k);
      ctx.lineTo(-hw + k, hh - k);
      ctx.lineWidth = clamp(geo.inradius * 0.14, 4, 9);
      ctx.strokeStyle = rgba(t.dark, 0.32);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(t.spec, 0.4);
      ctx.stroke();
    }
    const r = clamp(geo.inradius * 0.11, 2.6, 5);
    const corners = insetPolygon(geo.pts, inset * (geo.shape === 'rect' ? 1 : 1.4) + r * 0.2);
    for (let i = 0; i < corners.length; i += 2) rivets.push({ x: corners[i] as number, y: corners[i + 1] as number, r, pops: 4 });
  }
  return rivets;
}

/** Fine brushing lines along the long axis. */
function brushed(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: MetalTones, rng: Rng): void {
  const vertical = geo.h > geo.w * 1.6;
  const L = vertical ? geo.h : geo.w;
  const T = vertical ? geo.w : geo.h;
  ctx.save();
  if (vertical) ctx.rotate(Math.PI / 2);
  const light = new Path2D();
  const dark = new Path2D();
  const lines = clamp(Math.round(T / 3.5), 4, 24);
  for (let i = 0; i < lines; i++) {
    const y = rng.range(-0.5, 0.5) * T;
    const x0 = rng.range(-0.6, 0.2) * L;
    const x1 = x0 + rng.range(0.3, 0.8) * L;
    const p = i % 2 === 0 ? light : dark;
    p.moveTo(x0, y);
    p.lineTo(x1, y + rng.range(-0.6, 0.6));
  }
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = rgba(t.spec, 0.32);
  ctx.stroke(light);
  ctx.strokeStyle = rgba(t.deep, 0.2);
  ctx.stroke(dark);
  ctx.restore();
}

function paintBall(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: MetalTones, rng: Rng): Rivet[] {
  const R = geo.radius;
  const g = ctx.createRadialGradient(-R * 0.38, -R * 0.42, R * 0.04, -R * 0.1, -R * 0.1, R * 1.15);
  g.addColorStop(0, t.spec);
  g.addColorStop(0.22, t.light);
  g.addColorStop(0.6, t.base);
  g.addColorStop(1, t.deep);
  ctx.fillStyle = g;
  ctx.fillRect(-R - 2, -R - 2, R * 2 + 4, R * 2 + 4);
  // Reflected ground light on the lower rim.
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.86, 0.15 * Math.PI, 0.7 * Math.PI);
  ctx.lineWidth = R * 0.1;
  ctx.strokeStyle = rgba(t.light, 0.45);
  ctx.stroke();
  // Welded seam with rivets around the equator, tilted with the seed.
  const tilt = rng.range(-0.5, 0.5);
  ctx.save();
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.ellipse(0, 0, R, R * 0.3, 0, 0, Math.PI);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = rgba(t.deep, 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 1.8, R, R * 0.3, 0, 0, Math.PI);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = rgba(t.spec, 0.5);
  ctx.stroke();
  ctx.restore();
  const rivets: Rivet[] = [];
  const r = clamp(R * 0.07, 2.4, 4.4);
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    const x = Math.cos(a) * R * 0.86;
    const y = Math.sin(a) * R * 0.26;
    rivets.push({ x: x * Math.cos(tilt) - y * Math.sin(tilt), y: x * Math.sin(tilt) + y * Math.cos(tilt), r: r * (0.75 + 0.25 * Math.sin(a)), pops: 4 });
  }
  // Crisp specular.
  ctx.beginPath();
  ctx.ellipse(-R * 0.38, -R * 0.44, R * 0.16, R * 0.09, -0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fill();
  return rivets;
}

function paintRivet(ctx: CanvasRenderingContext2D, r: Rivet, popped: boolean, t: MetalTones): void {
  if (popped) {
    // An empty, rust-rimmed hole.
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r * 0.9, 0, TAU);
    ctx.fillStyle = rgba(t.rust, 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r * 0.62, 0, TAU);
    ctx.fillStyle = '#20252b';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r * 0.62, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = rgba(t.spec, 0.7);
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.arc(r.x + r.r * 0.25, r.y + r.r * 0.3, r.r * 1.05, 0, TAU);
  ctx.fillStyle = rgba(t.deep, 0.55);
  ctx.fill();
  const g = ctx.createRadialGradient(r.x - r.r * 0.35, r.y - r.r * 0.35, 0, r.x, r.y, r.r);
  g.addColorStop(0, t.spec);
  g.addColorStop(0.55, t.rivet);
  g.addColorStop(1, t.dark);
  ctx.beginPath();
  ctx.arc(r.x, r.y, r.r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = rgba(t.deep, 0.8);
  ctx.stroke();
}

/** Scratches, worn edges, smudges and a little rust. */
function wear(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: MetalTones, rng: Rng): void {
  const count = clamp(Math.round(geo.perimeter / 70), 2, 8);
  const scratches = new Path2D();
  for (let i = 0; i < count; i++) {
    const [x, y] = randomInside(geo, rng, 3);
    const a = rng.range(-0.6, 0.6) + (rng.next() < 0.5 ? 0 : Math.PI / 2) * (geo.h > geo.w ? 1 : 0);
    const len = clamp(geo.inradius * rng.range(0.5, 1.4), 5, 30);
    scratches.moveTo(x, y);
    scratches.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + rng.range(-2, 2), y + Math.sin(a) * len * 0.5 + rng.range(-2, 2), x + Math.cos(a) * len, y + Math.sin(a) * len);
  }
  ctx.save();
  ctx.translate(0.7, 0.8);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = rgba(t.deep, 0.35);
  ctx.stroke(scratches);
  ctx.restore();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = rgba(t.spec, 0.6);
  ctx.stroke(scratches);

  // Rust blooms out of a seam or two.
  const rust = rng.next() < 0.7 ? 1 + Math.floor(rng.next() * 2) : 0;
  for (let i = 0; i < rust; i++) {
    const f = perimeterPoint(geo, rng.next());
    const x = f.x + f.nx * 4;
    const y = f.y + f.ny * 4;
    const r = clamp(geo.inradius * 0.4, 4, 12);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(t.rust, 0.42));
    g.addColorStop(1, rgba(t.rust, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- damage

/** Dents: a shadowed upper-left wall and a lit lower-right wall, with a dark crease. */
function dents(ctx: CanvasRenderingContext2D, geo: BlockGeo, stage: DamageStage, t: MetalTones, rng: Rng): void {
  const all = 6;
  const visible = stage === 1 ? 2 : stage === 2 ? 4 : all;
  for (let i = 0; i < all; i++) {
    const [x, y] = randomInside(geo, rng, Math.min(geo.inradius * 0.4, 8));
    const rx = clamp(geo.inradius * rng.range(0.4, 0.65), 4, 20);
    const ry = rx * rng.range(0.6, 0.9);
    const a = rng.range(-0.5, 0.5) + (geo.h > geo.w ? Math.PI / 2 : 0);
    if (i >= visible) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(1, ry / rx);
    ctx.rotate(-a);
    // A pressed hollow: soft shading inside, then crisp crescents - the near (upper-left) wall in
    // shadow, the far wall catching the light.
    const g = ctx.createRadialGradient(-rx * 0.2, -rx * 0.2, rx * 0.1, 0, 0, rx);
    g.addColorStop(0, rgba(t.dark, 0.3));
    g.addColorStop(1, rgba(t.dark, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    const k = rx * 0.32;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.arc(k, k, rx, 0, TAU);
    ctx.fillStyle = rgba(t.deep, 0.6);
    ctx.fill('evenodd');
    ctx.beginPath();
    ctx.arc(0, 0, rx * 0.92, 0, TAU);
    ctx.arc(-k * 0.6, -k * 0.6, rx * 0.92, 0, TAU);
    ctx.fillStyle = rgba(t.spec, 0.55);
    ctx.fill('evenodd');
    ctx.restore();
  }
}

/** The last stage tears a jagged gash with bent-back lips. */
function tear(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: MetalTones, rng: Rng): void {
  const f = perimeterPoint(geo, rng.next());
  const heading = Math.atan2(f.ny, f.nx) + rng.range(-0.4, 0.4);
  const pts = walkCrack(geo, f.x, f.y, heading, clamp(geo.inradius * 1.4, 14, 60), clamp(geo.inradius * 0.3, 3.5, 8), 0.2, 0.5, rng);
  const width = clamp(geo.inradius * 0.3, 3.5, 8);
  const lips = new Path2D();
  addTapered(lips, pts, pts.length / 2, width * 1.9);
  ctx.fillStyle = rgba(t.spec, 0.7);
  ctx.fill(lips);
  const gash = new Path2D();
  addTapered(gash, pts, pts.length / 2, width);
  ctx.fillStyle = '#1d2228';
  ctx.fill(gash);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = INK;
  ctx.stroke(gash);
}

/** Bent, crumpled edges: shallow notches with soft shoulders. */
function bends(geo: BlockGeo, rng: Rng): Chip[] {
  const chips: Chip[] = [];
  const count = clamp(Math.round(geo.perimeter / 200) + 1, 2, 4);
  for (let i = 0; i < count; i++) {
    const f = perimeterPoint(geo, (i + rng.range(0.2, 0.8)) / count);
    const a = clamp(geo.perimeter * 0.03, 8, 22);
    const d = clamp(geo.inradius * 0.3, 3, 8);
    const pts = [f.x - f.tx * a - f.nx * 3, f.y - f.ty * a - f.ny * 3];
    for (let k = 0; k <= 6; k++) {
      const s = k / 6;
      const bump = Math.sin(s * Math.PI) * d * (0.85 + 0.3 * Math.sin(s * 9 + i));
      pts.push(f.x + f.tx * a * (s * 2 - 1) + f.nx * bump, f.y + f.ty * a * (s * 2 - 1) + f.ny * bump);
    }
    pts.push(f.x + f.tx * a - f.nx * 3, f.y + f.ty * a - f.ny * 3);
    chips.push({ pts, ax: f.x, ay: f.y, born: i === 0 ? 2 : 3 });
  }
  return chips;
}

