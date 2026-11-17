/**
 * Particle artwork: debris, puffs and glows, each with PARTICLE_VARIANTS designs. Painted centred
 * on the origin inside +-PARTICLE_HALF units. Debris carries a thin ink outline so it reads as part
 * of the cartoon world; glows (spark, glint, flash, fire) have none and are meant to be added.
 */
import { clamp, Rng, TAU } from '../../core/math';
import { INK } from '../../core/palette';
import { mixHex, rgba, sparkle, type Pts } from './materialUtil';
import type { ParticleKind } from './types';

const LX = -0.6;
const LY = -0.8;

function tones(base: string): { base: string; light: string; dark: string } {
  return { base, light: mixHex(base, '#ffffff', 0.38), dark: mixHex(base, '#1a0e08', 0.38) };
}

function poly(ctx: CanvasRenderingContext2D, pts: Pts): void {
  ctx.beginPath();
  ctx.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] as number, pts[i + 1] as number);
  ctx.closePath();
}

/** Irregular convex-ish polygon around the origin. */
function lump(rng: Rng, n: number, rx: number, ry: number, jitter: number): Pts {
  const pts: Pts = [];
  const turn = rng.range(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = turn + ((i + rng.range(-0.3, 0.3)) / n) * TAU;
    const k = 1 - jitter * rng.next();
    pts.push(Math.cos(a) * rx * k, Math.sin(a) * ry * k);
  }
  return pts;
}

/** Shades each triangle (centre, p_i, p_i+1) by how much its outer edge faces the key light. */
function facetShade(ctx: CanvasRenderingContext2D, pts: Pts, cx: number, cy: number, light: string, dark: string): void {
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i * 2] as number;
    const ay = pts[i * 2 + 1] as number;
    const bx = pts[j * 2] as number;
    const by = pts[j * 2 + 1] as number;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    // Outward normal of a clockwise (y-down) polygon edge.
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    const lit = nx * LX + ny * LY;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.closePath();
    ctx.fillStyle = lit > 0 ? rgba(light, clamp(lit, 0, 1) * 0.85) : rgba(dark, clamp(-lit, 0, 1) * 0.7);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- debris

function splinter(ctx: CanvasRenderingContext2D, v: number, color: string | undefined, rng: Rng): void {
  const t = tones(color ?? '#d9a05b');
  const w = [5, 4, 6.5, 3.6][v] as number;
  const len = [29, 27, 24, 29][v] as number;
  const top: Pts = [];
  const bottom: Pts = [];
  for (let k = 0; k <= 6; k++) {
    const x = -len + (k / 6) * len * 1.85;
    const taper = Math.sin((k / 6) * Math.PI * 0.92 + 0.12);
    top.push(x, -w * taper - rng.range(0, 1));
    bottom.push(x + rng.range(-1, 1), w * taper * 0.85 + rng.range(0, 1));
  }
  // Ragged broken end on the right.
  const pts: Pts = [-len - 2, 0.5, ...top, len, -w * 0.6, len - 4, -w * 0.1, len + 2, w * 0.25, len - 3, w * 0.6];
  for (let i = bottom.length - 2; i >= 0; i -= 2) pts.push(bottom[i] as number, bottom[i + 1] as number);
  poly(ctx, pts);
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, t.light);
  g.addColorStop(0.45, t.base);
  g.addColorStop(1, t.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(-len, -w * 0.15);
  ctx.quadraticCurveTo(0, -w * 0.45, len, -w * 0.1);
  ctx.moveTo(-len * 0.6, w * 0.35);
  ctx.quadraticCurveTo(0, w * 0.1, len * 0.8, w * 0.4);
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(t.dark, 0.8);
  ctx.stroke();
  ctx.restore();
  poly(ctx, pts);
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function woodchip(ctx: CanvasRenderingContext2D, color: string | undefined, rng: Rng): void {
  const t = tones(color ?? '#b8763a');
  const pts = lump(rng, 5 + Math.floor(rng.next() * 2), rng.range(17, 22), rng.range(11, 16), 0.3);
  poly(ctx, pts);
  ctx.fillStyle = t.base;
  ctx.fill();
  ctx.save();
  ctx.clip();
  facetShade(ctx, pts, rng.range(-4, 4), rng.range(-3, 3), mixHex(t.light, '#fff2d6', 0.4), t.dark);
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(-24, i * 5 + rng.range(-1, 1));
    ctx.quadraticCurveTo(0, i * 5 + rng.range(-3, 3), 24, i * 5 + rng.range(-1, 1));
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(t.dark, 0.6);
  ctx.stroke();
  ctx.restore();
  poly(ctx, pts);
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function shard(ctx: CanvasRenderingContext2D, v: number, rng: Rng): void {
  const shapes: Pts[] = [
    [-20, 14, 6, -25, 18, 10],
    [-26, 4, 2, -12, 25, -2, 4, 10],
    [-12, 20, -6, -24, 14, -6, 10, 16],
    [-22, -6, 20, -16, 8, 16],
  ];
  const pts = (shapes[v] as Pts).map((p) => p + rng.range(-1.5, 1.5));
  poly(ctx, pts);
  const g = ctx.createLinearGradient(-20, -20, 20, 20);
  g.addColorStop(0, 'rgba(236, 251, 255, 0.85)');
  g.addColorStop(0.5, 'rgba(160, 222, 244, 0.6)');
  g.addColorStop(1, 'rgba(84, 168, 214, 0.8)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(30, 92, 128, 0.9)';
  ctx.stroke();
  // Bright fractured edge on the lit side and an inner highlight.
  ctx.beginPath();
  ctx.moveTo(pts[0] as number, pts[1] as number);
  ctx.lineTo(pts[2] as number, pts[3] as number);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  const cx = pts.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) / (pts.length / 2);
  const cy = pts.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0) / (pts.length / 2);
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy + 2);
  ctx.lineTo(cx + 2, cy - 6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.stroke();
}

function rock(ctx: CanvasRenderingContext2D, color: string | undefined, rng: Rng): void {
  const t = tones(color ?? '#9aa0a6');
  const pts = lump(rng, 6 + Math.floor(rng.next() * 3), rng.range(19, 25), rng.range(15, 21), 0.22);
  poly(ctx, pts);
  ctx.fillStyle = t.base;
  ctx.fill();
  ctx.save();
  ctx.clip();
  facetShade(ctx, pts, rng.range(-5, 3), rng.range(-5, 3), t.light, t.dark);
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(rng.range(-16, 16), rng.range(-12, 12), rng.range(0.7, 1.5), 0, TAU);
    ctx.fillStyle = i % 2 === 0 ? rgba(t.dark, 0.7) : rgba(t.light, 0.8);
    ctx.fill();
  }
  ctx.restore();
  poly(ctx, pts);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function metal(ctx: CanvasRenderingContext2D, v: number, rng: Rng): void {
  const steel = { spec: '#eef3f7', light: '#bfcad5', base: '#8d9bab', dark: '#55616f' };
  ctx.lineJoin = 'round';
  if (v === 2) {
    // Hex nut.
    const pts: Pts = [];
    for (let i = 0; i < 6; i++) pts.push(Math.cos((i / 6) * TAU + 0.3) * 17, Math.sin((i / 6) * TAU + 0.3) * 17);
    poly(ctx, pts);
    ctx.fillStyle = steel.base;
    ctx.fill();
    facetShade(ctx, pts, 0, 0, steel.spec, steel.dark);
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, TAU);
    ctx.fillStyle = '#2b3138';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    poly(ctx, pts);
    ctx.lineWidth = 2.6;
    ctx.stroke();
    return;
  }
  if (v === 3) {
    // Bolt: hex head and threaded shank.
    ctx.translate(-1, 20);
    ctx.beginPath();
    ctx.rect(-6, -26, 32, 12);
    ctx.fillStyle = steel.light;
    ctx.fill();
    ctx.beginPath();
    for (let x = -4; x < 26; x += 4.5) {
      ctx.moveTo(x, -26);
      ctx.lineTo(x + 2, -14);
    }
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = steel.dark;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-6, -26, 32, 12);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    const head: Pts = [-22, -32, -6, -32, -4, -20, -6, -8, -22, -8, -24, -20];
    poly(ctx, head);
    const g = ctx.createLinearGradient(0, -32, 0, -8);
    g.addColorStop(0, steel.spec);
    g.addColorStop(0.5, steel.base);
    g.addColorStop(1, steel.dark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.stroke();
    return;
  }
  // Torn, slightly bent plate fragment with a rivet hole.
  const pts = lump(rng, 6, rng.range(20, 26), rng.range(12, 17), 0.35);
  poly(ctx, pts);
  const g = ctx.createLinearGradient(-20, -16, 20, 16);
  g.addColorStop(0, steel.light);
  g.addColorStop(0.3, steel.spec);
  g.addColorStop(0.55, steel.base);
  g.addColorStop(1, steel.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Fold line where the plate bent.
  ctx.beginPath();
  ctx.moveTo(-6 + rng.range(-3, 3), -22);
  ctx.lineTo(4 + rng.range(-3, 3), 22);
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(steel.dark, 0.8);
  ctx.stroke();
  ctx.translate(1.6, 0);
  ctx.strokeStyle = rgba(steel.spec, 0.8);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(rng.range(6, 10), rng.range(-3, 3), 3.4, 0, TAU);
  ctx.fillStyle = '#2b3138';
  ctx.fill();
  poly(ctx, pts);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function star(ctx: CanvasRenderingContext2D, v: number): void {
  const points = v === 3 ? 4 : 5;
  const outer = [26, 24, 25, 27][v] as number;
  const inner = outer * (v === 3 ? 0.36 : v === 1 ? 0.5 : 0.44);
  const turn = -Math.PI / 2 + (v === 2 ? 0.25 : 0);
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = turn + (i / (points * 2)) * TAU;
    const r = i % 2 === 0 ? outer : inner;
    // Slightly rounded points: a short curve through each tip.
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r + 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(-outer, -outer, outer, outer);
  g.addColorStop(0, '#fff7c2');
  g.addColorStop(0.45, '#ffd84a');
  g.addColorStop(1, '#f39a1d');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-outer * 0.22, -outer * 0.2, outer * 0.16, outer * 0.09, -0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fill();
}

function feather(ctx: CanvasRenderingContext2D, v: number, color: string | undefined): void {
  const t = tones(color ?? '#ffffff');
  const len = [27, 25, 28, 23][v] as number;
  const wide = [10, 8, 11, 9][v] as number;
  const bend = [5, -4, 7, 2][v] as number;
  ctx.save();
  ctx.rotate(-0.15);
  ctx.beginPath();
  ctx.moveTo(-len, 2);
  ctx.bezierCurveTo(-len * 0.4, -wide * 1.3 + bend, len * 0.5, -wide + bend, len, bend * 0.4);
  // A notch in the vane.
  ctx.lineTo(len * 0.55, wide * 0.35 + bend * 0.3);
  ctx.lineTo(len * 0.4, wide * 0.05);
  ctx.bezierCurveTo(len * 0.1, wide * 1.2, -len * 0.5, wide * 1.1, -len, 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -wide, 0, wide);
  g.addColorStop(0, t.light);
  g.addColorStop(0.55, t.base);
  g.addColorStop(1, t.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Shaft.
  ctx.beginPath();
  ctx.moveTo(-len - 4, 3);
  ctx.quadraticCurveTo(0, bend * 0.2 - 1, len * 0.85, bend * 0.35);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = rgba(t.dark, 0.9);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- puffs and glows

/** Scalloped cartoon cloud: a ring of round lobes around a core, as one path (non-zero fill). */
function cloudPath(rng: Rng, r: number, lobes: number): Path2D {
  const p = new Path2D();
  const turn = rng.range(0, TAU);
  for (let i = 0; i < lobes; i++) {
    const a = turn + (i / lobes) * TAU;
    const d = r * rng.range(0.44, 0.56);
    const lr = r * rng.range(0.38, 0.5);
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    p.moveTo(x + lr, y);
    p.arc(x, y, lr, 0, TAU);
  }
  p.moveTo(r * 0.62, 0);
  p.arc(0, 0, r * 0.62, 0, TAU);
  return p;
}

/** Cel-shaded puff: flat base, a shaded underside, a crisp highlight; smoke also gets an outline. */
function puff(ctx: CanvasRenderingContext2D, base: string, highlight: string, rng: Rng, outline: boolean): void {
  const r = 27;
  const path = cloudPath(rng, r, 6 + Math.floor(rng.next() * 2));
  if (outline) {
    ctx.strokeStyle = rgba(mixHex(base, '#1a0e08', 0.6), 0.9);
    ctx.lineWidth = 3;
    ctx.stroke(path);
  }
  ctx.fillStyle = base;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = rgba(mixHex(base, '#1a0e08', 0.32), 0.55);
  ctx.beginPath();
  ctx.rect(-40, -40, 80, 80);
  ctx.arc(-7, -9, r * 0.98, 0, TAU, true);
  ctx.fill('evenodd');
  ctx.fillStyle = rgba(highlight, 0.9);
  ctx.beginPath();
  ctx.ellipse(-9, -11, r * 0.4, r * 0.27, -0.6, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(7, -16, r * 0.11, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function spark(ctx: CanvasRenderingContext2D, v: number): void {
  const tail = [-30, -24, -30, -18][v] as number;
  const head = [26, 24, 28, 20][v] as number;
  const w = [4, 3.2, 5, 4.5][v] as number;
  // Saturated orange body so a spark still reads over snow or bright sand without additive blending.
  const glow = ctx.createLinearGradient(tail, 0, head, 0);
  glow.addColorStop(0, 'rgba(230, 70, 10, 0)');
  glow.addColorStop(0.55, 'rgba(240, 100, 16, 0.75)');
  glow.addColorStop(1, 'rgba(255, 150, 30, 0.95)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.moveTo(tail, 0);
  ctx.quadraticCurveTo(head * 0.4, -w * 2.2, head + w, 0);
  ctx.quadraticCurveTo(head * 0.4, w * 2.2, tail, 0);
  ctx.fill();
  const mid = ctx.createLinearGradient(tail * 0.3, 0, head, 0);
  mid.addColorStop(0, 'rgba(255, 200, 60, 0)');
  mid.addColorStop(1, 'rgba(255, 214, 90, 1)');
  ctx.fillStyle = mid;
  ctx.beginPath();
  ctx.moveTo(tail * 0.3, 0);
  ctx.quadraticCurveTo(head * 0.45, -w * 1.3, head + w * 0.5, 0);
  ctx.quadraticCurveTo(head * 0.45, w * 1.3, tail * 0.3, 0);
  ctx.fill();
  const core = ctx.createLinearGradient(tail * 0.6, 0, head, 0);
  core.addColorStop(0, 'rgba(255, 240, 180, 0)');
  core.addColorStop(1, 'rgba(255, 255, 245, 1)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.moveTo(tail * 0.6, 0);
  ctx.quadraticCurveTo(head * 0.5, -w * 0.8, head, 0);
  ctx.quadraticCurveTo(head * 0.5, w * 0.8, tail * 0.6, 0);
  ctx.fill();
}

function glint(ctx: CanvasRenderingContext2D, v: number): void {
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
  halo.addColorStop(0, 'rgba(220, 248, 255, 0.75)');
  halo.addColorStop(1, 'rgba(160, 225, 255, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.rotate(v % 2 === 0 ? 0 : Math.PI / 4);
  const p = new Path2D();
  sparkle(p, 0, 0, [28, 22, 26, 20][v] as number, 0.12);
  if (v >= 2) sparkle(p, 14, -14, 8, 0.15);
  ctx.fillStyle = '#ffffff';
  ctx.fill(p);
  ctx.restore();
}

function flash(ctx: CanvasRenderingContext2D, v: number): void {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 31);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.25, 'rgba(255, 250, 215, 0.9)');
  g.addColorStop(0.55, 'rgba(255, 210, 110, 0.4)');
  g.addColorStop(1, 'rgba(255, 170, 60, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 31, 0, TAU);
  ctx.fill();
  const rays = 8 + v * 2;
  ctx.beginPath();
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU + v * 0.3;
    const r = i % 2 === 0 ? 31 : 22;
    ctx.moveTo(Math.cos(a + 0.05) * 8, Math.sin(a + 0.05) * 8);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a - 0.05) * 8, Math.sin(a - 0.05) * 8);
  }
  ctx.fillStyle = 'rgba(255, 245, 200, 0.55)';
  ctx.fill();
}

/** Cel-shaded fireball: scalloped bands from deep red through orange and yellow to a white-hot core. */
function fire(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const outer = cloudPath(rng, 27, 7);
  ctx.strokeStyle = '#8f1d0a';
  ctx.lineWidth = 3;
  ctx.stroke(outer);
  ctx.fillStyle = '#ee4a1c';
  ctx.fill(outer);
  ctx.fillStyle = '#ff9320';
  ctx.fill(cloudPath(rng, 20, 6));
  ctx.fillStyle = '#ffd23f';
  ctx.fill(cloudPath(rng, 13.5, 5));
  ctx.fillStyle = '#fff7cf';
  ctx.beginPath();
  ctx.arc(-1, -1, 6.5, 0, TAU);
  ctx.fill();
}

/** Comic-book burst: three nested spiky stars with an ink outline. */
function burst(ctx: CanvasRenderingContext2D, v: number, rng: Rng, color?: string): void {
  const spikes = [9, 11, 10, 12][v] as number;
  const jit: number[] = [];
  for (let i = 0; i < spikes; i++) jit.push(rng.range(0.72, 1));
  const turn = rng.range(0, TAU);
  const star = (ro: number, ri: number): Path2D => {
    const p = new Path2D();
    for (let i = 0; i < spikes; i++) {
      const a = turn + (i / spikes) * TAU;
      const b = a + TAU / spikes / 2;
      const r = ro * (jit[i] as number);
      if (i === 0) p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else p.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      p.lineTo(Math.cos(b) * ri, Math.sin(b) * ri);
    }
    p.closePath();
    return p;
  };
  const outer = star(30, 15);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke(outer);
  ctx.fillStyle = color ?? '#ff8a1f';
  ctx.fill(outer);
  ctx.fillStyle = color ? mixHex(color, '#ffffff', 0.55) : '#ffd84a';
  ctx.fill(star(23.5, 12));
  ctx.fillStyle = color ? '#ffffff' : '#fffbe8';
  ctx.fill(star(15, 7.5));
}

/** Speed line: a thin tapered stroke, transparent at the tail. */
function streak(ctx: CanvasRenderingContext2D, v: number, color?: string): void {
  const len = [30, 26, 30, 22][v] as number;
  const w = [2.6, 2, 3.2, 2.4][v] as number;
  const c = color ?? '#ffffff';
  const g = ctx.createLinearGradient(-len, 0, len, 0);
  g.addColorStop(0, rgba(c, 0));
  g.addColorStop(0.5, rgba(c, 0.95));
  g.addColorStop(1, rgba(c, 1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.quadraticCurveTo(len * 0.3, -w, len, 0);
  ctx.quadraticCurveTo(len * 0.3, w, -len, 0);
  ctx.fill();
}

function snow(ctx: CanvasRenderingContext2D, v: number): void {
  const r = [24, 20, 26, 18][v] as number;
  const draw = (width: number, style: string): void => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + v * 0.2;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      ctx.moveTo(0, 0);
      ctx.lineTo(cx * r, cy * r);
      for (const k of [0.5, 0.75]) {
        const bl = r * 0.26 * (1.3 - k);
        for (const s of [-1, 1]) {
          ctx.moveTo(cx * r * k, cy * r * k);
          ctx.lineTo(cx * r * k + Math.cos(a + s * 0.9) * bl, cy * r * k + Math.sin(a + s * 0.9) * bl);
        }
      }
    }
    ctx.stroke();
  };
  draw(6.5, 'rgba(96, 170, 226, 0.9)');
  draw(3, '#ffffff');
}

function zap(ctx: CanvasRenderingContext2D, v: number, rng: Rng): void {
  const pts: number[] = [-28, 0];
  const flip = v % 2 === 0 ? 1 : -1;
  for (let i = 1; i < 5; i++) pts.push(-28 + (56 * i) / 5, (i % 2 === 0 ? -1 : 1) * rng.range(6, 13) * flip);
  pts.push(28, 0);
  const line = (w: number, style: string): void => {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0] as number, pts[1] as number);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] as number, pts[i + 1] as number);
    ctx.stroke();
  };
  line(8, '#4347c9');
  line(4.5, '#fff27a');
  line(1.6, '#ffffff');
}

export function paintParticleArt(ctx: CanvasRenderingContext2D, kind: ParticleKind, variant: number, color?: string): void {
  const v = ((variant % 4) + 4) % 4;
  const rng = new Rng(0x5eed + v * 977 + kind.length * 31);
  ctx.save();
  switch (kind) {
    case 'splinter':
      splinter(ctx, v, color, rng);
      break;
    case 'woodchip':
      woodchip(ctx, color, rng);
      break;
    case 'shard':
      shard(ctx, v, rng);
      break;
    case 'rock':
      rock(ctx, color, rng);
      break;
    case 'metal':
      metal(ctx, v, rng);
      break;
    case 'dust':
      puff(ctx, color ?? '#e6dcc8', mixHex(color ?? '#e6dcc8', '#ffffff', 0.6), rng, false);
      break;
    case 'smoke':
      puff(ctx, color ?? '#57504c', mixHex(color ?? '#57504c', '#cfc6be', 0.5), rng, true);
      break;
    case 'spark':
      spark(ctx, v);
      break;
    case 'glint':
      glint(ctx, v);
      break;
    case 'flash':
      flash(ctx, v);
      break;
    case 'star':
      star(ctx, v);
      break;
    case 'feather':
      feather(ctx, v, color);
      break;
    case 'fire':
      fire(ctx, rng);
      break;
    case 'burst':
      burst(ctx, v, rng, color);
      break;
    case 'streak':
      streak(ctx, v, color);
      break;
    case 'snow':
      snow(ctx, v);
      break;
    case 'zap':
      zap(ctx, v, rng);
      break;
  }
  ctx.restore();
}
