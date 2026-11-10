/**
 * The slingshot: a carved Y-shaped branch with flared roots, a stitched leather grip, a twine
 * binding over the fork, carved knobs and twine wraps where the rubber bands tie on, plus tally
 * marks of earlier victories cut into the trunk.
 *
 * Origin = base centre on the ground, 100 units per metre, y down. The back sprite holds the
 * trunk and the far (right) arm, the front sprite the near (left) arm and the fork binding.
 * The band tie points match SLING.forkBack / SLING.forkFront in core/config.
 */
import { clamp, lerp, Rng, TAU } from '../../core/math';
import { INK } from '../../core/palette';
import { mixHex, rgba } from './materialUtil';

type V = [number, number];

interface Limb {
  p0: V;
  p1: V;
  p2: V;
  p3: V;
  /** Width at the start, the middle and the end. */
  w0: number;
  wm: number;
  w1: number;
  /** Round cap at the end (arms); trunks end flat at the ground. */
  cap: boolean;
}

interface Sample {
  x: number;
  y: number;
  /** Unit normal pointing to the left of the direction of travel (towards the key light). */
  nx: number;
  ny: number;
  w: number;
}

interface WoodTones {
  light: string;
  base: string;
  dark: string;
  grain: string;
  rim: string;
}

const FRONT: WoodTones = { light: '#d4934f', base: '#a8652e', dark: '#6e3a16', grain: '#5a2f12', rim: '#f2c38a' };
const BACK: WoodTones = {
  light: mixHex(FRONT.light, '#3a2010', 0.22),
  base: mixHex(FRONT.base, '#3a2010', 0.22),
  dark: mixHex(FRONT.dark, '#1e1008', 0.22),
  grain: mixHex(FRONT.grain, '#1e1008', 0.2),
  rim: mixHex(FRONT.rim, '#3a2010', 0.25),
};
const OUTLINE = 6;
const TWINE = '#e1c38e';
const TWINE_DARK = '#a8834f';
const LEATHER = '#6b3b1f';
const LEATHER_LIGHT = '#9a5a30';
const STITCH = '#f0d7a8';

/** Band tie points (design units), mirrored in SLING.forkBack / forkFront. */
export const SLING_TIE_BACK: V = [36, -298];
export const SLING_TIE_FRONT: V = [-30, -292];

const TRUNK: Limb = { p0: [0, 8], p1: [-3, -60], p2: [3, -120], p3: [0, -160], w0: 44, wm: 29, w1: 32, cap: true };
const BACK_ARM: Limb = { p0: [4, -142], p1: [26, -170], p2: [42, -226], p3: [37, -310], w0: 24, wm: 20, w1: 17, cap: true };
const FRONT_ARM: Limb = { p0: [-4, -140], p1: [-24, -168], p2: [-38, -222], p3: [-31, -304], w0: 26, wm: 21, w1: 18, cap: true };
const ROOT_LEFT: Limb = { p0: [-10, -22], p1: [-22, -6], p2: [-38, 2], p3: [-54, 6], w0: 20, wm: 11, w1: 3, cap: true };
const ROOT_RIGHT: Limb = { p0: [10, -20], p1: [22, -5], p2: [36, 2], p3: [50, 5], w0: 18, wm: 10, w1: 3, cap: true };

function bez(l: Limb, t: number): V {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * l.p0[0] + b * l.p1[0] + c * l.p2[0] + d * l.p3[0], a * l.p0[1] + b * l.p1[1] + c * l.p2[1] + d * l.p3[1]];
}

function bezTangent(l: Limb, t: number): V {
  const u = 1 - t;
  const x = 3 * u * u * (l.p1[0] - l.p0[0]) + 6 * u * t * (l.p2[0] - l.p1[0]) + 3 * t * t * (l.p3[0] - l.p2[0]);
  const y = 3 * u * u * (l.p1[1] - l.p0[1]) + 6 * u * t * (l.p2[1] - l.p1[1]) + 3 * t * t * (l.p3[1] - l.p2[1]);
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}

function sample(l: Limb, n = 22): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = bez(l, t);
    const [tx, ty] = bezTangent(l, t);
    const w = t < 0.5 ? lerp(l.w0, l.wm, t * 2) : lerp(l.wm, l.w1, (t - 0.5) * 2);
    out.push({ x, y, nx: ty, ny: -tx, w });
  }
  return out;
}

function limbPath(l: Limb, s: Sample[]): Path2D {
  const path = new Path2D();
  s.forEach((p, i) => {
    const x = p.x + (p.nx * p.w) / 2;
    const y = p.y + (p.ny * p.w) / 2;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  const end = s[s.length - 1] as Sample;
  if (l.cap) {
    const a = Math.atan2(end.ny, end.nx);
    path.arc(end.x, end.y, end.w / 2, a, a + Math.PI, false);
  }
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i] as Sample;
    path.lineTo(p.x - (p.nx * p.w) / 2, p.y - (p.ny * p.w) / 2);
  }
  path.closePath();
  return path;
}

/** Cylindrical shading, grain, rim light and a few scratches inside one limb. */
function shadeLimb(ctx: CanvasRenderingContext2D, path: Path2D, s: Sample[], t: WoodTones, rng: Rng, grainLines: number): void {
  ctx.save();
  ctx.clip(path);
  const mid = s[Math.floor(s.length / 2)] as Sample;
  const half = mid.w * 0.62;
  const g = ctx.createLinearGradient(mid.x + mid.nx * half, mid.y + mid.ny * half, mid.x - mid.nx * half, mid.y - mid.ny * half);
  g.addColorStop(0, t.light);
  g.addColorStop(0.38, t.base);
  g.addColorStop(0.8, t.dark);
  g.addColorStop(1, mixHex(t.dark, '#000000', 0.15));
  ctx.fillStyle = g;
  ctx.fill(path);

  // Grain following the limb, wiggling a little.
  ctx.beginPath();
  for (let k = 0; k < grainLines; k++) {
    const off = rng.range(-0.42, 0.42);
    const phase = rng.range(0, TAU);
    const from = Math.floor(rng.range(0, 0.25) * s.length);
    const to = s.length - Math.floor(rng.range(0, 0.25) * s.length);
    for (let i = from; i < to; i++) {
      const p = s[i] as Sample;
      const o = (off + Math.sin(i * 0.7 + phase) * 0.05) * p.w;
      const x = p.x + p.nx * o;
      const y = p.y + p.ny * o;
      if (i === from) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = rgba(t.grain, 0.42);
  ctx.stroke();

  // Rim light down the lit side.
  ctx.beginPath();
  s.forEach((p, i) => {
    const o = p.w * 0.36;
    if (i === 0) ctx.moveTo(p.x + p.nx * o, p.y + p.ny * o);
    else ctx.lineTo(p.x + p.nx * o, p.y + p.ny * o);
  });
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(t.rim, 0.55);
  ctx.stroke();

  // Scratches across the wood.
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const p = s[Math.floor(rng.range(0.2, 0.85) * s.length)] as Sample;
    const o = rng.range(-0.3, 0.2) * p.w;
    const x = p.x + p.nx * o;
    const y = p.y + p.ny * o;
    ctx.moveTo(x, y);
    ctx.lineTo(x - p.nx * rng.range(5, 9) + rng.range(-2, 2), y - p.ny * rng.range(5, 9) + rng.range(2, 5));
  }
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = rgba(t.rim, 0.75);
  ctx.stroke();
  ctx.restore();
}

/** Carved knob on top of an arm with a groove below it. */
function knob(ctx: CanvasRenderingContext2D, s: Sample[], t: WoodTones): void {
  const end = s[s.length - 1] as Sample;
  const below = s[s.length - 3] as Sample;
  const r = end.w * 0.62;
  ctx.beginPath();
  ctx.ellipse(end.x, end.y - 2, r, r * 0.86, 0, 0, TAU);
  const g = ctx.createRadialGradient(end.x - r * 0.35, end.y - r * 0.5, 1, end.x, end.y, r * 1.1);
  g.addColorStop(0, t.rim);
  g.addColorStop(0.45, t.light);
  g.addColorStop(1, t.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = OUTLINE * 0.8;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(below.x + (below.nx * below.w) / 2, below.y + (below.ny * below.w) / 2);
  ctx.lineTo(below.x - (below.nx * below.w) / 2, below.y - (below.ny * below.w) / 2);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = rgba(t.grain, 0.8);
  ctx.stroke();
}

/** Twine wound round an arm around a point, with the free ends hanging down. */
function twineWrap(ctx: CanvasRenderingContext2D, l: Limb, s: Sample[], at: V, turns: number, rng: Rng): void {
  // Nearest sample to the tie point.
  let best = 0;
  let dist = Infinity;
  s.forEach((p, i) => {
    const d = Math.hypot(p.x - at[0], p.y - at[1]);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  const c = s[best] as Sample;
  const tx = -c.ny;
  const ty = c.nx;
  const half = c.w / 2 + 2.5;
  const pitch = 5.6;
  const bands = new Path2D();
  for (let k = 0; k < turns; k++) {
    const along = (k - (turns - 1) / 2) * pitch;
    const ox = c.x - tx * along;
    const oy = c.y - ty * along;
    // Each turn slants a little across the arm.
    bands.moveTo(ox + c.nx * half + tx * 2.2, oy + c.ny * half + ty * 2.2);
    bands.lineTo(ox - c.nx * half - tx * 2.2, oy - c.ny * half - ty * 2.2);
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = pitch + 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke(bands);
  ctx.lineWidth = pitch - 0.4;
  ctx.strokeStyle = TWINE;
  ctx.stroke(bands);
  ctx.translate(0.9, 1.2);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = TWINE_DARK;
  ctx.stroke(bands);
  ctx.translate(-1.8, -2.4);
  ctx.strokeStyle = 'rgba(255, 246, 220, 0.8)';
  ctx.lineWidth = 1.1;
  ctx.stroke(bands);
  ctx.restore();
  // Loose end.
  const ex = c.x - (c.nx * half) * (l === FRONT_ARM ? -1 : 1);
  const ey = c.y + 4;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.quadraticCurveTo(ex + rng.range(-4, 4), ey + 10, ex + rng.range(-6, 6), ey + 18);
  ctx.lineWidth = 4.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = TWINE;
  ctx.stroke();
}

function paintLimbs(ctx: CanvasRenderingContext2D, limbs: readonly Limb[], t: WoodTones, rng: Rng): Sample[][] {
  const samples = limbs.map((l) => sample(l));
  const paths = limbs.map((l, i) => limbPath(l, samples[i] as Sample[]));
  // Outline the union first, then fill on top, so joints between limbs carry no inner line.
  ctx.lineJoin = 'round';
  ctx.lineWidth = OUTLINE * 2;
  ctx.strokeStyle = INK;
  for (const p of paths) ctx.stroke(p);
  paths.forEach((p, i) => shadeLimb(ctx, p, samples[i] as Sample[], t, rng, limbs[i] === TRUNK ? 6 : 4));
  return samples;
}

// ---------------------------------------------------------------- back: trunk + far arm

export function paintSlingshotBackArt(ctx: CanvasRenderingContext2D): void {
  const rng = new Rng(0x51e6);
  ctx.save();
  // Soft contact shadow on the ground.
  const shadow = ctx.createRadialGradient(0, 6, 4, 0, 6, 70);
  shadow.addColorStop(0, 'rgba(30, 20, 10, 0.35)');
  shadow.addColorStop(1, 'rgba(30, 20, 10, 0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(0, 6, 72, 14, 0, 0, TAU);
  ctx.fill();

  // The far arm sits a little in shadow behind the trunk.
  const [arm] = paintLimbs(ctx, [BACK_ARM], BACK, rng);
  knob(ctx, arm as Sample[], BACK);
  twineWrap(ctx, BACK_ARM, arm as Sample[], SLING_TIE_BACK, 4, rng);
  // Roots are filled after the trunk so they flare out of it without a seam.
  const [trunk] = paintLimbs(ctx, [TRUNK, ROOT_LEFT, ROOT_RIGHT], FRONT, rng);
  trunkDetails(ctx, trunk as Sample[], rng);
  ctx.restore();
}

/** Knot, tally marks and the stitched leather grip. */
function trunkDetails(ctx: CanvasRenderingContext2D, s: Sample[], rng: Rng): void {
  const at = (y: number): Sample => {
    let best = s[0] as Sample;
    for (const p of s) if (Math.abs(p.y - y) < Math.abs(best.y - y)) best = p;
    return best;
  };
  // Knot.
  const k = at(-38);
  ctx.beginPath();
  ctx.ellipse(k.x + 6, k.y, 5.5, 8, 0.1, 0, TAU);
  ctx.fillStyle = FRONT.dark;
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = FRONT.grain;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(k.x + 5, k.y - 1.5, 2, 3.4, 0.1, 0, TAU);
  ctx.fillStyle = rgba(FRONT.rim, 0.7);
  ctx.fill();

  // Tally marks carved into the bark: one for every fort that fell.
  const tally = at(-62);
  ctx.save();
  ctx.translate(tally.x - 8, tally.y);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(i * 4 - 4, -7 + rng.range(-1, 1));
    ctx.lineTo(i * 4 - 4 + 0.6, 7 + rng.range(-1, 1));
  }
  ctx.moveTo(-8, 5);
  ctx.lineTo(12, -5);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3d1f0b';
  ctx.stroke();
  ctx.translate(0.9, 0.9);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = rgba(FRONT.rim, 0.85);
  ctx.stroke();
  ctx.restore();

  // Leather grip: a wide wrapped strap with diagonal turns and a stitched seam.
  const top = -128;
  const bottom = -84;
  const strap = new Path2D();
  const left: V[] = [];
  const right: V[] = [];
  for (let y = bottom; y >= top; y -= 4) {
    const p = at(y);
    left.push([p.x - p.w / 2 - 2.5, y]);
    right.push([p.x + p.w / 2 + 2.5, y]);
  }
  left.forEach(([x, y], i) => (i === 0 ? strap.moveTo(x, y) : strap.lineTo(x, y)));
  for (let i = right.length - 1; i >= 0; i--) strap.lineTo((right[i] as V)[0], (right[i] as V)[1]);
  strap.closePath();
  const p = at((top + bottom) / 2);
  const g = ctx.createLinearGradient(p.x - p.w / 2, 0, p.x + p.w / 2, 0);
  g.addColorStop(0, LEATHER_LIGHT);
  g.addColorStop(0.45, LEATHER);
  g.addColorStop(1, '#3f2010');
  ctx.fillStyle = g;
  ctx.fill(strap);
  ctx.save();
  ctx.clip(strap);
  ctx.beginPath();
  for (let y = bottom + 4; y > top - 10; y -= 9) {
    ctx.moveTo(p.x - 30, y + 6);
    ctx.lineTo(p.x + 30, y - 6);
  }
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(30, 12, 4, 0.75)';
  ctx.stroke();
  ctx.translate(0, 1.6);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(214, 150, 100, 0.55)';
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(p.x + p.w * 0.18, bottom - 3);
  ctx.lineTo(p.x + p.w * 0.18, top + 3);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = STITCH;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = OUTLINE * 0.7;
  ctx.strokeStyle = INK;
  ctx.stroke(strap);
}

// ---------------------------------------------------------------- front: near arm + binding

export function paintSlingshotFrontArt(ctx: CanvasRenderingContext2D): void {
  const rng = new Rng(0xf0e7);
  ctx.save();
  const [arm] = paintLimbs(ctx, [FRONT_ARM], FRONT, rng) as Sample[][];
  knob(ctx, arm as Sample[], FRONT);
  twineWrap(ctx, FRONT_ARM, arm as Sample[], SLING_TIE_FRONT, 4, rng);
  forkBinding(ctx);
  ctx.restore();
}

/** Twine lashed over the fork, hiding where the near arm joins the trunk. */
function forkBinding(ctx: CanvasRenderingContext2D): void {
  const cx = -1;
  const cy = -150;
  const halfW = 21;
  const turns = 4;
  const pitch = 6;
  const path = new Path2D();
  for (let k = 0; k < turns; k++) {
    const y = cy + (k - (turns - 1) / 2) * pitch;
    const widen = 1 - Math.abs(k - (turns - 1) / 2) * 0.05;
    path.moveTo(cx - halfW * widen, y + 3);
    path.quadraticCurveTo(cx, y - 2.5, cx + halfW * widen, y - 3);
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = pitch + 3;
  ctx.strokeStyle = INK;
  ctx.stroke(path);
  ctx.lineWidth = pitch - 0.3;
  ctx.strokeStyle = TWINE;
  ctx.stroke(path);
  ctx.translate(0.6, 1.5);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = TWINE_DARK;
  ctx.stroke(path);
  ctx.translate(-1.2, -3);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255, 246, 220, 0.85)';
  ctx.stroke(path);
  ctx.restore();
  // Cross lashing over the turns.
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy - 14);
  ctx.lineTo(cx + 8, cy + 14);
  ctx.lineWidth = 6.5;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = TWINE;
  ctx.stroke();
  // A nail through the lashing.
  ctx.beginPath();
  ctx.arc(cx + 13, cy + 1, clamp(3.2, 2, 4), 0, TAU);
  ctx.fillStyle = '#7d8590';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
}
