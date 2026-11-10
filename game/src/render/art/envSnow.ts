/** THE FROSTBOUND HEIGHTS: blue-hour sky with a faint aurora, alpine ranges, a frozen lake village and snowy pines. */
import { Rng, TAU } from '../../core/math';
import { haze, range, skyGradient, sun } from './envBackdrop';
import { blob, celCircles, celRidge, circle, cloudLobes, ellipse, periodic, ridge, tuft, wrapped, type Circle } from './envKit';
import type { BackdropFrame, CloudDef, GroundDef, LayerFill, ParallaxLayer, SceneDef } from './envLayers';

const BOTTOM = 1500;

function paintBackdrop(ctx: CanvasRenderingContext2D, f: BackdropFrame, seed: number): void {
  const rng = new Rng(seed * 13 + 5);
  const span = f.viewR - f.viewL;
  skyGradient(ctx, f, [
    [0, '#5868b8'],
    [0.38, '#8494d8'],
    [0.72, '#c3c4ec'],
    [0.92, '#efd9e6'],
    [1, '#fbe6dc'],
  ]);
  aurora(ctx, f, rng);
  // A few early stars high up.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, f.w);
    const y = f.top + rng.range(0, (0 - f.top) * 0.35);
    ctx.beginPath();
    ctx.arc(x, y, rng.range(1, 2.4), 0, TAU);
    ctx.fill();
  }
  const sx = f.viewL + span * rng.range(0.14, 0.26);
  sun(ctx, sx, -560, 30, '#fff7ee', '#ffd8c8', 520, 0.5);

  range(ctx, f, {
    light: '#dcdcf4', base: '#b4b8e2', shade: '#9599cf', snow: '#fbf9ff', snowShade: '#c9c8ec', snowFrac: 0.42,
    minH: 260, maxH: 470, spacing: 400, baseY: 6, sharp: 0.9,
  }, seed + 1);
  haze(ctx, f, -320, 10, '#ecdfee', 0.55);
  range(ctx, f, {
    light: '#c8d0f0', base: '#a3acdc', shade: '#8189c2', snow: '#ffffff', snowShade: '#bec4ea', snowFrac: 0.5,
    minH: 140, maxH: 280, spacing: 300, baseY: 34, sharp: 0.85,
  }, seed + 2);
  haze(ctx, f, -110, f.bottom, '#e6e6f6', 0.45);
}

/** Soft ribbons of green-teal light high in the sky (additive, very faint). */
function aurora(ctx: CanvasRenderingContext2D, f: BackdropFrame, rng: Rng): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let band = 0; band < 3; band++) {
    const y0 = f.top + (0 - f.top) * (0.12 + band * 0.08);
    const amp = rng.range(30, 60);
    const ph = rng.range(0, TAU);
    for (let x = 0; x < f.w; x += 6) {
      const y = y0 + Math.sin(x * 0.004 + ph) * amp + Math.sin(x * 0.011 + ph * 2) * amp * 0.3;
      const h = 70 + Math.sin(x * 0.007 + band) * 30;
      const a = 0.05 * (0.6 + 0.4 * Math.sin(x * 0.003 + ph));
      const g = ctx.createLinearGradient(0, y - h, 0, y);
      g.addColorStop(0, band === 1 ? 'rgba(170,140,255,0)' : 'rgba(120,255,210,0)');
      g.addColorStop(1, band === 1 ? `rgba(170,140,255,${a})` : `rgba(120,255,210,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y - h, 6.5, h);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- shape builders

/** Snow-laden pine: dark tiers with a cap of snow on every tier. */
function snowPine(dark: Path2D, snow: Path2D, x: number, base: number, h: number, w: number, tiers = 4): void {
  const trunk = h * 0.07;
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const bottom = base - trunk - (h - trunk) * t0 * 0.8;
    const top = base - trunk - (h - trunk) * Math.min(1, t0 * 0.8 + 0.38);
    const half = (w / 2) * (1 - t0 * 0.66);
    const th = bottom - top;
    dark.moveTo(x, top);
    dark.quadraticCurveTo(x + half * 0.3, top + th * 0.5, x + half, bottom);
    dark.quadraticCurveTo(x + half * 0.5, bottom - th * 0.1, x, bottom - th * 0.04);
    dark.quadraticCurveTo(x - half * 0.5, bottom - th * 0.1, x - half, bottom);
    dark.quadraticCurveTo(x - half * 0.3, top + th * 0.5, x, top);
    dark.closePath();
    // Snow cap: follows the tier's upper edge, lumpy lower edge.
    snow.moveTo(x, top - 2);
    snow.quadraticCurveTo(x + half * 0.3, top + th * 0.5, x + half * 0.92, bottom - th * 0.04);
    snow.quadraticCurveTo(x + half * 0.6, bottom - th * 0.32, x + half * 0.3, bottom - th * 0.22);
    snow.quadraticCurveTo(x, bottom - th * 0.42, x - half * 0.35, bottom - th * 0.18);
    snow.quadraticCurveTo(x - half * 0.7, bottom - th * 0.3, x - half * 0.94, bottom - th * 0.02);
    snow.quadraticCurveTo(x - half * 0.3, top + th * 0.5, x, top - 2);
    snow.closePath();
  }
  dark.rect(x - w * 0.05, base - trunk - 2, w * 0.1, trunk + 4);
}

/** Cluster of ice crystal spires. */
function iceSpires(path: Path2D, x: number, base: number, h: number, rng: Rng): void {
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const hh = h * (i === 1 ? 1 : rng.range(0.4, 0.8));
    const dx = (i - (n - 1) / 2) * h * 0.18 + rng.range(-4, 4);
    const lean = (i - (n - 1) / 2) * 0.12 + rng.range(-0.05, 0.05);
    const w = hh * 0.16;
    const tx = x + dx + lean * hh;
    path.moveTo(x + dx - w, base + 6);
    path.lineTo(tx - w * 0.9, base - hh * 0.78);
    path.lineTo(tx, base - hh);
    path.lineTo(tx + w * 0.9, base - hh * 0.8);
    path.lineTo(x + dx + w, base + 6);
    path.closePath();
  }
}

// ---------------------------------------------------------------- layers

function farForest(): ParallaxLayer {
  const tile = 2800;
  const rng = new Rng(15);
  const f = periodic(tile, 16, [[2, 30], [5, 14]]);
  const ridgeY = (u: number) => -120 + f(u);
  const hill = new Path2D();
  ridge(hill, tile, ridgeY, BOTTOM, 10);
  const fills: LayerFill[] = celRidge(hill, '#f2f0fd', '#d9dcf3', '#c0c5e8', 5, 26);
  const dark = new Path2D();
  const snow = new Path2D();
  for (let u = 0; u < tile; u += rng.range(14, 30)) {
    if (Math.sin(u * 0.005 + 1) < -0.3) continue;
    const h = rng.range(40, 80);
    wrapped(u, h * 0.3, tile, (x) => snowPine(dark, snow, x, ridgeY(x) + 12 + rng.range(0, 30), h, h * 0.5, 3));
  }
  fills.push({ path: dark, color: '#8c96c6' }, { path: snow, color: '#e8eafa' });
  return { tile, px: 0.11, pv: 0.2, zoomK: 0.07, fills };
}

function lakeVillage(): ParallaxLayer {
  const tile = 3200;
  const rng = new Rng(25);
  const f = periodic(tile, 26, [[2, 34], [4, 16]]);
  // Hills that dip down to a long frozen lake in the middle of the tile.
  const lakeL = tile * 0.3;
  const lakeR = tile * 0.62;
  const shore = (u: number) => Math.min(1, Math.max(0, (Math.min(u - lakeL, lakeR - u) + 60) / 160));
  const ridgeY = (u: number) => -24 - (90 + f(u)) * (u > lakeL - 100 && u < lakeR + 100 ? 1 - (1 - shore(u)) : 1);
  const hill = new Path2D();
  ridge(hill, tile, ridgeY, BOTTOM, 10);
  const fills: LayerFill[] = celRidge(hill, '#ffffff', '#e4ebfa', '#c6d0ee', 6, 30);

  // Lake ice with long reflections.
  const lake = new Path2D();
  lake.moveTo(lakeL - 40, -26);
  lake.bezierCurveTo(lakeL + 60, -34, lakeR - 60, -34, lakeR + 40, -26);
  lake.bezierCurveTo(lakeR - 40, 4, lakeL + 40, 4, lakeL - 40, -26);
  lake.closePath();
  const sheen = new Path2D();
  for (let i = 0; i < 9; i++) {
    const x = lakeL + rng.range(20, lakeR - lakeL - 120);
    const y = -24 + rng.range(-4, 8);
    sheen.rect(x, y, rng.range(40, 120), 2.4);
  }
  fills.push({ path: lake, color: '#a9c8ea' }, { path: lake, color: '#c4dcf4', dy: -3, dx: -10 }, { path: sheen, color: '#f2f8ff', alpha: 0.9 });

  // A lodge with glowing windows on the lake shore, with smoke from the chimney.
  const lx = lakeR + 120;
  const lb = ridgeY(lx) + 8;
  const wall = new Path2D();
  wall.rect(lx - 60, lb - 54, 120, 56);
  wall.rect(lx + 26, lb - 104, 16, 40);
  const roofSnow = new Path2D();
  roofSnow.moveTo(lx - 78, lb - 50);
  roofSnow.lineTo(lx, lb - 104);
  roofSnow.lineTo(lx + 78, lb - 50);
  roofSnow.quadraticCurveTo(lx + 60, lb - 42, lx + 44, lb - 50);
  roofSnow.quadraticCurveTo(lx, lb - 40, lx - 44, lb - 48);
  roofSnow.quadraticCurveTo(lx - 62, lb - 40, lx - 78, lb - 50);
  roofSnow.closePath();
  const windows = new Path2D();
  windows.rect(lx - 44, lb - 38, 16, 16);
  windows.rect(lx - 8, lb - 38, 16, 22);
  windows.rect(lx + 28, lb - 38, 16, 16);
  const glow = new Path2D();
  circle(glow, lx, lb - 28, 90);
  const smoke = new Path2D();
  for (let i = 0; i < 5; i++) circle(smoke, lx + 34 + i * 10 + i * i * 2, lb - 116 - i * 22, 9 + i * 3);
  fills.push(
    { path: glow, color: '#ffc58a', alpha: 0.18 },
    { path: wall, color: '#8a6b72' },
    { path: windows, color: '#ffd27a' },
    { path: roofSnow, color: '#f7f8ff' },
    { path: smoke, color: '#eef0fb', alpha: 0.55 },
  );

  // Pines on both banks, ice spires out on the lake edge.
  const dark = new Path2D();
  const snow = new Path2D();
  for (let u = 0; u < tile; u += rng.range(18, 40)) {
    if (u > lakeL - 60 && u < lakeR + 40) continue;
    if (u > lx - 90 && u < lx + 90) continue;
    const h = rng.range(60, 120);
    wrapped(u, h * 0.3, tile, (x) => snowPine(dark, snow, x, ridgeY(x) + 10 + rng.range(0, 24), h, h * 0.48, 4));
  }
  fills.push({ path: dark, color: '#5c7aa6' }, { path: snow, color: '#f4f6ff' });
  const ice = new Path2D();
  iceSpires(ice, lakeL + 10, -22, 90, rng);
  iceSpires(ice, lakeR - 30, -22, 70, rng);
  fills.push({ path: ice, color: '#9dc9ec' }, { path: ice, color: '#d5efff', dx: -6, dy: 2 });
  return { tile, px: 0.24, pv: 0.38, zoomK: 0.15, fills };
}

function drifts(): ParallaxLayer {
  const tile = 3400;
  const rng = new Rng(35);
  const f = periodic(tile, 36, [[2, 36], [5, 18], [11, 6]]);
  const ridgeY = (u: number) => -44 + f(u);
  const hill = new Path2D();
  ridge(hill, tile, ridgeY, BOTTOM, 10);
  const fills: LayerFill[] = celRidge(hill, '#ffffff', '#eef3fd', '#cbd7f1', 8, 44);
  // Snow-buried boulders.
  const rocks: Circle[] = [];
  for (let i = 0; i < 12; i++) {
    const x = rng.range(0, tile);
    wrapped(x, 40, tile, (xx) => rocks.push([xx, ridgeY(xx) + rng.range(30, 90), rng.range(14, 26), 1]));
  }
  fills.push(...celCircles(rocks, '#bccbea', '#dce5f7', '#ffffff', 0.6));
  // Big near pines in small groves.
  const dark = new Path2D();
  const snow = new Path2D();
  for (let g = 0; g < 5; g++) {
    const u0 = tile * (g / 5 + rng.range(0.02, 0.1));
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const h = rng.range(110, 190);
      const u = u0 + i * h * 0.36;
      wrapped(u, h * 0.3, tile, (x) => snowPine(dark, snow, x, ridgeY(x) + 22, h, h * 0.5, 5));
    }
  }
  fills.push({ path: dark, color: '#2f6070', dx: 3 }, { path: dark, color: '#3e7484' }, { path: snow, color: '#c9d7f0', dy: 3 }, { path: snow, color: '#ffffff' });
  // Ice formations jutting out of the drifts.
  const ice = new Path2D();
  for (let i = 0; i < 4; i++) {
    const x = tile * (i / 4 + 0.13);
    wrapped(x, 50, tile, (xx) => iceSpires(ice, xx, ridgeY(xx) + 26, rng.range(70, 120), rng));
  }
  fills.push({ path: ice, color: '#7fb6e2' }, { path: ice, color: '#bfe4fb', dx: -7, dy: 3 }, { path: ice, color: '#ecf9ff', dx: -12, dy: 10, alpha: 0.7 });
  return { tile, px: 0.42, pv: 0.6, zoomK: 0.24, fills };
}

// ---------------------------------------------------------------- clouds and ground

function clouds(): CloudDef[] {
  const rng = new Rng(45);
  const out: CloudDef[] = [];
  for (let i = 0; i < 5; i++) {
    const w = rng.range(280, 460);
    const h = rng.range(80, 120);
    out.push({ lobes: cloudLobes(w, h, rng), w, x: i / 5 + rng.range(0, 0.08), alt: rng.range(480, 760), speed: rng.range(4, 9), depth: rng.range(0.02, 0.05), scale: rng.range(0.75, 1.1), squash: 0.7 });
  }
  return out;
}

function ground(): GroundDef {
  const tile = 2400;
  const rng = new Rng(55);
  const fills: LayerFill[] = [];
  const band = (y0: number, y1: number, seed: number, color: string, alpha = 1) => {
    const a = periodic(tile, seed, [[3, 9], [7, 4]]);
    const b = periodic(tile, seed + 1, [[4, 8], [9, 3]]);
    const p = new Path2D();
    p.moveTo(-4, y0 + a(-4));
    for (let u = 0; u <= tile + 4; u += 16) p.lineTo(u, y0 + a(u));
    for (let u = tile + 4; u >= -4; u -= 16) p.lineTo(u, y1 + b(u));
    p.closePath();
    fills.push({ path: p, color, alpha });
  };
  band(120, 150, 101, '#5f6a8c');
  band(200, 226, 103, '#7c87a8', 0.8);
  band(290, 320, 105, '#4c5574', 0.8);
  // Frozen stones and ice veins.
  const shade = new Path2D();
  const base = new Path2D();
  const light = new Path2D();
  for (let i = 0; i < 38; i++) {
    const x = rng.range(10, tile - 10);
    const y = rng.range(70, 320);
    const rx = rng.range(6, 15);
    const ry = rx * rng.range(0.55, 0.8);
    blob(shade, x + 1.5, y + 2, rx, ry, new Rng(i + 31));
    blob(base, x, y, rx * 0.92, ry * 0.88, new Rng(i + 31));
    ellipse(light, x - rx * 0.3, y - ry * 0.35, rx * 0.36, ry * 0.24);
  }
  fills.push({ path: shade, color: '#3e4663' }, { path: base, color: '#8f9bbb' }, { path: light, color: '#c3cce3' });
  const veins = new Path2D();
  for (let i = 0; i < 7; i++) {
    let x = rng.range(40, tile - 80);
    let y = rng.range(80, 260);
    veins.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += rng.range(8, 20);
      y += rng.range(-10, 10);
      veins.lineTo(x, y);
    }
    for (let k = 0; k < 5; k++) {
      x -= rng.range(8, 20);
      y += 3;
      veins.lineTo(x, y);
    }
    veins.closePath();
  }
  fills.push({ path: veins, color: '#a9d8f0', alpha: 0.75 });
  const specks = new Path2D();
  for (let i = 0; i < 110; i++) circle(specks, rng.range(0, tile), rng.range(60, 340), rng.range(1.4, 3));
  fills.push({ path: specks, color: '#7b86a6' });

  // Thick snow lip: lumpy top, cool shadow at its base, sparkles.
  const lump = periodic(tile, 111, [[14, 4], [33, 2]]);
  const under = new Path2D();
  const snowShade = new Path2D();
  const snow = new Path2D();
  under.moveTo(-4, 0);
  snowShade.moveTo(-4, -6 + lump(-4));
  snow.moveTo(-4, -7 + lump(-4));
  for (let u = -4; u <= tile + 4; u += 6) {
    const bump = Math.pow(Math.abs(Math.sin(u * 0.03)), 0.6) * 5;
    under.lineTo(u, 0);
    snowShade.lineTo(u, -5 + lump(u) - bump);
    snow.lineTo(u, -7 + lump(u) - bump);
  }
  for (let u = tile + 4; u >= -4; u -= 6) {
    under.lineTo(u, 52 + Math.sin(u * 0.05) * 5);
    snowShade.lineTo(u, 40 + Math.abs(Math.sin(u * 0.028)) * 9 + lump(u));
    snow.lineTo(u, 26 + Math.abs(Math.sin(u * 0.028)) * 8 + lump(u) * 0.6);
  }
  under.closePath();
  snowShade.closePath();
  snow.closePath();
  fills.push({ path: under, color: '#2d3450', alpha: 0.35 }, { path: snowShade, color: '#bcd0ee' }, { path: snow, color: '#f6f9ff' });
  const sparkle = new Path2D();
  for (let u = 6; u < tile; u += rng.range(14, 40)) circle(sparkle, u, rng.range(-2, 18), rng.range(1.2, 2.2));
  fills.push({ path: sparkle, color: '#ffffff' });
  const blue = new Path2D();
  for (let u = 10; u < tile; u += rng.range(30, 70)) ellipse(blue, u, rng.range(10, 24), rng.range(8, 16), rng.range(2, 3.5));
  fills.push({ path: blue, color: '#dce6f8' });

  // A few frosted grass stalks poking out of the snow.
  const sway = [0, 1].map((g) => {
    const p = new Path2D();
    for (let u = 140 + g * 200; u < tile - 40; u += rng.range(380, 700)) tuft(p, u, rng.range(18, 30), rng, 4);
    return { phase: g * 2.4, fills: [{ path: p, color: '#a7a3a8' }] };
  });
  return { tile, soil: '#6c7697', deep: '#545c7b', deepAt: 300, fills, sway };
}

let scene: SceneDef | null = null;

export function snowScene(): SceneDef {
  scene ??= {
    paintBackdrop,
    backdropPx: 0.04,
    backdropPv: 0.08,
    layers: [farForest(), lakeVillage(), drifts()],
    clouds: { style: { shade: '#b7b4e0', base: '#e2e2f6', light: '#fbf6ff', alpha: 0.88 }, items: clouds() },
    ground: ground(),
    ambient: 'snow',
  };
  return scene;
}
