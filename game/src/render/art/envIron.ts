/** THE IRONWORKS: a smoggy amber sky, a skyline of chimneys and furnaces, cranes, cog wheels and riveted steel underfoot. */
import { Rng, TAU } from '../../core/math';
import { haze, skyGradient, sun } from './envBackdrop';
import { blob, circle, cloudLobes, ellipse, periodic, ridge, wrapped } from './envKit';
import type { BackdropFrame, CloudDef, GroundDef, LayerFill, ParallaxLayer, SceneDef } from './envLayers';

const BOTTOM = 1500;

function paintBackdrop(ctx: CanvasRenderingContext2D, f: BackdropFrame, seed: number): void {
  const rng = new Rng(seed * 19 + 7);
  const span = f.viewR - f.viewL;
  skyGradient(ctx, f, [
    [0, '#3b2a3a'],
    [0.3, '#6a3f45'],
    [0.6, '#b8623f'],
    [0.84, '#eda052'],
    [1, '#ffd98a'],
  ]);
  const sx = f.viewL + span * rng.range(0.2, 0.34);
  sun(ctx, sx, -230, 58, '#ffe9b0', '#ff9a4a', 700, 0.55);
  // Bands of smog drifting across the sun.
  for (let i = 0; i < 9; i++) {
    const y = -520 + i * 56 + rng.range(-16, 16);
    const g = ctx.createLinearGradient(0, y - 22, 0, y + 22);
    g.addColorStop(0, 'rgba(70,40,48,0)');
    g.addColorStop(0.5, `rgba(70,40,48,${0.1 + rng.next() * 0.14})`);
    g.addColorStop(1, 'rgba(70,40,48,0)');
    ctx.fillStyle = g;
    const x = rng.range(-200, f.w * 0.6);
    ctx.fillRect(x, y - 22, rng.range(f.w * 0.4, f.w), 44);
  }
  // Far skyline: stacks, gasometers and sheds as one silhouette, with a second paler row behind it.
  for (let row = 0; row < 2; row++) {
    const r2 = new Rng(seed + row * 31 + 11);
    ctx.fillStyle = row === 0 ? '#a45a45' : '#7b4244';
    const base = row === 0 ? 4 : 30;
    let x = -40;
    while (x < f.w + 40) {
      const kind = r2.int(0, 3);
      const w = r2.range(50, 140);
      const h = r2.range(60, 170) * (row === 0 ? 1.15 : 0.85);
      if (kind === 0) {
        // Chimney with a flared lip and a smoke plume.
        const cw = 18 + r2.range(0, 10);
        ctx.fillRect(x, base - h * 1.5, cw, h * 1.5 + 60);
        ctx.fillRect(x - 4, base - h * 1.5 - 6, cw + 8, 8);
        ctx.save();
        ctx.globalAlpha = 0.35;
        for (let k = 0; k < 7; k++) {
          ctx.beginPath();
          ctx.arc(x + cw / 2 + k * 16 + k * k * 1.5, base - h * 1.5 - 18 - k * 20, 12 + k * 6, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        x += cw + r2.range(20, 60);
      } else if (kind === 1) {
        // Gasometer: a drum with a domed top.
        ctx.fillRect(x, base - h * 0.7, w, h * 0.7 + 60);
        ctx.beginPath();
        ctx.ellipse(x + w / 2, base - h * 0.7, w / 2, w * 0.16, 0, Math.PI, TAU);
        ctx.fill();
        x += w + r2.range(10, 40);
      } else {
        // Saw-tooth factory shed.
        ctx.beginPath();
        ctx.moveTo(x, base + 60);
        ctx.lineTo(x, base - h * 0.45);
        const teeth = Math.max(2, Math.round(w / 34));
        for (let k = 0; k < teeth; k++) {
          const tx = x + (k / teeth) * w;
          ctx.lineTo(tx + w / teeth, base - h * 0.45 - 22);
          ctx.lineTo(tx + w / teeth, base - h * 0.45);
        }
        ctx.lineTo(x + w, base + 60);
        ctx.closePath();
        ctx.fill();
        x += w + r2.range(8, 30);
      }
    }
    haze(ctx, f, -260, base + 20, '#f0a060', row === 0 ? 0.3 : 0.16);
  }
  ctx.fillStyle = '#6a3a3e';
  ctx.fillRect(-2, 30, f.w + 4, f.bottom);
  haze(ctx, f, -60, f.bottom, '#e58a4a', 0.3);
}

/** A cog wheel as a single sub-path: teeth around a ring with a hub hole. */
function cog(path: Path2D, x: number, y: number, r: number, teeth: number, phase = 0): void {
  const inner = r * 0.82;
  for (let i = 0; i < teeth; i++) {
    const a0 = phase + (i / teeth) * TAU;
    const a1 = a0 + (0.5 / teeth) * TAU;
    const pts: [number, number][] = [
      [inner, a0 - 0.02],
      [r, a0 + 0.04],
      [r, a1 - 0.04],
      [inner, a1 + 0.02],
    ];
    pts.forEach(([rr, a], k) => {
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0 && k === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    });
  }
  path.closePath();
}

function foundry(): ParallaxLayer {
  const tile = 3200;
  const rng = new Rng(81);
  const body = new Path2D();
  const dark = new Path2D();
  const glow = new Path2D();
  const windows = new Path2D();
  const smoke = new Path2D();
  // A long foundry hall, blast furnaces and tall stacks.
  let x = 0;
  while (x < tile - 120) {
    const w = rng.range(180, 320);
    const h = rng.range(110, 190);
    const kind = rng.int(0, 2);
    if (kind === 0) {
      body.rect(x, -h, w, h + 40);
      // Arched furnace doors glowing.
      for (let k = 0; k < Math.floor(w / 70); k++) {
        const wx = x + 24 + k * 70;
        windows.moveTo(wx, -8);
        windows.lineTo(wx, -44);
        windows.arc(wx + 16, -44, 16, Math.PI, 0);
        windows.lineTo(wx + 32, -8);
        windows.closePath();
        circle(glow, wx + 16, -30, 46);
      }
      dark.rect(x, -h, w, 8);
      for (let k = 0; k < w; k += 26) dark.rect(x + k, -h + 8, 3, h);
    } else if (kind === 1) {
      // Blast furnace: a tapering tower with ring bands and a downcomer pipe.
      const cx = x + w / 2;
      body.moveTo(cx - 54, 40);
      body.lineTo(cx - 40, -h * 1.3);
      body.lineTo(cx + 40, -h * 1.3);
      body.lineTo(cx + 54, 40);
      body.closePath();
      body.rect(cx - 30, -h * 1.3 - 26, 60, 28);
      for (let k = 0; k < 5; k++) dark.rect(cx - 52 + k * 2.5, -h * 1.2 + k * h * 0.26, 104 - k * 5, 6);
      body.moveTo(cx + 30, -h * 1.3 - 14);
      body.lineTo(cx + 120, -h * 0.7);
      body.lineTo(cx + 120, 40);
      body.lineTo(cx + 100, 40);
      body.lineTo(cx + 100, -h * 0.62);
      body.lineTo(cx + 30, -h * 1.3 + 6);
      body.closePath();
      circle(glow, cx, -20, 70);
      windows.rect(cx - 16, -34, 32, 30);
    } else {
      // Twin stacks with plumes.
      for (const dx of [w * 0.3, w * 0.62]) {
        const sw = 26;
        body.rect(x + dx, -h * 1.7, sw, h * 1.7 + 40);
        body.rect(x + dx - 5, -h * 1.7 - 8, sw + 10, 10);
        dark.rect(x + dx, -h * 1.2, sw, 6);
        dark.rect(x + dx, -h * 0.7, sw, 6);
        for (let k = 0; k < 6; k++) circle(smoke, x + dx + sw / 2 + k * 20 + k * k * 2, -h * 1.7 - 24 - k * 24, 14 + k * 7);
      }
      body.rect(x + w * 0.2, -40, w * 0.6, 80);
    }
    x += w + rng.range(20, 70);
  }
  const fills: LayerFill[] = [
    { path: smoke, color: '#5a3a44', alpha: 0.45 },
    { path: body, color: '#5a343c' },
    { path: dark, color: '#3f242d' },
    { path: glow, color: '#ff9a3c', alpha: 0.2 },
    { path: windows, color: '#ffc45a' },
  ];
  const floor = new Path2D();
  floor.rect(-6, 0, tile + 12, BOTTOM);
  fills.unshift({ path: floor, color: '#5a343c' });
  return { tile, px: 0.14, pv: 0.24, top: -420, bottom: 140, haze: ['#e08a4c', 0.32, -180], fills };
}

function cranes(): ParallaxLayer {
  const tile = 3600;
  const rng = new Rng(83);
  const f = periodic(tile, 84, [[2, 16], [6, 8]]);
  const ridgeY = (u: number) => -34 + f(u);
  const heap = new Path2D();
  ridge(heap, tile, ridgeY, BOTTOM, 12);
  const fills: LayerFill[] = [
    { path: heap, color: '#6b4446' },
    { path: heap, color: '#3d2530', dy: 8 },
    { path: heap, color: '#4a2d36', dx: -30, dy: 10 },
  ];
  const steel = new Path2D();
  const lite = new Path2D();
  const gear = new Path2D();
  const hub = new Path2D();
  const lamp = new Path2D();
  for (let i = 0; i < 3; i++) {
    const x = tile * (i / 3 + 0.08);
    wrapped(x, 260, tile, (xx) => {
      const y = ridgeY(xx) + 10;
      const h = 250 + i * 30;
      // Gantry crane: lattice mast, long jib, counterweight and a hook on a cable.
      steel.rect(xx - 9, y - h, 18, h);
      for (let k = 0; k < h - 20; k += 24) {
        lite.moveTo(xx - 9, y - k);
        lite.lineTo(xx + 9, y - k - 22);
        lite.lineTo(xx + 9, y - k - 18);
        lite.lineTo(xx - 9, y - k + 4);
        lite.closePath();
      }
      steel.rect(xx - 90, y - h - 12, 330, 12);
      steel.moveTo(xx, y - h - 60);
      steel.lineTo(xx + 236, y - h - 12);
      steel.lineTo(xx + 228, y - h - 12);
      steel.lineTo(xx, y - h - 52);
      steel.lineTo(xx - 86, y - h - 12);
      steel.lineTo(xx - 90, y - h - 12);
      steel.closePath();
      steel.rect(xx - 96, y - h, 44, 34);
      steel.rect(xx + 180, y - h, 2.5, 120);
      steel.moveTo(xx + 181, y - h + 120);
      steel.arc(xx + 181, y - h + 132, 12, -Math.PI / 2, Math.PI * 0.8);
      steel.arc(xx + 181, y - h + 132, 8, Math.PI * 0.8, -Math.PI / 2, true);
      steel.closePath();
      circle(lamp, xx, y - h - 62, 6);
    });
    // A pair of meshing cog wheels half-buried in the slag.
    const gx = tile * (i / 3 + 0.26);
    wrapped(gx, 140, tile, (xx) => {
      const y = ridgeY(xx) + 20;
      cog(gear, xx, y - 40, 80, 12, 0.1);
      cog(gear, xx + 120, y - 10, 52, 8, 0.5);
      circle(hub, xx, y - 40, 26);
      circle(hub, xx + 120, y - 10, 16);
    });
  }
  // Fat pipes running along the ground.
  const pipe = new Path2D();
  const band = new Path2D();
  for (let u = 0; u < tile; u += rng.range(500, 800)) {
    const len = rng.range(240, 420);
    const y = ridgeY(u) + 4;
    pipe.rect(u, y - 26, len, 22);
    for (let k = 0; k <= len; k += 60) band.rect(u + k - 3, y - 29, 6, 28);
  }
  fills.push(
    { path: gear, color: '#8a5a44' },
    { path: gear, color: '#b07a52', dx: -3, dy: -3 },
    { path: hub, color: '#3f242d' },
    { path: pipe, color: '#9a5a3c' },
    { path: pipe, color: '#c4804e', dy: -14 },
    { path: band, color: '#55303a' },
    { path: steel, color: '#33202b' },
    { path: lite, color: '#55303a' },
    { path: lamp, color: '#ff6a4a' },
  );
  return { tile, px: 0.3, pv: 0.46, top: -400, bottom: 180, haze: ['#d67c44', 0.18, -80], fills };
}

function girders(): ParallaxLayer {
  const tile = 3800;
  const rng = new Rng(85);
  const f = periodic(tile, 86, [[3, 12], [8, 5]]);
  const ridgeY = (u: number) => -30 + f(u);
  const heap = new Path2D();
  ridge(heap, tile, ridgeY, BOTTOM, 10);
  const fills: LayerFill[] = [
    { path: heap, color: '#85504a' },
    { path: heap, color: '#2f1c26', dy: 7 },
    { path: heap, color: '#3a232d', dx: -36, dy: 9 },
  ];
  const steel = new Path2D();
  const rivet = new Path2D();
  const stripeA = new Path2D();
  const stripeB = new Path2D();
  const tank = new Path2D();
  const tankLite = new Path2D();
  for (let i = 0; i < 4; i++) {
    const x = tile * (i / 4 + rng.range(0.04, 0.1));
    wrapped(x, 200, tile, (xx) => {
      const y = ridgeY(xx) + 14;
      if (i % 2 === 0) {
        // A scaffold of I-beams with a hazard-striped barrier.
        for (const dx of [-70, 70]) steel.rect(xx + dx - 8, y - 190, 16, 190);
        steel.rect(xx - 96, y - 198, 192, 14);
        steel.rect(xx - 96, y - 110, 192, 10);
        for (let k = -80; k <= 80; k += 20) circle(rivet, xx + k, y - 191, 2.6);
        steel.moveTo(xx - 62, y - 100);
        steel.lineTo(xx + 62, y - 6);
        steel.lineTo(xx + 62, y);
        steel.lineTo(xx - 62, y - 94);
        steel.closePath();
        stripeA.rect(xx - 130, y - 44, 60, 14);
        for (let k = 0; k < 4; k++) {
          stripeB.moveTo(xx - 130 + k * 15, y - 30);
          stripeB.lineTo(xx - 122 + k * 15, y - 44);
          stripeB.lineTo(xx - 114 + k * 15, y - 44);
          stripeB.lineTo(xx - 122 + k * 15, y - 30);
          stripeB.closePath();
        }
        steel.rect(xx - 128, y - 30, 5, 30);
        steel.rect(xx - 77, y - 30, 5, 30);
      } else {
        // A riveted pressure tank on legs with a gauge.
        tank.moveTo(xx - 70, y - 120);
        tank.arc(xx - 70 + 44, y - 120, 44, Math.PI, Math.PI * 1.5);
        tank.lineTo(xx + 26, y - 164);
        tank.arc(xx + 26, y - 120, 44, -Math.PI / 2, 0);
        tank.lineTo(xx + 70, y - 60);
        tank.arc(xx + 26, y - 60, 44, 0, Math.PI / 2);
        tank.lineTo(xx - 26, y - 16);
        tank.arc(xx - 26, y - 60, 44, Math.PI / 2, Math.PI);
        tank.closePath();
        tankLite.rect(xx - 52, y - 150, 14, 110);
        steel.rect(xx - 50, y - 18, 10, 20);
        steel.rect(xx + 40, y - 18, 10, 20);
        steel.rect(xx - 72, y - 96, 144, 5);
        for (let k = -60; k <= 60; k += 20) circle(rivet, xx + k, y - 93.5, 2.4);
        circle(rivet, xx + 30, y - 124, 13);
      }
    });
  }
  fills.push(
    { path: tank, color: '#b0623c' },
    { path: tankLite, color: '#de8a52', alpha: 0.8 },
    { path: stripeA, color: '#f2b53a' },
    { path: stripeB, color: '#2a1a22' },
    { path: steel, color: '#24151e' },
    { path: rivet, color: '#f0c890' },
  );
  return { tile, px: 0.46, pv: 0.62, top: -300, bottom: 220, fills };
}

function clouds(): CloudDef[] {
  const rng = new Rng(87);
  const out: CloudDef[] = [];
  for (let i = 0; i < 6; i++) {
    const w = rng.range(360, 620);
    const h = rng.range(70, 110);
    out.push({ lobes: cloudLobes(w, h, rng), w, x: i / 6 + rng.range(0, 0.08), alt: rng.range(380, 700), speed: rng.range(6, 12), depth: rng.range(0.02, 0.05), scale: rng.range(0.8, 1.2), squash: 0.5 });
  }
  return out;
}

function ground(): GroundDef {
  const tile = 2400;
  const rng = new Rng(89);
  const fills: LayerFill[] = [];
  // Packed slag and cinders below a deck of riveted plates.
  const band = (y0: number, y1: number, seed: number, color: string, alpha = 1) => {
    const a = periodic(tile, seed, [[3, 7], [8, 4]]);
    const b = periodic(tile, seed + 1, [[4, 6], [9, 3]]);
    const p = new Path2D();
    p.moveTo(-4, y0 + a(-4));
    for (let u = 0; u <= tile + 4; u += 16) p.lineTo(u, y0 + a(u));
    for (let u = tile + 4; u >= -4; u -= 16) p.lineTo(u, y1 + b(u));
    p.closePath();
    fills.push({ path: p, color, alpha });
  };
  band(130, 160, 301, '#2c1b24');
  band(214, 240, 303, '#5a3a3c', 0.7);
  band(296, 324, 305, '#23151d', 0.85);
  const shade = new Path2D();
  const base = new Path2D();
  const hot = new Path2D();
  for (let i = 0; i < 40; i++) {
    const x = rng.range(10, tile - 10);
    const y = rng.range(96, 330);
    const rx = rng.range(5, 13);
    const ry = rx * rng.range(0.55, 0.8);
    blob(shade, x + 1.5, y + 2, rx, ry, new Rng(i + 331), 7, 0.24);
    blob(base, x, y, rx * 0.9, ry * 0.86, new Rng(i + 331), 7, 0.24);
    if (i % 5 === 0) ellipse(hot, x, y, rx * 0.4, ry * 0.3);
  }
  fills.push({ path: shade, color: '#1c1118' }, { path: base, color: '#6a4a48' }, { path: hot, color: '#ff8a3a', alpha: 0.85 });
  // Buried pipe run.
  const pipe = new Path2D();
  pipe.rect(-4, 176, tile + 8, 20);
  const pipeLite = new Path2D();
  pipeLite.rect(-4, 178, tile + 8, 5);
  const flange = new Path2D();
  for (let u = 80; u < tile; u += 300) flange.rect(u, 172, 10, 28);
  fills.push({ path: pipe, color: '#8a4f38' }, { path: pipeLite, color: '#c98252' }, { path: flange, color: '#4a2a2c' });

  // Steel deck: plates with seams, rivets, a bright worn edge and a hazard stripe.
  const deck = new Path2D();
  deck.rect(-4, -4, tile + 8, 62);
  const edge = new Path2D();
  edge.rect(-4, -4, tile + 8, 5);
  const lower = new Path2D();
  lower.rect(-4, 44, tile + 8, 14);
  const seams = new Path2D();
  const rivets = new Path2D();
  const stripes = new Path2D();
  for (let u = 0; u < tile; u += 120) {
    seams.rect(u - 1.5, 1, 3, 43);
    for (const dx of [10, 110]) for (const dy of [9, 36]) circle(rivets, u + dx, dy, 2.6);
  }
  for (let u = 0; u < tile; u += 30) {
    stripes.moveTo(u, 58);
    stripes.lineTo(u + 10, 44);
    stripes.lineTo(u + 25, 44);
    stripes.lineTo(u + 15, 58);
    stripes.closePath();
  }
  const scuff = new Path2D();
  for (let i = 0; i < 46; i++) scuff.rect(rng.range(0, tile), rng.range(8, 40), rng.range(14, 50), 1.6);
  const under = new Path2D();
  under.rect(-4, 58, tile + 8, 12);
  fills.push(
    { path: under, color: '#120a10', alpha: 0.45 },
    { path: deck, color: '#6d6a78' },
    { path: scuff, color: '#8b8998', alpha: 0.7 },
    { path: lower, color: '#f0b030' },
    { path: stripes, color: '#2a1d24' },
    { path: seams, color: '#474452' },
    { path: rivets, color: '#b9b7c6' },
    { path: edge, color: '#c9c8d6' },
  );
  return { tile, soil: '#3d2830', deep: '#2a1a22', deepAt: 300, fills, sway: [] };
}

let scene: SceneDef | null = null;

export function ironScene(): SceneDef {
  scene ??= {
    paintBackdrop,
    backdropPx: 0.04,
    backdropPv: 0.08,
    layers: [foundry(), cranes(), girders()],
    clouds: { style: { shade: '#4a2e3a', base: '#7a4a48', light: '#b8785a', alpha: 0.55 }, items: clouds() },
    ground: ground(),
    ambient: 'embers',
  };
  return scene;
}
