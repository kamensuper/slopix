/** THE STORMBOUND ISLES: a bruised evening sky over a dark sea, floating islands, a lighthouse and wind-bent grass. */
import { Rng, TAU } from '../../core/math';
import { haze, skyGradient, sun } from './envBackdrop';
import { blob, celCircles, celRidge, circle, cloudLobes, ellipse, periodic, ridge, tuft, wrapped, type Circle } from './envKit';
import type { BackdropFrame, CloudDef, GroundDef, LayerFill, ParallaxLayer, SceneDef } from './envLayers';

const BOTTOM = 1500;

/** A towering thundercloud built from soft discs, lit from below by the low sun. */
function thunderhead(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rng: Rng): void {
  const lobes: [number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const t = rng.next();
    const up = Math.pow(rng.next(), 0.8);
    const spread = 1 - up * 0.55;
    lobes.push([x + (t - 0.5) * w * spread, y - up * h, (0.12 + rng.next() * 0.12) * w * (1 - up * 0.35)]);
  }
  const pass = (color: string, dx: number, dy: number, k: number): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const [lx, ly, r] of lobes) {
      ctx.moveTo(lx + dx + r * k, ly + dy);
      ctx.arc(lx + dx, ly + dy, r * k, 0, TAU);
    }
    ctx.fill();
  };
  pass('#2c3350', 6, 10, 1.02);
  pass('#3d4768', 0, 0, 1);
  pass('#55608a', -8, -10, 0.82);
  pass('#7c84ad', -14, -18, 0.5);
  // Warm underside where the last light catches it: only the lowest lobes, nudged down.
  ctx.fillStyle = 'rgba(255,166,120,0.22)';
  ctx.beginPath();
  for (const [lx, ly, r] of lobes) {
    if (ly < y - h * 0.3) continue;
    ctx.moveTo(lx + r * 0.7, ly + r * 0.3);
    ctx.arc(lx, ly + r * 0.3, r * 0.7, 0, TAU);
  }
  ctx.fill();
}

function paintBackdrop(ctx: CanvasRenderingContext2D, f: BackdropFrame, seed: number): void {
  const rng = new Rng(seed * 17 + 3);
  const span = f.viewR - f.viewL;
  skyGradient(ctx, f, [
    [0, '#1d2440'],
    [0.35, '#34416b'],
    [0.66, '#5f6f9c'],
    [0.86, '#c98f8a'],
    [0.95, '#f4b877'],
    [1, '#ffd89a'],
  ]);
  const sx = f.viewL + span * rng.range(0.62, 0.78);
  sun(ctx, sx, -70, 46, '#fff1c9', '#ffb070', 620, 0.6);
  // Thunderheads, drawn on their own canvas-wide pass so the warm underside only tints the cloud.
  for (let i = 0; i < 5; i++) {
    const x = f.w * (i / 5 + rng.range(0.02, 0.14));
    thunderhead(ctx, x, -260 - rng.range(0, 160), rng.range(520, 820), rng.range(300, 460), rng);
  }
  // Far rain curtains under the clouds.
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#dfe6ff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const x0 = f.w * rng.next();
    for (let k = 0; k < 40; k++) {
      const x = x0 + k * 7;
      ctx.beginPath();
      ctx.moveTo(x, -250 + rng.range(-20, 20));
      ctx.lineTo(x - 50, -20);
      ctx.stroke();
    }
  }
  ctx.restore();
  // The sea: a dark band with a bright streak under the sun.
  const sea = ctx.createLinearGradient(0, -26, 0, 120);
  sea.addColorStop(0, '#8f8fb0');
  sea.addColorStop(0.2, '#4a5a86');
  sea.addColorStop(1, '#27304f');
  ctx.fillStyle = sea;
  ctx.fillRect(-2, -26, f.w + 4, f.bottom + 28);
  ctx.fillStyle = 'rgba(255,214,160,0.5)';
  for (let i = 0; i < 26; i++) {
    const y = -22 + i * 4.2;
    const w = 30 + i * 9 + rng.range(-10, 10);
    ctx.fillRect(sx - w / 2 + rng.range(-14, 14), y, w, 1.8);
  }
  haze(ctx, f, -200, 0, '#e9b08a', 0.28);
}

/** A floating island: flat grassy top, tapering rock underneath with hanging roots. */
function island(rock: Path2D, grass: Path2D, shade: Path2D, x: number, y: number, w: number, h: number, rng: Rng): void {
  const n = 9;
  rock.moveTo(x - w / 2, y);
  rock.lineTo(x + w / 2, y);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const half = (w / 2) * Math.pow(1 - t, 0.85) * rng.range(0.82, 1.1);
    rock.lineTo(x + half * (1 - t * 0.3), y + h * t + rng.range(-3, 3));
  }
  rock.lineTo(x + rng.range(-w * 0.06, w * 0.06), y + h);
  for (let i = n - 1; i >= 1; i--) {
    const t = i / n;
    const half = (w / 2) * Math.pow(1 - t, 0.85) * rng.range(0.82, 1.1);
    rock.lineTo(x - half, y + h * t + rng.range(-3, 3));
  }
  rock.closePath();
  // Shadowed right flank.
  shade.moveTo(x + w * 0.1, y + 2);
  shade.lineTo(x + w / 2, y + 2);
  shade.lineTo(x + w * 0.28, y + h * 0.45);
  shade.lineTo(x + w * 0.02, y + h * 0.98);
  shade.closePath();
  // Grass cap with a drooping fringe.
  grass.moveTo(x - w / 2 - 4, y + 3);
  grass.quadraticCurveTo(x, y - h * 0.16, x + w / 2 + 4, y + 3);
  const fr = Math.max(5, Math.round(w / 16));
  for (let i = fr; i >= 0; i--) {
    const u = x - w / 2 + (i / fr) * w;
    grass.quadraticCurveTo(u + w / fr / 2, y + 10 + rng.range(2, 12), u, y + 6);
  }
  grass.closePath();
}

function farIsles(): ParallaxLayer {
  const tile = 3000;
  const rng = new Rng(61);
  const rock = new Path2D();
  const grass = new Path2D();
  const shade = new Path2D();
  for (let i = 0; i < 7; i++) {
    const x = tile * (i / 7 + rng.range(0.01, 0.07));
    const w = rng.range(120, 260);
    wrapped(x, w, tile, (xx) => island(rock, grass, shade, xx, -rng.range(150, 330), w, w * rng.range(0.5, 0.8), new Rng(i + 70)));
  }
  // Low reefs breaking the horizon.
  const f = periodic(tile, 62, [[3, 14], [7, 8]]);
  const reef = new Path2D();
  ridge(reef, tile, (u) => -8 + Math.min(0, f(u)) * 2.2, BOTTOM, 12);
  const fills: LayerFill[] = [
    { path: reef, color: '#2f3a60' },
    { path: rock, color: '#5a6690' },
    { path: shade, color: '#434d75' },
    { path: grass, color: '#7f9a9c' },
  ];
  return { tile, px: 0.1, pv: 0.18, top: -360, bottom: 120, haze: ['#9a8fa8', 0.3, -120], fills };
}

function lighthouseIsles(): ParallaxLayer {
  const tile = 3400;
  const rng = new Rng(63);
  const rock = new Path2D();
  const grass = new Path2D();
  const shade = new Path2D();
  const spots: { x: number; y: number; w: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const x = tile * (i / 5 + rng.range(0.03, 0.09));
    const w = rng.range(260, 460);
    const y = -rng.range(120, 260);
    spots.push({ x, y, w });
    wrapped(x, w, tile, (xx) => island(rock, grass, shade, xx, y, w, w * rng.range(0.55, 0.75), new Rng(i + 90)));
  }
  const fills: LayerFill[] = [
    { path: rock, color: '#4b5278' },
    { path: shade, color: '#363c5e' },
    { path: grass, color: '#5f9a7a' },
    { path: grass, color: '#84bf8a', dy: -3 },
  ];
  // Lighthouse on the first island, wind-bent trees on the others, a waterfall off the third.
  const a = spots[0]!;
  const tower = new Path2D();
  tower.moveTo(a.x - 16, a.y + 2);
  tower.lineTo(a.x - 10, a.y - 96);
  tower.lineTo(a.x + 10, a.y - 96);
  tower.lineTo(a.x + 16, a.y + 2);
  tower.closePath();
  const bands = new Path2D();
  bands.rect(a.x - 14.5, a.y - 30, 29, 14);
  bands.rect(a.x - 12, a.y - 70, 24, 14);
  const lamp = new Path2D();
  lamp.rect(a.x - 9, a.y - 114, 18, 18);
  const cap = new Path2D();
  cap.moveTo(a.x - 14, a.y - 114);
  cap.lineTo(a.x, a.y - 132);
  cap.lineTo(a.x + 14, a.y - 114);
  cap.closePath();
  cap.rect(a.x - 15, a.y - 98, 30, 4);
  const beam = new Path2D();
  beam.moveTo(a.x - 6, a.y - 105);
  beam.lineTo(a.x - 520, a.y - 170);
  beam.lineTo(a.x - 520, a.y - 70);
  beam.closePath();
  const glow = new Path2D();
  circle(glow, a.x, a.y - 105, 46);
  fills.push(
    { path: beam, color: '#fff2b8', alpha: 0.13 },
    { path: glow, color: '#ffe08a', alpha: 0.3 },
    { path: tower, color: '#e9e2dc' },
    { path: bands, color: '#c0504a' },
    { path: lamp, color: '#ffe9a0' },
    { path: cap, color: '#3a3f5c' },
  );
  const trees: Circle[] = [];
  const trunks = new Path2D();
  for (const s of spots.slice(1)) {
    for (let k = 0; k < 3; k++) {
      const x = s.x + (k - 1) * s.w * 0.24 + rng.range(-10, 10);
      const h = rng.range(44, 70);
      // Trunks lean with the prevailing wind.
      trunks.moveTo(x - 4, s.y + 2);
      trunks.quadraticCurveTo(x - 2, s.y - h * 0.6, x - h * 0.4, s.y - h);
      trunks.lineTo(x - h * 0.4 + 6, s.y - h + 2);
      trunks.quadraticCurveTo(x + 5, s.y - h * 0.5, x + 5, s.y + 2);
      trunks.closePath();
      trees.push([x - h * 0.55, s.y - h - 6, h * 0.36], [x - h * 0.95, s.y - h + 6, h * 0.26, 0], [x - h * 0.2, s.y - h + 2, h * 0.24, 0]);
    }
  }
  fills.push({ path: trunks, color: '#3b3550' }, ...celCircles(trees, '#2f6a5c', '#458a6a', '#74b784', 0.5));
  const w3 = spots[2]!;
  const fall = new Path2D();
  fall.rect(w3.x + w3.w * 0.2, w3.y + 4, 12, 360);
  const mist = new Path2D();
  for (let i = 0; i < 5; i++) circle(mist, w3.x + w3.w * 0.2 + 6 + (i - 2) * 16, w3.y + 366 - Math.abs(i - 2) * 6, 20 - Math.abs(i - 2) * 3);
  fills.push({ path: fall, color: '#dbe8ff', alpha: 0.7 }, { path: mist, color: '#eaf1ff', alpha: 0.5 });
  return { tile, px: 0.22, pv: 0.36, top: -420, bottom: 420, haze: ['#8f8aa8', 0.22, -40], fills };
}

function cliffs(): ParallaxLayer {
  const tile = 3600;
  const rng = new Rng(65);
  const f = periodic(tile, 66, [[2, 40], [5, 18], [12, 7]]);
  // Basalt bluffs with flat steps, like columns worn by the wind.
  const ridgeY = (u: number) => Math.round((-60 + f(u)) / 16) * 16;
  const hill = new Path2D();
  ridge(hill, tile, ridgeY, BOTTOM, 8);
  const fills: LayerFill[] = celRidge(hill, '#7fb07c', '#3f4a66', '#2d3550', 7, 30);
  const cols = new Path2D();
  for (let u = 0; u < tile; u += rng.range(26, 54)) cols.rect(u, ridgeY(u) + 14, 3, rng.range(60, 160));
  fills.push({ path: cols, color: '#262d47', alpha: 0.7 });
  // Lightning rods and a creaking wind vane on the bluffs.
  const metal = new Path2D();
  const orb = new Path2D();
  for (let i = 0; i < 4; i++) {
    const x = tile * (i / 4 + 0.11);
    wrapped(x, 30, tile, (xx) => {
      const y = ridgeY(xx);
      metal.rect(xx - 2.5, y - 130, 5, 134);
      metal.rect(xx - 22, y - 96, 44, 4);
      metal.rect(xx - 14, y - 70, 28, 4);
      circle(orb, xx, y - 136, 9);
    });
  }
  fills.push({ path: metal, color: '#232842' }, { path: orb, color: '#ffd76a' }, { path: orb, color: '#fff3c0', dx: -2, dy: -2, alpha: 0.7 });
  // Long grass leaning in the wind.
  const grass = new Path2D();
  for (let u = 0; u < tile; u += rng.range(20, 46)) {
    const h = rng.range(18, 40);
    const y = ridgeY(u);
    grass.moveTo(u - 3, y + 4);
    grass.quadraticCurveTo(u - 4, y - h * 0.6, u - h * 0.9, y - h);
    grass.quadraticCurveTo(u, y - h * 0.5, u + 3, y + 4);
    grass.closePath();
  }
  fills.push({ path: grass, color: '#9fd08c' });
  return { tile, px: 0.42, pv: 0.6, top: -320, bottom: 220, fills };
}

function clouds(): CloudDef[] {
  const rng = new Rng(67);
  const out: CloudDef[] = [];
  for (let i = 0; i < 7; i++) {
    const w = rng.range(320, 560);
    const h = rng.range(90, 150);
    out.push({ lobes: cloudLobes(w, h, rng), w, x: i / 7 + rng.range(0, 0.08), alt: rng.range(420, 760), speed: rng.range(18, 34), depth: rng.range(0.03, 0.07), scale: rng.range(0.8, 1.25), squash: 0.62 });
  }
  return out;
}

function ground(): GroundDef {
  const tile = 2400;
  const rng = new Rng(69);
  const fills: LayerFill[] = [];
  // Layered dark basalt with hexagonal column tops showing through.
  const band = (y0: number, y1: number, seed: number, color: string, alpha = 1) => {
    const a = periodic(tile, seed, [[3, 8], [8, 4]]);
    const b = periodic(tile, seed + 1, [[4, 7], [9, 3]]);
    const p = new Path2D();
    p.moveTo(-4, y0 + a(-4));
    for (let u = 0; u <= tile + 4; u += 16) p.lineTo(u, y0 + a(u));
    for (let u = tile + 4; u >= -4; u -= 16) p.lineTo(u, y1 + b(u));
    p.closePath();
    fills.push({ path: p, color, alpha });
  };
  band(110, 142, 201, '#2b3350');
  band(196, 224, 203, '#4b5578', 0.75);
  band(286, 318, 205, '#232a44', 0.85);
  const shade = new Path2D();
  const base = new Path2D();
  const light = new Path2D();
  for (let i = 0; i < 34; i++) {
    const x = rng.range(10, tile - 10);
    const y = rng.range(70, 320);
    const r = rng.range(7, 15);
    for (const [p, k, dx, dy] of [[shade, 1, 1.5, 2], [base, 0.9, 0, 0]] as const) {
      p.moveTo(x + dx + r * k, y + dy);
      for (let a = 1; a < 6; a++) p.lineTo(x + dx + Math.cos((a / 6) * TAU) * r * k, y + dy + Math.sin((a / 6) * TAU) * r * k * 0.7);
      p.closePath();
    }
    ellipse(light, x - r * 0.25, y - r * 0.25, r * 0.36, r * 0.18);
  }
  fills.push({ path: shade, color: '#1c2238' }, { path: base, color: '#56608a' }, { path: light, color: '#8c97bd' });
  const puddles = new Path2D();
  for (let i = 0; i < 9; i++) blob(puddles, rng.range(40, tile - 40), rng.range(60, 110), rng.range(18, 40), rng.range(3, 6), new Rng(i + 300), 8, 0.2);
  fills.push({ path: puddles, color: '#9fb3e6', alpha: 0.55 });

  // Mossy turf lip, wet and dark, with a lighter crest.
  const lump = periodic(tile, 211, [[12, 3], [31, 1.6]]);
  const under = new Path2D();
  const turfShade = new Path2D();
  const turf = new Path2D();
  under.moveTo(-4, 0);
  turfShade.moveTo(-4, -4 + lump(-4));
  turf.moveTo(-4, -5 + lump(-4));
  for (let u = -4; u <= tile + 4; u += 6) {
    under.lineTo(u, 0);
    turfShade.lineTo(u, -4 + lump(u));
    turf.lineTo(u, -5 + lump(u));
  }
  for (let u = tile + 4; u >= -4; u -= 6) {
    under.lineTo(u, 50 + Math.sin(u * 0.05) * 5);
    turfShade.lineTo(u, 34 + Math.abs(Math.sin(u * 0.05)) * 10 + lump(u));
    turf.lineTo(u, 18 + Math.abs(Math.sin(u * 0.05)) * 7 + lump(u) * 0.6);
  }
  under.closePath();
  turfShade.closePath();
  turf.closePath();
  fills.push({ path: under, color: '#141a2c', alpha: 0.4 }, { path: turfShade, color: '#2f6a5c' }, { path: turf, color: '#56a070' });
  const crest = new Path2D();
  for (let u = 4; u < tile; u += rng.range(10, 26)) ellipse(crest, u, rng.range(-1, 6), rng.range(5, 12), rng.range(1.5, 3));
  fills.push({ path: crest, color: '#8fd08c' });

  const sway = [0, 1, 2].map((g) => {
    const p = new Path2D();
    for (let u = 30 + g * 70; u < tile - 20; u += rng.range(90, 190)) tuft(p, u, rng.range(20, 36), rng, 5);
    return { phase: g * 1.7, fills: [{ path: p, color: g === 1 ? '#7fc487' : '#4f9a6c' }] };
  });
  return { tile, soil: '#39425f', deep: '#2a3149', deepAt: 300, fills, sway };
}

let scene: SceneDef | null = null;

export function stormScene(): SceneDef {
  scene ??= {
    paintBackdrop,
    backdropPx: 0.04,
    backdropPv: 0.08,
    layers: [farIsles(), lighthouseIsles(), cliffs()],
    clouds: { style: { shade: '#2a304c', base: '#4a5478', light: '#7d86ab', alpha: 0.9 }, items: clouds() },
    ground: ground(),
    ambient: 'rain',
  };
  return scene;
}
