/** Small 2D geometry helpers for the simulation. Local space is y UP, origin at a shape's bounding-box centre. */
import type { BlockShape, TerrainDef } from '../core/types';
import { DEG } from '../core/math';

export type Point = [number, number];

export interface XY {
  x: number;
  y: number;
}

/** Counter-clockwise outline of a polygonal block. Null for circles. */
export function blockOutline(shape: BlockShape, w: number, h: number, flip = false): Point[] | null {
  const hw = w / 2;
  const hh = h / 2;
  switch (shape) {
    case 'circle':
      return null;
    case 'tri':
      return [
        [-hw, -hh],
        [hw, -hh],
        [0, hh],
      ];
    case 'wedge':
      return flip
        ? [
            [-hw, -hh],
            [hw, -hh],
            [hw, hh],
          ]
        : [
            [-hw, -hh],
            [hw, -hh],
            [-hw, hh],
          ];
    default:
      return [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ];
  }
}

export function blockArea(shape: BlockShape, w: number, h: number): number {
  if (shape === 'circle') return Math.PI * (w / 2) * (w / 2);
  if (shape === 'rect') return w * h;
  return (w * h) / 2;
}

export function polygonArea(points: Point[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Point;
    const b = points[(i + 1) % points.length] as Point;
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return twice / 2;
}

/** World-space counter-clockwise outline of a static terrain piece. */
export function terrainOutline(piece: TerrainDef): Point[] {
  const local: Point[] =
    piece.shape === 'poly' && piece.points
      ? piece.points
      : [
          [-(piece.w ?? 1) / 2, -(piece.h ?? 1) / 2],
          [(piece.w ?? 1) / 2, -(piece.h ?? 1) / 2],
          [(piece.w ?? 1) / 2, (piece.h ?? 1) / 2],
          [-(piece.w ?? 1) / 2, (piece.h ?? 1) / 2],
        ];
  const angle = (piece.angle ?? 0) * DEG;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return local.map(([x, y]) => [piece.x + x * c - y * s, piece.y + x * s + y * c]);
}

/**
 * Moves every edge of a convex counter-clockwise polygon inwards by `d` (mitred corners).
 * Falls back to the original outline if the shape is too small to shrink.
 */
export function insetPolygon(points: Point[], d: number): Point[] {
  const n = points.length;
  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n] as Point;
    const cur = points[i] as Point;
    const next = points[(i + 1) % n] as Point;
    const e1x = cur[0] - prev[0];
    const e1y = cur[1] - prev[1];
    const e2x = next[0] - cur[0];
    const e2y = next[1] - cur[1];
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    // Inward (left-hand) normals of the two edges meeting at this corner.
    const n1x = -e1y / l1;
    const n1y = e1x / l1;
    const n2x = -e2y / l2;
    const n2y = e2x / l2;
    const k = d / Math.max(0.2, 1 + n1x * n2x + n1y * n2y);
    result.push([cur[0] + (n1x + n2x) * k, cur[1] + (n1y + n2y) * k]);
  }
  return polygonArea(result) > polygonArea(points) * 0.25 ? result : points;
}

/**
 * Closest point of a convex counter-clockwise polygon to (px, py).
 * Returns the distance (0 when the point is inside, in which case `out` is the point itself).
 */
export function closestOnPolygon(points: Point[], px: number, py: number, out: XY): number {
  const n = points.length;
  let inside = true;
  let best = Infinity;
  let bx = px;
  let by = py;
  for (let i = 0; i < n; i++) {
    const a = points[i] as Point;
    const b = points[(i + 1) % n] as Point;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const rx = px - a[0];
    const ry = py - a[1];
    if (ex * ry - ey * rx < 0) inside = false;
    const len2 = ex * ex + ey * ey;
    const t = len2 > 0 ? Math.min(1, Math.max(0, (rx * ex + ry * ey) / len2)) : 0;
    const cx = a[0] + ex * t;
    const cy = a[1] + ey * t;
    const d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    if (d2 < best) {
      best = d2;
      bx = cx;
      by = cy;
    }
  }
  if (inside) {
    out.x = px;
    out.y = py;
    return 0;
  }
  out.x = bx;
  out.y = by;
  return Math.sqrt(best);
}
