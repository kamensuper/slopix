/** THE CELESTIAL RUINS: a starlit violet night, a ringed moon, drifting temple fragments and rune-lit marble. */
import { Rng, TAU } from '../../core/math';
import { haze, skyGradient, sun } from './envBackdrop';
import { blob, circle, cloudLobes, ellipse, periodic, ridge, wrapped } from './envKit';
import type { BackdropFrame, CloudDef, GroundDef, LayerFill, ParallaxLayer, SceneDef } from './envLayers';

const BOTTOM = 1500;

function paintBackdrop(ctx: CanvasRenderingContext2D, f: BackdropFrame, seed: number): void {
  const rng = new Rng(seed * 23 + 9);
  const span = f.viewR - f.viewL;
  skyGradient(ctx, f, [
    [0, '#0d0b2a'],
    [0.34, '#1f1750'],
    [0.64, '#4a2c82'],
    [0.86, '#8c4a9c'],
    [1, '#e58aa6'],
  ]);
  // Nebula: a few big soft colour clouds, additive.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const x = rng.range(0, f.w);
    const y = f.top + rng.range(0.1, 0.75) * (0 - f.top);
    const r = rng.range(220, 520);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = rng.pick(['90,200,255', '255,120,220', '150,110,255', '80,255,210']);
    g.addColorStop(0, `rgba(${c},0.16)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
  // Stars: many small, a few bright ones with a cross flare.
  for (let i = 0; i < 420; i++) {
    const x = rng.range(0, f.w);
    const y = f.top + Math.pow(rng.next(), 1.3) * (0 - f.top) * 0.92;
    const r = rng.range(0.8, 2.2);
    ctx.fillStyle = `rgba(255,${230 + Math.floor(rng.next() * 25)},${200 + Math.floor(rng.next() * 55)},${rng.range(0.45, 0.95)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (i % 28 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(x - 9, y - 0.8, 18, 1.6);
      ctx.fillRect(x - 0.8, y - 9, 1.6, 18);
    }
  }
  // The ringed moon.
  const mx = f.viewL + span * rng.range(0.66, 0.8);
  const my = -520;
  sun(ctx, mx, my, 92, '#f3eaff', '#b9a0ff', 560, 0.4);
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, 92, 0, TAU);
  ctx.clip();
  ctx.fillStyle = 'rgba(150,120,210,0.45)';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.arc(mx + rng.range(-70, 70), my + rng.range(-70, 70), rng.range(8, 24), 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(60,30,110,0.35)';
  ctx.beginPath();
  ctx.arc(mx + 44, my + 26, 104, 0, TAU);
  ctx.arc(mx, my, 92, 0, TAU, true);
  ctx.fill('evenodd');
  ctx.restore();
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(-0.32);
  for (const [rx, a, w] of [[176, 0.75, 7], [150, 0.5, 4], [200, 0.35, 3]] as const) {
    ctx.strokeStyle = `rgba(255,220,250,${a})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, rx * 0.2, 0, -0.18, Math.PI + 0.18);
    ctx.stroke();
  }
  ctx.restore();
  // Far shattered spires along the horizon.
  const r2 = new Rng(seed + 41);
  ctx.fillStyle = '#5a3a8a';
  for (let x = -40; x < f.w + 40; x += r2.range(70, 190)) {
    const h = r2.range(60, 210);
    const w = r2.range(26, 60);
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x + w * 0.1, -h * 0.7);
    ctx.lineTo(x + w * 0.4, -h);
    ctx.lineTo(x + w * 0.62, -h * 0.82);
    ctx.lineTo(x + w * 0.8, -h * 0.9);
    ctx.lineTo(x + w, 20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(-2, 10, f.w + 4, f.bottom);
  haze(ctx, f, -240, 20, '#e58aa6', 0.4);
  haze(ctx, f, -30, f.bottom, '#7a4a9c', 0.5);
}

/** A broken column: fluted shaft, capital, and a jagged top when `broken`. */
function column(stone: Path2D, shade: Path2D, x: number, base: number, h: number, w: number, broken: boolean): void {
  stone.rect(x - w / 2, base - h, w, h + 4);
  stone.rect(x - w * 0.72, base - 10, w * 1.44, 14);
  if (broken) {
    stone.moveTo(x - w / 2, base - h + 1);
    stone.lineTo(x - w * 0.2, base - h - w * 0.5);
    stone.lineTo(x + w * 0.08, base - h - w * 0.16);
    stone.lineTo(x + w / 2, base - h - w * 0.66);
    stone.lineTo(x + w / 2, base - h + 1);
    stone.closePath();
  } else {
    stone.rect(x - w * 0.72, base - h - 12, w * 1.44, 14);
    stone.rect(x - w * 0.6, base - h - 2, w * 1.2, 6);
  }
  for (const k of [-0.25, 0, 0.25]) shade.rect(x + k * w - 1.2, base - h + 6, 2.4, h - 18);
  shade.rect(x + w * 0.28, base - h, w * 0.22, h);
}

/** A floating slab of ruin with a column stump and a glowing crystal underneath. */
function fragment(stone: Path2D, shade: Path2D, glow: Path2D, x: number, y: number, w: number, rng: Rng): void {
  const h = w * rng.range(0.3, 0.5);
  stone.moveTo(x - w / 2, y);
  stone.lineTo(x + w / 2, y);
  stone.lineTo(x + w * 0.36, y + h * 0.4);
  stone.lineTo(x + w * 0.12, y + h * 0.7);
  stone.lineTo(x + w * 0.02, y + h);
  stone.lineTo(x - w * 0.16, y + h * 0.6);
  stone.lineTo(x - w * 0.38, y + h * 0.34);
  stone.closePath();
  shade.moveTo(x + w * 0.06, y + 3);
  shade.lineTo(x + w / 2, y + 3);
  shade.lineTo(x + w * 0.36, y + h * 0.4);
  shade.lineTo(x + w * 0.02, y + h);
  shade.closePath();
  stone.rect(x - w / 2 - 4, y - 7, w + 8, 9);
  const c = x + w * 0.02;
  glow.moveTo(c - 7, y + h + 8);
  glow.lineTo(c, y + h + 2);
  glow.lineTo(c + 7, y + h + 8);
  glow.lineTo(c, y + h + 30);
  glow.closePath();
}

function driftingRuins(): ParallaxLayer {
  const tile = 3200;
  const rng = new Rng(101);
  const stone = new Path2D();
  const shade = new Path2D();
  const glow = new Path2D();
  const halo = new Path2D();
  for (let i = 0; i < 8; i++) {
    const x = tile * (i / 8 + rng.range(0.01, 0.06));
    const y = -rng.range(140, 380);
    const w = rng.range(90, 210);
    wrapped(x, w, tile, (xx) => {
      fragment(stone, shade, glow, xx, y, w, new Rng(i + 110));
      if (i % 2 === 0) column(stone, shade, xx - w * 0.2, y - 6, w * 0.5, w * 0.12, i % 4 === 0);
      circle(halo, xx + w * 0.02, y + w * 0.45, 30);
    });
  }
  // A great broken ring (an old star gate) low on the horizon.
  const gx = tile * 0.52;
  const ring = new Path2D();
  ring.arc(gx, -90, 190, Math.PI * 1.08, Math.PI * 1.92);
  ring.arc(gx, -90, 158, Math.PI * 1.92, Math.PI * 1.08, true);
  ring.closePath();
  ring.arc(gx, -90, 190, Math.PI * 0.02, Math.PI * 0.3);
  ring.arc(gx, -90, 158, Math.PI * 0.3, Math.PI * 0.02, true);
  ring.closePath();
  const fills: LayerFill[] = [
    { path: ring, color: '#6a4aa0' },
    { path: ring, color: '#8a6ac0', dx: -4, dy: -4 },
    { path: halo, color: '#7af0ff', alpha: 0.16 },
    { path: stone, color: '#7a5fb0' },
    { path: shade, color: '#56418a' },
    { path: glow, color: '#9ff6ff' },
  ];
  return { tile, px: 0.1, pv: 0.18, top: -480, bottom: 120, haze: ['#8c4a9c', 0.28, -140], fills };
}

function temple(): ParallaxLayer {
  const tile = 3600;
  const rng = new Rng(103);
  const f = periodic(tile, 104, [[2, 22], [5, 10]]);
  const ridgeY = (u: number) => -40 + f(u);
  const hill = new Path2D();
  ridge(hill, tile, ridgeY, BOTTOM, 10);
  const fills: LayerFill[] = [
    { path: hill, color: '#b9a6e6' },
    { path: hill, color: '#3f2f78', dy: 6 },
    { path: hill, color: '#4f3c8c', dx: -30, dy: 8 },
  ];
  const stone = new Path2D();
  const shade = new Path2D();
  const rune = new Path2D();
  const crystal = new Path2D();
  const crystalLite = new Path2D();
  // A colonnade with a broken pediment, then single columns and crystal clusters.
  const cx = tile * 0.22;
  const base = ridgeY(cx) + 12;
  for (let k = 0; k < 6; k++) column(stone, shade, cx + k * 62, base, k > 3 ? 110 + k * 4 : 190, 26, k > 3);
  stone.rect(cx - 30, base - 222, 250, 22);
  stone.moveTo(cx - 36, base - 222);
  stone.lineTo(cx + 80, base - 282);
  stone.lineTo(cx + 150, base - 250);
  stone.lineTo(cx + 170, base - 222);
  stone.closePath();
  for (let k = 0; k < 7; k++) circle(rune, cx - 12 + k * 34, base - 211, 4);
  stone.rect(cx - 50, base - 6, 420, 14);
  stone.rect(cx - 70, base + 6, 460, 14);
  for (let i = 0; i < 5; i++) {
    const x = tile * (0.42 + i * 0.115) + rng.range(-30, 30);
    wrapped(x, 80, tile, (xx) => {
      const y = ridgeY(xx) + 12;
      if (i % 2 === 0) {
        const h = rng.range(120, 220);
        column(stone, shade, xx, y, h, 30, i !== 2);
        // A rune band that glows on the shaft.
        rune.rect(xx - 15, y - h * 0.55, 30, 5);
        rune.rect(xx - 15, y - h * 0.55 + 12, 30, 2.5);
      } else {
        for (let k = 0; k < 4; k++) {
          const hh = rng.range(50, 130);
          const dx = (k - 1.5) * 26;
          const lean = (k - 1.5) * 0.14;
          const w = hh * 0.17;
          const tx = xx + dx + lean * hh;
          crystal.moveTo(xx + dx - w, y + 4);
          crystal.lineTo(tx - w * 0.9, y - hh * 0.8);
          crystal.lineTo(tx, y - hh);
          crystal.lineTo(tx + w * 0.9, y - hh * 0.82);
          crystal.lineTo(xx + dx + w, y + 4);
          crystal.closePath();
          crystalLite.moveTo(xx + dx - w, y + 4);
          crystalLite.lineTo(tx - w * 0.9, y - hh * 0.8);
          crystalLite.lineTo(tx, y - hh);
          crystalLite.lineTo(tx - w * 0.1, y + 4);
          crystalLite.closePath();
        }
      }
    });
  }
  const glow = new Path2D();
  for (let i = 0; i < 5; i += 2) circle(glow, tile * (0.42 + (i + 1) * 0.115), ridgeY(tile * (0.42 + (i + 1) * 0.115)) - 40, 110);
  fills.push(
    { path: glow, color: '#7af0ff', alpha: 0.1 },
    { path: stone, color: '#9c88d2' },
    { path: shade, color: '#6a55a8' },
    { path: crystal, color: '#58c8e8' },
    { path: crystalLite, color: '#b8f6ff' },
    { path: rune, color: '#9ff6ff' },
  );
  return { tile, px: 0.26, pv: 0.4, top: -360, bottom: 160, haze: ['#7a4a9c', 0.22, -100], fills };
}

function nearRubble(): ParallaxLayer {
  const tile = 3800;
  const rng = new Rng(105);
  const f = periodic(tile, 106, [[3, 14], [7, 7], [13, 3]]);
  const ridgeY = (u: number) => Math.round((-36 + f(u)) / 12) * 12;
  const hill = new Path2D();
  ridge(hill, tile, ridgeY, BOTTOM, 6);
  const fills: LayerFill[] = [
    { path: hill, color: '#d6c8f6' },
    { path: hill, color: '#2c2060', dy: 7 },
    { path: hill, color: '#392a74', dx: -34, dy: 9 },
  ];
  const stone = new Path2D();
  const shade = new Path2D();
  const rune = new Path2D();
  for (let i = 0; i < 6; i++) {
    const x = tile * (i / 6 + rng.range(0.03, 0.1));
    wrapped(x, 120, tile, (xx) => {
      const y = ridgeY(xx) + 10;
      if (i % 3 === 0) {
        // A leaning arch with a rune keystone.
        stone.rect(xx - 80, y - 170, 30, 174);
        stone.rect(xx + 50, y - 120, 30, 124);
        stone.moveTo(xx - 84, y - 166);
        stone.bezierCurveTo(xx - 70, y - 250, xx + 30, y - 262, xx + 60, y - 210);
        stone.lineTo(xx + 36, y - 196);
        stone.bezierCurveTo(xx + 14, y - 226, xx - 44, y - 220, xx - 50, y - 166);
        stone.closePath();
        shade.rect(xx - 58, y - 170, 8, 174);
        shade.rect(xx + 72, y - 120, 8, 124);
        circle(rune, xx - 10, y - 226, 7);
      } else if (i % 3 === 1) {
        // Fallen column drums.
        for (let k = 0; k < 3; k++) {
          ellipse(stone, xx + k * 50, y - 16 - (k === 1 ? 8 : 0), 26, 18, k * 0.2);
          ellipse(shade, xx + k * 50 + 12, y - 12 - (k === 1 ? 8 : 0), 10, 14, k * 0.2);
        }
      } else {
        // A standing stone with carved, glowing lines.
        stone.moveTo(xx - 30, y + 4);
        stone.lineTo(xx - 22, y - 150);
        stone.lineTo(xx + 2, y - 176);
        stone.lineTo(xx + 26, y - 144);
        stone.lineTo(xx + 32, y + 4);
        stone.closePath();
        shade.moveTo(xx + 10, y + 4);
        shade.lineTo(xx + 8, y - 168);
        shade.lineTo(xx + 26, y - 144);
        shade.lineTo(xx + 32, y + 4);
        shade.closePath();
        for (let k = 0; k < 4; k++) rune.rect(xx - 12, y - 130 + k * 28, 12 + (k % 2) * 8, 4);
        circle(rune, xx - 4, y - 150, 5);
      }
    });
  }
  fills.push({ path: stone, color: '#5a469c' }, { path: shade, color: '#3c2d78' }, { path: rune, color: '#a8fbff' });
  return { tile, px: 0.44, pv: 0.62, top: -300, bottom: 220, fills };
}

function clouds(): CloudDef[] {
  const rng = new Rng(107);
  const out: CloudDef[] = [];
  for (let i = 0; i < 5; i++) {
    const w = rng.range(380, 640);
    const h = rng.range(60, 90);
    out.push({ lobes: cloudLobes(w, h, rng), w, x: i / 5 + rng.range(0, 0.08), alt: rng.range(300, 620), speed: rng.range(3, 7), depth: rng.range(0.02, 0.05), scale: rng.range(0.8, 1.2), squash: 0.4 });
  }
  return out;
}

function ground(): GroundDef {
  const tile = 2400;
  const rng = new Rng(109);
  const fills: LayerFill[] = [];
  // Deep violet bedrock with veins of light and buried crystal.
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
  band(120, 150, 401, '#24194f');
  band(204, 232, 403, '#4a3a8a', 0.7);
  band(292, 322, 405, '#1b123e', 0.85);
  const veins = new Path2D();
  for (let i = 0; i < 9; i++) {
    let x = rng.range(20, tile - 160);
    let y = rng.range(90, 300);
    veins.moveTo(x, y);
    const pts: [number, number][] = [];
    for (let k = 0; k < 6; k++) {
      x += rng.range(14, 30);
      y += rng.range(-12, 12);
      pts.push([x, y]);
      veins.lineTo(x, y);
    }
    for (let k = pts.length - 1; k >= 0; k--) veins.lineTo(pts[k]![0] - 2, pts[k]![1] + 3.2);
    veins.closePath();
  }
  fills.push({ path: veins, color: '#8ff0ff', alpha: 0.8 });
  const gem = new Path2D();
  const gemLite = new Path2D();
  for (let i = 0; i < 16; i++) {
    const x = rng.range(20, tile - 20);
    const y = rng.range(90, 320);
    const r = rng.range(6, 13);
    gem.moveTo(x, y - r);
    gem.lineTo(x + r * 0.7, y);
    gem.lineTo(x, y + r);
    gem.lineTo(x - r * 0.7, y);
    gem.closePath();
    gemLite.moveTo(x, y - r);
    gemLite.lineTo(x, y + r);
    gemLite.lineTo(x - r * 0.7, y);
    gemLite.closePath();
  }
  fills.push({ path: gem, color: '#7a5fe0' }, { path: gemLite, color: '#c4b4ff' });
  const stars = new Path2D();
  for (let i = 0; i < 120; i++) circle(stars, rng.range(0, tile), rng.range(70, 340), rng.range(0.9, 2));
  fills.push({ path: stars, color: '#e9dcff', alpha: 0.8 });
  const dust = new Path2D();
  for (let i = 0; i < 8; i++) blob(dust, rng.range(40, tile - 40), rng.range(150, 300), rng.range(40, 90), rng.range(10, 20), new Rng(i + 420), 8, 0.2);
  fills.push({ path: dust, color: '#a070ff', alpha: 0.14 });

  // Marble paving: big slabs with chipped corners, seams and a glowing inlaid border.
  const slab = new Path2D();
  slab.rect(-4, -4, tile + 8, 56);
  const top = new Path2D();
  top.rect(-4, -4, tile + 8, 6);
  const seams = new Path2D();
  const chips = new Path2D();
  const inlay = new Path2D();
  const marks = new Path2D();
  for (let u = 0; u < tile; u += 160) {
    seams.rect(u - 1.5, 2, 3, 50);
    chips.moveTo(u - 10, 52);
    chips.lineTo(u, 40 - rng.range(0, 8));
    chips.lineTo(u + 12, 52);
    chips.closePath();
    // Rune glyph in the middle of every slab.
    const gx = u + 80;
    marks.rect(gx - 14, 24, 28, 3);
    marks.rect(gx - 1.5, 14, 3, 22);
    circle(marks, gx, 25.5, 7);
    circle(marks, gx - 20, 25.5, 2);
    circle(marks, gx + 20, 25.5, 2);
  }
  inlay.rect(-4, 40, tile + 8, 3);
  const veining = new Path2D();
  for (let i = 0; i < 30; i++) {
    const x = rng.range(0, tile);
    const y = rng.range(6, 36);
    veining.moveTo(x, y);
    veining.quadraticCurveTo(x + rng.range(10, 30), y + rng.range(-8, 8), x + rng.range(30, 60), y + rng.range(-4, 6));
    veining.lineTo(x + rng.range(30, 60), y + 2);
    veining.quadraticCurveTo(x + 20, y + 4, x, y + 1.6);
    veining.closePath();
  }
  const under = new Path2D();
  under.rect(-4, 52, tile + 8, 12);
  fills.push(
    { path: under, color: '#0d0828', alpha: 0.5 },
    { path: slab, color: '#cfc3ee' },
    { path: veining, color: '#a898d8', alpha: 0.6 },
    { path: seams, color: '#8a78c2' },
    { path: chips, color: '#3a2a70' },
    { path: inlay, color: '#8ff0ff' },
    { path: marks, color: '#8ff0ff', alpha: 0.75 },
    { path: top, color: '#f6f0ff' },
  );
  return { tile, soil: '#33266c', deep: '#221848', deepAt: 300, fills, sway: [] };
}

let scene: SceneDef | null = null;

export function celestialScene(): SceneDef {
  scene ??= {
    paintBackdrop,
    backdropPx: 0.03,
    backdropPv: 0.06,
    layers: [driftingRuins(), temple(), nearRubble()],
    clouds: { style: { shade: '#5a3a9c', base: '#8a5ab8', light: '#d89ad0', alpha: 0.4 }, items: clouds() },
    ground: ground(),
    ambient: 'stardust',
  };
  return scene;
}
