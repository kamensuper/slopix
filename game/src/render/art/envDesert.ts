/** THE GOLDEN BADLANDS: low golden sun, rose mesas, wind-carved hoodoos and arches, ruins and dunes. */
import { Rng } from '../../core/math';
import { haze, range, rays, skyGradient, sun } from './envBackdrop';
import { blade, blob, celRidge, circle, cloudLobes, ellipse, periodic, ridge, smoothClosed, tuft, wrapped } from './envKit';
import type { BackdropFrame, CloudDef, GroundDef, LayerFill, ParallaxLayer, SceneDef } from './envLayers';

const BOTTOM = 1500;

function paintBackdrop(ctx: CanvasRenderingContext2D, f: BackdropFrame, seed: number): void {
  const rng = new Rng(seed * 17 + 3);
  const span = f.viewR - f.viewL;
  skyGradient(ctx, f, [
    [0, '#e98a5e'],
    [0.35, '#fba866'],
    [0.72, '#ffd391'],
    [1, '#fff0cf'],
  ]);
  const sx = f.viewL + span * rng.range(0.14, 0.26);
  rays(ctx, sx, -470, 1300, '#fff0c4', 0.04, seed);
  sun(ctx, sx, -470, 46, '#fff7dc', '#ffd47a', 760, 0.7);

  range(ctx, f, {
    light: '#eeb39a', base: '#dca08f', shade: '#c88a86', strata: '#d29788', mesa: true,
    minH: 130, maxH: 250, spacing: 560, baseY: 6, sharp: 0,
  }, seed + 1);
  haze(ctx, f, -270, 10, '#ffe4bb', 0.55);
  range(ctx, f, {
    light: '#eaa26c', base: '#d6895d', shade: '#bc6f52', strata: '#c97b57', mesa: true,
    minH: 70, maxH: 160, spacing: 430, baseY: 36, sharp: 0,
  }, seed + 2);
  haze(ctx, f, -90, f.bottom, '#ffe6c0', 0.42);
}

// ---------------------------------------------------------------- shape builders

/** Wind-carved hoodoo: pinched column of stacked lumps under a wide cap rock. */
function hoodoo(path: Path2D, x: number, base: number, h: number, w: number, rng: Rng, grooves: Path2D): void {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let hw = w * (0.5 - t * 0.18);
    hw *= 1 + 0.16 * Math.sin(t * 18 + x) - (t > 0.78 && t < 0.86 ? 0.25 : 0);
    if (t >= 0.86) hw = w * 0.52;
    const y = base + 40 - (h + 40) * t;
    left.push([x - hw + rng.range(-4, 4), y]);
    right.push([x + hw + rng.range(-4, 4), y]);
    // Strata grooves where the rock pinches in.
    if (i > 1 && i < n - 1 && i % 2 === 0) grooves.rect(x - hw * 0.8, y, hw * 1.7, 3.5);
  }
  smoothClosed(path, [...left, [x, base - h - 10], ...right.reverse()]);
}

/** A natural stone arch as one outline (outer edge, then the opening). */
function arch(path: Path2D, x: number, base: number, w: number, h: number, t: number): void {
  const l = x - w / 2;
  const r = x + w / 2;
  path.moveTo(l - 20, base + 40);
  path.bezierCurveTo(l - 6, base - h * 0.3, l - 14, base - h * 0.75, l + w * 0.1, base - h * 0.92);
  path.bezierCurveTo(l + w * 0.35, base - h * 1.06, r - w * 0.3, base - h * 1.02, r - w * 0.06, base - h * 0.84);
  path.bezierCurveTo(r + 10, base - h * 0.6, r + 6, base - h * 0.3, r + 24, base + 40);
  path.lineTo(r - t, base + 40);
  path.bezierCurveTo(r - t * 0.9, base - h * 0.3, r - t * 1.1, base - (h - t * 1.1), x, base - (h - t * 1.05));
  path.bezierCurveTo(l + t * 1.2, base - (h - t * 1.1), l + t, base - h * 0.3, l + t * 0.8, base + 40);
  path.closePath();
}

/** Saguaro-style cactus silhouette. */
function saguaro(path: Path2D, x: number, base: number, h: number): void {
  const w = h * 0.12;
  path.moveTo(x - w, base + 4);
  path.lineTo(x - w, base - h + w);
  path.arc(x, base - h + w, w, Math.PI, 0);
  path.lineTo(x + w, base + 4);
  path.closePath();
  for (const [s, at, up] of [[-1, 0.42, 0.3], [1, 0.55, 0.26]] as const) {
    const ax = x + s * w * 2.6;
    const ay = base - h * at;
    path.moveTo(x, ay + w * 0.7);
    path.lineTo(ax + s * w * 0.8, ay + w * 0.7);
    path.lineTo(ax + s * w * 0.8, ay - h * up + w * 0.8);
    path.arc(ax, ay - h * up + w * 0.8, w * 0.8, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : 0, s > 0);
    path.lineTo(ax - s * w * 0.8, ay - w * 0.7);
    path.lineTo(x, ay - w * 0.7);
    path.closePath();
  }
}

// ---------------------------------------------------------------- layers

function formations(): ParallaxLayer {
  const tile = 3000;
  const rng = new Rng(13);
  const f = periodic(tile, 14, [[3, 18], [7, 8]]);
  const ridgeY = (u: number) => -60 + f(u);
  const sil = new Path2D();
  const grooves = new Path2D();
  ridge(sil, tile, ridgeY, BOTTOM, 12);
  for (const [u, h, w] of [[0.08, 300, 90], [0.15, 220, 70], [0.42, 360, 110], [0.47, 250, 80], [0.74, 280, 85], [0.93, 200, 64]] as const) {
    const x = u * tile;
    wrapped(x, w, tile, (xx) => hoodoo(sil, xx, ridgeY(xx), h, w, rng, grooves));
  }
  wrapped(tile * 0.27, 260, tile, (x) => arch(sil, x, ridgeY(x), 420, 300, 70));
  wrapped(tile * 0.62, 200, tile, (x) => arch(sil, x, ridgeY(x), 300, 210, 56));
  const fills: LayerFill[] = celRidge(sil, '#f7c49a', '#eaad86', '#d8977a', 6, 22);
  fills.push({ path: grooves, color: '#dc9d7c' });
  return { tile, px: 0.12, pv: 0.22, top: -500, bottom: 120, haze: ['#ffe2bc', 0.4, -300], fills };
}

function ruins(): ParallaxLayer {
  const tile = 3200;
  const rng = new Rng(23);
  const f = periodic(tile, 24, [[2, 30], [5, 12]]);
  const ridgeY = (u: number) => -70 + f(u);
  const hill = new Path2D();
  ridge(hill, tile, ridgeY, BOTTOM, 12);
  // Rocky plateaus with cliff steps.
  for (const [u, w, h] of [[0.2, 520, 90], [0.58, 380, 120], [0.86, 300, 70]] as const) {
    wrapped(u * tile, w / 2 + 40, tile, (x) => {
      const b = ridgeY(x) + 30;
      hill.moveTo(x - w / 2 - 40, b);
      hill.bezierCurveTo(x - w / 2 - 10, b - h * 0.4, x - w / 2, b - h * 0.95, x - w / 2 + 30, b - h);
      hill.lineTo(x + w / 2 - 20, b - h - 4);
      hill.bezierCurveTo(x + w / 2 + 6, b - h * 0.9, x + w / 2 + 14, b - h * 0.4, x + w / 2 + 50, b);
      hill.closePath();
    });
  }
  const fills: LayerFill[] = celRidge(hill, '#f8c88a', '#e9a966', '#cf8a51', 6, 28);

  // Temple ruins on the first plateau: columns, a fallen lintel and a gateway.
  const stone = new Path2D();
  const dark = new Path2D();
  const px = tile * 0.2;
  const top = ridgeY(px) + 30 - 90;
  const cols = [-200, -130, -60, 10, 80, 150];
  cols.forEach((dx, i) => {
    const broken = i === 2 || i === 5;
    const h = broken ? rng.range(60, 110) : 170;
    const x = px + dx;
    stone.rect(x - 15, top - h, 30, h + 2);
    stone.rect(x - 22, top - 10, 44, 10);
    if (!broken) stone.rect(x - 22, top - h - 12, 44, 14);
    else {
      // Jagged break.
      stone.moveTo(x - 15, top - h + 1);
      stone.lineTo(x - 6, top - h - 12);
      stone.lineTo(x + 3, top - h - 4);
      stone.lineTo(x + 15, top - h - 16);
      stone.lineTo(x + 15, top - h + 1);
      stone.closePath();
    }
    // Fluting.
    for (const k of [-7, 0, 7]) dark.rect(x + k - 1, top - h + (broken ? 4 : 4), 2.2, h - 14);
  });
  // Entablature over the intact left columns, broken off at the right.
  stone.moveTo(px - 230, top - 182);
  stone.lineTo(px + 34, top - 182);
  stone.lineTo(px + 48, top - 196);
  stone.lineTo(px + 22, top - 214);
  stone.lineTo(px - 230, top - 214);
  stone.closePath();
  stone.moveTo(px - 236, top - 214);
  stone.lineTo(px - 60, top - 262);
  stone.lineTo(px - 10, top - 248);
  stone.lineTo(px - 2, top - 214);
  stone.closePath();
  dark.rect(px - 230, top - 196, 250, 3);
  // Fallen drum segments.
  ellipse(stone, px + 210, top - 12, 26, 14);
  ellipse(stone, px + 250, top - 10, 22, 12, 0.2);

  // An eroded colossal bird head (an old guardian of the badlands) on the second plateau.
  const bx = tile * 0.58;
  const bTop = ridgeY(bx) + 30 - 120;
  const head = new Path2D();
  head.moveTo(bx - 80, bTop + 2);
  head.bezierCurveTo(bx - 96, bTop - 90, bx - 60, bTop - 168, bx + 4, bTop - 172);
  head.bezierCurveTo(bx + 52, bTop - 172, bx + 74, bTop - 140, bx + 80, bTop - 110);
  // Beak.
  head.lineTo(bx + 152, bTop - 92);
  head.lineTo(bx + 82, bTop - 62);
  head.bezierCurveTo(bx + 86, bTop - 30, bx + 70, bTop - 6, bx + 60, bTop + 2);
  head.closePath();
  // Crest feathers.
  for (const [dx, h] of [[-30, 50], [-6, 64], [18, 46]] as const) {
    head.moveTo(bx + dx - 14, bTop - 160);
    head.quadraticCurveTo(bx + dx - 18, bTop - 160 - h, bx + dx + 6, bTop - 168 - h);
    head.quadraticCurveTo(bx + dx + 2, bTop - 160 - h * 0.5, bx + dx + 16, bTop - 166);
    head.closePath();
  }
  stone.addPath(head);
  circle(dark, bx + 22, bTop - 112, 14);
  dark.moveTo(bx - 6, bTop - 140);
  dark.lineTo(bx + 44, bTop - 136);
  dark.lineTo(bx + 42, bTop - 128);
  dark.lineTo(bx - 4, bTop - 132);
  dark.closePath();
  dark.rect(bx + 82, bTop - 82, 56, 3);
  // Cracks.
  dark.moveTo(bx - 50, bTop - 60);
  dark.lineTo(bx - 30, bTop - 40);
  dark.lineTo(bx - 36, bTop - 20);
  dark.lineTo(bx - 32, bTop - 20);
  dark.lineTo(bx - 26, bTop - 40);
  dark.lineTo(bx - 46, bTop - 62);
  dark.closePath();

  // Gateway arch on the third plateau.
  const gx = tile * 0.86;
  const gTop = ridgeY(gx) + 30 - 70;
  stone.rect(gx - 70, gTop - 150, 34, 152);
  stone.rect(gx + 36, gTop - 150, 34, 152);
  stone.moveTo(gx - 76, gTop - 146);
  stone.bezierCurveTo(gx - 70, gTop - 236, gx + 70, gTop - 236, gx + 76, gTop - 146);
  stone.lineTo(gx + 38, gTop - 146);
  stone.bezierCurveTo(gx + 34, gTop - 196, gx - 34, gTop - 196, gx - 38, gTop - 146);
  stone.closePath();
  for (let k = 0; k < 4; k++) dark.rect(gx - 70, gTop - 40 - k * 32, 34, 2.5);
  for (let k = 0; k < 4; k++) dark.rect(gx + 36, gTop - 40 - k * 32, 34, 2.5);

  fills.push({ path: stone, color: '#d8a173', dx: 5, dy: 4 }, { path: stone, color: '#f1c592' }, { path: stone, color: '#e2ad7b', dx: -5, dy: 3 });
  fills.push({ path: dark, color: '#bf8558' });
  return { tile, px: 0.24, pv: 0.38, top: -520, bottom: 140, haze: ['#ffe4c0', 0.3, -150], fills };
}

function dunes(): ParallaxLayer {
  const tile = 3200;
  const rng = new Rng(33);
  const crest = (u: number, period: number, phase: number) => 1 - Math.pow(Math.abs(Math.cos(((u + phase) * Math.PI) / period)), 0.75);
  const warp = periodic(tile, 34, [[3, 60]]);
  const ridgeY = (u: number) => {
    const w = u + warp(u);
    return -30 - Math.max(crest(w, 800, 0) * 95, crest(w, 640, 210) * 70 + 10);
  };
  const sil = new Path2D();
  ridge(sil, tile, ridgeY, BOTTOM, 6);
  const fills: LayerFill[] = celRidge(sil, '#ffe0a3', '#f4c47e', '#d99a5c', 5, 54);
  // Ripple marks on the windward faces.
  const ripples = new Path2D();
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, tile);
    const y = ridgeY(x) + rng.range(18, 120);
    const len = rng.range(30, 70);
    ripples.moveTo(x, y);
    ripples.quadraticCurveTo(x + len * 0.5, y - 6, x + len, y);
    ripples.quadraticCurveTo(x + len * 0.5, y - 3, x, y);
    ripples.closePath();
  }
  fills.push({ path: ripples, color: '#ffe8b8', alpha: 0.85 });
  // Cacti and dry shrubs standing on the dunes.
  const cacti = new Path2D();
  const shrubs = new Path2D();
  for (let i = 0; i < 7; i++) {
    const x = tile * (i / 7 + rng.range(0.01, 0.1));
    const h = rng.range(60, 110);
    wrapped(x, h * 0.5, tile, (xx) => saguaro(cacti, xx, ridgeY(xx) + 26, h));
  }
  for (let i = 0; i < 18; i++) {
    const x = rng.range(0, tile);
    wrapped(x, 20, tile, (xx) => blob(shrubs, xx, ridgeY(xx) + rng.range(20, 60), rng.range(10, 18), rng.range(6, 10), rng));
  }
  fills.push({ path: cacti, color: '#6f8d4e', dx: 4 }, { path: cacti, color: '#8faa5f' }, { path: shrubs, color: '#b9915a' });
  return { tile, px: 0.42, pv: 0.6, top: -240, bottom: 180, fills };
}

// ---------------------------------------------------------------- clouds and ground

function clouds(): CloudDef[] {
  const rng = new Rng(43);
  const out: CloudDef[] = [];
  for (let i = 0; i < 5; i++) {
    const w = rng.range(320, 520);
    const h = rng.range(80, 110);
    out.push({ lobes: cloudLobes(w, h, rng), w, x: i / 5 + rng.range(0, 0.08), alt: rng.range(520, 800), speed: rng.range(6, 12), depth: rng.range(0.02, 0.05), scale: rng.range(0.8, 1.1), squash: rng.range(0.38, 0.5) });
  }
  return out;
}

function ground(): GroundDef {
  const tile = 2400;
  const rng = new Rng(53);
  const fills: LayerFill[] = [];
  const band = (y0: number, y1: number, seed: number, color: string, alpha = 1) => {
    const a = periodic(tile, seed, [[2, 8], [5, 5]]);
    const b = periodic(tile, seed + 1, [[3, 7], [8, 3]]);
    const p = new Path2D();
    p.moveTo(-4, y0 + a(-4));
    for (let u = 0; u <= tile + 4; u += 16) p.lineTo(u, y0 + a(u));
    for (let u = tile + 4; u >= -4; u -= 16) p.lineTo(u, y1 + b(u));
    p.closePath();
    fills.push({ path: p, color, alpha });
  };
  band(60, 96, 81, '#e4a862');
  band(96, 108, 83, '#c9844a');
  band(150, 196, 85, '#cf8a4e');
  band(196, 206, 87, '#b26d3c');
  band(250, 300, 89, '#e09e5c', 0.8);

  // Embedded stones and a few fossil shells.
  const shade = new Path2D();
  const base = new Path2D();
  const light = new Path2D();
  for (let i = 0; i < 34; i++) {
    const x = rng.range(10, tile - 10);
    const y = rng.range(40, 320);
    const rx = rng.range(6, 15);
    const ry = rx * rng.range(0.5, 0.75);
    blob(shade, x + 1.5, y + 2, rx, ry, new Rng(i + 77));
    blob(base, x, y, rx * 0.92, ry * 0.88, new Rng(i + 77));
    ellipse(light, x - rx * 0.3, y - ry * 0.35, rx * 0.36, ry * 0.24);
  }
  fills.push({ path: shade, color: '#9c5a31' }, { path: base, color: '#e7b27a' }, { path: light, color: '#f8d6a6' });
  const fossils = new Path2D();
  for (let i = 0; i < 3; i++) {
    const x = rng.range(100, tile - 100);
    const y = rng.range(120, 260);
    for (let k = 0; k < 4; k++) {
      const a = -0.9 + k * 0.6;
      fossils.moveTo(x, y + 8);
      fossils.lineTo(x + Math.cos(a - 1.57) * 16, y + 8 + Math.sin(a - 1.57) * 16);
      fossils.lineTo(x + Math.cos(a - 1.57 + 0.3) * 16, y + 8 + Math.sin(a - 1.57 + 0.3) * 16);
      fossils.closePath();
    }
  }
  fills.push({ path: fossils, color: '#f3cf9a', alpha: 0.9 });
  const specks = new Path2D();
  for (let i = 0; i < 120; i++) circle(specks, rng.range(0, tile), rng.range(30, 340), rng.range(1.4, 3));
  fills.push({ path: specks, color: '#b97a45' });

  // Sand lip with ripples.
  const lip = periodic(tile, 91, [[10, 3], [27, 1.5]]);
  const under = new Path2D();
  const sand = new Path2D();
  const top = new Path2D();
  under.moveTo(-4, 0);
  sand.moveTo(-4, -3 + lip(-4));
  top.moveTo(-4, -4 + lip(-4));
  for (let u = -4; u <= tile + 4; u += 8) {
    under.lineTo(u, 0);
    sand.lineTo(u, -3 + lip(u));
    top.lineTo(u, -4 + lip(u));
  }
  for (let u = tile + 4; u >= -4; u -= 8) {
    under.lineTo(u, 34 + Math.sin(u * 0.02) * 6);
    sand.lineTo(u, 22 + Math.sin(u * 0.02) * 6 + lip(u));
    top.lineTo(u, 6 + Math.abs(Math.sin(u * 0.035)) * 4);
  }
  under.closePath();
  sand.closePath();
  top.closePath();
  fills.push({ path: under, color: '#a8612f', alpha: 0.45 }, { path: sand, color: '#f0c47c' }, { path: top, color: '#fde2a8' });
  const marks = new Path2D();
  for (let u = 10; u < tile; u += rng.range(18, 40)) {
    const y = rng.range(6, 16);
    const len = rng.range(10, 24);
    marks.moveTo(u, y);
    marks.quadraticCurveTo(u + len / 2, y - 3, u + len, y);
    marks.quadraticCurveTo(u + len / 2, y - 1, u, y);
    marks.closePath();
  }
  fills.push({ path: marks, color: '#dcaa64', alpha: 0.7 });
  // Pebbles resting on the surface.
  const pebbles = new Path2D();
  for (let u = 30; u < tile; u += rng.range(90, 260)) ellipse(pebbles, u, -2, rng.range(4, 8), rng.range(3, 5));
  fills.push({ path: pebbles, color: '#d49359' });

  // Sparse dry grass that leans in the hot wind.
  const sway = [0, 1].map((g) => {
    const back = new Path2D();
    const front = new Path2D();
    for (let u = 80 + g * 120; u < tile - 40; u += rng.range(260, 520)) {
      const h = rng.range(22, 40);
      tuft(back, u, h, rng, 5);
      for (let k = 0; k < 3; k++) blade(front, u + 4 + k * 4, h * rng.range(0.4, 0.7), 2, rng.range(-6, 8));
    }
    return { phase: g * 2.4, fills: [{ path: back, color: '#bf9a55' }, { path: front, color: '#e5c57f' }] };
  });
  return { tile, soil: '#d99b57', deep: '#b8713d', deepAt: 330, fills, sway };
}

let scene: SceneDef | null = null;

export function desertScene(): SceneDef {
  scene ??= {
    paintBackdrop,
    backdropPx: 0.04,
    backdropPv: 0.08,
    layers: [formations(), ruins(), dunes()],
    clouds: { style: { shade: '#f2b48a', base: '#ffe0bd', light: '#fff5e3', alpha: 0.9 }, items: clouds() },
    ground: ground(),
    ambient: 'sand',
  };
  return scene;
}
