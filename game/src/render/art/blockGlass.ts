/**
 * Glass: translucent panes and orbs with tinted thick edges, layered reflections and sharp glints.
 * Damage is a spider-web fracture from an impact point; at the last stage cells drop out.
 */
import { clamp, Rng, TAU } from '../../core/math';
import { INK } from '../../core/palette';
import { insetPolygon, insideGeo, mixSeed, outlinePath, paintBevel, randomInside, sparkle, type BlockGeo, type Pts } from './materialUtil';
import type { DamageStage } from './types';

const OUTLINE = 4.5;
const EDGE_TINT = 'rgba(52, 150, 196, 0.55)';
const CRACK_WHITE = 'rgba(255, 255, 255, 0.95)';
const CRACK_DARK = 'rgba(28, 92, 128, 0.55)';

export function paintGlass(ctx: CanvasRenderingContext2D, geo: BlockGeo, stage: DamageStage, seed: number): void {
  const salt = Math.round(geo.w * 5 + geo.h * 19);
  const rng = new Rng(mixSeed(seed, salt));
  const outline = outlinePath(geo, rng, 0.8);
  const web = stage > 0 ? spiderWeb(geo, new Rng(mixSeed(seed, salt + 101))) : null;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.clip(outline);
  if (geo.shape === 'circle') paintOrb(ctx, geo, rng);
  else paintPane(ctx, geo, rng);
  if (web) paintWeb(ctx, web, stage);
  ctx.restore();

  ctx.lineWidth = OUTLINE;
  ctx.strokeStyle = INK;
  ctx.stroke(outline);
  if (web && stage === 3) dropCells(ctx, outline, web);
  ctx.restore();
}

function paintPane(ctx: CanvasRenderingContext2D, geo: BlockGeo, rng: Rng): void {
  const hw = geo.w / 2;
  const hh = geo.h / 2;
  // Body: pale and clear towards the light, deeper blue where the light passes through more glass.
  const body = ctx.createLinearGradient(-hw, -hh, hw * 0.4 + hh, hh + hw * 0.2);
  body.addColorStop(0, 'rgba(226, 248, 255, 0.62)');
  body.addColorStop(0.5, 'rgba(160, 222, 244, 0.5)');
  body.addColorStop(1, 'rgba(96, 180, 222, 0.66)');
  ctx.fillStyle = body;
  ctx.fillRect(-hw - 2, -hh - 2, geo.w + 4, geo.h + 4);

  // Thick tinted edge, then the inner face edge of the pane.
  const edge = clamp(geo.inradius * 0.55, 4, 11);
  ctx.beginPath();
  ctx.rect(-hw - 4, -hh - 4, geo.w + 8, geo.h + 8);
  const inner = insetPolygon(geo.pts, edge);
  addPolyline(ctx, inner, true);
  ctx.fillStyle = EDGE_TINT;
  ctx.fill('evenodd');
  paintBevel(ctx, geo, Math.min(edge * 0.55, 5), 'rgba(255, 255, 255, 0.85)', 'rgba(24, 96, 140, 0.5)');
  ctx.beginPath();
  addPolyline(ctx, inner, true);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.stroke();

  reflections(ctx, geo, rng);

  // A crisp highlight running along the lit top edge, and a glint on the top-left corner.
  const [x0, y0] = topLeftCorner(geo.pts);
  const len = clamp(geo.w * 0.35, 8, 60);
  ctx.beginPath();
  ctx.moveTo(x0 + edge * 0.9, y0 + edge * 0.55);
  ctx.lineTo(x0 + edge * 0.9 + len, y0 + edge * 0.55 + (geo.shape === 'rect' ? 0 : len * 0.4));
  ctx.lineWidth = clamp(geo.inradius * 0.12, 1.4, 3);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.stroke();
  if (geo.inradius >= 10) {
    const glint = new Path2D();
    sparkle(glint, x0 + edge * 0.9, y0 + edge * 0.7, clamp(geo.inradius * 0.35, 4, 9));
    ctx.fillStyle = '#ffffff';
    ctx.fill(glint);
  }
}

/** Diagonal bands of reflected sky: one broad and soft, one or two thin and sharp. */
function reflections(ctx: CanvasRenderingContext2D, geo: BlockGeo, rng: Rng): void {
  const span = Math.max(geo.w, geo.h);
  const short = Math.min(geo.w, geo.h);
  ctx.save();
  ctx.rotate(-0.75);
  const bands = Math.max(1, Math.round(span / 120));
  for (let i = 0; i < bands; i++) {
    const at = ((i + rng.range(0.15, 0.5)) / bands - 0.5) * span * 0.9;
    const broad = clamp(short * 0.45, 6, 26);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(at, -span, broad, span * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(at + broad + clamp(short * 0.12, 2, 6), -span, clamp(short * 0.08, 1.5, 4), span * 2);
  }
  ctx.restore();
}

function paintOrb(ctx: CanvasRenderingContext2D, geo: BlockGeo, rng: Rng): void {
  const R = geo.radius;
  const body = ctx.createRadialGradient(R * 0.25, R * 0.3, R * 0.1, 0, 0, R);
  body.addColorStop(0, 'rgba(200, 240, 255, 0.45)');
  body.addColorStop(0.7, 'rgba(150, 216, 242, 0.5)');
  body.addColorStop(1, 'rgba(60, 150, 200, 0.8)');
  ctx.fillStyle = body;
  ctx.fillRect(-R - 2, -R - 2, R * 2 + 4, R * 2 + 4);
  // Caustic: light focused through the ball onto its far side.
  ctx.beginPath();
  ctx.arc(R * 0.08, R * 0.08, R * 0.8, 0.15 * Math.PI, 0.75 * Math.PI);
  ctx.lineWidth = R * 0.12;
  ctx.strokeStyle = 'rgba(235, 252, 255, 0.55)';
  ctx.stroke();
  // Window reflection.
  ctx.beginPath();
  ctx.ellipse(-R * 0.36, -R * 0.4, R * 0.3, R * 0.17, -0.7, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-R * 0.15, -R * 0.62, R * 0.07, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  paintBevel(ctx, geo, clamp(R * 0.1, 3, 6), 'rgba(255, 255, 255, 0.7)', 'rgba(24, 96, 140, 0.45)');
  if (rng.next() < 0.5) {
    const glint = new Path2D();
    sparkle(glint, R * 0.5, -R * 0.45, clamp(R * 0.14, 3, 7));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill(glint);
  }
}

// ---------------------------------------------------------------- fractures

interface Web {
  x: number;
  y: number;
  /** Radial cracks, in angular order. */
  spokes: Pts[];
  /** Concentric ring segments: [spoke index, distance along it] pairs for rings 1 and 2. */
  rings: number[][];
}

const RING_AT = [0.32, 0.62];

function spiderWeb(geo: BlockGeo, rng: Rng): Web {
  const [x, y] = randomInside(geo, rng, Math.min(geo.inradius * 0.55, 18));
  const n = 7 + Math.floor(rng.next() * 3);
  const turn = rng.range(0, TAU);
  const reach = Math.max(geo.w, geo.h);
  const spokes: Pts[] = [];
  for (let i = 0; i < n; i++) {
    let a = turn + ((i + rng.range(-0.25, 0.25)) / n) * TAU;
    const pts: Pts = [x, y];
    let px = x;
    let py = y;
    for (let run = 0; run < reach; ) {
      const step = clamp(geo.inradius * 0.35, 4, 9) * rng.range(0.7, 1.3);
      a += rng.range(-0.18, 0.18);
      px += Math.cos(a) * step;
      py += Math.sin(a) * step;
      run += step;
      pts.push(px, py);
      if (!insideGeo(geo, px, py, -1)) break;
    }
    spokes.push(pts);
  }
  const rings = RING_AT.map((f) => spokes.map(() => f * rng.range(0.8, 1.2)));
  return { x, y, spokes, rings };
}

/** Point at fraction `f` of the length of a spoke polyline. */
function along(pts: Pts, f: number): [number, number] {
  const nodes = pts.length / 2;
  const p = clamp(f, 0, 1) * (nodes - 1);
  const i = Math.min(nodes - 2, Math.floor(p));
  const t = p - i;
  return [(pts[i * 2] as number) + ((pts[i * 2 + 2] as number) - (pts[i * 2] as number)) * t, (pts[i * 2 + 1] as number) + ((pts[i * 2 + 3] as number) - (pts[i * 2 + 1] as number)) * t];
}

/** Stage 1: a few short spokes. Stage 2: all spokes, inner ring. Stage 3: full web. */
function paintWeb(ctx: CanvasRenderingContext2D, web: Web, stage: DamageStage): void {
  const path = new Path2D();
  const n = web.spokes.length;
  web.spokes.forEach((pts, i) => {
    const show = stage === 1 ? (i % 3 === 0 ? 0.55 : i % 3 === 1 ? 0.3 : 0) : stage === 2 ? (i % 2 === 0 ? 1 : 0.7) : 1;
    if (show <= 0) return;
    const nodes = Math.max(2, Math.ceil((pts.length / 2) * show));
    path.moveTo(pts[0] as number, pts[1] as number);
    for (let k = 1; k < nodes; k++) path.lineTo(pts[k * 2] as number, pts[k * 2 + 1] as number);
  });
  const ringCount = stage === 1 ? 0 : stage === 2 ? 1 : 2;
  for (let r = 0; r < ringCount; r++) {
    const fr = web.rings[r] as number[];
    for (let i = 0; i < n; i++) {
      if (stage === 2 && i % 3 === 2) continue;
      const j = (i + 1) % n;
      const [ax, ay] = along(web.spokes[i] as Pts, fr[i] as number);
      const [bx, by] = along(web.spokes[j] as Pts, fr[j] as number);
      path.moveTo(ax, ay);
      // Ring segments bow slightly towards the impact point.
      path.quadraticCurveTo((ax + bx) / 2 + (web.x - (ax + bx) / 2) * 0.12, (ay + by) / 2 + (web.y - (ay + by) / 2) * 0.12, bx, by);
    }
  }
  ctx.save();
  ctx.translate(0.9, 1.1);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = CRACK_DARK;
  ctx.stroke(path);
  ctx.restore();
  ctx.lineWidth = stage === 3 ? 2.2 : 1.8;
  ctx.strokeStyle = CRACK_WHITE;
  ctx.stroke(path);
  // Crushed, frosted glass at the point of impact.
  const r = 3 + stage * 2.2;
  const g = ctx.createRadialGradient(web.x, web.y, 0, web.x, web.y, r * 1.8);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  g.addColorStop(0.5, 'rgba(240, 250, 255, 0.6)');
  g.addColorStop(1, 'rgba(240, 250, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(web.x, web.y, r * 1.8, 0, TAU);
  ctx.fill();
}

/** Last stage: two cells of the web next to the impact fall out of the pane. */
function dropCells(ctx: CanvasRenderingContext2D, outline: Path2D, web: Web): void {
  const n = web.spokes.length;
  const holes = new Path2D();
  for (const i of [0, Math.floor(n / 2)]) {
    const j = (i + 1) % n;
    const f0 = (web.rings[0] as number[])[i] as number;
    const f1 = (web.rings[0] as number[])[j] as number;
    const g0 = (web.rings[1] as number[])[i] as number;
    const g1 = (web.rings[1] as number[])[j] as number;
    const a = along(web.spokes[i] as Pts, f0);
    const b = along(web.spokes[j] as Pts, f1);
    const c = along(web.spokes[j] as Pts, g1);
    const d = along(web.spokes[i] as Pts, g0);
    holes.moveTo(a[0], a[1]);
    holes.lineTo(b[0], b[1]);
    holes.lineTo(c[0], c[1]);
    holes.lineTo(d[0], d[1]);
    holes.closePath();
  }
  ctx.save();
  ctx.clip(outline);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fill(holes);
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = INK;
  ctx.stroke(holes);
  ctx.translate(-1, -1);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.stroke(holes);
  ctx.restore();
}

// ---------------------------------------------------------------- helpers

function addPolyline(path: CanvasPath, pts: Pts, close: boolean): void {
  path.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i] as number, pts[i + 1] as number);
  if (close) path.closePath();
}

/** The polygon vertex closest to the top-left (where the key light hits). */
function topLeftCorner(pts: Pts): [number, number] {
  let best = 0;
  let score = Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const s = (pts[i] as number) + (pts[i + 1] as number) * 1.5;
    if (s < score) {
      score = s;
      best = i;
    }
  }
  return [pts[best] as number, pts[best + 1] as number];
}
