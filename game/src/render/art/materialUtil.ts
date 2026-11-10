/**
 * Helpers shared by the block and prop artwork: seeding, silhouette geometry, hand-drawn
 * outlines, cel-shaded bevels and the crack / chip generators behind the damage stages.
 */
import { clamp, Rng, TAU } from '../../core/math';
import type { BlockShape } from '../../core/types';
import type { BlockSpec } from './types';

/** Flat coordinate list: x0, y0, x1, y1 ... */
export type Pts = number[];

/** Unit vector pointing at the key light (top-left) in canvas space. */
export const LIGHT_X = -0.6;
export const LIGHT_Y = -0.8;

/** Spacing of the wobble samples along a hand-drawn outline. */
const OUTLINE_STEP = 17;
/** Corners are eased over at most this distance along each edge ... */
const CORNER_TRIM = 3.6;
/** ... and never pull the silhouette back from the true vertex by more than this. */
const CORNER_CUT = 1.5;
/** Spacing of the dents along the hewn inner edge of a chiselled bevel. */
const CHISEL_STEP = 15;

// ---------------------------------------------------------------- seeding

/** Derives an independent, well-mixed 32-bit seed from a seed and a salt. */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed | 0) ^ Math.imul(salt + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---------------------------------------------------------------- silhouette geometry

export interface BlockGeo {
  shape: BlockShape;
  w: number;
  h: number;
  /** Convex silhouette, clockwise on screen (y down). Empty for circles. */
  pts: Pts;
  /** Circle radius; 0 for polygons. */
  radius: number;
  /** Radius of the largest inscribed circle: the yardstick for bevels, chips and cracks. */
  inradius: number;
  perimeter: number;
  /** Centroid. */
  cx: number;
  cy: number;
}

/** The exact physics silhouette of a block, centred on the origin. */
export function blockGeo(spec: Pick<BlockSpec, 'shape' | 'w' | 'h' | 'flip'>): BlockGeo {
  const hw = spec.w / 2;
  if (spec.shape === 'circle') {
    return { shape: 'circle', w: spec.w, h: spec.w, pts: [], radius: hw, inradius: hw, perimeter: TAU * hw, cx: 0, cy: 0 };
  }
  const hh = spec.h / 2;
  if (spec.shape === 'rect') {
    const pts = [-hw, -hh, hw, -hh, hw, hh, -hw, hh];
    return { shape: 'rect', w: spec.w, h: spec.h, pts, radius: 0, inradius: Math.min(hw, hh), perimeter: (spec.w + spec.h) * 2, cx: 0, cy: 0 };
  }
  const top = spec.shape === 'tri' ? 0 : spec.flip ? hw : -hw;
  const perimeter = Math.hypot(hw - top, spec.h) + spec.w + Math.hypot(hw + top, spec.h);
  return {
    shape: spec.shape,
    w: spec.w,
    h: spec.h,
    pts: [top, -hh, hw, hh, -hw, hh],
    radius: 0,
    inradius: (spec.w * spec.h) / perimeter,
    perimeter,
    cx: top / 3,
    cy: hh / 3,
  };
}

export interface EdgeFrame {
  /** Start of the edge (or the sampled point). */
  x: number;
  y: number;
  /** Unit tangent, clockwise around the silhouette. */
  tx: number;
  ty: number;
  /** Unit normal pointing into the shape. */
  nx: number;
  ny: number;
  len: number;
}

export function edgeFrame(pts: Pts, i: number): EdgeFrame {
  const j = (i + 1) % (pts.length / 2);
  const x = pts[i * 2];
  const y = pts[i * 2 + 1];
  const dx = pts[j * 2] - x;
  const dy = pts[j * 2 + 1] - y;
  const len = Math.hypot(dx, dy);
  return { x, y, tx: dx / len, ty: dy / len, nx: -dy / len, ny: dx / len, len };
}

/** How directly polygon edge `i` faces the key light: 1 = fully lit, -1 = fully in shade. */
export function edgeLight(pts: Pts, i: number): number {
  const f = edgeFrame(pts, i);
  return -(f.nx * LIGHT_X + f.ny * LIGHT_Y);
}

/** True when the point lies at least `margin` inside the silhouette (negative margins reach outside). */
export function insideGeo(geo: BlockGeo, x: number, y: number, margin = 0): boolean {
  if (geo.shape === 'circle') return Math.hypot(x, y) <= geo.radius - margin;
  const pts = geo.pts;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j * 2] - pts[i * 2];
    const dy = pts[j * 2 + 1] - pts[i * 2 + 1];
    if (((y - pts[i * 2 + 1]) * dx - (x - pts[i * 2]) * dy) / Math.hypot(dx, dy) < margin) return false;
  }
  return true;
}

/** Random point at least `margin` inside the silhouette (the centroid when the shape is too thin). */
export function randomInside(geo: BlockGeo, rng: Rng, margin: number): [number, number] {
  for (let tries = 0; tries < 10; tries++) {
    const x = rng.range(-0.5, 0.5) * geo.w;
    const y = rng.range(-0.5, 0.5) * geo.h;
    if (insideGeo(geo, x, y, margin)) return [x, y];
  }
  return [geo.cx, geo.cy];
}

/** Point at fraction `t` of the perimeter (clockwise) with its tangent and inward normal. */
export function perimeterPoint(geo: BlockGeo, t: number): EdgeFrame {
  const turn = t - Math.floor(t);
  if (geo.shape === 'circle') {
    const cos = Math.cos(turn * TAU);
    const sin = Math.sin(turn * TAU);
    return { x: cos * geo.radius, y: sin * geo.radius, tx: -sin, ty: cos, nx: -cos, ny: -sin, len: 0 };
  }
  const n = geo.pts.length / 2;
  let d = turn * geo.perimeter;
  for (let i = 0; ; i++) {
    const f = edgeFrame(geo.pts, i);
    if (d <= f.len || i === n - 1) {
      f.x += f.tx * d;
      f.y += f.ty * d;
      return f;
    }
    d -= f.len;
  }
}

// ---------------------------------------------------------------- outlines and blobs

/**
 * Adds a closed smooth blob: an ellipse whose radius is pulled INWARDS by up to `dent` (0..1)
 * at `n` control points, so it never exceeds the ellipse.
 */
export function blobPath(path: CanvasPath, cx: number, cy: number, rx: number, ry: number, n: number, dent: number, rng: Rng): void {
  // Quadratic segments through the midpoints of the control polygon fall short of it; grow it to compensate.
  const cos = Math.cos(Math.PI / n);
  const grow = 1 / (0.5 + 0.5 * cos * cos);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = (1 - dent * rng.next()) * grow;
    xs.push(cx + Math.cos(a) * rx * k);
    ys.push(cy + Math.sin(a) * ry * k);
  }
  path.moveTo((xs[n - 1] + xs[0]) / 2, (ys[n - 1] + ys[0]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    path.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[j]) / 2, (ys[i] + ys[j]) / 2);
  }
  path.closePath();
}

/** Number of control points that keeps a wobbly circle of this radius round. */
export function circleSteps(radius: number): number {
  return Math.max(12, Math.round((TAU * radius) / OUTLINE_STEP));
}

/**
 * Closed hand-drawn outline of the physics silhouette. Corners are eased a little and the line
 * wobbles INWARDS only, so the paint never leaves the collision shape.
 */
export function outlinePath(geo: BlockGeo, rng: Rng, wobble: number): Path2D {
  const path = new Path2D();
  if (geo.shape === 'circle') {
    blobPath(path, 0, 0, geo.radius, geo.radius, circleSteps(geo.radius), wobble / geo.radius, rng);
    return path;
  }
  const n = geo.pts.length / 2;
  const frames: EdgeFrame[] = [];
  for (let i = 0; i < n; i++) frames.push(edgeFrame(geo.pts, i));
  const trims = frames.map((next, i) => {
    const prev = frames[(i + n - 1) % n];
    const halfAngle = Math.acos(clamp(-(prev.tx * next.tx + prev.ty * next.ty), -1, 1)) / 2;
    return Math.min(CORNER_TRIM, (2 * CORNER_CUT) / Math.cos(halfAngle), Math.min(prev.len, next.len) * 0.22);
  });
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    const j = (i + 1) % n;
    const run = f.len - trims[i] - trims[j];
    const sx = f.x + f.tx * trims[i];
    const sy = f.y + f.ty * trims[i];
    if (i === 0) path.moveTo(sx, sy);
    const steps = Math.round(run / OUTLINE_STEP);
    let px = 0;
    let py = 0;
    for (let k = 1; k < steps; k++) {
      const along = (run * k) / steps;
      const pull = wobble * rng.next();
      const qx = sx + f.tx * along + f.nx * pull;
      const qy = sy + f.ty * along + f.ny * pull;
      if (k > 1) path.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
      px = qx;
      py = qy;
    }
    const ex = sx + f.tx * run;
    const ey = sy + f.ty * run;
    if (steps > 1) path.quadraticCurveTo(px, py, ex, ey);
    else path.lineTo(ex, ey);
    const next = frames[j];
    path.quadraticCurveTo(next.x, next.y, next.x + next.tx * trims[j], next.y + next.ty * trims[j]);
  }
  path.closePath();
  return path;
}

// ---------------------------------------------------------------- bevels

/** Offsets a clockwise convex polygon inwards by `d` (mitred corners). */
export function insetPolygon(pts: Pts, d: number): Pts {
  const n = pts.length / 2;
  const out: Pts = [];
  for (let i = 0; i < n; i++) {
    const a = edgeFrame(pts, (i + n - 1) % n);
    const b = edgeFrame(pts, i);
    const k = d / (1 + a.nx * b.nx + a.ny * b.ny);
    out.push(b.x + (a.nx + b.nx) * k, b.y + (a.ny + b.ny) * k);
  }
  return out;
}

/**
 * Adds the strip between polygon edge `i` and the matching edge of the inset polygon.
 * With `jag` the inner edge is hewn unevenly (chiselled stone).
 */
export function edgeStrip(path: CanvasPath, pts: Pts, inner: Pts, i: number, rng?: Rng, jag = 0): void {
  const j = (i + 1) % (pts.length / 2);
  const ax = inner[j * 2];
  const ay = inner[j * 2 + 1];
  const bx = inner[i * 2];
  const by = inner[i * 2 + 1];
  path.moveTo(pts[i * 2], pts[i * 2 + 1]);
  path.lineTo(pts[j * 2], pts[j * 2 + 1]);
  path.lineTo(ax, ay);
  if (rng && jag > 0) {
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.round(len / CHISEL_STEP);
    for (let k = 1; k < steps; k++) {
      const t = (k + rng.range(-0.3, 0.3)) / steps;
      const off = rng.range(-jag, jag);
      path.lineTo(ax + (bx - ax) * t - ((by - ay) / len) * off, ay + (by - ay) * t + ((bx - ax) / len) * off);
    }
  }
  path.lineTo(bx, by);
  path.closePath();
}

/**
 * Cel-shaded bevel inside the silhouette: light along the edges that face the key light, dark
 * along the others. Must be called with the block clip active (circles rely on it).
 */
export function paintBevel(
  ctx: CanvasRenderingContext2D,
  geo: BlockGeo,
  width: number,
  light: string,
  dark: string,
  rng?: Rng,
  jag = 0,
): void {
  if (geo.shape === 'circle') {
    // A crescent is what remains of the disc after a copy shifted away from / towards the light.
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.arc(0, 0, geo.radius + 1, 0, TAU);
      ctx.arc(-LIGHT_X * width * side, -LIGHT_Y * width * side, geo.radius + 1, 0, TAU);
      ctx.fillStyle = side > 0 ? light : dark;
      ctx.fill('evenodd');
    }
    return;
  }
  const inner = insetPolygon(geo.pts, Math.min(width, geo.inradius * 0.5));
  const alpha = ctx.globalAlpha;
  for (let i = 0; i < geo.pts.length / 2; i++) {
    const lit = edgeLight(geo.pts, i);
    ctx.beginPath();
    edgeStrip(ctx, geo.pts, inner, i, rng, jag);
    ctx.globalAlpha = alpha * (0.4 + 0.6 * Math.abs(lit));
    ctx.fillStyle = lit > 0 ? light : dark;
    ctx.fill();
  }
  ctx.globalAlpha = alpha;
}

// ---------------------------------------------------------------- cracks

export interface Crack {
  /** Polyline from the root to the tip at full growth. */
  pts: Pts;
  /** First damage stage that shows the crack. */
  born: number;
  /** Width at the root when fully grown. */
  width: number;
  /** Branches only show once their parent has grown past node `at`. */
  parent?: Crack;
  at?: number;
}

/** Share of its length / width a crack has reached 0, 1 and 2 stages after it first appeared. */
const GROWTH = [0.45, 0.75, 1];
const THICKEN = [0.64, 0.82, 1];
/** Cracks keep most of their width along the first half and then run out into a point. */
const TAPER_POWER = 1.7;

/** Number of polyline nodes of a crack that show at a damage stage (0 = hidden). */
export function visibleNodes(crack: Crack, stage: number): number {
  const age = stage - crack.born;
  if (age < 0 || age >= GROWTH.length) return 0;
  if (crack.parent && visibleNodes(crack.parent, stage) <= (crack.at ?? 0)) return 0;
  return Math.max(2, Math.ceil((crack.pts.length / 2) * GROWTH[age]));
}

export function crackWidth(crack: Crack, stage: number): number {
  return crack.width * THICKEN[clamp(stage - crack.born, 0, THICKEN.length - 1)];
}

/** Spreads `total` cracks evenly over the three damage stages. */
export function bornStage(index: number, total: number): number {
  return 1 + Math.floor((index * 3) / total);
}

/**
 * Walks a jagged polyline from (x, y) along `heading` until it is `length` long or has left the
 * silhouette. `wander` drifts the heading, `zig` makes consecutive segments alternate sides.
 */
export function walkCrack(
  geo: BlockGeo,
  x: number,
  y: number,
  heading: number,
  length: number,
  step: number,
  wander: number,
  zig: number,
  rng: Rng,
): Pts {
  const pts: Pts = [x, y];
  let side = rng.next() < 0.5 ? -1 : 1;
  for (let run = 0; run < length; run += step) {
    heading += rng.range(-wander, wander);
    const a = heading + side * zig * rng.range(0.4, 1);
    side = -side;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push(x, y);
    // One node past the edge, so a grown crack visibly reaches the outline.
    if (!insideGeo(geo, x, y, -1)) break;
  }
  return pts;
}

/** Adds the first `count` nodes of a polyline, shifted by (ox, oy). */
export function addPolyline(path: CanvasPath, pts: Pts, count: number, ox = 0, oy = 0): void {
  path.moveTo(pts[0] + ox, pts[1] + oy);
  for (let i = 1; i < count; i++) path.lineTo(pts[i * 2] + ox, pts[i * 2 + 1] + oy);
}

/** Adds a crack as a filled sliver: `width` wide at its root, running out into a point at node `count - 1`. */
export function addTapered(path: CanvasPath, pts: Pts, count: number, width: number): void {
  const last = count - 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < last; k++) {
      const i = pass === 0 ? k : last - 1 - k;
      const before = Math.max(0, i - 1);
      const dx = pts[(i + 1) * 2] - pts[before * 2];
      const dy = pts[(i + 1) * 2 + 1] - pts[before * 2 + 1];
      const half = ((pass === 0 ? 0.5 : -0.5) * width * (1 - Math.pow(i / last, TAPER_POWER))) / (Math.hypot(dx, dy) || 1);
      if (pass === 0 && k === 0) path.moveTo(pts[0] - dy * half, pts[1] + dx * half);
      else path.lineTo(pts[i * 2] - dy * half, pts[i * 2 + 1] + dx * half);
    }
    if (pass === 0) path.lineTo(pts[last * 2], pts[last * 2 + 1]);
  }
  path.closePath();
}

/** Point at fractional node index `p` of a polyline (p must stay below its last node). */
export function nodeAt(pts: Pts, p: number): [number, number] {
  const i = Math.floor(p);
  const t = p - i;
  return [pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * t, pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * t];
}

// ---------------------------------------------------------------- chips and scuffs

export interface Chip {
  /** Notch polygon; it starts and ends just outside the silhouette. */
  pts: Pts;
  /** Point on the silhouette edge the notch is centred on. */
  ax: number;
  ay: number;
  born: number;
}

/** Notches bitten out of the edges at stages 2 and 3 (drawn inside the silhouette, so the physics shape still matches). */
export function edgeChips(geo: BlockGeo, rng: Rng): Chip[] {
  const count = clamp(Math.round(geo.perimeter / 170) + 1, 2, 5);
  const depth = clamp(geo.inradius * 0.26, 3.5, 9);
  const offset = rng.next();
  const chips: Chip[] = [];
  for (let i = 0; i < count; i++) {
    const f = perimeterPoint(geo, offset + (i + rng.range(0.15, 0.85)) / count);
    const d = depth * rng.range(0.75, 1.15);
    const a = d * rng.range(0.9, 1.4);
    const deep = d * rng.range(0.6, 1);
    chips.push({
      pts: [
        f.x - f.tx * a - f.nx * 4,
        f.y - f.ty * a - f.ny * 4,
        f.x - f.tx * a,
        f.y - f.ty * a,
        f.x - f.tx * a * 0.3 + f.nx * deep,
        f.y - f.ty * a * 0.3 + f.ny * deep,
        f.x + f.tx * a * 0.35 + f.nx * d,
        f.y + f.ty * a * 0.35 + f.ny * d,
        f.x + f.tx * a,
        f.y + f.ty * a,
        f.x + f.tx * a - f.nx * 4,
        f.y + f.ty * a - f.ny * 4,
      ],
      ax: f.x,
      ay: f.y,
      // Alternate so that the first chips do not sit next to each other.
      born: i % 2 === 0 && i < count - 1 ? 2 : 3,
    });
  }
  return chips;
}

/** Adds a chip polygon, optionally scaled about its anchor (the pale chipped rim around a notch). */
export function addChip(path: CanvasPath, chip: Chip, scale = 1): void {
  const pts = chip.pts;
  for (let i = 0; i < pts.length; i += 2) {
    const x = chip.ax + (pts[i] - chip.ax) * scale;
    const y = chip.ay + (pts[i + 1] - chip.ay) * scale;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
}

/** Adds a few scuffed patches for the last damage stage. */
export function addScuffs(path: CanvasPath, geo: BlockGeo, rng: Rng): void {
  const count = clamp(Math.round(geo.perimeter / 140), 2, 5);
  for (let i = 0; i < count; i++) {
    const [x, y] = randomInside(geo, rng, 0);
    const r = clamp(geo.inradius * rng.range(0.5, 0.9), 6, 28);
    blobPath(path, x, y, r * rng.range(1, 1.7), r, 7, 0.4, rng);
  }
}

// ---------------------------------------------------------------- colour, gradients, carving

function hexChannels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes two #rrggbb colours (t = 0 gives `a`). */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexChannels(a);
  const cb = hexChannels(b);
  const out = ca.map((v, i) => Math.round(v + ((cb[i] as number) - v) * t));
  return `#${out.map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

/** #rrggbb + alpha -> rgba(). */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexChannels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Linear gradient across a w x h box that runs from the lit top-left to the shaded bottom-right
 * but follows the short axis of long thin pieces (a plank is shaded across its thickness).
 */
export function boxGradient(ctx: CanvasRenderingContext2D, w: number, h: number, stops: readonly (readonly [number, string])[]): CanvasGradient {
  const hw = w / 2;
  const hh = h / 2;
  const len = Math.hypot(hh, hw) || 1;
  const dx = hh / len;
  const dy = hw / len;
  const reach = hw * dx + hh * dy;
  const g = ctx.createLinearGradient(-dx * reach, -dy * reach, dx * reach, dy * reach);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

/** Adds a closed polygon. */
export function addPoly(path: CanvasPath, pts: Pts): void {
  path.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i] as number, pts[i + 1] as number);
  path.closePath();
}

/** A polygon geometry with the same yardsticks as `geo` (for bevels on hewn silhouettes). */
export function polyGeo(geo: BlockGeo, pts: Pts): BlockGeo {
  let perimeter = 0;
  for (let i = 0; i < pts.length / 2; i++) perimeter += edgeFrame(pts, i).len;
  return { ...geo, shape: geo.shape === 'circle' ? 'rect' : geo.shape, pts, radius: 0, perimeter };
}

/**
 * Hewn stone silhouette: every corner is knocked off with one or two small facets. The result is
 * convex and lies inside the physics shape.
 */
export function hewnPolygon(geo: BlockGeo, rng: Rng): Pts {
  if (geo.shape === 'circle') {
    // Lumpy boulder: a convex polygon with slightly irregular spokes.
    const n = clamp(Math.round(geo.radius / 7), 8, 13);
    const out: Pts = [];
    const turn = rng.next() * TAU;
    for (let i = 0; i < n; i++) {
      const a = turn + ((i + rng.range(-0.22, 0.22)) / n) * TAU;
      const r = geo.radius * rng.range(0.93, 1);
      out.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return out;
  }
  const pts = geo.pts;
  const n = pts.length / 2;
  const out: Pts = [];
  for (let i = 0; i < n; i++) {
    const prev = edgeFrame(pts, (i + n - 1) % n);
    const next = edgeFrame(pts, i);
    const limit = Math.min(prev.len, next.len) * 0.28;
    const cut = Math.min(limit, rng.range(0.35, 1) * clamp(geo.inradius * 0.55, 3, 15));
    const cutB = Math.min(limit, cut * rng.range(0.6, 1.4));
    const vx = pts[i * 2] as number;
    const vy = pts[i * 2 + 1] as number;
    out.push(vx - prev.tx * cut, vy - prev.ty * cut);
    if (rng.next() < 0.55) {
      // A second facet: the corner breaks off in two planes.
      const bx = (prev.nx + next.nx) * 0.5;
      const by = (prev.ny + next.ny) * 0.5;
      out.push(vx - prev.tx * cut * 0.25 + bx * cut * 0.42, vy - prev.ty * cut * 0.25 + by * cut * 0.42);
    }
    out.push(vx + next.tx * cutB, vy + next.ty * cutB);
  }
  return out;
}

/**
 * Bites the chips that are live at `stage` out of an already painted block: a pale rim of freshly
 * broken material, the notch erased to transparency and its new edge inked.
 */
export function carveChips(
  ctx: CanvasRenderingContext2D,
  outline: Path2D,
  chips: readonly Chip[],
  stage: number,
  rim: string,
  rimScale: number,
  ink: string,
  lineWidth: number,
): void {
  const live = chips.filter((c) => c.born <= stage);
  if (live.length === 0) return;
  ctx.save();
  ctx.clip(outline);
  ctx.beginPath();
  for (const c of live) addChip(ctx, c, rimScale);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  for (const c of live) addChip(ctx, c, 1);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.clip(outline);
  ctx.beginPath();
  for (const c of live) {
    const p = c.pts;
    ctx.moveTo(p[2] as number, p[3] as number);
    for (let i = 4; i < p.length - 2; i += 2) ctx.lineTo(p[i] as number, p[i + 1] as number);
  }
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.restore();
}

/** Paints the visible part of every crack: a lit lower lip under a dark tapered groove. */
export function paintCracks(ctx: CanvasRenderingContext2D, cracks: readonly Crack[], stage: number, dark: string, lip: string, lipOffset = 1.2): void {
  const grooves = new Path2D();
  const lips = new Path2D();
  for (const c of cracks) {
    const n = visibleNodes(c, stage);
    if (n < 2) continue;
    const w = crackWidth(c, stage);
    addTapered(grooves, c.pts, n, w);
    addTapered(lips, c.pts.map((v, i) => v + (i % 2 === 0 ? lipOffset * 0.6 : lipOffset)), n, w * 0.9);
  }
  ctx.fillStyle = lip;
  ctx.fill(lips);
  ctx.fillStyle = dark;
  ctx.fill(grooves);
}

/** Small four-point sparkle (glass and metal glints). */
export function sparkle(path: CanvasPath, x: number, y: number, r: number, thin = 0.18): void {
  const t = r * thin;
  path.moveTo(x, y - r);
  path.quadraticCurveTo(x + t, y - t, x + r, y);
  path.quadraticCurveTo(x + t, y + t, x, y + r);
  path.quadraticCurveTo(x - t, y + t, x - r, y);
  path.quadraticCurveTo(x - t, y - t, x, y - r);
  path.closePath();
}
