/**
 * Decor: non-colliding scenery placed by level designers. Each painter draws a cached sprite in
 * the 100-units-per-metre design space with the origin at the bottom centre (x in [-w/2, w/2],
 * y in [-h, 0]). Painterly style: soft gradients, cel highlights from the top-left and thin,
 * tinted edges instead of the heavy ink outline reserved for gameplay objects.
 */
import { Rng, TAU } from '../../core/math';
import { mix, rgba } from './envKit';
import type { DecorInfo } from './types';

/** Non-colliding scenery available to level designers, keyed by kind (sizes in metres). */
export const DECOR: Record<string, DecorInfo> = {
  // Sunlit Wildlands
  tree_oak: { theme: 'grasslands', w: 5, h: 6 },
  tree_birch: { theme: 'grasslands', w: 2.5, h: 5 },
  bush: { theme: 'grasslands', w: 2, h: 1.2 },
  flowers: { theme: 'grasslands', w: 1.5, h: 0.6 },
  grass_tuft: { theme: 'grasslands', w: 1, h: 0.5 },
  rock_mossy: { theme: 'grasslands', w: 1.8, h: 1.1 },
  fence: { theme: 'grasslands', w: 3, h: 1.1 },
  mushroom: { theme: 'grasslands', w: 0.6, h: 0.6 },
  // Golden Badlands
  cactus: { theme: 'desert', w: 1.4, h: 2.6 },
  palm: { theme: 'desert', w: 3, h: 5.5 },
  rock_sandstone: { theme: 'desert', w: 2.4, h: 1.6 },
  ruin_column: { theme: 'desert', w: 1, h: 4 },
  ruin_arch: { theme: 'desert', w: 4, h: 4.5 },
  dune_grass: { theme: 'desert', w: 1.2, h: 0.6 },
  bones: { theme: 'desert', w: 1.2, h: 0.4 },
  // Frostbound Heights
  pine_snow: { theme: 'snowlands', w: 2.6, h: 5.5 },
  ice_crystal: { theme: 'snowlands', w: 1.2, h: 2 },
  snow_rock: { theme: 'snowlands', w: 2, h: 1.2 },
  lantern: { theme: 'snowlands', w: 0.6, h: 2.2, glow: { x: 0.08, y: 1.83, r: 1.3 } },
  snowman: { theme: 'snowlands', w: 1.2, h: 1.8 },
  frozen_bush: { theme: 'snowlands', w: 1.6, h: 1 },
};

/** Default per-level backdrop seed when the level does not supply one. */
export function envSeed(worldWidth: number): number {
  return Math.round(worldWidth * 10) + 1;
}

type Painter = (ctx: CanvasRenderingContext2D, rng: Rng, seed: number) => void;

export function paintDecor(ctx: CanvasRenderingContext2D, kind: string, seed: number): void {
  const painter = PAINTERS[kind];
  if (!painter) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  painter(ctx, new Rng(seed * 7919 + kind.length * 31), seed);
  ctx.restore();
}

/** Additive light for decor with `glow` (painted centred on the origin). */
export function paintDecorGlow(ctx: CanvasRenderingContext2D, kind: string): void {
  const info = DECOR[kind];
  if (!info?.glow) return;
  const r = info.glow.r * 100;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgba(255,214,140,0.55)');
  g.addColorStop(0.25, 'rgba(255,180,90,0.22)');
  g.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
}

// ---------------------------------------------------------------- helpers

/** Fills with a top-left -> bottom-right gradient across the given box and adds a soft tinted edge. */
function form(ctx: CanvasRenderingContext2D, path: Path2D, x0: number, y0: number, x1: number, y1: number, light: string, base: string, dark: string, edge = 3): void {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, light);
  g.addColorStop(0.45, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill(path);
  if (edge > 0) {
    ctx.strokeStyle = rgba(mix(dark, '#1d1420', 0.35), 0.55);
    ctx.lineWidth = edge;
    ctx.stroke(path);
  }
}

/** Paints `inner` clipped to `clip`. */
function within(ctx: CanvasRenderingContext2D, clip: Path2D, inner: () => void): void {
  ctx.save();
  ctx.clip(clip);
  inner();
  ctx.restore();
}

function circlePath(path: Path2D, x: number, y: number, r: number): void {
  path.moveTo(x + r, y);
  path.arc(x, y, r, 0, TAU);
}

/** Leafy crown from lobes: dark mass, lit body, sunlit caps, leaf scallops and a soft shadow side. */
function crown(ctx: CanvasRenderingContext2D, lobes: [number, number, number][], c: { dark: string; base: string; light: string; hi: string }, rng: Rng): void {
  const all = new Path2D();
  for (const [x, y, r] of lobes) circlePath(all, x, y, r);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y, r] of lobes) {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r);
    maxY = Math.max(maxY, y + r);
  }
  ctx.fillStyle = c.dark;
  ctx.fill(all);
  within(ctx, all, () => {
    const body = new Path2D();
    for (const [x, y, r] of lobes) circlePath(body, x - r * 0.12, y - r * 0.16, r * 0.86);
    const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
    g.addColorStop(0, c.light);
    g.addColorStop(0.5, c.base);
    g.addColorStop(1, mix(c.base, c.dark, 0.5));
    ctx.fillStyle = g;
    ctx.fill(body);
    // Sunlit caps on the upper lobes.
    const caps = new Path2D();
    for (const [x, y, r] of lobes) {
      if (y > (minY + maxY) / 2 + r * 0.2) continue;
      circlePath(caps, x - r * 0.3, y - r * 0.38, r * 0.48);
    }
    ctx.fillStyle = rgba(c.hi, 0.75);
    ctx.fill(caps);
    // Leaf scallops: little crescents scattered over the crown.
    ctx.strokeStyle = rgba(c.dark, 0.55);
    ctx.lineWidth = 3;
    for (let i = 0; i < lobes.length * 4; i++) {
      const [x, y, r] = lobes[i % lobes.length]!;
      const a = rng.range(0, TAU);
      const d = rng.range(0.2, 0.8) * r;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      ctx.beginPath();
      ctx.arc(px, py, rng.range(7, 12), 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(c.hi, 0.6);
    for (let i = 0; i < lobes.length * 2; i++) {
      const [x, y, r] = lobes[i % lobes.length]!;
      const px = x - r * rng.range(0.1, 0.6);
      const py = y - r * rng.range(0.1, 0.6);
      ctx.beginPath();
      ctx.arc(px, py, rng.range(6, 10), 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();
    }
  });
  ctx.strokeStyle = rgba(mix(c.dark, '#10200f', 0.4), 0.5);
  ctx.lineWidth = 3;
  ctx.stroke(all);
}

/** Small soft contact shadow on the ground. */
function contact(ctx: CanvasRenderingContext2D, w: number, alpha = 0.22): void {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
  g.addColorStop(0, `rgba(30,20,40,${alpha})`);
  g.addColorStop(1, 'rgba(30,20,40,0)');
  ctx.fillStyle = g;
  ctx.save();
  ctx.scale(1, 0.18);
  ctx.beginPath();
  ctx.arc(0, 0, w / 2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function grassBlades(ctx: CanvasRenderingContext2D, x0: number, x1: number, h: number, rng: Rng, dark: string, light: string, n: number): void {
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass ? light : dark;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = rng.range(x0, x1);
      const hh = h * rng.range(0.5, 1) * (pass ? 0.8 : 1);
      const lean = rng.range(-0.4, 0.4) * hh;
      const w = rng.range(3, 6);
      ctx.moveTo(x - w, 2);
      ctx.quadraticCurveTo(x - w * 0.2 + lean * 0.3, -hh * 0.6, x + lean, -hh);
      ctx.quadraticCurveTo(x + w * 0.5 + lean * 0.3, -hh * 0.5, x + w, 2);
      ctx.closePath();
    }
    ctx.fill();
  }
}

// ---------------------------------------------------------------- Sunlit Wildlands

const LEAF = { dark: '#2f7a37', base: '#52a643', light: '#86d35a', hi: '#bfee86' };

const treeOak: Painter = (ctx, rng) => {
  contact(ctx, 420, 0.25);
  // Trunk with flared roots and two heavy limbs.
  const trunk = new Path2D();
  trunk.moveTo(-110, 4);
  trunk.bezierCurveTo(-70, -10, -52, -40, -50, -120);
  trunk.bezierCurveTo(-52, -200, -70, -250, -120, -300);
  trunk.lineTo(-96, -322);
  trunk.bezierCurveTo(-56, -290, -30, -270, -8, -250);
  trunk.bezierCurveTo(10, -300, 40, -330, 90, -350);
  trunk.lineTo(104, -326);
  trunk.bezierCurveTo(70, -300, 52, -250, 50, -170);
  trunk.bezierCurveTo(48, -80, 64, -24, 118, 4);
  trunk.quadraticCurveTo(60, 0, 30, -8);
  trunk.quadraticCurveTo(0, 2, -36, -6);
  trunk.quadraticCurveTo(-70, 2, -110, 4);
  trunk.closePath();
  form(ctx, trunk, -80, -300, 80, 0, '#a9774c', '#7f5537', '#553522');
  within(ctx, trunk, () => {
    ctx.strokeStyle = 'rgba(60,34,18,0.55)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 7; i++) {
      const x = -40 + i * 13 + rng.range(-4, 4);
      ctx.beginPath();
      ctx.moveTo(x, rng.range(-10, -30));
      ctx.bezierCurveTo(x + rng.range(-12, 12), -100, x + rng.range(-14, 14), -180, x + rng.range(-20, 20), -260);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(214,170,120,0.4)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const x = -42 + i * 9;
      ctx.beginPath();
      ctx.moveTo(x, -30);
      ctx.bezierCurveTo(x - 4, -100, x + 2, -170, x - 10, -240);
      ctx.stroke();
    }
    // A hollow with a dark interior.
    ctx.fillStyle = '#3a2416';
    ctx.beginPath();
    ctx.ellipse(10, -150, 14, 22, 0.1, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,140,90,0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(10, -150, 17, 25, 0.1, Math.PI * 0.6, Math.PI * 1.5);
    ctx.stroke();
  });
  const lobes: [number, number, number][] = [
    [-150, -360, 95], [-40, -420, 115], [90, -400, 105], [175, -340, 75], [-200, -300, 60],
    [-90, -500, 90], [40, -520, 85], [150, -470, 70], [-5, -330, 80], [110, -310, 60], [-120, -280, 55],
  ];
  for (const l of lobes) {
    l[0] += rng.range(-8, 8);
    l[1] += rng.range(-8, 8);
  }
  crown(ctx, lobes, LEAF, rng);
};

const treeBirch: Painter = (ctx, rng) => {
  contact(ctx, 180, 0.2);
  const trunk = new Path2D();
  trunk.moveTo(-20, 2);
  trunk.bezierCurveTo(-14, -120, -30, -240, -8, -380);
  trunk.lineTo(10, -380);
  trunk.bezierCurveTo(-6, -240, 10, -120, 18, 2);
  trunk.closePath();
  // A thin side branch.
  trunk.moveTo(-8, -250);
  trunk.quadraticCurveTo(-50, -300, -70, -330);
  trunk.lineTo(-62, -336);
  trunk.quadraticCurveTo(-40, -300, 0, -268);
  trunk.closePath();
  form(ctx, trunk, -24, -380, 24, 0, '#ffffff', '#efe9dc', '#c9bfac');
  within(ctx, trunk, () => {
    ctx.fillStyle = '#3a3330';
    for (let y = -20; y > -370; y -= rng.range(24, 44)) {
      const w = rng.range(8, 18);
      const x = -16 + rng.range(0, 18);
      ctx.beginPath();
      ctx.ellipse(x, y, w, 3, rng.range(-0.2, 0.2), 0, TAU);
      ctx.fill();
    }
  });
  const lobes: [number, number, number][] = [
    [-50, -360, 60], [30, -400, 66], [-10, -450, 58], [70, -330, 48], [-85, -300, 40], [10, -320, 50], [-40, -420, 44],
  ];
  crown(ctx, lobes, { dark: '#5c9a3a', base: '#8ccd52', light: '#b8e76f', hi: '#e2f89c' }, rng);
};

const bush: Painter = (ctx, rng) => {
  contact(ctx, 200, 0.22);
  const lobes: [number, number, number][] = [
    [-60, -42, 40], [0, -62, 52], [58, -44, 40], [-28, -88, 32], [30, -86, 30], [-82, -26, 26], [84, -26, 26],
  ];
  crown(ctx, lobes, LEAF, rng);
  // Berries or blossoms.
  const color = rng.next() < 0.5 ? '#e8463c' : '#ffffff';
  for (let i = 0; i < 9; i++) {
    const x = rng.range(-80, 80);
    const y = rng.range(-100, -24);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, 2, 0, TAU);
    ctx.fill();
  }
};

const flowers: Painter = (ctx, rng) => {
  grassBlades(ctx, -64, 64, 34, rng, '#3f8f3a', '#79c74b', 16);
  const kinds = [
    { petal: '#ffffff', core: '#ffc93a' },
    { petal: '#ff8fbf', core: '#ffe680' },
    { petal: '#ffd84a', core: '#f08a1c' },
    { petal: '#9fb8ff', core: '#ffffff' },
  ];
  for (let i = 0; i < 7; i++) {
    const x = -60 + i * 20 + rng.range(-6, 6);
    const top = -rng.range(28, 54);
    ctx.strokeStyle = '#4f9a3c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + rng.range(-4, 4), 0);
    ctx.quadraticCurveTo(x - 4, top / 2, x, top);
    ctx.stroke();
    const k = kinds[(i + Math.floor(rng.next() * 2)) % kinds.length]!;
    const r = rng.range(5.5, 8);
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * TAU + i;
      ctx.fillStyle = mix(k.petal, '#7a5a8a', 0.12);
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r + 0.8, top + Math.sin(a) * r + 0.8, r * 0.7, r * 0.5, a, 0, TAU);
      ctx.fill();
      ctx.fillStyle = k.petal;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r, top + Math.sin(a) * r, r * 0.66, r * 0.46, a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = k.core;
    ctx.beginPath();
    ctx.arc(x, top, r * 0.45, 0, TAU);
    ctx.fill();
  }
};

const grassTuft: Painter = (ctx, rng) => {
  grassBlades(ctx, -40, 40, 48, rng, '#3a8f36', '#86d24f', 14);
};

const rockMossy: Painter = (ctx, rng) => {
  contact(ctx, 190, 0.25);
  const rock = new Path2D();
  rock.moveTo(-88, 2);
  rock.bezierCurveTo(-96, -40, -70, -92, -20, -104);
  rock.bezierCurveTo(30, -112, 74, -86, 86, -48);
  rock.bezierCurveTo(94, -20, 90, -4, 84, 2);
  rock.closePath();
  form(ctx, rock, -80, -100, 80, 0, '#c9ced3', '#9aa0a6', '#5f656e');
  within(ctx, rock, () => {
    // Facets.
    ctx.fillStyle = 'rgba(70,74,84,0.35)';
    ctx.beginPath();
    ctx.moveTo(20, -104);
    ctx.lineTo(40, -50);
    ctx.lineTo(96, -30);
    ctx.lineTo(96, -110);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,62,70,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-30, -20);
    ctx.lineTo(-14, -46);
    ctx.lineTo(-20, -64);
    ctx.stroke();
    // Moss cap.
    const moss = new Path2D();
    moss.moveTo(-100, -40);
    moss.bezierCurveTo(-80, -100, 20, -130, 70, -80);
    for (let x = 70; x > -100; x -= 14) moss.quadraticCurveTo(x - 7, -60 + Math.sin(x) * 6 + (x < -60 ? 12 : 0), x - 14, -66 + Math.cos(x * 0.7) * 8);
    moss.closePath();
    form(ctx, moss, -80, -110, 60, -50, '#a6dc63', '#6fb544', '#3f8a35', 0);
    ctx.fillStyle = 'rgba(200,240,140,0.7)';
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.arc(rng.range(-60, 30), rng.range(-100, -74), rng.range(2, 4), 0, TAU);
      ctx.fill();
    }
  });
  grassBlades(ctx, -95, 95, 22, rng, '#3a8f36', '#79c74b', 12);
};

const fence: Painter = (ctx, rng) => {
  const wood = (path: Path2D, x0: number, y0: number, x1: number, y1: number) => form(ctx, path, x0, y0, x1, y1, '#f2c98a', '#cf9655', '#8f5a2c', 3);
  const posts = [-130, 0, 130];
  // Rails behind the posts.
  for (const y of [-78, -40]) {
    const rail = new Path2D();
    const tilt = rng.range(-6, 6);
    rail.moveTo(-150, y - 8);
    rail.lineTo(150, y - 8 + tilt);
    rail.lineTo(150, y + 8 + tilt);
    rail.lineTo(-150, y + 8);
    rail.closePath();
    wood(rail, 0, y - 8, 0, y + 8);
    ctx.strokeStyle = 'rgba(120,70,30,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-140, y);
    ctx.lineTo(140, y + tilt * 0.9);
    ctx.stroke();
  }
  for (const x of posts) {
    const lean = rng.range(-0.06, 0.06);
    const post = new Path2D();
    post.moveTo(x - 10, 2);
    post.lineTo(x - 10 + lean * 100, -96);
    post.lineTo(x + lean * 100, -108);
    post.lineTo(x + 10 + lean * 100, -96);
    post.lineTo(x + 10, 2);
    post.closePath();
    wood(post, x - 10, -100, x + 10, 0);
    // Nails.
    ctx.fillStyle = '#4a3a30';
    for (const y of [-78, -40]) {
      ctx.beginPath();
      ctx.arc(x + lean * -y, y, 2.6, 0, TAU);
      ctx.fill();
    }
  }
  grassBlades(ctx, -150, 150, 26, rng, '#3a8f36', '#86d24f', 22);
};

const mushroom: Painter = (ctx, rng) => {
  const one = (x: number, h: number, r: number) => {
    const stem = new Path2D();
    stem.moveTo(x - r * 0.3, 0);
    stem.quadraticCurveTo(x - r * 0.4, -h * 0.5, x - r * 0.26, -h);
    stem.lineTo(x + r * 0.26, -h);
    stem.quadraticCurveTo(x + r * 0.42, -h * 0.5, x + r * 0.32, 0);
    stem.closePath();
    form(ctx, stem, x - r, -h, x + r, 0, '#fffaf0', '#f0e4cc', '#c8b593', 2);
    const cap = new Path2D();
    cap.moveTo(x - r, -h + 4);
    cap.bezierCurveTo(x - r, -h - r * 1.1, x + r, -h - r * 1.1, x + r, -h + 4);
    cap.quadraticCurveTo(x, -h - r * 0.1, x - r, -h + 4);
    cap.closePath();
    form(ctx, cap, x - r, -h - r, x + r, -h, '#ff7a63', '#e23b2e', '#9c1f1c', 2.5);
    ctx.fillStyle = '#fff6e6';
    for (const [dx, dy, s] of [[-0.45, -0.45, 0.17], [0.15, -0.7, 0.14], [0.55, -0.35, 0.12], [-0.05, -0.32, 0.1]] as const) {
      ctx.beginPath();
      ctx.ellipse(x + dx * r, -h + dy * r, s * r, s * r * 0.8, 0, 0, TAU);
      ctx.fill();
    }
  };
  contact(ctx, 60, 0.2);
  one(-10, 26, 22);
  one(17, 14, 12 + rng.range(0, 2));
};

// ---------------------------------------------------------------- Golden Badlands

const CACTUS = { light: '#9bd26e', base: '#5faa4c', dark: '#2f6f36' };

function cactusArm(path: Path2D, x0: number, y0: number, dir: number, reach: number, up: number, w: number): void {
  path.moveTo(x0, y0 + w);
  path.lineTo(x0 + dir * (reach - w), y0 + w);
  path.quadraticCurveTo(x0 + dir * (reach + w), y0 + w, x0 + dir * (reach + w), y0 - w);
  path.lineTo(x0 + dir * (reach + w), y0 - up);
  path.arc(x0 + dir * reach, y0 - up, w, dir > 0 ? 0 : Math.PI, dir > 0 ? Math.PI : TAU, true);
  path.lineTo(x0 + dir * (reach - w), y0 - w);
  path.lineTo(x0, y0 - w);
  path.closePath();
}

const cactus: Painter = (ctx, rng) => {
  contact(ctx, 120, 0.25);
  const w = 24;
  const body = new Path2D();
  body.moveTo(-w, 2);
  body.lineTo(-w, -230);
  body.arc(0, -230, w, Math.PI, 0);
  body.lineTo(w, 2);
  body.closePath();
  const arms = new Path2D();
  cactusArm(arms, -10, -110 - rng.range(0, 20), -1, 42, 70, 15);
  cactusArm(arms, 10, -150 - rng.range(0, 20), 1, 40, 60, 14);
  form(ctx, arms, -70, -200, 70, -80, CACTUS.light, CACTUS.base, CACTUS.dark);
  form(ctx, body, -w, -250, w, 0, CACTUS.light, CACTUS.base, CACTUS.dark);
  // Ribs and spines.
  within(ctx, body, () => {
    ctx.strokeStyle = 'rgba(40,90,40,0.55)';
    ctx.lineWidth = 3;
    for (const x of [-12, 0, 12]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x * 0.8, -248);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(210,250,170,0.6)';
    ctx.beginPath();
    ctx.moveTo(-16, -10);
    ctx.lineTo(-14, -240);
    ctx.stroke();
  });
  ctx.strokeStyle = '#fff3c8';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 30; i++) {
    const y = -rng.range(10, 240);
    const side = rng.next() < 0.5 ? -1 : 1;
    const x = side * w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * 6, y - 3);
    ctx.stroke();
  }
  // A flower on top.
  ctx.fillStyle = '#ff7aa8';
  for (let p = 0; p < 5; p++) {
    const a = -Math.PI / 2 + (p - 2) * 0.5;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 9, -252 + Math.sin(a) * 9, 7, 4.5, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd84a';
  ctx.beginPath();
  ctx.arc(0, -254, 4, 0, TAU);
  ctx.fill();
};

const palm: Painter = (ctx, rng) => {
  contact(ctx, 160, 0.25);
  // Curved, ringed trunk.
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push([Math.sin(t * 1.6) * 60 - 10, -t * 430]);
  }
  const trunk = new Path2D();
  pts.forEach(([x, y], i) => {
    const w = 18 - (i / 12) * 6;
    if (i === 0) trunk.moveTo(x - w - 6, y + 2);
    else trunk.lineTo(x - w, y);
  });
  for (let i = 12; i >= 0; i--) {
    const [x, y] = pts[i]!;
    const w = 18 - (i / 12) * 6;
    trunk.lineTo(x + w + (i === 0 ? 6 : 0), y + (i === 0 ? 2 : 0));
  }
  trunk.closePath();
  form(ctx, trunk, -40, -430, 60, 0, '#d9b077', '#b4864f', '#7a5530');
  within(ctx, trunk, () => {
    ctx.strokeStyle = 'rgba(110,70,35,0.6)';
    ctx.lineWidth = 3;
    for (let i = 1; i < 24; i++) {
      const t = i / 24;
      const x = Math.sin(t * 1.6) * 60 - 10;
      const y = -t * 430;
      ctx.beginPath();
      ctx.moveTo(x - 24, y + 4);
      ctx.quadraticCurveTo(x, y - 6, x + 24, y + 4);
      ctx.stroke();
    }
  });
  const [tx, ty] = pts[12]!;
  // Fronds: drooping leaves with notched leaflets.
  const frond = (angle: number, len: number, droop: number, back: boolean) => {
    const ex = tx + Math.cos(angle) * len;
    const ey = ty + Math.sin(angle) * len + droop;
    const mx = tx + Math.cos(angle) * len * 0.5;
    const my = ty + Math.sin(angle) * len * 0.5 - 30;
    const leaf = new Path2D();
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    leaf.moveTo(tx, ty);
    // Upper edge with notches.
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const bx = (1 - t) * (1 - t) * tx + 2 * (1 - t) * t * mx + t * t * ex;
      const by = (1 - t) * (1 - t) * ty + 2 * (1 - t) * t * my + t * t * ey;
      const wid = Math.sin(t * Math.PI) * 30 * (1 - t * 0.3);
      leaf.lineTo(bx - nx * wid + (i % 2) * 6, by - ny * wid + 6);
      leaf.lineTo(bx - nx * wid * 0.4, by - ny * wid * 0.4);
    }
    for (let i = steps; i >= 1; i--) {
      const t = i / steps;
      const bx = (1 - t) * (1 - t) * tx + 2 * (1 - t) * t * mx + t * t * ex;
      const by = (1 - t) * (1 - t) * ty + 2 * (1 - t) * t * my + t * t * ey;
      const wid = Math.sin(t * Math.PI) * 26;
      leaf.lineTo(bx + nx * wid * 0.4, by + ny * wid * 0.4);
      leaf.lineTo(bx + nx * wid - (i % 2) * 6, by + ny * wid + 6);
    }
    leaf.closePath();
    form(ctx, leaf, tx - 100, ty - 60, tx + 100, ty + 80, back ? '#5fae4e' : '#8fd36a', back ? '#3f8a3e' : '#4fa24a', back ? '#245c2c' : '#2f7234', 2.5);
    ctx.strokeStyle = back ? 'rgba(30,70,30,0.6)' : 'rgba(210,250,160,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
  };
  for (const [a, len, d] of [[-2.7, 120, 60], [-0.4, 125, 60], [-1.6, 90, -10]] as const) frond(a, len, d, true);
  // Coconuts.
  for (const [dx, dy] of [[-8, 12], [10, 14], [0, 24]] as const) {
    const g = ctx.createRadialGradient(tx + dx - 4, ty + dy - 4, 1, tx + dx, ty + dy, 13);
    g.addColorStop(0, '#9a7348');
    g.addColorStop(1, '#4e3420');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tx + dx, ty + dy, 12, 0, TAU);
    ctx.fill();
  }
  for (const [a, len, d] of [[-3.0, 145, 110], [-2.2, 130, 40], [-0.9, 135, 30], [0.05, 150, 115], [-1.25, 110, -20]] as const) {
    frond(a + rng.range(-0.08, 0.08), len, d, false);
  }
};

const rockSandstone: Painter = (ctx, rng) => {
  contact(ctx, 240, 0.28);
  const rock = new Path2D();
  rock.moveTo(-116, 2);
  rock.bezierCurveTo(-120, -50, -100, -90, -70, -110);
  rock.lineTo(-30, -150);
  rock.bezierCurveTo(10, -162, 60, -150, 80, -120);
  rock.bezierCurveTo(108, -90, 118, -40, 114, 2);
  rock.closePath();
  form(ctx, rock, -100, -150, 100, 0, '#f8cf92', '#e0a061', '#a95e30');
  within(ctx, rock, () => {
    // Wind-carved strata.
    for (let i = 0; i < 6; i++) {
      const y = -18 - i * 24 + rng.range(-3, 3);
      ctx.fillStyle = i % 2 ? 'rgba(255,230,180,0.35)' : 'rgba(160,80,35,0.35)';
      ctx.beginPath();
      ctx.moveTo(-130, y);
      ctx.bezierCurveTo(-60, y - 6, 20, y + 8, 130, y - 4);
      ctx.lineTo(130, y + 8);
      ctx.bezierCurveTo(20, y + 16, -60, y + 4, -130, y + 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(140,70,30,0.35)';
    ctx.beginPath();
    ctx.moveTo(40, -160);
    ctx.lineTo(50, -80);
    ctx.lineTo(130, -30);
    ctx.lineTo(130, -160);
    ctx.closePath();
    ctx.fill();
  });
  // A little sand drift at the foot.
  ctx.fillStyle = '#f4cf8c';
  ctx.beginPath();
  ctx.moveTo(-120, 2);
  ctx.quadraticCurveTo(-90, -18, -50, -6);
  ctx.quadraticCurveTo(-20, 2, -10, 2);
  ctx.closePath();
  ctx.fill();
};

const STONE = { light: '#fbe9c4', base: '#e8cd9a', dark: '#b08c5c' };

const ruinColumn: Painter = (ctx, rng) => {
  contact(ctx, 110, 0.25);
  const top = -330 - rng.range(0, 40);
  // Plinth.
  const plinth = new Path2D();
  plinth.rect(-46, -34, 92, 34);
  plinth.rect(-40, -46, 80, 14);
  form(ctx, plinth, -46, -46, 46, 0, STONE.light, STONE.base, STONE.dark);
  // Shaft with a jagged break.
  const shaft = new Path2D();
  shaft.moveTo(-30, -44);
  shaft.lineTo(-28, top + 10);
  shaft.lineTo(-14, top - 14);
  shaft.lineTo(-2, top + 4);
  shaft.lineTo(10, top - 26);
  shaft.lineTo(22, top - 2);
  shaft.lineTo(28, top + 6);
  shaft.lineTo(30, -44);
  shaft.closePath();
  form(ctx, shaft, -30, top, 30, -44, STONE.light, STONE.base, STONE.dark);
  within(ctx, shaft, () => {
    ctx.strokeStyle = 'rgba(150,110,60,0.5)';
    ctx.lineWidth = 3;
    for (const x of [-18, -6, 6, 18]) {
      ctx.beginPath();
      ctx.moveTo(x, -44);
      ctx.lineTo(x, top);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,245,220,0.6)';
    ctx.beginPath();
    ctx.moveTo(-23, -50);
    ctx.lineTo(-23, top + 20);
    ctx.stroke();
    // Drum joints and a crack.
    ctx.strokeStyle = 'rgba(120,85,45,0.6)';
    for (const y of [-130, -220, -300]) {
      if (y < top + 10) continue;
      ctx.beginPath();
      ctx.moveTo(-32, y);
      ctx.lineTo(32, y + 2);
      ctx.stroke();
    }
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(8, -120);
    ctx.lineTo(0, -160);
    ctx.lineTo(10, -190);
    ctx.lineTo(4, -214);
    ctx.stroke();
    // Chips out of the edge.
    ctx.fillStyle = 'rgba(160,120,70,0.55)';
    ctx.beginPath();
    ctx.moveTo(30, -250);
    ctx.lineTo(20, -240);
    ctx.lineTo(30, -228);
    ctx.fill();
  });
  // Fallen chunk and sand drift.
  const chunk = new Path2D();
  chunk.moveTo(30, 2);
  chunk.lineTo(36, -18);
  chunk.lineTo(58, -24);
  chunk.lineTo(66, -6);
  chunk.lineTo(60, 2);
  chunk.closePath();
  form(ctx, chunk, 30, -24, 66, 2, STONE.light, STONE.base, STONE.dark, 2);
  ctx.fillStyle = '#f2cb86';
  ctx.beginPath();
  ctx.moveTo(-50, 2);
  ctx.quadraticCurveTo(-40, -22, -10, -14);
  ctx.quadraticCurveTo(20, -6, 40, 2);
  ctx.closePath();
  ctx.fill();
};

const ruinArch: Painter = (ctx, rng) => {
  contact(ctx, 420, 0.25);
  const outer = new Path2D();
  outer.moveTo(-190, 2);
  outer.lineTo(-190, -260);
  outer.bezierCurveTo(-190, -420, 190, -420, 190, -260);
  outer.lineTo(190, 2);
  outer.lineTo(110, 2);
  outer.lineTo(110, -240);
  outer.bezierCurveTo(110, -330, -110, -330, -110, -240);
  outer.lineTo(-110, 2);
  outer.closePath();
  // A missing chunk on the upper right for a weathered silhouette.
  const bite = new Path2D();
  bite.moveTo(120, -420);
  bite.lineTo(150, -360);
  bite.lineTo(178, -350);
  bite.lineTo(200, -300);
  bite.lineTo(220, -420);
  bite.closePath();
  ctx.save();
  ctx.fillStyle = '#000';
  // Clip away the bite (even-odd with a big rect).
  const keep = new Path2D();
  keep.rect(-220, -460, 440, 470);
  keep.addPath(bite);
  ctx.clip(keep, 'evenodd');
  form(ctx, outer, -190, -410, 190, 0, STONE.light, STONE.base, STONE.dark);
  within(ctx, outer, () => {
    // Masonry courses on the pillars and voussoirs on the arch.
    ctx.strokeStyle = 'rgba(140,100,55,0.55)';
    ctx.lineWidth = 3;
    for (let y = -30; y > -250; y -= 44) {
      ctx.beginPath();
      ctx.moveTo(-200, y);
      ctx.lineTo(-100, y);
      ctx.moveTo(100, y + 6);
      ctx.lineTo(200, y + 6);
      ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 110, -250 + Math.sin(a) * 88);
      ctx.lineTo(Math.cos(a) * 196, -250 + Math.sin(a) * 160);
      ctx.stroke();
    }
    // Keystone with a carved bird emblem.
    ctx.fillStyle = 'rgba(150,105,60,0.45)';
    ctx.beginPath();
    ctx.arc(0, -372, 18, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -376);
    ctx.lineTo(30, -370);
    ctx.lineTo(14, -364);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,0.7)';
    ctx.beginPath();
    ctx.arc(4, -376, 4, 0, TAU);
    ctx.fill();
    // Weathering.
    ctx.fillStyle = 'rgba(120,85,45,0.3)';
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.arc(rng.range(-190, 190), rng.range(-380, -10), rng.range(3, 9), 0, TAU);
      ctx.fill();
    }
    // Inner shadow of the opening.
    ctx.fillStyle = 'rgba(120,80,40,0.35)';
    ctx.beginPath();
    ctx.moveTo(110, 2);
    ctx.lineTo(110, -240);
    ctx.bezierCurveTo(110, -300, 60, -322, 40, -326);
    ctx.lineTo(150, -330);
    ctx.lineTo(150, 2);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
  // Rubble and sand at the feet.
  for (const [x, w] of [[-150, 40], [140, 50], [60, 26]] as const) {
    const p = new Path2D();
    p.moveTo(x - w / 2, 2);
    p.lineTo(x - w / 2 + 6, -w * 0.5);
    p.lineTo(x + w / 2 - 4, -w * 0.6);
    p.lineTo(x + w / 2, 2);
    p.closePath();
    form(ctx, p, x - w / 2, -w * 0.6, x + w / 2, 0, STONE.light, STONE.base, STONE.dark, 2);
  }
  ctx.fillStyle = '#f2cb86';
  ctx.beginPath();
  ctx.moveTo(-210, 2);
  ctx.quadraticCurveTo(-180, -30, -130, -12);
  ctx.quadraticCurveTo(-100, -2, -80, 2);
  ctx.moveTo(90, 2);
  ctx.quadraticCurveTo(150, -26, 210, 2);
  ctx.fill();
};

const duneGrass: Painter = (ctx, rng) => {
  grassBlades(ctx, -50, 50, 56, rng, '#b48c48', '#e8c983', 16);
};

const bones: Painter = (ctx, rng) => {
  contact(ctx, 120, 0.2);
  const ivory = { light: '#fffaea', base: '#efe3c4', dark: '#b8a67c' };
  // A long bone lying slightly askew.
  ctx.save();
  ctx.translate(-10, -14);
  ctx.rotate(-0.08 + rng.range(-0.05, 0.05));
  const bone = new Path2D();
  bone.moveTo(-36, -5);
  bone.lineTo(30, -5);
  bone.arc(36, -9, 8, Math.PI * 0.8, Math.PI * 0.1, false);
  bone.arc(38, 6, 8, -Math.PI * 0.2, Math.PI * 0.9, false);
  bone.lineTo(-36, 5);
  bone.arc(-40, 8, 8, Math.PI * 0.1, Math.PI * 1.2, false);
  bone.arc(-42, -6, 8, Math.PI * 0.8, Math.PI * 1.9, false);
  bone.closePath();
  form(ctx, bone, -50, -15, 50, 15, ivory.light, ivory.base, ivory.dark, 2.5);
  ctx.restore();
  // Rib arcs poking out of the sand.
  ctx.strokeStyle = ivory.dark;
  ctx.lineWidth = 6;
  for (let i = 0; i < 3; i++) {
    const x = 26 + i * 10;
    ctx.beginPath();
    ctx.arc(x, 4, 16 - i * 2, Math.PI * 1.05, Math.PI * 1.7);
    ctx.stroke();
  }
  ctx.strokeStyle = ivory.light;
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const x = 26 + i * 10;
    ctx.beginPath();
    ctx.arc(x, 4, 16 - i * 2, Math.PI * 1.1, Math.PI * 1.5);
    ctx.stroke();
  }
  ctx.fillStyle = '#f2cb86';
  ctx.beginPath();
  ctx.ellipse(10, 2, 60, 6, 0, Math.PI, TAU);
  ctx.fill();
};

// ---------------------------------------------------------------- Frostbound Heights

const pineSnow: Painter = (ctx, rng) => {
  contact(ctx, 230, 0.22);
  ctx.fillStyle = '#5a3c28';
  ctx.fillRect(-12, -60, 24, 62);
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const bottom = -40 - t * 400;
    const top = bottom - 150 + t * 20;
    const half = 128 * (1 - t * 0.68) + rng.range(-4, 4);
    const th = bottom - top;
    const tier = new Path2D();
    tier.moveTo(0, top);
    tier.quadraticCurveTo(half * 0.3, top + th * 0.5, half, bottom);
    for (let k = 1; k <= 4; k++) tier.quadraticCurveTo(half - (half * 2 * (k - 0.5)) / 4, bottom - 18, half - (half * 2 * k) / 4, bottom - (k === 4 ? 0 : 4));
    tier.quadraticCurveTo(-half * 0.3, top + th * 0.5, 0, top);
    tier.closePath();
    form(ctx, tier, -half, top, half, bottom, '#4f8e86', '#2f6f6a', '#1b4547', 2.5);
    // Snow load on the tier.
    const snow = new Path2D();
    snow.moveTo(0, top - 3);
    snow.quadraticCurveTo(half * 0.3, top + th * 0.5, half * 0.95, bottom - 6);
    snow.quadraticCurveTo(half * 0.7, bottom - th * 0.32, half * 0.4, bottom - th * 0.22);
    snow.quadraticCurveTo(half * 0.1, bottom - th * 0.44, -half * 0.3, bottom - th * 0.2);
    snow.quadraticCurveTo(-half * 0.7, bottom - th * 0.32, -half * 0.96, bottom - 6);
    snow.quadraticCurveTo(-half * 0.3, top + th * 0.5, 0, top - 3);
    snow.closePath();
    form(ctx, snow, -half, top, half, bottom, '#ffffff', '#f2f8ff', '#b8d2ee', 2);
    // Icicle drips under the snow.
    ctx.fillStyle = 'rgba(200,232,250,0.9)';
    for (let k = 0; k < 3; k++) {
      const x = -half * 0.6 + k * half * 0.6 + rng.range(-6, 6);
      const y = bottom - th * 0.24 + Math.abs(x) * 0.05;
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x, y + rng.range(10, 20));
      ctx.lineTo(x + 4, y);
      ctx.fill();
    }
  }
  // Snow mound at the foot.
  const mound = new Path2D();
  mound.moveTo(-110, 2);
  mound.quadraticCurveTo(-60, -30, 0, -26);
  mound.quadraticCurveTo(70, -30, 110, 2);
  mound.closePath();
  form(ctx, mound, -110, -30, 110, 2, '#ffffff', '#eef5ff', '#bcd2ee', 0);
};

const iceCrystal: Painter = (ctx, rng) => {
  contact(ctx, 110, 0.2);
  const prisms: [number, number, number, number][] = [
    [-30, 120, 20, -0.25], [26, 140, 22, 0.22], [0, 190, 28, 0.02], [-46, 70, 14, -0.45], [44, 80, 14, 0.4],
  ];
  for (const [x, h, w, lean] of prisms) {
    const hh = h * rng.range(0.9, 1.05);
    ctx.save();
    ctx.translate(x, 2);
    ctx.rotate(lean);
    const body = new Path2D();
    body.moveTo(-w, 0);
    body.lineTo(-w, -hh * 0.78);
    body.lineTo(0, -hh);
    body.lineTo(w, -hh * 0.78);
    body.lineTo(w, 0);
    body.closePath();
    const g = ctx.createLinearGradient(-w, -hh, w, 0);
    g.addColorStop(0, 'rgba(240,252,255,0.95)');
    g.addColorStop(0.5, 'rgba(174,227,245,0.85)');
    g.addColorStop(1, 'rgba(98,170,214,0.9)');
    ctx.fillStyle = g;
    ctx.fill(body);
    // Facets.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(-w, -hh * 0.78);
    ctx.lineTo(0, -hh);
    ctx.lineTo(-w * 0.2, -hh * 0.72);
    ctx.lineTo(-w * 0.25, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(70,140,200,0.35)';
    ctx.beginPath();
    ctx.moveTo(w * 0.35, 0);
    ctx.lineTo(w * 0.3, -hh * 0.7);
    ctx.lineTo(w, -hh * 0.78);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,130,190,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke(body);
    ctx.restore();
  }
  // Sparkle.
  ctx.fillStyle = '#ffffff';
  const sx = -8;
  const sy = -150;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 14);
  ctx.lineTo(sx + 3, sy - 3);
  ctx.lineTo(sx + 14, sy);
  ctx.lineTo(sx + 3, sy + 3);
  ctx.lineTo(sx, sy + 14);
  ctx.lineTo(sx - 3, sy + 3);
  ctx.lineTo(sx - 14, sy);
  ctx.lineTo(sx - 3, sy - 3);
  ctx.closePath();
  ctx.fill();
  // Snow at the base.
  ctx.fillStyle = '#f4f8ff';
  ctx.beginPath();
  ctx.ellipse(0, 2, 58, 12, 0, Math.PI, TAU);
  ctx.fill();
};

const snowRock: Painter = (ctx, rng) => {
  contact(ctx, 200, 0.25);
  const rock = new Path2D();
  rock.moveTo(-96, 2);
  rock.bezierCurveTo(-102, -40, -80, -84, -30, -100);
  rock.bezierCurveTo(20, -112, 76, -90, 92, -46);
  rock.bezierCurveTo(98, -20, 96, -4, 92, 2);
  rock.closePath();
  form(ctx, rock, -90, -100, 90, 0, '#aab4d0', '#7d88a8', '#4c5574');
  within(ctx, rock, () => {
    ctx.fillStyle = 'rgba(50,58,90,0.35)';
    ctx.beginPath();
    ctx.moveTo(30, -110);
    ctx.lineTo(40, -50);
    ctx.lineTo(100, -30);
    ctx.lineTo(100, -110);
    ctx.closePath();
    ctx.fill();
    // Thick snow cap.
    const cap = new Path2D();
    cap.moveTo(-110, -36);
    cap.bezierCurveTo(-90, -120, 60, -136, 104, -60);
    cap.quadraticCurveTo(80, -44, 60, -58);
    cap.quadraticCurveTo(30, -40, 0, -60);
    cap.quadraticCurveTo(-30, -44, -60, -56);
    cap.quadraticCurveTo(-90, -40, -110, -36);
    cap.closePath();
    form(ctx, cap, -100, -120, 100, -40, '#ffffff', '#f2f7ff', '#bcd2ee', 0);
    ctx.fillStyle = 'rgba(190,230,250,0.9)';
    for (let i = 0; i < 4; i++) {
      const x = -60 + i * 38 + rng.range(-6, 6);
      ctx.beginPath();
      ctx.moveTo(x - 4, -52);
      ctx.lineTo(x, -52 + rng.range(10, 18));
      ctx.lineTo(x + 4, -52);
      ctx.fill();
    }
  });
  ctx.fillStyle = '#f4f8ff';
  ctx.beginPath();
  ctx.ellipse(-30, 2, 80, 10, 0, Math.PI, TAU);
  ctx.fill();
};

const lantern: Painter = (ctx, rng) => {
  contact(ctx, 60, 0.25);
  // Wooden post with a hook arm.
  const post = new Path2D();
  post.rect(-9, -176, 18, 178);
  post.moveTo(-9, -168);
  post.lineTo(26, -168);
  post.lineTo(26, -160);
  post.lineTo(-9, -158);
  post.closePath();
  form(ctx, post, -9, -176, 9, 0, '#9c6d48', '#6b4630', '#3f2818');
  ctx.strokeStyle = 'rgba(40,24,14,0.5)';
  ctx.lineWidth = 2;
  for (let y = -150; y < -10; y += rng.range(30, 50)) {
    ctx.beginPath();
    ctx.moveTo(-5, y);
    ctx.lineTo(-2, y + 16);
    ctx.stroke();
  }
  // Snow on the post top and arm.
  ctx.fillStyle = '#f6f9ff';
  ctx.beginPath();
  ctx.ellipse(0, -177, 13, 6, 0, Math.PI, TAU);
  ctx.ellipse(12, -169, 16, 4, 0, Math.PI, TAU);
  ctx.fill();
  // Hanging lantern.
  const cx = 8;
  const top = -156;
  ctx.strokeStyle = '#2f2b36';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(20, -160);
  ctx.lineTo(cx, top + 4);
  ctx.stroke();
  const glass = new Path2D();
  glass.moveTo(cx - 13, top + 14);
  glass.lineTo(cx + 13, top + 14);
  glass.lineTo(cx + 15, top + 44);
  glass.lineTo(cx - 15, top + 44);
  glass.closePath();
  const g = ctx.createRadialGradient(cx, top + 30, 2, cx, top + 30, 20);
  g.addColorStop(0, '#fffbe0');
  g.addColorStop(0.5, '#ffd27a');
  g.addColorStop(1, '#f08a2a');
  ctx.fillStyle = g;
  ctx.fill(glass);
  ctx.fillStyle = '#3a3542';
  ctx.beginPath();
  ctx.moveTo(cx - 18, top + 15);
  ctx.lineTo(cx, top + 2);
  ctx.lineTo(cx + 18, top + 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - 16, top + 43, 32, 6);
  ctx.strokeStyle = '#3a3542';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, top + 14);
  ctx.lineTo(cx, top + 44);
  ctx.stroke();
  // Flame.
  ctx.fillStyle = '#fff6d0';
  ctx.beginPath();
  ctx.moveTo(cx - 4, top + 38);
  ctx.quadraticCurveTo(cx - 4, top + 28, cx, top + 22);
  ctx.quadraticCurveTo(cx + 4, top + 28, cx + 4, top + 38);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f6f9ff';
  ctx.beginPath();
  ctx.ellipse(cx, top + 4, 12, 4, 0, Math.PI, TAU);
  ctx.fill();
  // Snow heap at the base.
  ctx.beginPath();
  ctx.ellipse(0, 2, 30, 10, 0, Math.PI, TAU);
  ctx.fill();
};

const snowman: Painter = (ctx, rng) => {
  contact(ctx, 120, 0.25);
  const ball = (x: number, y: number, r: number) => {
    const p = new Path2D();
    p.arc(x, y, r, 0, TAU);
    form(ctx, p, x - r, y - r, x + r, y + r, '#ffffff', '#eef4ff', '#b5cbea', 2.5);
  };
  ball(0, -46, 48);
  ball(2, -114, 36);
  // Twig arms.
  ctx.strokeStyle = '#6b4630';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-30, -118);
  ctx.lineTo(-62, -146);
  ctx.moveTo(-50, -136);
  ctx.lineTo(-58, -158);
  ctx.moveTo(34, -116);
  ctx.lineTo(62, -132);
  ctx.lineTo(70, -150);
  ctx.stroke();
  ball(0, -166, 28);
  // Pig face: ears, snout, pebble eyes and a grin.
  ctx.fillStyle = '#eef4ff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 14, -190);
    ctx.lineTo(s * 26, -206);
    ctx.lineTo(s * 28, -184);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,190,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const snout = new Path2D();
  snout.ellipse(4, -160, 12, 9, 0, 0, TAU);
  form(ctx, snout, -8, -169, 16, -151, '#ffe2e8', '#f6c6d0', '#d697a6', 2);
  ctx.fillStyle = '#7a4a58';
  ctx.beginPath();
  ctx.ellipse(0, -160, 2.4, 3.4, 0, 0, TAU);
  ctx.ellipse(8, -160, 2.4, 3.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2b2a33';
  ctx.beginPath();
  ctx.arc(-9, -176, 3.6, 0, TAU);
  ctx.arc(15, -176, 3.6, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(-8 + i * 5, -145 + Math.sin((i / 4) * Math.PI) * 3, 1.8, 0, TAU);
    ctx.fill();
  }
  // Coal buttons.
  for (const y of [-124, -104]) {
    ctx.beginPath();
    ctx.arc(4, y, 4, 0, TAU);
    ctx.fill();
  }
  // Knitted scarf.
  const scarf = new Path2D();
  scarf.moveTo(-26, -146);
  scarf.quadraticCurveTo(2, -134, 30, -146);
  scarf.lineTo(30, -136);
  scarf.quadraticCurveTo(2, -124, -26, -136);
  scarf.closePath();
  scarf.moveTo(14, -138);
  scarf.lineTo(26, -100);
  scarf.lineTo(14, -98);
  scarf.lineTo(6, -136);
  scarf.closePath();
  form(ctx, scarf, -26, -146, 30, -100, '#ff8a5c', '#e2493a', '#a42a24', 2);
  ctx.strokeStyle = 'rgba(255,230,200,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-20, -139);
  ctx.quadraticCurveTo(2, -129, 26, -139);
  ctx.stroke();
  // Little woolly hat.
  const hat = new Path2D();
  hat.moveTo(-24, -184);
  hat.quadraticCurveTo(0, -224, 24, -184);
  hat.closePath();
  form(ctx, hat, -24, -214, 24, -184, '#6fc2ff', '#2b8fd8', '#1d5f9c', 2);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(rng.range(-2, 2), -214, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e8f1ff';
  ctx.fillRect(-25, -188, 50, 7);
};

const frozenBush: Painter = (ctx, rng) => {
  contact(ctx, 160, 0.22);
  const lobes: [number, number, number][] = [
    [-46, -36, 34], [0, -54, 44], [46, -36, 34], [-20, -76, 28], [24, -74, 26], [-66, -22, 22], [68, -22, 22],
  ];
  crown(ctx, lobes, { dark: '#2c5b5c', base: '#4c8180', light: '#7fb1ad', hi: '#c6e6e4' }, rng);
  // Frost and snow on top.
  const snow = new Path2D();
  for (const [x, y, r] of lobes) {
    if (y > -40) continue;
    snow.moveTo(x - r * 0.8, y - r * 0.2);
    snow.quadraticCurveTo(x - r * 0.4, y - r * 1.15, x + r * 0.5, y - r * 0.85);
    snow.quadraticCurveTo(x + r * 0.2, y - r * 0.5, x - r * 0.8, y - r * 0.2);
    snow.closePath();
  }
  form(ctx, snow, -60, -120, 60, -40, '#ffffff', '#f2f8ff', '#bcd2ee', 0);
  ctx.fillStyle = 'rgba(220,245,255,0.9)';
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(rng.range(-70, 70), rng.range(-90, -10), rng.range(2, 3.5), 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#f4f8ff';
  ctx.beginPath();
  ctx.ellipse(0, 2, 80, 10, 0, Math.PI, TAU);
  ctx.fill();
};

const PAINTERS: Record<string, Painter> = {
  tree_oak: treeOak,
  tree_birch: treeBirch,
  bush,
  flowers,
  grass_tuft: grassTuft,
  rock_mossy: rockMossy,
  fence,
  mushroom,
  cactus,
  palm,
  rock_sandstone: rockSandstone,
  ruin_column: ruinColumn,
  ruin_arch: ruinArch,
  dune_grass: duneGrass,
  bones,
  pine_snow: pineSnow,
  ice_crystal: iceCrystal,
  snow_rock: snowRock,
  lantern,
  snowman,
  frozen_bush: frozenBush,
};
