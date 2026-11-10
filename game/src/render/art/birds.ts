/**
 * Bird artwork. Every bird faces right and is built around the collision circle of radius
 * CHARACTER_RADIUS; crests, tails and beaks may reach out to CHARACTER_EXTENT.
 *
 * A bird is a static design (outline, plumage, face) posed every frame by a small rig that is
 * derived from the BirdPose. Time only ever moves feathers, pupils and sparks, never the body.
 */
import { DEG, TAU, clamp01, lerp } from '../../core/math';
import { BIRD_COLORS, INK } from '../../core/palette';
import type { BirdType } from '../../core/types';
import {
  DETAIL_LINE,
  FEATURE_LINE,
  beginBody,
  blobPolar,
  blobThrough,
  endBody,
  flashTones,
  paintBeak,
  paintBrow,
  paintEye,
  paintGloss,
  paintPlumes,
  paintSqueezedEye,
  shadeBody,
  traceBlob,
} from './charParts';
import type { BeakShape, BeakTones, Blob, BodyTones, EyeLook, EyeShape, EyeTones, Plume, PlumePose } from './charParts';
import type { BirdPose } from './types';

// ---------------------------------------------------------------- design data

interface BirdTones extends BodyTones, EyeTones, BeakTones {
  belly: string;
  brow: string;
  crest: string;
  tail: string;
}

interface BrowShape {
  outerX: number;
  outerY: number;
  outerW: number;
  innerX: number;
  innerY: number;
  innerW: number;
}

interface Patch {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

interface BirdDesign {
  body: Blob;
  tail: readonly Plume[];
  crest: readonly Plume[];
  belly: Patch | null;
  gloss: { x: number; y: number; size: number };
  near: EyeShape;
  far: EyeShape;
  nearBrow: BrowShape;
  farBrow: BrowShape;
  beak: BeakShape;
  /** Personality: added to the resting lid closure and brow anger of every ordinary state. */
  lidBias: number;
  angerBias: number;
}

function plume(
  x: number,
  y: number,
  angleDeg: number,
  backDeg: number,
  length: number,
  width: number,
  bend: number,
  point: number,
  phase: number,
  ruffleDeg: number,
): Plume {
  return { x, y, angle: angleDeg * DEG, back: backDeg * DEG, length, width, bend, point, phase, ruffle: ruffleDeg * DEG };
}

const FACE_TONES = {
  ink: INK,
  eyeWhite: '#ffffff',
  pupil: '#1b120f',
  mouth: '#7a1f2b',
  tongue: '#f48295',
  gloss: '#ffffffcc',
} as const;

const BEAK_YELLOW = { beak: '#f7b125', beakDark: '#de870f', beakLight: '#ffd96e' } as const;

// ---------------------------------------------------------------- Red

const RED_TONES: BirdTones = {
  ...FACE_TONES,
  ...BEAK_YELLOW,
  hi: '#f5563f',
  body: BIRD_COLORS.red.body,
  lo: '#c82b27',
  shade: '#a81f2299',
  rim: '#ff7a5c85',
  belly: '#f2d9b6',
  lid: '#c92e29',
  brow: '#2b1a12',
  crest: '#d1332b',
  tail: '#3b2725',
};

const RED: BirdDesign = {
  body: blobPolar([93, 94, 95, 95, 96, 95, 93, 95, 96, 95, 94, 93]),
  tail: [plume(-84, 10, 200, 186, 48, 25, -4, 0.35, 0, 14), plume(-86, 30, 168, 178, 43, 23, 4, 0.35, 1.7, -12)],
  crest: [plume(-12, -84, -114, -168, 58, 29, -9, 0.3, 0.6, -22), plume(4, -86, -76, -152, 45, 25, -7, 0.3, 2.1, 20)],
  belly: { x: 12, y: 72, rx: 64, ry: 44 },
  gloss: { x: -50, y: -54, size: 15 },
  near: { x: 14, y: -15, rx: 25, ry: 27, pupil: 10 },
  far: { x: 60, y: -13, rx: 20, ry: 25, pupil: 9 },
  nearBrow: { outerX: -16, outerY: -46, outerW: 12, innerX: 38, innerY: -29, innerW: 17 },
  farBrow: { outerX: 88, outerY: -43, outerW: 11, innerX: 40, innerY: -28, innerW: 16 },
  beak: { x: 38, y: 27, length: 70, upper: 23, lower: 16, jaw: 54, hook: 6, gape: 0.62 },
  lidBias: 0,
  angerBias: 0,
};

// ---------------------------------------------------------------- Chuck

const CHUCK_TONES: BirdTones = {
  ...FACE_TONES,
  hi: '#ffe452',
  body: BIRD_COLORS.chuck.body,
  lo: '#efb616',
  shade: '#d9960b8c',
  rim: '#fff9a890',
  belly: '#fff3c2',
  beak: '#f08a1c',
  beakDark: '#d2670f',
  beakLight: '#ffb95e',
  lid: '#e9b815',
  brow: '#33200f',
  crest: '#3a2a1e',
  tail: '#3a2a1e',
};

/** Rounded triangle leaning back: [angle in degrees, radius], clockwise from the apex. */
const CHUCK_OUTLINE: readonly (readonly [number, number])[] = [
  [-97, 108],
  [-72, 93],
  [-46, 86],
  [-20, 87],
  [5, 96],
  [27, 109],
  [48, 97],
  [69, 87],
  [90, 84],
  [111, 87],
  [132, 97],
  [153, 109],
  [175, 96],
  [200, 87],
  [226, 86],
  [250, 93],
];

const CHUCK: BirdDesign = {
  body: blobThrough(CHUCK_OUTLINE.map(([angle, radius]): [number, number] => [Math.cos(angle * DEG) * radius, Math.sin(angle * DEG) * radius])),
  tail: [plume(-90, 48, 190, 184, 46, 15, -2, 0.9, 0.9, 14), plume(-88, 60, 164, 176, 40, 14, 3, 0.9, 2.2, -14)],
  crest: [
    plume(-18, -94, -162, -180, 46, 15, -3, 0.9, 0.3, -20),
    plume(-14, -99, -138, -173, 60, 17, -5, 0.9, 1.4, 6),
    plume(-9, -100, -112, -165, 50, 16, -5, 0.9, 2.6, 26),
  ],
  belly: { x: 8, y: 70, rx: 62, ry: 34 },
  gloss: { x: -44, y: -40, size: 13 },
  near: { x: 6, y: -12, rx: 24, ry: 22, pupil: 9 },
  far: { x: 50, y: -10, rx: 19, ry: 20, pupil: 8 },
  nearBrow: { outerX: -22, outerY: -40, outerW: 8, innerX: 30, innerY: -27, innerW: 13 },
  farBrow: { outerX: 74, outerY: -40, outerW: 8, innerX: 32, innerY: -26, innerW: 12 },
  beak: { x: 32, y: 21, length: 94, upper: 17, lower: 11, jaw: 70, hook: 2, gape: 0.5 },
  lidBias: 0.16,
  angerBias: 0.1,
};

// ---------------------------------------------------------------- Bomb

interface BombTones extends BirdTones {
  collar: string;
  collarDark: string;
  collarLight: string;
  fuse: string;
  spark: string;
  sparkHot: string;
  sparkEdge: string;
  halo: string;
  glowCore: string;
  glowMid: string;
  glowEdge: string;
}

const BOMB_TONES: BombTones = {
  ...FACE_TONES,
  ...BEAK_YELLOW,
  hi: '#565663',
  body: BIRD_COLORS.bomb.body,
  lo: '#24242b',
  shade: '#101014a6',
  rim: '#8a8a9a80',
  belly: '#8e8e9c',
  lid: '#55555f',
  brow: '#a9a9b8',
  crest: '#2c2c33',
  tail: '#2c2c33',
  collar: '#8e8e9c',
  collarDark: '#5b5b68',
  collarLight: '#cfcfda',
  fuse: '#dbb684',
  spark: '#ffb629',
  sparkHot: '#fff5c4',
  sparkEdge: '#e2681a',
  halo: '#ffc94a55',
  glowCore: '#ffd54f',
  glowMid: '#ff6a1f',
  glowEdge: '#8f1212',
};

const BOMB: BirdDesign = {
  body: blobPolar([94, 94, 95, 94, 95, 95, 94, 95, 95, 94, 94, 94]),
  tail: [plume(-86, 14, 200, 188, 36, 23, -3, 0.25, 0.4, 12), plume(-88, 33, 168, 178, 34, 22, 3, 0.25, 1.6, -12)],
  crest: [],
  belly: { x: 14, y: 76, rx: 54, ry: 36 },
  gloss: { x: -50, y: -52, size: 16 },
  near: { x: 12, y: -10, rx: 23, ry: 24, pupil: 8.5 },
  far: { x: 57, y: -8, rx: 18, ry: 22, pupil: 7.5 },
  nearBrow: { outerX: -18, outerY: -42, outerW: 13, innerX: 36, innerY: -31, innerW: 17 },
  farBrow: { outerX: 84, outerY: -40, outerW: 12, innerX: 38, innerY: -30, innerW: 16 },
  beak: { x: 36, y: 29, length: 66, upper: 21, lower: 13, jaw: 46, hook: 9, gape: 0.55 },
  lidBias: 0.24,
  angerBias: 0.15,
};

/** Number of heat pulses over a whole fuse; they are spaced quadratically, so the rhythm accelerates. */
const HEAT_PULSES = 9;
/** Slow pulse that keeps a held fuse value alive, in Hz. */
const HEAT_IDLE_HZ = 1.3;
/** Fraction of the fuse cord that is left when the fuse has burnt down. */
const FUSE_STUB = 0.35;
const SPARK_RAYS = 6;

function paintBombFuse(ctx: CanvasRenderingContext2D, pose: BirdPose, sweep: number, t: BombTones): void {
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = t.ink;
  ctx.fillStyle = t.collar;
  ctx.beginPath();
  ctx.moveTo(-18, -88);
  ctx.lineTo(-15, -107);
  ctx.quadraticCurveTo(0, -113, 15, -107);
  ctx.lineTo(18, -88);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = t.collarDark;
  ctx.beginPath();
  ctx.ellipse(0, -107, 12, 3.6, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = t.collarLight;
  ctx.lineWidth = DETAIL_LINE;
  ctx.beginPath();
  ctx.moveTo(-9, -103);
  ctx.lineTo(-10.5, -94);
  ctx.stroke();

  // The cord burns down with the fuse: only the first part of the curve is drawn.
  const fuse = clamp01(pose.fuse ?? 0);
  const part = lerp(1, FUSE_STUB, fuse);
  const back = clamp01(sweep);
  const sway = Math.sin(pose.time * 2.6) * 2.5;
  const midX = lerp(3, -8, back);
  const midY = lerp(-130, -126, back);
  const endX = lerp(-15, -36, back) + sway;
  const endY = lerp(-141, -127, back);
  const ctrlX = lerp(0, midX, part);
  const ctrlY = lerp(-106, midY, part);
  const tipX = lerp(lerp(0, midX, part), lerp(midX, endX, part), part);
  const tipY = lerp(lerp(-106, midY, part), lerp(midY, endY, part), part);
  ctx.beginPath();
  ctx.moveTo(0, -106);
  ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
  ctx.lineWidth = 11;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = t.fuse;
  ctx.stroke();
  paintSpark(ctx, tipX, tipY, 12 + 7 * fuse, pose.time, t);
}

function paintSpark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, t: BombTones): void {
  const flicker = 0.85 + 0.15 * Math.sin(time * 37);
  ctx.fillStyle = t.halo;
  ctx.beginPath();
  ctx.arc(x, y, size * 1.6 * flicker, 0, TAU);
  ctx.fill();

  const spin = time * 3.1;
  ctx.beginPath();
  for (let i = 0; i < SPARK_RAYS * 2; i++) {
    const angle = spin + (i / (SPARK_RAYS * 2)) * TAU;
    const ray = size * (0.62 + 0.38 * Math.abs(Math.sin(time * 29 + i * 1.9)));
    const radius = i % 2 === 0 ? ray : size * 0.4;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fillStyle = t.spark;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = t.sparkEdge;
  ctx.stroke();
  ctx.fillStyle = t.sparkHot;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.34 * flicker, 0, TAU);
  ctx.fill();
}

/** The body heats up with the fuse: a glow from the core that pulses faster and faster. Drawn inside the body clip. */
function paintBombHeat(ctx: CanvasRenderingContext2D, pose: BirdPose, t: BombTones): void {
  const fuse = clamp01(pose.fuse ?? 0);
  if (fuse <= 0) return;
  const beat = 0.5 + 0.5 * Math.sin(TAU * (HEAT_PULSES * fuse * fuse + pose.time * HEAT_IDLE_HZ));
  const glow = ctx.createRadialGradient(6, 24, 4, 0, 6, 110);
  glow.addColorStop(0, t.glowCore);
  glow.addColorStop(0.42, t.glowMid);
  glow.addColorStop(1, t.glowEdge);
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * (0.2 + 0.52 * fuse) * (0.58 + 0.42 * beat);
  ctx.fillStyle = glow;
  ctx.fillRect(-120, -120, 240, 240);
  ctx.globalAlpha = alpha;
}

// ---------------------------------------------------------------- The Blues

const BLUES_TONES: BirdTones = {
  ...FACE_TONES,
  ...BEAK_YELLOW,
  hi: '#84d0f8',
  body: BIRD_COLORS.blues.body,
  lo: '#3f9fe0',
  shade: '#2b7fc480',
  rim: '#c4ecff90',
  belly: '#e8f7ff',
  lid: '#49a5e2',
  brow: '#1c477d',
  crest: '#3d9be0',
  tail: '#2b7fc4',
};

const BLUES: BirdDesign = {
  body: blobPolar([94, 95, 94, 94, 95, 95, 94, 95, 95, 94, 94, 94]),
  tail: [plume(-86, 16, 198, 186, 32, 19, -3, 0.4, 0.5, 14), plume(-87, 31, 168, 178, 30, 18, 3, 0.4, 1.9, -14)],
  crest: [
    plume(-16, -85, -130, -166, 26, 15, -3, 0.45, 0.2, -24),
    plume(-6, -88, -101, -158, 35, 16, -4, 0.45, 1.3, 4),
    plume(4, -87, -72, -150, 25, 14, -3, 0.45, 2.5, 26),
  ],
  belly: { x: 14, y: 72, rx: 60, ry: 40 },
  gloss: { x: -50, y: -52, size: 15 },
  near: { x: 8, y: -12, rx: 29, ry: 31, pupil: 13.5 },
  far: { x: 60, y: -10, rx: 23, ry: 28, pupil: 12 },
  nearBrow: { outerX: -16, outerY: -49, outerW: 7, innerX: 26, innerY: -43, innerW: 9 },
  farBrow: { outerX: 82, outerY: -44, outerW: 7, innerX: 48, innerY: -41, innerW: 9 },
  beak: { x: 44, y: 27, length: 54, upper: 16, lower: 10, jaw: 40, hook: 3, gape: 0.6 },
  lidBias: -0.08,
  angerBias: -0.12,
};

// ---------------------------------------------------------------- Matilda

interface MatildaTones extends BirdTones {
  cheek: string;
  cheekHot: string;
  crease: string;
}

const MATILDA_TONES: MatildaTones = {
  ...FACE_TONES,
  ...BEAK_YELLOW,
  hi: '#ffffff',
  body: BIRD_COLORS.matilda.body,
  lo: '#e4dccb',
  shade: '#cfc5b3b8',
  rim: '#ffffffb0',
  belly: '#fffdf6',
  lid: '#e2dacb',
  brow: '#2b1a12',
  crest: '#4a362e',
  tail: '#e6decd',
  cheek: '#f6b7a6',
  cheekHot: '#ef8f7e',
  crease: '#b9ad98',
};

const MATILDA: BirdDesign = {
  body: blobPolar([106, 94, 85, 90, 98, 98, 93, 98, 98, 90, 85, 94]),
  tail: [
    plume(-80, 30, 206, 190, 36, 19, -3, 0.3, 0.2, 14),
    plume(-85, 45, 181, 182, 41, 19, 0, 0.3, 1.2, 0),
    plume(-80, 60, 156, 174, 35, 18, 3, 0.3, 2.3, -14),
  ],
  crest: [plume(-8, -122, -120, -160, 27, 12, -3, 0.6, 0.7, -30), plume(3, -124, -70, -140, 23, 11, 3, 0.6, 2.2, 28)],
  belly: null,
  gloss: { x: -40, y: -66, size: 13 },
  near: { x: 16, y: -26, rx: 21, ry: 24, pupil: 8.5 },
  far: { x: 57, y: -24, rx: 17, ry: 22, pupil: 7.5 },
  nearBrow: { outerX: -12, outerY: -57, outerW: 6, innerX: 35, innerY: -44, innerW: 10 },
  farBrow: { outerX: 80, outerY: -53, outerW: 6, innerX: 38, innerY: -43, innerW: 10 },
  beak: { x: 37, y: 13, length: 66, upper: 18, lower: 12, jaw: 49, hook: 5, gape: 0.58 },
  lidBias: 0.05,
  angerBias: 0.08,
};

/** After laying her egg: a slimmer, crumpled sack with a pinched waist and a sagging bottom. */
const MATILDA_SPENT: BirdDesign = {
  ...MATILDA,
  body: blobThrough([
    [0, -100],
    [30, -88],
    [50, -58],
    [57, -24],
    [51, 6],
    [62, 34],
    [70, 62],
    [50, 86],
    [0, 93],
    [-50, 86],
    [-70, 62],
    [-62, 34],
    [-51, 6],
    [-57, -24],
    [-50, -58],
    [-30, -88],
  ]),
  tail: [plume(-62, 44, 200, 190, 30, 15, -3, 0.3, 0.2, 18), plume(-64, 58, 164, 176, 28, 14, 3, 0.3, 2.3, -18)],
  crest: [plume(-8, -116, -128, -160, 27, 11, -3, 0.6, 0.7, -30), plume(3, -118, -62, -140, 23, 10, 3, 0.6, 2.2, 28)],
  gloss: { x: -26, y: -66, size: 9 },
  near: { x: 2, y: -28, rx: 21, ry: 24, pupil: 8.5 },
  far: { x: 43, y: -26, rx: 17, ry: 22, pupil: 7.5 },
  nearBrow: { outerX: -26, outerY: -59, outerW: 6, innerX: 21, innerY: -48, innerW: 9 },
  farBrow: { outerX: 66, outerY: -55, outerW: 6, innerX: 24, innerY: -47, innerW: 9 },
  beak: { x: 24, y: 11, length: 60, upper: 16, lower: 11, jaw: 45, hook: 5, gape: 0.58 },
};

/** Top-knot: a neat dark bun; its two sprigs are the crest plumes. */
function paintMatildaBun(ctx: CanvasRenderingContext2D, spent: boolean, t: MatildaTones): void {
  const y = spent ? -106 : -112;
  const radius = spent ? 11 : 15;
  ctx.beginPath();
  ctx.arc(-2, y, radius, 0, TAU);
  ctx.fillStyle = t.crest;
  ctx.fill();
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
}

function paintMatildaMarks(ctx: CanvasRenderingContext2D, design: BirdDesign, spent: boolean, strain: number, t: MatildaTones): void {
  const near = design.near;
  const grow = 1 + 0.3 * strain;
  ctx.fillStyle = strain > 0.5 ? t.cheekHot : t.cheek;
  if (!spent) {
    ctx.beginPath();
    ctx.ellipse(near.x - 20, near.y + 40, 17 * grow, 11 * grow, 0.15, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(design.far.x + 26, design.far.y + 34, 12 * grow, 10 * grow, 0, 0, TAU);
    ctx.fill();
  }
  ctx.lineWidth = DETAIL_LINE;
  ctx.strokeStyle = t.crease;
  ctx.beginPath();
  if (spent) {
    ctx.moveTo(-44, 20);
    ctx.quadraticCurveTo(-30, 30, -40, 46);
    ctx.moveTo(40, 18);
    ctx.quadraticCurveTo(28, 30, 38, 44);
    ctx.moveTo(-18, 62);
    ctx.quadraticCurveTo(0, 72, 20, 62);
    ctx.moveTo(near.x - 16, near.y + 30);
    ctx.quadraticCurveTo(near.x, near.y + 38, near.x + 14, near.y + 31);
  } else {
    ctx.moveTo(-62, 26);
    ctx.quadraticCurveTo(-30, 50, -66, 66);
    ctx.moveTo(-50, 36);
    ctx.quadraticCurveTo(-36, 46, -52, 56);
  }
  ctx.stroke();
}

const LASH_LENGTH = 10;

/** Three lashes fanning out from the outer upper corner of an eye (`outer`: +1 right, -1 left). */
function paintLashes(ctx: CanvasRenderingContext2D, eye: EyeShape, outer: 1 | -1, size: number, ink: string): void {
  ctx.lineWidth = DETAIL_LINE;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const lean = (22 + i * 24) * DEG;
    const dx = outer * Math.cos(lean);
    const dy = -Math.sin(lean);
    const fromX = eye.x + dx * eye.rx * size;
    const fromY = eye.y + dy * eye.ry * size;
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(fromX + dx * LASH_LENGTH, fromY + dy * LASH_LENGTH);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------- rig

/** How a design is posed this frame. */
interface Rig {
  /** Brows: 0 relaxed .. 1 furious; `lift` raises them in surprise. */
  anger: number;
  lift: number;
  /** Lid closure before blinking; `uneven` mismatches the two eyes. */
  top: number;
  bottom: number;
  uneven: number;
  eye: number;
  pupil: number;
  /** Beak: opening and gritting. */
  open: number;
  clench: number;
  /** Plumage. */
  sweep: number;
  ruffle: number;
  flutter: number;
  speed: number;
  squeeze: boolean;
  lookX: number;
  lookY: number;
  /** 0..1: pupils wander on their own. */
  drift: number;
}

const REST: Rig = {
  anger: 0.35,
  lift: 0,
  top: 0.1,
  bottom: 0,
  uneven: 0,
  eye: 1,
  pupil: 1,
  open: 0,
  clench: 0,
  sweep: 0,
  ruffle: 0,
  flutter: 0.045,
  speed: 2.3,
  squeeze: false,
  lookX: 0.2,
  lookY: 0.05,
  drift: 0,
};

function stateRig(pose: BirdPose): Rig {
  switch (pose.state) {
    case 'idle':
      return { ...REST };
    case 'aiming': {
      const pull = clamp01(pose.pull ?? 0);
      return {
        ...REST,
        anger: 0.6 + 0.4 * pull,
        top: 0.2 + 0.14 * pull,
        bottom: 0.08 + 0.18 * pull,
        clench: 0.3 + 0.7 * pull,
        sweep: 0.15 + 0.55 * pull,
        flutter: 0.01 + 0.03 * pull,
        speed: 34,
      };
    }
    case 'flying':
      return { ...REST, anger: 1, top: 0.14, bottom: 0.04, open: 1, sweep: 1, flutter: 0.13, speed: 26, lookX: 0.45, lookY: 0 };
    case 'ability':
      return { ...REST, anger: 1, top: 0.04, eye: 1.08, pupil: 0.82, open: 1.35, sweep: 1, flutter: 0.16, speed: 30, lookX: 0.4, lookY: 0 };
    case 'hit':
      return { ...REST, anger: 0.8, squeeze: true, clench: 1, sweep: -0.35, ruffle: 0.4, flutter: 0.02, speed: 40 };
    case 'dazed':
      return {
        ...REST,
        anger: 0,
        lift: 0.25,
        top: 0.42,
        bottom: 0.08,
        uneven: 1,
        pupil: 0.9,
        open: 0.3,
        sweep: 0.1,
        ruffle: 1,
        flutter: 0.07,
        speed: 3.1,
        lookX: 0,
        lookY: 0.1,
        drift: 1,
      };
  }
}

/** What "special ability active" looks like for each bird; Red keeps the generic battle cry. */
function abilityRig(type: BirdType, rig: Rig): Rig {
  switch (type) {
    case 'chuck':
      return { ...rig, top: 0.5, bottom: 0.32, eye: 1, pupil: 0.9, open: 0, clench: 0.4, sweep: 1.12, flutter: 0.05, speed: 44, lookX: 0.6 };
    case 'bomb':
      return { ...rig, anger: 0, lift: 1, top: 0, eye: 1.28, pupil: 0.55, open: 0, clench: 1, sweep: 0.2, flutter: 0.09, speed: 34, lookX: 0.1 };
    case 'blues':
      return { ...rig, anger: 0, lift: 0.8, top: 0, eye: 1.1, pupil: 1.1, open: 0.85, sweep: 0.7, flutter: 0.14, speed: 24 };
    case 'matilda':
      return { ...rig, anger: 0.9, top: 0.4, bottom: 0.36, eye: 1, pupil: 1, open: 0, clench: 1, sweep: 0.3, flutter: 0.03, speed: 40, lookX: 0.1 };
    default:
      return rig;
  }
}

function buildRig(type: BirdType, design: BirdDesign, pose: BirdPose): Rig {
  let rig = stateRig(pose);
  if (pose.state === 'ability') {
    rig = abilityRig(type, rig);
  } else {
    rig.anger = clamp01(rig.anger + design.angerBias * (1 - rig.lift));
    if (!rig.squeeze) rig.top = clamp01(rig.top + design.lidBias);
  }
  if (type === 'bomb') {
    const fuse = clamp01(pose.fuse ?? 0);
    rig.eye *= 1 + 0.2 * fuse;
    rig.pupil *= 1 - 0.35 * fuse;
    rig.top *= 1 - fuse;
    rig.anger *= 1 - fuse;
    rig.lift = Math.max(rig.lift, fuse * 0.9);
  }
  if (pose.abilityUsed) {
    if (type === 'matilda') {
      rig.eye *= 1.22;
      rig.pupil *= 0.62;
      rig.top = Math.min(rig.top, 0.02);
      rig.bottom = 0;
      rig.anger = 0;
      rig.lift = 1;
      rig.open = Math.max(rig.open, 0.4);
      rig.ruffle = Math.max(rig.ruffle, 0.8);
    } else if (type === 'chuck') {
      rig.sweep = Math.max(rig.sweep, 0.85);
      rig.ruffle = Math.max(rig.ruffle, 0.35);
    }
  }
  if (pose.lookX !== undefined) rig.lookX = pose.lookX;
  if (pose.lookY !== undefined) rig.lookY = pose.lookY;
  return rig;
}

// ---------------------------------------------------------------- face

/** How far full anger drops the inner brow ends / raises the outer ones, and how far surprise lifts a brow. */
const BROW_DROP = 9;
const BROW_FLARE = 4;
const BROW_LIFT = 13;
/** Share of a blink that comes from the lower lid. */
const BLINK_FROM_BELOW = 0.12;
/** Angry lids slant by this fraction of the eye height. */
const LID_SLANT = 0.32;
const DRIFT_REACH = 0.55;
const DRIFT_SPEED = 2.4;

function eyeLook(eye: EyeShape, inner: 1 | -1, rig: Rig, pose: BirdPose): EyeLook {
  const blink = clamp01(pose.blink);
  const bottom = rig.bottom + blink * BLINK_FROM_BELOW;
  const open = clamp01(rig.top + rig.uneven * (inner > 0 ? 0.2 : -0.14));
  const wander = pose.time * DRIFT_SPEED + (inner > 0 ? 0 : 2.2);
  return {
    lookX: rig.lookX + rig.drift * DRIFT_REACH * Math.cos(wander),
    lookY: rig.lookY + rig.drift * DRIFT_REACH * Math.sin(wander),
    top: lerp(open, 1 - bottom, blink),
    bottom,
    slant: rig.anger * eye.ry * LID_SLANT,
    size: rig.eye,
    pupil: rig.pupil,
  };
}

function paintBirdBrow(ctx: CanvasRenderingContext2D, brow: BrowShape, rig: Rig, tones: BirdTones): void {
  const rise = rig.lift * BROW_LIFT;
  paintBrow(
    ctx,
    brow.outerX,
    brow.outerY - rig.anger * BROW_FLARE - rise,
    brow.outerW,
    brow.innerX,
    brow.innerY + rig.anger * BROW_DROP - rise,
    brow.innerW,
    rig.lift * 5,
    tones.brow,
    tones.ink,
  );
}

function paintFace(ctx: CanvasRenderingContext2D, design: BirdDesign, rig: Rig, pose: BirdPose, tones: BirdTones): void {
  if (rig.squeeze) {
    paintSqueezedEye(ctx, design.far, -1, tones);
    paintSqueezedEye(ctx, design.near, 1, tones);
  } else {
    paintEye(ctx, design.far, eyeLook(design.far, -1, rig, pose), -1, tones);
    paintEye(ctx, design.near, eyeLook(design.near, 1, rig, pose), 1, tones);
  }
  paintBeak(ctx, design.beak, rig.open, rig.clench, tones);
  paintBirdBrow(ctx, design.farBrow, rig, tones);
  paintBirdBrow(ctx, design.nearBrow, rig, tones);
}

// ---------------------------------------------------------------- painters

const DESIGNS: Record<BirdType, BirdDesign> = { red: RED, chuck: CHUCK, bomb: BOMB, blues: BLUES, matilda: MATILDA };
const TONES: Record<BirdType, BirdTones> = {
  red: RED_TONES,
  chuck: CHUCK_TONES,
  bomb: BOMB_TONES,
  blues: BLUES_TONES,
  matilda: MATILDA_TONES,
};

export function paintBird(ctx: CanvasRenderingContext2D, type: BirdType, pose: BirdPose): void {
  const spent = type === 'matilda' && pose.abilityUsed === true;
  const design = spent ? MATILDA_SPENT : DESIGNS[type];
  const flash = pose.flash ?? 0;
  const tones = flashTones(TONES[type], flash);
  const rig = buildRig(type, design, pose);
  const plumes: PlumePose = { sweep: rig.sweep, ruffle: rig.ruffle, flutter: rig.flutter, speed: rig.speed, time: pose.time };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paintPlumes(ctx, design.tail, plumes, tones.tail, tones.ink);
  paintPlumes(ctx, design.crest, plumes, tones.crest, tones.ink);
  if (type === 'bomb') paintBombFuse(ctx, pose, rig.sweep, flashTones(BOMB_TONES, flash));
  if (type === 'matilda') paintMatildaBun(ctx, spent, flashTones(MATILDA_TONES, flash));

  beginBody(ctx, design.body, tones);
  if (design.belly) {
    ctx.beginPath();
    ctx.ellipse(design.belly.x, design.belly.y, design.belly.rx, design.belly.ry, 0, 0, TAU);
    ctx.fillStyle = tones.belly;
    ctx.fill();
  }
  if (type === 'matilda') {
    const strain = pose.state === 'ability' && !spent ? 1 : 0;
    paintMatildaMarks(ctx, design, spent, strain, flashTones(MATILDA_TONES, flash));
  }
  shadeBody(ctx, design.body, tones);
  if (type === 'bomb') paintBombHeat(ctx, pose, flashTones(BOMB_TONES, flash));
  paintGloss(ctx, design.gloss.x, design.gloss.y, design.gloss.size, tones.gloss);
  endBody(ctx);

  paintFace(ctx, design, rig, pose, tones);
  if (type === 'matilda' && !rig.squeeze) {
    paintLashes(ctx, design.near, -1, rig.eye, tones.ink);
    paintLashes(ctx, design.far, 1, rig.eye, tones.ink);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- egg

const EGG_TONES = {
  ink: INK,
  hi: '#ffffff',
  body: '#fffaea',
  lo: '#efe4cc',
  shade: '#d8c9a8a8',
  rim: '#ffffffc0',
  gloss: '#ffffffe6',
  speckle: '#c9a877',
  sheen: '#ffffff73',
} as const;

const EGG_BODY = blobPolar([101, 92, 85, 84, 89, 94, 96, 94, 89, 84, 85, 92]);
/** Speckles as [x, y, radius]. */
const EGG_SPECKLES: readonly (readonly [number, number, number])[] = [
  [-30, -40, 5],
  [22, -58, 3.5],
  [44, -8, 4.5],
  [-52, 14, 4],
  [6, 30, 5.5],
  [-20, 62, 4],
  [38, 52, 3.5],
  [-4, -12, 3],
];
/** Seconds between two passes of the sheen that slides across the shell. */
const EGG_SHEEN_PERIOD = 2.2;
const EGG_WOBBLE = 0.045;

export function paintEgg(ctx: CanvasRenderingContext2D, time: number): void {
  const t = EGG_TONES;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.rotate(Math.sin(time * 9) * EGG_WOBBLE);
  beginBody(ctx, EGG_BODY, t);
  ctx.fillStyle = t.speckle;
  for (const [x, y, radius] of EGG_SPECKLES) {
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.8, 0.5, 0, TAU);
    ctx.fill();
  }
  shadeBody(ctx, EGG_BODY, t);

  const slide = ((time / EGG_SHEEN_PERIOD) % 1) * 2 - 1;
  ctx.save();
  ctx.rotate(-0.5);
  ctx.fillStyle = t.sheen;
  ctx.fillRect(slide * 190 - 9, -140, 18, 280);
  ctx.restore();
  paintGloss(ctx, -34, -52, 17, t.gloss);
  endBody(ctx);
  ctx.restore();
}

/** Outline of a bird's body for tools that need the silhouette (collision-fit overlays, tests). */
export function traceBirdBody(ctx: CanvasRenderingContext2D, type: BirdType, spent = false): void {
  traceBlob(ctx, type === 'matilda' && spent ? MATILDA_SPENT.body : DESIGNS[type].body);
}
