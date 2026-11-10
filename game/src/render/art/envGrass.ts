/** THE SUNLIT WILDLANDS: warm sun, cumulus, misty peaks, a far waterfall, forests and meadows. */
import { Rng } from '../../core/math';
import { haze, range, rays, skyGradient, sun } from './envBackdrop';
import {
  blade,
  broadleaf,
  canopyCircles,
  type Circle,
  blob,

  celCircles,
  celRidge,
  circle,
  cloudLobes,
  ellipse,
  periodic,
  ridge,
  tuft,
  wrapped,
} from './envKit';
import type { BackdropFrame, CloudDef, GroundDef, LayerFill, ParallaxLayer, SceneDef } from './envLayers';

const BOTTOM = 1500;

function paintBackdrop(ctx: CanvasRenderingContext2D, f: BackdropFrame, seed: number): void {
  const rng = new Rng(seed * 31 + 7);
  const span = f.viewR - f.viewL;
  skyGradient(ctx, f, [
    [0, '#3aa3e8'],
    [0.42, '#64c0f2'],
    [0.78, '#a9e0f8'],
    [1, '#e4f5ea'],
  ]);
  const sx = f.viewL + span * rng.range(0.12, 0.24);
  rays(ctx, sx, -640, 1200, '#fff6d0', 0.035, seed);
  sun(ctx, sx, -640, 34, '#fffef6', '#fff0b0', 560, 0.55);

  range(ctx, f, {
    light: '#cfe0f1', base: '#a9c3e1', shade: '#94afd6', snow: '#f4f8fd', snowShade: '#cfdcef', snowFrac: 0.2,
    minH: 170, maxH: 330, spacing: 340, baseY: 10, sharp: 0.75,
  }, seed + 1);
  haze(ctx, f, -300, 10, '#e2f3f6', 0.6);

  // Waterfall plateau: a hazy mesa of green with a tall ribbon of water and mist.
  const wx = f.viewL + span * rng.range(0.55, 0.78);
  waterfall(ctx, wx, rng);

  range(ctx, f, {
    light: '#c9e6bc', base: '#b0d6a9', shade: '#a0c89d', minH: 50, maxH: 120, spacing: 240, baseY: 40, sharp: 0.1,
  }, seed + 2);
  haze(ctx, f, -80, f.bottom, '#e9f7ea', 0.35);
}

function waterfall(ctx: CanvasRenderingContext2D, x: number, rng: Rng): void {
  const top = -270;
  const w = 470;
  ctx.save();
  // Cliff body.
  const body = new Path2D();
  body.moveTo(x - w * 0.62, 60);
  body.bezierCurveTo(x - w * 0.6, top + 80, x - w * 0.52, top + 12, x - w * 0.4, top + 4);
  body.quadraticCurveTo(x - w * 0.1, top - 16, x + w * 0.16, top - 2);
  body.quadraticCurveTo(x + w * 0.4, top + 6, x + w * 0.46, top + 40);
  body.bezierCurveTo(x + w * 0.52, top + 120, x + w * 0.62, top + 200, x + w * 0.7, 60);
  body.closePath();
  const g = ctx.createLinearGradient(0, top, 0, 40);
  g.addColorStop(0, '#a9c8b6');
  g.addColorStop(1, '#b9d6cb');
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.clip(body);
  // Rock strata on the cliff face and the shaded right flank.
  ctx.fillStyle = '#9dbcb0';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.12, top);
  ctx.lineTo(x + w * 0.2, top + 120);
  ctx.lineTo(x + w * 0.32, 60);
  ctx.lineTo(x + w, 60);
  ctx.lineTo(x + w, top - 30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a2c0b2';
  ctx.lineWidth = 4;
  for (let i = 0; i < 6; i++) {
    const y = top + 40 + i * 38;
    ctx.beginPath();
    ctx.moveTo(x - w, y + rng.range(-6, 6));
    ctx.quadraticCurveTo(x, y + rng.range(-12, 12), x + w, y + rng.range(-6, 6));
    ctx.stroke();
  }
  // Grassy cap with tree clumps.
  ctx.fillStyle = '#a9d39c';
  ctx.beginPath();
  ctx.moveTo(x - w, top - 40);
  ctx.lineTo(x + w, top - 40);
  ctx.lineTo(x + w, top + 18);
  ctx.quadraticCurveTo(x, top + 34, x - w, top + 20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#9fcb98';
  for (let i = 0; i < 9; i++) {
    const cx = x - w * 0.36 + (i / 8) * w * 0.74 + rng.range(-10, 10);
    if (Math.abs(cx - (x - w * 0.02)) < 34) continue;
    ctx.beginPath();
    ctx.arc(cx, top - 4 - rng.range(0, 6), rng.range(14, 24), 0, Math.PI * 2);
    ctx.fill();
  }
  // Water ribbon.
  const fx = x - w * 0.02;
  const ribbon = new Path2D();
  ribbon.moveTo(fx - 16, top - 4);
  ribbon.bezierCurveTo(fx - 22, top + 30, fx - 20, top + 120, fx - 30, 40);
  ribbon.lineTo(fx + 30, 40);
  ribbon.bezierCurveTo(fx + 22, top + 120, fx + 24, top + 30, fx + 16, top - 4);
  ribbon.closePath();
  const wg = ctx.createLinearGradient(0, top, 0, 40);
  wg.addColorStop(0, '#e9f8ff');
  wg.addColorStop(1, '#ffffff');
  ctx.fillStyle = wg;
  ctx.fill(ribbon);
  ctx.save();
  ctx.clip(ribbon);
  ctx.strokeStyle = '#c8e6f5';
  ctx.lineWidth = 3;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(fx + i * 5, top);
    ctx.lineTo(fx + i * 8, 40);
    ctx.stroke();
  }
  ctx.restore();
  // Mist at the foot.
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.arc(fx + rng.range(-60, 60), rng.range(-34, 6), rng.range(16, 32), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- parallax layers

function farHills(): ParallaxLayer {
  const tile = 2600;
  const rng = new Rng(11);
  const f = periodic(tile, 12, [[2, 38], [5, 16], [11, 6]]);
  const ridgeY = (u: number) => -150 + f(u);
  const sil = new Path2D();
  ridge(sil, tile, ridgeY, BOTTOM, 10);
  for (let u = 0; u < tile; u += rng.range(14, 30)) {
    if (Math.sin(u * 0.004 + 1) < -0.2) continue;
    const r = rng.range(9, 17);
    wrapped(u, r, tile, (x) => circle(sil, x, ridgeY(x) + r * 0.45, r));
  }
  return {
    tile, px: 0.1, pv: 0.18, zoomK: 0.06,
    fills: celRidge(sil, '#cde7bb', '#aed59f', '#9cc896', 5, 24),
  };
}

function forestHills(): ParallaxLayer {
  const tile = 3000;
  const rng = new Rng(21);
  const f = periodic(tile, 22, [[2, 44], [3, 24], [7, 9]]);
  const ridgeY = (u: number) => -105 + f(u);
  const hill = new Path2D();
  ridge(hill, tile, ridgeY, BOTTOM, 10);
  const fills: LayerFill[] = [...celRidge(hill, '#a6d982', '#86c565', '#74b35c', 6, 30)];

  // Forest belts following the ridge.
  const density = (u: number) => Math.sin(u * 0.0042 + 0.4) + Math.sin(u * 0.011) * 0.4;
  // Forest body draping down the slope wherever the woods are dense.
  const body = new Path2D();
  const depth = (u: number) => (density(u) > -0.15 ? (density(u) + 0.15) * 70 + Math.sin(u * 0.05) * 6 : 0);
  body.moveTo(-6, ridgeY(-6));
  for (let u = -6; u <= tile + 6; u += 10) body.lineTo(u, ridgeY(u) + 4);
  for (let u = tile + 6; u >= -6; u -= 10) body.lineTo(u, ridgeY(u) + 4 + depth(u));
  body.closePath();
  fills.push({ path: body, color: '#5c9f55' });
  const forest: Circle[] = [];
  const lower: Circle[] = [];
  for (let u = 0; u < tile; u += rng.range(20, 34)) {
    const d = density(u);
    if (d < -0.15) continue;
    const r = rng.range(14, 22) + d * 6;
    const lift = rng.range(0, 12);
    wrapped(u, r * 1.6, tile, (x) => broadleaf(forest, x, ridgeY(x) + 14 - lift, r, rng));
    const dd = depth(u);
    if (dd > 30) wrapped(u + 12, r, tile, (x) => lower.push([x, ridgeY(x) + dd * rng.range(0.45, 0.85), r * 0.7, 0]));
  }
  fills.push(...celCircles(lower, '#4f9450', '#5fa457', '#86c464', 0.5));
  fills.push(...celCircles(forest, '#4c9150', '#62a858', '#86c464', 0.5));

  // Three ancient umbrella trees towering over the forest: thick gnarled trunks, wide crowns.
  const trunks = new Path2D();
  const crowns: Circle[] = [];
  for (const [u, scale] of [[tile * 0.16, 1], [tile * 0.53, 0.8], [tile * 0.81, 1.1]] as const) {
    wrapped(u, 200 * scale, tile, (x) => {
      const base = ridgeY(x) + 10;
      const h = 190 * scale;
      const k = scale;
      trunks.moveTo(x - 30 * k, base);
      trunks.bezierCurveTo(x - 12 * k, base - h * 0.25, x - 24 * k, base - h * 0.7, x - 10 * k, base - h);
      trunks.lineTo(x + 12 * k, base - h);
      trunks.bezierCurveTo(x + 12 * k, base - h * 0.6, x + 8 * k, base - h * 0.25, x + 34 * k, base);
      trunks.closePath();
      // Limbs fanning out under the crown.
      for (const [s, reach, rise] of [[-1, 120, 0.95], [1, 130, 0.92], [-1, 60, 1.05], [1, 70, 1.08]] as const) {
        trunks.moveTo(x + s * 6 * k, base - h * 0.62);
        trunks.quadraticCurveTo(x + s * reach * 0.45 * k, base - h * (rise - 0.05), x + s * reach * k, base - h * rise - 8 * k);
        trunks.lineTo(x + s * (reach - 6) * k, base - h * rise + 2 * k);
        trunks.quadraticCurveTo(x + s * reach * 0.4 * k, base - h * (rise - 0.18), x - s * 4 * k, base - h * 0.5);
        trunks.closePath();
      }
      const r = new Rng(Math.round(x));
      const top = base - h - 26 * k;
      for (let i = 0; i < 11; i++) {
        const t = i / 10 - 0.5;
        const rr = (34 + (1 - Math.abs(t) * 1.6) * 22) * k * r.range(0.85, 1.1);
        crowns.push([x + t * 300 * k, top + Math.abs(t) * 70 * k + r.range(-10, 6) * k, rr, i % 2]);
      }
      crowns.push([x - 30 * k, top - 34 * k, 50 * k, 1], [x + 40 * k, top - 28 * k, 44 * k, 1]);
    });
  }
  fills.push({ path: trunks, color: '#6b6e55' });
  fills.push(...celCircles(crowns, '#45874a', '#5a9d53', '#86c35f', 0.5));

  // A distant cottage with a warm roof, half hidden by the trees.
  const cot = new Path2D();
  const roof = new Path2D();
  const cx = tile * 0.36;
  const cb = ridgeY(cx) + 4;
  cot.rect(cx - 26, cb - 30, 52, 32);
  roof.moveTo(cx - 34, cb - 28);
  roof.lineTo(cx, cb - 56);
  roof.lineTo(cx + 34, cb - 28);
  roof.closePath();
  fills.push({ path: cot, color: '#efe2c6' }, { path: roof, color: '#cf6a4a' });
  const win = new Path2D();
  win.rect(cx - 14, cb - 20, 9, 9);
  win.rect(cx + 6, cb - 20, 9, 9);
  fills.push({ path: win, color: '#8a6a4f' });
  return { tile, px: 0.22, pv: 0.36, zoomK: 0.14, fills };
}

function meadows(): ParallaxLayer {
  const tile = 3400;
  const rng = new Rng(31);
  const f = periodic(tile, 32, [[2, 34], [4, 22], [9, 8]]);
  const ridgeY = (u: number) => -46 + f(u);
  const hill = new Path2D();
  ridge(hill, tile, ridgeY, BOTTOM, 10);
  const fills: LayerFill[] = [...celRidge(hill, '#b6e979', '#8bd152', '#77be47', 8, 36)];

  // Bush clumps scattered over the slopes.
  const bushes: Circle[] = [];
  for (let u = rng.range(0, 200); u < tile; u += rng.range(140, 380)) {
    const n = rng.int(2, 4);
    const y0 = rng.range(30, 90);
    for (let i = 0; i < n; i++) {
      const r = rng.range(10, 20);
      wrapped(u, 80, tile, (x) => bushes.push([x + i * r * 1.1, ridgeY(x + i * r * 1.1) + y0 - r * 0.5, r, i === 1 ? 1 : 0]));
    }
  }
  fills.push(...celCircles(bushes, '#4c9a3c', '#5fb046', '#84cc58', 0.5));

  // Lone round trees.
  const trunks = new Path2D();
  const crowns: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const u = tile * (i / 6 + rng.range(0.02, 0.12));
    const size = rng.range(0.75, 1.2);
    wrapped(u, 80 * size, tile, (x) => {
      const base = ridgeY(x) + 14;
      trunks.moveTo(x - 7 * size, base);
      trunks.quadraticCurveTo(x - 3 * size, base - 50 * size, x - 4 * size, base - 80 * size);
      trunks.lineTo(x + 5 * size, base - 80 * size);
      trunks.quadraticCurveTo(x + 4 * size, base - 50 * size, x + 9 * size, base);
      trunks.closePath();
      crowns.push(...canopyCircles(x, base - 110 * size, 62 * size, 50 * size, new Rng(Math.round(x) + 3), 7));
    });
  }
  fills.push({ path: trunks, color: '#73563d' });
  fills.push(...celCircles(crowns, '#3f8f3a', '#57aa46', '#86cf58', 0.52));

  // Wildflower specks.
  const colors = ['#ffffff', '#ffd94f', '#ff9cc2'];
  for (const color of colors) {
    const p = new Path2D();
    for (let i = 0; i < 160; i++) {
      const x = rng.range(0, tile);
      circle(p, x, ridgeY(x) + rng.range(12, 160), rng.range(2.2, 3.6));
    }
    fills.push({ path: p, color });
  }
  return { tile, px: 0.4, pv: 0.6, zoomK: 0.24, fills };
}

// ---------------------------------------------------------------- clouds

function clouds(): CloudDef[] {
  const rng = new Rng(41);
  const out: CloudDef[] = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const w = rng.range(240, 420);
    const h = rng.range(80, 130);
    out.push({ lobes: cloudLobes(w, h, rng), w, x: i / n + rng.range(0, 0.08), alt: rng.range(430, 760), speed: rng.range(5, 11), depth: rng.range(0.02, 0.06), scale: rng.range(0.75, 1.15) });
  }
  return out;
}

// ---------------------------------------------------------------- ground

function ground(): GroundDef {
  const tile = 2400;
  const rng = new Rng(51);
  const fills: LayerFill[] = [];
  const band = (y0: number, y1: number, seed: number, color: string, alpha = 1) => {
    const a = periodic(tile, seed, [[3, 10], [7, 5]]);
    const b = periodic(tile, seed + 1, [[4, 9], [9, 4]]);
    const p = new Path2D();
    p.moveTo(-4, y0 + a(-4));
    for (let u = 0; u <= tile + 4; u += 16) p.lineTo(u, y0 + a(u));
    for (let u = tile + 4; u >= -4; u -= 16) p.lineTo(u, y1 + b(u));
    p.closePath();
    fills.push({ path: p, color, alpha });
  };
  band(115, 150, 61, '#6a4428');
  band(205, 228, 63, '#8a603b', 0.8);
  band(300, 330, 65, '#4f321c', 0.7);

  // Pebbles and specks.
  const shade = new Path2D();
  const base = new Path2D();
  const light = new Path2D();
  for (let i = 0; i < 46; i++) {
    const x = rng.range(10, tile - 10);
    const y = rng.range(60, 300);
    const rx = rng.range(6, 16);
    const ry = rx * rng.range(0.55, 0.8);
    const r2 = new Rng(i + 5);
    blob(shade, x + 1.5, y + 2, rx, ry, r2);
    blob(base, x, y, rx * 0.92, ry * 0.88, new Rng(i + 5));
    ellipse(light, x - rx * 0.3, y - ry * 0.35, rx * 0.38, ry * 0.25);
  }
  fills.push({ path: shade, color: '#4a301b' }, { path: base, color: '#9a7a5a' }, { path: light, color: '#c4a885' });
  const specks = new Path2D();
  for (let i = 0; i < 140; i++) circle(specks, rng.range(0, tile), rng.range(40, 340), rng.range(1.5, 3.2));
  fills.push({ path: specks, color: '#94693f' });
  // Roots.
  const roots = new Path2D();
  for (let i = 0; i < 9; i++) {
    const x = rng.range(20, tile - 60);
    const len = rng.range(40, 90);
    roots.moveTo(x, 18);
    roots.bezierCurveTo(x + 6, 18 + len * 0.4, x + len * 0.4, 18 + len * 0.6, x + len * 0.55, 18 + len);
    roots.lineTo(x + len * 0.55 + 2.5, 18 + len - 1);
    roots.bezierCurveTo(x + len * 0.45, 18 + len * 0.55, x + 12, 18 + len * 0.35, x + 7, 18);
    roots.closePath();
  }
  fills.push({ path: roots, color: '#5a3a21', alpha: 0.85 });

  // Grass lip: shadow under the turf, scalloped turf, sunlit top.
  const lip = periodic(tile, 71, [[12, 3], [31, 2]]);
  const scallop = (u: number, depth: number) => depth + Math.abs(Math.sin(u * 0.045)) * 9 + lip(u) * 1.5;
  const under = new Path2D();
  const turf = new Path2D();
  const top = new Path2D();
  under.moveTo(-4, 0);
  turf.moveTo(-4, -3 + lip(-4));
  top.moveTo(-4, -5 + lip(-4));
  for (let u = -4; u <= tile + 4; u += 8) {
    under.lineTo(u, 0);
    turf.lineTo(u, -3 + lip(u));
    top.lineTo(u, -5 + lip(u));
  }
  for (let u = tile + 4; u >= -4; u -= 6) {
    under.lineTo(u, scallop(u, 34));
    turf.lineTo(u, scallop(u, 22));
    top.lineTo(u, 7 + lip(u) * 0.8 + Math.abs(Math.sin(u * 0.06)) * 3);
  }
  under.closePath();
  turf.closePath();
  top.closePath();
  fills.push({ path: under, color: '#4b2f18', alpha: 0.55 }, { path: turf, color: '#4fa83a' }, { path: top, color: '#7fcf4a' });

  // Short static blades along the lip.
  const dark = new Path2D();
  const lit = new Path2D();
  for (let u = 4; u < tile; u += rng.range(5, 11)) {
    const h = rng.range(8, 20);
    blade(rng.next() < 0.5 ? dark : lit, u, h, 3, rng.range(-4, 6));
  }
  fills.push({ path: dark, color: '#3f9a3a' }, { path: lit, color: '#8fd655' });

  // Swaying tufts in three phase groups.
  const sway = [0, 1, 2].map((g) => {
    const back = new Path2D();
    const front = new Path2D();
    for (let u = 30 + g * 47; u < tile - 30; u += rng.range(110, 230)) {
      const h = rng.range(26, 50);
      tuft(back, u, h, rng, 5);
      tuft(front, u + 6, h * 0.75, rng, 4);
    }
    return { phase: g * 2.1, fills: [{ path: back, color: '#3a9036' }, { path: front, color: '#86d24f' }] };
  });

  // Little flowers nestled in the grass.
  const petals = new Path2D();
  const pink = new Path2D();
  const hearts = new Path2D();
  for (let u = 60; u < tile; u += rng.range(140, 320)) {
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const x = u + k * rng.range(10, 18);
      const y = -rng.range(8, 16);
      const target = rng.next() < 0.65 ? petals : pink;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        circle(target, x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3.2);
      }
      circle(hearts, x, y, 2.6);
    }
  }
  return {
    tile, soil: '#7a4f2c', deep: '#5c3a20', deepAt: 260, fills, sway,
    over: [{ path: petals, color: '#ffffff' }, { path: pink, color: '#ff9cc2' }, { path: hearts, color: '#ffc93a' }],
  };
}

let scene: SceneDef | null = null;

export function grassScene(): SceneDef {
  scene ??= {
    paintBackdrop,
    backdropPx: 0.04,
    backdropPv: 0.08,
    layers: [farHills(), forestHills(), meadows()],
    clouds: { style: { shade: '#c6d8f0', base: '#eef4fb', light: '#ffffff', alpha: 0.97 }, items: clouds() },
    ground: ground(),
    ambient: 'pollen',
  };
  return scene;
}
