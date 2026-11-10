/**
 * Shared helpers for the environment artwork: colour mixing, tileable noise and the painterly
 * shape builders (hills, canopies, pines, clouds) used by the backdrops, parallax layers and decor.
 */
import { Rng, TAU } from '../../core/math';

// ---------------------------------------------------------------- colour

type RGB = [number, number, number];
const rgbCache = new Map<string, RGB>();

export function rgb(hex: string): RGB {
  let c = rgbCache.get(hex);
  if (!c) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, (x) => x + x) : h, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

/** Linear mix of two hex colours, returned as a hex string. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const r = (i: number) => Math.round(x[i]! + (y[i]! - x[i]!) * t);
  return `#${((1 << 24) | (r(0) << 16) | (r(1) << 8) | r(2)).toString(16).slice(1)}`;
}

export function rgba(hex: string, a: number): string {
  const c = rgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

// ---------------------------------------------------------------- tileable noise

/** A smooth periodic 1D function: sum of sines with integer cycles over `period`. */
export function periodic(period: number, seed: number, octaves: [cycles: number, amp: number][]): (u: number) => number {
  const rng = new Rng(seed);
  const parts = octaves.map(([k, a]) => ({ w: (TAU * k) / period, a, p: rng.range(0, TAU) }));
  return (u) => {
    let v = 0;
    for (const o of parts) v += Math.sin(u * o.w + o.p) * o.a;
    return v;
  };
}

/** Calls `fn` for x and for its copies one tile to the left / right when they overlap the seam. */
export function wrapped(x: number, half: number, tile: number, fn: (x: number) => void): void {
  fn(x);
  if (x - half < 0) fn(x + tile);
  if (x + half > tile) fn(x - tile);
}

// ---------------------------------------------------------------- shape builders (all add sub-paths)

/** Closed ridge: y = f(u) for u in [-pad, tile + pad], then down to `bottom`. */
export function ridge(path: Path2D, tile: number, f: (u: number) => number, bottom: number, step = 12, pad = 6): void {
  path.moveTo(-pad, bottom);
  for (let u = -pad; u <= tile + pad; u += step) path.lineTo(u, f(u));
  path.lineTo(tile + pad, f(tile + pad));
  path.lineTo(tile + pad, bottom);
  path.closePath();
}

export function ellipse(path: Path2D, cx: number, cy: number, rx: number, ry: number, rot = 0): void {
  path.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
  path.ellipse(cx, cy, rx, ry, rot, 0, TAU);
  path.closePath();
}

export function circle(path: Path2D, cx: number, cy: number, r: number): void {
  path.moveTo(cx + r, cy);
  path.arc(cx, cy, r, 0, TAU);
  path.closePath();
}

/** Irregular rounded blob (a smooth closed curve through jittered radii). */
export function blob(path: Path2D, cx: number, cy: number, rx: number, ry: number, rng: Rng, n = 9, jitter = 0.14): void {
  const pts: [number, number][] = [];
  const rot = rng.range(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const k = 1 + rng.range(-jitter, jitter);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  smoothClosed(path, pts);
}

/** Closed curve through points using quadratic midpoints (Chaikin-like, always smooth). */
export function smoothClosed(path: Path2D, pts: [number, number][]): void {
  const n = pts.length;
  const mid = (i: number): [number, number] => {
    const a = pts[i % n]!;
    const b = pts[(i + 1) % n]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const m0 = mid(n - 1);
  path.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const m = mid(i);
    path.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  path.closePath();
}

/** Open smooth polyline helper: moves to the first point and curves through the rest. */
export function smoothOpen(path: CanvasPath, pts: [number, number][]): void {
  if (pts.length < 2) return;
  path.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    path.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  const last = pts[pts.length - 1]!;
  path.lineTo(last[0], last[1]);
}

/**
 * Rounded tree canopy built from overlapping circles. Returns the list so the caller can
 * re-use it for the shade / light passes.
 */
export function canopyCircles(cx: number, cy: number, rx: number, ry: number, rng: Rng, count: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.range(-0.3, 0.3);
    const d = rng.range(0.35, 0.75);
    const r = Math.min(rx, ry) * rng.range(0.42, 0.62);
    out.push([cx + Math.cos(a) * rx * d * 0.85, cy + Math.sin(a) * ry * d * 0.8, r]);
  }
  out.push([cx, cy, Math.min(rx, ry) * 0.62]);
  return out;
}

/** Snow-laden or plain pine: stacked drooping tiers. `w` is the width of the lowest tier. */
export function pine(path: Path2D, x: number, base: number, h: number, w: number, tiers = 4): void {
  const trunk = h * 0.08;
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const bottom = base - trunk - (h - trunk) * t0 * 0.78;
    const top = base - trunk - (h - trunk) * Math.min(1, t0 * 0.78 + 0.42);
    const half = (w / 2) * (1 - t0 * 0.62);
    path.moveTo(x, top);
    path.quadraticCurveTo(x + half * 0.35, bottom - (bottom - top) * 0.45, x + half, bottom);
    path.quadraticCurveTo(x + half * 0.5, bottom - (bottom - top) * 0.12, x, bottom - (bottom - top) * 0.06);
    path.quadraticCurveTo(x - half * 0.5, bottom - (bottom - top) * 0.12, x - half, bottom);
    path.quadraticCurveTo(x - half * 0.35, bottom - (bottom - top) * 0.45, x, top);
    path.closePath();
  }
  path.rect(x - w * 0.045, base - trunk - 2, w * 0.09, trunk + 2);
}

/** Simple cumulus prototype: circles along a flat base. Returns [cx, cy, r] lobes in local units. */
export function cloudLobes(w: number, h: number, rng: Rng): [number, number, number][] {
  const lobes: [number, number, number][] = [];
  const n = Math.max(3, Math.round(w / (h * 0.55)));
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const edge = Math.sin(t * Math.PI);
    const r = h * (0.24 + edge * 0.24) * rng.range(0.9, 1.1);
    const cx = -w / 2 + r + t * (w - 2 * r);
    // Lobes sit on a common flat base line (y = 0).
    lobes.push([cx, -r, r]);
  }
  // Crown lobes, biggest left of centre (towards the sun) for a lively, asymmetric silhouette.
  const crowns = 2 + Math.floor(rng.next() * 2);
  for (let i = 0; i < crowns; i++) {
    const cx = -w * 0.2 + (i / Math.max(1, crowns - 1)) * w * 0.38 + rng.range(-w * 0.05, w * 0.05);
    const r = h * (i === 0 ? rng.range(0.42, 0.5) : rng.range(0.3, 0.42));
    lobes.push([cx, -h + r + rng.range(0, h * 0.14), r]);
  }
  return lobes;
}

/** Adds every lobe (optionally shifted / scaled) to a path and cuts the bottom flat with a rect. */
export function addLobes(path: Path2D, lobes: [number, number, number][], dx = 0, dy = 0, k = 1): void {
  for (const [x, y, r] of lobes) circle(path, x + dx, y + dy, r * k);
}

// ---------------------------------------------------------------- layer helpers

export interface Fill3 {
  path: Path2D;
  color: string;
  alpha?: number;
  dx?: number;
  dy?: number;
}

/**
 * Cel-shaded silhouette from one ridge path: a sunlit rim along the crest, shade on slopes that
 * face away from the top-left sun, and the base tone in between.
 */
export function celRidge(path: Path2D, light: string, base: string, shade: string, rim: number, shadeShift: number): Fill3[] {
  return [
    { path, color: light },
    { path, color: shade, dy: rim },
    { path, color: base, dx: -shadeShift, dy: rim * 1.15 },
  ];
}

/** Three-tone canopy from overlapping circles (shade, base nudged up-left, light caps). */
export function celCircles(circles: Circle[], shadeC: string, baseC: string, lightC: string, lightK = 0.55): Fill3[] {
  const shade = new Path2D();
  const base = new Path2D();
  const light = new Path2D();
  for (const c of circles) {
    const [x, y, r] = c;
    circle(shade, x, y, r);
    circle(base, x - r * 0.1, y - r * 0.14, r * 0.9);
    if (c[3] !== 0) circle(light, x - r * 0.3, y - r * 0.36, r * lightK);
  }
  return [
    { path: shade, color: shadeC },
    { path: base, color: baseC },
    { path: light, color: lightC },
  ];
}

/** Tapered curved grass blade rooted at (x, 0) in a y-down space. */
export function blade(path: Path2D, x: number, h: number, w: number, lean: number): void {
  path.moveTo(x - w, 2);
  path.quadraticCurveTo(x - w * 0.3 + lean * 0.3, -h * 0.55, x + lean, -h);
  path.quadraticCurveTo(x + w * 0.4 + lean * 0.3, -h * 0.5, x + w, 2);
  path.closePath();
}

/** Small tuft of blades. */
export function tuft(path: Path2D, x: number, h: number, rng: Rng, blades = 5): void {
  for (let i = 0; i < blades; i++) {
    const t = blades === 1 ? 0 : i / (blades - 1) - 0.5;
    blade(path, x + t * h * 0.5, h * rng.range(0.55, 1) * (1 - Math.abs(t) * 0.5), h * 0.07, t * h * 0.7 + rng.range(-0.1, 0.1) * h);
  }
}

/**
 * One broadleaf crown as a cluster of three lobes standing on `gy` (only the main lobe gets a
 * sunlit cap, so forests read as masses of trees rather than rows of beads).
 */
export function broadleaf(out: Circle[], x: number, gy: number, r: number, rng: Rng): void {
  out.push([x - r * 0.62, gy - r * 0.62, r * rng.range(0.6, 0.75), 0]);
  out.push([x + r * 0.6, gy - r * 0.58, r * rng.range(0.6, 0.78), 0]);
  out.push([x + rng.range(-0.15, 0.15) * r, gy - r * 1.05, r, 1]);
}

/** [x, y, r, lit?]: lit = 0 skips the light cap. */
export type Circle = [number, number, number] | [number, number, number, number];
