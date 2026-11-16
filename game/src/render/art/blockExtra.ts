/**
 * Ice, ironwood, crystal and rubber. Each reads at a glance against the other materials:
 * ice is frosted and snow-capped, ironwood is dark timber in iron bands, crystal is a faceted
 * violet gem, rubber is matte black with a safety stripe.
 */
import { clamp, Rng, TAU } from '../../core/math';
import { INK } from '../../core/palette';
import { paintWood } from './blockWood';
import { insideGeo, mixSeed, outlinePath, randomInside, type BlockGeo } from './materialUtil';
import type { DamageStage } from './types';

const OUTLINE = 4.5;

function start(ctx: CanvasRenderingContext2D, geo: BlockGeo, seed: number, salt: number, wobble: number): { rng: Rng; outline: Path2D } {
  const rng = new Rng(mixSeed(seed, Math.round(geo.w * 7 + geo.h * 13) + salt));
  const outline = outlinePath(geo, rng, wobble);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.clip(outline);
  return { rng, outline };
}

function finish(ctx: CanvasRenderingContext2D, outline: Path2D): void {
  ctx.restore();
  ctx.lineWidth = OUTLINE;
  ctx.strokeStyle = INK;
  ctx.stroke(outline);
  ctx.restore();
}

/** A jagged crack from a point on the rim towards the middle; `depth` 0..1 is how far it has grown. */
function crackLine(ctx: CanvasRenderingContext2D, geo: BlockGeo, rng: Rng, depth: number): void {
  const angle = rng.range(0, TAU);
  const reach = Math.max(geo.w, geo.h) * 0.6;
  let x = Math.cos(angle) * reach;
  let y = Math.sin(angle) * reach;
  const tx = geo.cx + rng.range(-0.2, 0.2) * geo.w;
  const ty = geo.cy + rng.range(-0.2, 0.2) * geo.h;
  const steps = 6;
  ctx.moveTo(x, y);
  for (let i = 1; i <= Math.round(steps * depth); i++) {
    const k = i / steps;
    x = Math.cos(angle) * reach * (1 - k) + tx * k + rng.range(-1, 1) * geo.inradius * 0.3;
    y = Math.sin(angle) * reach * (1 - k) + ty * k + rng.range(-1, 1) * geo.inradius * 0.3;
    ctx.lineTo(x, y);
  }
}

function cracks(ctx: CanvasRenderingContext2D, geo: BlockGeo, seed: number, stage: DamageStage, light: string, dark: string, width: number): void {
  if (stage === 0) return;
  const rng = new Rng(mixSeed(seed, 977));
  const count = stage + 1 + (geo.inradius > 30 ? 1 : 0);
  ctx.beginPath();
  for (let i = 0; i < count; i++) crackLine(ctx, geo, rng, 0.45 + stage * 0.18);
  ctx.lineWidth = width + 2;
  ctx.strokeStyle = dark;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = light;
  ctx.stroke();
}

// ---------------------------------------------------------------- ice

export function paintIce(ctx: CanvasRenderingContext2D, geo: BlockGeo, stage: DamageStage, seed: number): void {
  const { rng, outline } = start(ctx, geo, seed, 11, 1.4);
  const hw = geo.w / 2;
  const hh = geo.h / 2;
  const body = ctx.createLinearGradient(-hw, -hh, hw * 0.5, hh);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.4, '#cfeeff');
  body.addColorStop(1, '#5aa9e6');
  ctx.fillStyle = body;
  ctx.fillRect(-hw - 4, -hh - 4, geo.w + 8, geo.h + 8);

  // Frozen-in streaks and bubbles.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 3;
  const streaks = clamp(Math.round((geo.w + geo.h) / 55), 2, 7);
  for (let i = 0; i < streaks; i++) {
    const [x, y] = randomInside(geo, rng, 3);
    const len = rng.range(8, 22);
    ctx.beginPath();
    ctx.moveTo(x - len * 0.5, y + len * 0.35);
    ctx.lineTo(x + len * 0.5, y - len * 0.35);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (let i = 0; i < streaks + 2; i++) {
    const [x, y] = randomInside(geo, rng, 4);
    ctx.beginPath();
    ctx.arc(x, y, rng.range(1.5, 3.5), 0, TAU);
    ctx.fill();
  }
  // Frosted, opaque patches: ice is milky where glass is clear.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  for (let i = 0; i < streaks; i++) {
    const [x, y] = randomInside(geo, rng, 2);
    ctx.beginPath();
    ctx.ellipse(x, y, rng.range(8, 20), rng.range(5, 11), rng.range(0, 3), 0, TAU);
    ctx.fill();
  }
  // Deep blue lower edge: the thickness of the block.
  ctx.fillStyle = 'rgba(30, 96, 190, 0.5)';
  ctx.fillRect(-hw - 4, hh - Math.min(9, geo.h * 0.28), geo.w + 8, 14);
  // Snow cap along the top.
  if (geo.shape !== 'circle') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-hw - 4, -hh - 6);
    ctx.lineTo(hw + 4, -hh - 6);
    const cap = Math.min(11, geo.h * 0.36);
    const lumps = Math.max(2, Math.round(geo.w / 26));
    for (let i = lumps; i >= 0; i--) {
      const x = -hw + (geo.w * i) / lumps;
      ctx.quadraticCurveTo(x + geo.w / lumps / 2, -hh + cap * rng.range(1.1, 1.9), x, -hh + cap * rng.range(0.4, 0.8));
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(-hw * 0.3, -hh * 0.45, hw * 0.42, hh * 0.2, -0.6, 0, TAU);
    ctx.fill();
  }
  cracks(ctx, geo, seed, stage, '#ffffff', 'rgba(40, 110, 170, 0.6)', 2.5);
  finish(ctx, outline);
}

// ---------------------------------------------------------------- ironwood

export function paintIronwood(ctx: CanvasRenderingContext2D, geo: BlockGeo, stage: DamageStage, seed: number): void {
  // Dark, oiled timber: the wood painter under a deep stain.
  paintWood(ctx, geo, stage, seed);
  const { rng, outline } = start(ctx, geo, seed, 23, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#9a6a48';
  ctx.fillRect(-geo.w, -geo.h, geo.w * 2, geo.h * 2);
  ctx.globalCompositeOperation = 'source-over';

  // Iron straps across the short side, with rivets. Bands loosen as the piece takes damage.
  const along = geo.w >= geo.h;
  const length = along ? geo.w : geo.h;
  const across = along ? geo.h : geo.w;
  const bands = geo.shape === 'circle' ? 1 : clamp(Math.round(length / 110), 1, 4) + 1;
  const bandW = clamp(across * 0.32, 9, 16);
  for (let i = 0; i < bands; i++) {
    if (stage === 3 && i % 2 === 1) continue;
    const t = bands === 1 ? 0 : (i / (bands - 1) - 0.5) * (length - bandW * 2.2);
    const skew = stage >= 2 ? rng.range(-0.08, 0.08) : 0;
    ctx.save();
    if (along) ctx.translate(t, 0);
    else ctx.translate(0, t);
    ctx.rotate(skew + (along ? 0 : Math.PI / 2));
    const grad = ctx.createLinearGradient(-bandW / 2, 0, bandW / 2, 0);
    grad.addColorStop(0, '#aeb9c6');
    grad.addColorStop(0.45, '#77828f');
    grad.addColorStop(1, '#474f5a');
    ctx.fillStyle = grad;
    ctx.fillRect(-bandW / 2, -across, bandW, across * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-bandW / 2, -across, bandW, across * 2);
    ctx.fillStyle = '#dfe7ef';
    const rivets = Math.max(1, Math.round(across / 34));
    for (let r = 0; r < rivets; r++) {
      const y = rivets === 1 ? 0 : (r / (rivets - 1) - 0.5) * (across - 14);
      ctx.beginPath();
      ctx.arc(0, y, 2.8, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  finish(ctx, outline);
}

// ---------------------------------------------------------------- crystal

export function paintCrystal(ctx: CanvasRenderingContext2D, geo: BlockGeo, stage: DamageStage, seed: number): void {
  const { rng, outline } = start(ctx, geo, seed, 37, 0.6);
  const hw = geo.w / 2;
  const hh = geo.h / 2;
  const body = ctx.createLinearGradient(-hw, -hh, hw, hh);
  body.addColorStop(0, '#f6e6ff');
  body.addColorStop(0.4, '#c98bf5');
  body.addColorStop(1, '#7a3fc0');
  ctx.fillStyle = body;
  ctx.fillRect(-hw - 4, -hh - 4, geo.w + 8, geo.h + 8);

  // Facets: triangles fanning out from an off-centre point, alternately lit and shaded.
  const fx = geo.cx + rng.range(-0.18, 0.18) * geo.w;
  const fy = geo.cy + rng.range(-0.18, 0.18) * geo.h;
  const corners: [number, number][] = [];
  if (geo.shape === 'circle') {
    for (let i = 0; i < 8; i++) corners.push([Math.cos((i / 8) * TAU + 0.3) * hw * 1.1, Math.sin((i / 8) * TAU + 0.3) * hw * 1.1]);
  } else {
    const n = geo.pts.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = geo.pts[i * 2] as number;
      const ay = geo.pts[i * 2 + 1] as number;
      const bx = geo.pts[((i + 1) % n) * 2] as number;
      const by = geo.pts[((i + 1) % n) * 2 + 1] as number;
      const cuts = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 60));
      for (let c = 0; c < cuts; c++) corners.push([ax + ((bx - ax) * c) / cuts, ay + ((by - ay) * c) / cuts]);
    }
  }
  corners.forEach(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % corners.length] as [number, number];
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.closePath();
    const lit = -((x + nx) / 2 - fx) * 0.6 - ((y + ny) / 2 - fy) * 0.8 > 0;
    ctx.fillStyle = lit ? `rgba(255, 255, 255, ${(0.14 + rng.next() * 0.22).toFixed(3)})` : `rgba(60, 20, 120, ${(0.1 + rng.next() * 0.2).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  });
  // Inner glow and a hard glint.
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, Math.max(12, geo.inradius * 1.4));
  glow.addColorStop(0, 'rgba(255, 240, 255, 0.75)');
  glow.addColorStop(1, 'rgba(255, 240, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-hw, -hh, geo.w, geo.h);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 2 + Math.round(geo.inradius / 25); i++) {
    const [x, y] = randomInside(geo, rng, 5);
    const s = rng.range(3, 6);
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x + s * 0.2, y - s * 0.2, x + s, y);
    ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.2, x, y + s);
    ctx.quadraticCurveTo(x - s * 0.2, y + s * 0.2, x - s, y);
    ctx.quadraticCurveTo(x - s * 0.2, y - s * 0.2, x, y - s);
    ctx.fill();
  }
  cracks(ctx, geo, seed, stage, '#ffffff', 'rgba(70, 20, 130, 0.7)', 2.2);
  finish(ctx, outline);
}

// ---------------------------------------------------------------- rubber

export function paintRubber(ctx: CanvasRenderingContext2D, geo: BlockGeo, stage: DamageStage, seed: number): void {
  const { rng, outline } = start(ctx, geo, seed, 53, 0.4);
  const hw = geo.w / 2;
  const hh = geo.h / 2;
  const body = ctx.createLinearGradient(0, -hh, 0, hh);
  body.addColorStop(0, '#5c6678');
  body.addColorStop(0.5, '#3c4352');
  body.addColorStop(1, '#232834');
  ctx.fillStyle = body;
  ctx.fillRect(-hw - 4, -hh - 4, geo.w + 8, geo.h + 8);

  // Tread: diagonal ribs.
  ctx.strokeStyle = 'rgba(15, 18, 26, 0.5)';
  ctx.lineWidth = 4;
  const step = 15;
  for (let x = -hw - geo.h; x < hw + geo.h; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, hh + 2);
    ctx.lineTo(x + geo.h + 4, -hh - 2);
    ctx.stroke();
  }
  // Orange safety stripe through the middle and a soft sheen on top.
  const stripe = clamp(Math.min(geo.w, geo.h) * 0.22, 5, 12);
  ctx.fillStyle = '#ff8a2b';
  if (geo.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, hw * 0.62, 0, TAU);
    ctx.lineWidth = stripe * 0.8;
    ctx.strokeStyle = '#ff8a2b';
    ctx.stroke();
  } else if (geo.w >= geo.h) ctx.fillRect(-hw - 4, -stripe / 2, geo.w + 8, stripe);
  else ctx.fillRect(-stripe / 2, -hh - 4, stripe, geo.h + 8);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(-hw - 4, -hh - 4, geo.w + 8, Math.min(8, geo.h * 0.25) + 4);

  // Damage: pale tears with a dark core.
  if (stage > 0) {
    const tears = new Rng(mixSeed(seed, 311));
    for (let i = 0; i < stage * 2; i++) {
      const [x, y] = randomInside(geo, tears, 3);
      if (!insideGeo(geo, x, y, 2)) continue;
      const len = tears.range(8, 16) * (0.6 + stage * 0.25);
      const a = tears.range(0, TAU);
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
      ctx.quadraticCurveTo(x + tears.range(-4, 4), y + tears.range(-4, 4), x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#8b96a8';
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#11141b';
      ctx.stroke();
    }
  }
  void rng;
  finish(ctx, outline);
}
