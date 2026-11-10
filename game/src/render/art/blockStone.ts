/**
 * Stone: heavy hewn blocks with knocked-off corners, chiselled bevels, mottled and speckled faces,
 * faint strata and hairline cracks. Damage fractures from an impact point, then chunks break away.
 */
import { clamp, Rng, TAU } from '../../core/math';
import { INK } from '../../core/palette';
import {
  addPoly,
  blobPath,
  boxGradient,
  carveChips,
  edgeChips,
  hewnPolygon,
  mixSeed,
  paintBevel,
  paintCracks,
  polyGeo,
  randomInside,
  rgba,
  walkCrack,
  type BlockGeo,
  type Crack,
} from './materialUtil';
import type { DamageStage } from './types';

interface StoneTones {
  light: string;
  base: string;
  dark: string;
  mottle: string;
  speck: string;
  bevelLight: string;
  bevelDark: string;
  crack: string;
  lip: string;
  fresh: string;
}

const TONES: readonly StoneTones[] = [
  // Neutral-to-warm granite greys: steel is the cool blue material.
  { light: '#d8d8d4', base: '#a3a39e', dark: '#71706b', mottle: '#8b8a84', speck: '#5a5954', bevelLight: '#f3f2ee', bevelDark: '#52514c', crack: '#302f2b', lip: '#e6e5e0', fresh: '#d6d3cb' },
  { light: '#dbd6ce', base: '#a8a197', dark: '#766f66', mottle: '#8f887e', speck: '#5e574e', bevelLight: '#f5f1ea', bevelDark: '#565046', crack: '#33302a', lip: '#e9e4db', fresh: '#d9d1c4' },
  { light: '#d4d6d6', base: '#9fa2a2', dark: '#6d7070', mottle: '#878a8a', speck: '#575a5a', bevelLight: '#f0f2f1', bevelDark: '#4f5252', crack: '#2e3131', lip: '#e2e4e3', fresh: '#d0d2d0' },
  { light: '#d9d5cf', base: '#a5a099', dark: '#736e68', mottle: '#8d8881', speck: '#5c5751', bevelLight: '#f4f0eb', bevelDark: '#544f49', crack: '#312e2a', lip: '#e7e3dd', fresh: '#d7d0c6' },
];

const OUTLINE = 5.5;

export function paintStone(ctx: CanvasRenderingContext2D, geo: BlockGeo, stage: DamageStage, seed: number): void {
  const t = TONES[(seed - 1) & 3] as StoneTones;
  const salt = Math.round(geo.w * 11 + geo.h * 17);
  const rng = new Rng(mixSeed(seed, salt));
  const hewn = hewnPolygon(geo, rng);
  const shape = polyGeo(geo, hewn);
  const outline = new Path2D();
  addPoly(outline, hewn);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.clip(outline);
  ctx.fillStyle = boxGradient(ctx, geo.w, geo.h, [
    [0, t.light],
    [0.45, t.base],
    [1, t.dark],
  ]);
  ctx.fillRect(-geo.w / 2 - 2, -geo.h / 2 - 2, geo.w + 4, geo.h + 4);
  if (geo.shape === 'circle') boulderShading(ctx, geo, t);
  facets(ctx, geo, t, rng);
  mottle(ctx, geo, t, rng);
  strata(ctx, geo, t, rng);
  speckle(ctx, geo, t, rng);
  paintBevel(ctx, shape, clamp(geo.inradius * 0.4, 4, 8), t.bevelLight, t.bevelDark, rng, 1.6);
  hairlines(ctx, geo, t, rng);
  if (stage > 0) {
    const damageRng = new Rng(mixSeed(seed, salt + 101));
    paintCracks(ctx, stoneCracks(geo, damageRng), stage, t.crack, t.lip, 1.4);
    if (stage === 3) grime(ctx, geo, damageRng);
  }
  ctx.restore();

  ctx.lineWidth = OUTLINE;
  ctx.strokeStyle = INK;
  ctx.stroke(outline);
  if (stage >= 2) {
    const chips = edgeChips(shape, new Rng(mixSeed(seed, salt + 202)));
    if (geo.shape !== 'circle' && chips.length > 0) {
      // Stone loses whole corners: deepen one chip at the last stage.
      const big = chips[chips.length - 1]!;
      big.born = 3;
      big.pts = big.pts.map((v, i) => (i % 2 === 0 ? big.ax : big.ay) + (v - (i % 2 === 0 ? big.ax : big.ay)) * 1.45);
    }
    carveChips(ctx, outline, chips, stage, t.fresh, 1.35, INK, 4);
  }
  ctx.restore();
}

/** Rounded light and shadow on boulders. */
function boulderShading(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: StoneTones): void {
  const R = geo.radius;
  const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.05);
  g.addColorStop(0, rgba(t.light, 0.9));
  g.addColorStop(0.55, rgba(t.base, 0));
  g.addColorStop(1, rgba(t.dark, 0.6));
  ctx.fillStyle = g;
  ctx.fillRect(-R, -R, R * 2, R * 2);
}

/** Broad planes of the hewn face, catching the light at slightly different angles. */
function facets(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: StoneTones, rng: Rng): void {
  const hw = geo.w / 2;
  const hh = geo.h / 2;
  const count = geo.inradius > 25 ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const [x, y] = randomInside(geo, rng, 0);
    const a = rng.range(0, TAU);
    const r = Math.max(hw, hh) * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(a + rng.range(0.6, 1.1)) * r, y + Math.sin(a + rng.range(0.6, 1.1)) * r);
    ctx.closePath();
    ctx.fillStyle = rgba(i % 2 === 0 ? t.light : t.dark, 0.13);
    ctx.fill();
  }
}

function mottle(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: StoneTones, rng: Rng): void {
  const count = clamp(Math.round((geo.w * geo.h) / 900), 4, 14);
  const dark = new Path2D();
  const light = new Path2D();
  for (let i = 0; i < count; i++) {
    const [x, y] = randomInside(geo, rng, -4);
    const r = clamp(geo.inradius * rng.range(0.5, 1.2), 5, 34);
    blobPath(i % 2 === 0 ? dark : light, x, y, r * rng.range(1, 1.8), r, 7, 0.45, rng);
  }
  ctx.fillStyle = rgba(t.mottle, 0.22);
  ctx.fill(dark);
  ctx.fillStyle = rgba(t.light, 0.2);
  ctx.fill(light);
}

/** Faint sedimentary layers on long slabs and big blocks. */
function strata(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: StoneTones, rng: Rng): void {
  if (geo.shape === 'circle') return;
  const vertical = geo.h > geo.w * 1.6;
  const L = vertical ? geo.h : geo.w;
  const T = vertical ? geo.w : geo.h;
  const lines = T > 50 ? 3 : 1;
  ctx.save();
  if (vertical) ctx.rotate(Math.PI / 2);
  ctx.beginPath();
  for (let i = 0; i < lines; i++) {
    const y0 = rng.range(-0.3, 0.3) * T;
    const tilt = rng.range(-0.06, 0.06);
    ctx.moveTo(-L / 2, y0 - (tilt * L) / 2);
    for (let x = -L / 2; x <= L / 2; x += 12) ctx.lineTo(x, y0 + tilt * x + rng.range(-0.8, 0.8));
  }
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(t.dark, 0.3);
  ctx.stroke();
  ctx.restore();
}

function speckle(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: StoneTones, rng: Rng): void {
  const count = clamp(Math.round((geo.w * geo.h) / 160), 8, 70);
  const dark = new Path2D();
  const light = new Path2D();
  for (let i = 0; i < count; i++) {
    const [x, y] = randomInside(geo, rng, 2);
    const r = rng.range(0.7, 1.7);
    const path = i % 3 === 0 ? light : dark;
    path.moveTo(x + r, y);
    path.arc(x, y, r, 0, TAU);
  }
  ctx.fillStyle = rgba(t.speck, 0.45);
  ctx.fill(dark);
  ctx.fillStyle = rgba(t.bevelLight, 0.55);
  ctx.fill(light);
}

/** One or two fine cracks every old stone has. */
function hairlines(ctx: CanvasRenderingContext2D, geo: BlockGeo, t: StoneTones, rng: Rng): void {
  const n = geo.inradius > 20 ? 2 : 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const [x, y] = randomInside(geo, rng, 4);
    const pts = walkCrack(geo, x, y, rng.range(0, TAU), clamp(geo.inradius * 1.2, 10, 40), 5, 0.4, 0.5, rng);
    ctx.moveTo(pts[0] as number, pts[1] as number);
    for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k] as number, pts[k + 1] as number);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(t.crack, 0.4);
  ctx.stroke();
}

/** Fractures radiating from an impact point, branching as the damage grows. */
function stoneCracks(geo: BlockGeo, rng: Rng): Crack[] {
  const cracks: Crack[] = [];
  const [px, py] = randomInside(geo, rng, Math.min(geo.inradius * 0.5, 14));
  const reach = Math.max(geo.w, geo.h) * 0.7;
  const width = clamp(geo.inradius * 0.16, 2.6, 5.5);
  const main = 4;
  const turn = rng.range(0, TAU);
  for (let i = 0; i < main; i++) {
    const heading = turn + (i / main) * TAU + rng.range(-0.4, 0.4);
    const pts = walkCrack(geo, px, py, heading, reach, clamp(geo.inradius * 0.3, 4, 9), 0.25, 0.45, rng);
    const crack: Crack = { pts, born: i < 2 ? 1 : i === 2 ? 2 : 3, width: width * (i < 2 ? 1 : 0.85) };
    cracks.push(crack);
    const nodes = pts.length / 2;
    if (nodes >= 4) {
      const at = Math.floor(nodes * rng.range(0.3, 0.55));
      const bx = pts[at * 2] as number;
      const by = pts[at * 2 + 1] as number;
      const branch = walkCrack(geo, bx, by, heading + (rng.next() < 0.5 ? 0.8 : -0.8), reach * 0.45, 5, 0.3, 0.45, rng);
      cracks.push({ pts: branch, born: Math.min(3, crack.born + 1), width: width * 0.6, parent: crack, at });
    }
  }
  return cracks;
}

/** Dust settles into the battered face. */
function grime(ctx: CanvasRenderingContext2D, geo: BlockGeo, rng: Rng): void {
  const path = new Path2D();
  for (let i = 0; i < 3; i++) {
    const [x, y] = randomInside(geo, rng, 0);
    const r = clamp(geo.inradius * rng.range(0.6, 1), 6, 30);
    blobPath(path, x, y, r * 1.5, r, 7, 0.4, rng);
  }
  ctx.fillStyle = 'rgba(40, 36, 32, 0.14)';
  ctx.fill(path);
}
