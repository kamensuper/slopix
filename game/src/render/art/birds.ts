/**
 * The flock: eight original birds, each a different species with its own silhouette, palette and
 * markings. Every bird faces right and is built around the collision circle of radius
 * CHARACTER_RADIUS; crests, tails and beaks may reach out to CHARACTER_EXTENT.
 *
 * A bird is a static design (outline, plumage, face) posed every frame by a small rig that is
 * derived from the BirdPose. Time only ever moves feathers, pupils and sparks, never the body.
 */
import { DEG, TAU, clamp01, lerp } from '../../core/math';
import { BIRD_COLORS, INK } from '../../core/palette';
import type { BirdType } from '../../core/types';
import {
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

/** Extra artwork of one species. `under` is painted inside the body clip, `over` on top of the face. */
type MarkPainter = (ctx: CanvasRenderingContext2D, pose: BirdPose, tones: BirdTones) => void;

interface BirdDesign {
  body: Blob;
  /** Painted behind the body (after the plumes). */
  behind?: MarkPainter;
  under?: MarkPainter;
  over?: MarkPainter;
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
const BEAK_SLATE = { beak: '#454c5a', beakDark: '#262b35', beakLight: '#7d8696' } as const;
const BEAK_HORN = { beak: '#f1d6bd', beakDark: '#c69f84', beakLight: '#fff4e8' } as const;

/** Rounded outline through [angle in degrees, radius] pairs, clockwise from straight up. */
function outline(points: readonly (readonly [number, number])[]): Blob {
  return blobThrough(points.map(([angle, radius]): [number, number] => [Math.cos(angle * DEG) * radius, Math.sin(angle * DEG) * radius]));
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, fill: string): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

function dots(ctx: CanvasRenderingContext2D, spots: readonly (readonly [number, number, number])[], fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (const [x, y, r] of spots) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
}

/** Four-pointed twinkle. */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const w = size * 0.28;
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x + w, y - w, x + size, y);
  ctx.quadraticCurveTo(x + w, y + w, x, y + size);
  ctx.quadraticCurveTo(x - w, y + w, x - size, y);
  ctx.quadraticCurveTo(x - w, y - w, x, y - size);
}

// ---------------------------------------------------------------- Pip, the kingfisher (Striker)

const PIP_TONES: BirdTones = {
  ...FACE_TONES,
  ...BEAK_SLATE,
  hi: '#58dbe4',
  body: BIRD_COLORS.pip.body,
  lo: '#0f7c96',
  shade: '#0a5c7899',
  rim: '#b4f6f985',
  belly: '#f2903f',
  lid: '#1b95a8',
  brow: '#0f6a82',
  crest: '#158aa3',
  tail: '#0e6c88',
};

const PIP: BirdDesign = {
  body: blobPolar([96, 95, 96, 97, 96, 94, 92, 92, 94, 96, 96, 95]),
  tail: [plume(-86, 20, 190, 184, 40, 22, -2, 0.5, 0.4, 12), plume(-84, 38, 165, 176, 34, 20, 3, 0.5, 1.8, -12)],
  // A shaggy, spiky crest swept back over the crown.
  crest: [
    plume(-32, -78, -152, -176, 46, 17, -4, 0.85, 0.2, -18),
    plume(-16, -87, -128, -169, 60, 18, -5, 0.85, 1.1, -6),
    plume(0, -90, -103, -161, 54, 17, -5, 0.85, 2.0, 10),
    plume(15, -86, -80, -152, 38, 15, -4, 0.85, 2.9, 24),
  ],
  belly: { x: 6, y: 74, rx: 70, ry: 46 },
  gloss: { x: -52, y: -52, size: 14 },
  near: { x: 12, y: -18, rx: 23, ry: 25, pupil: 10.5 },
  far: { x: 56, y: -16, rx: 18, ry: 22, pupil: 9 },
  nearBrow: { outerX: -14, outerY: -47, outerW: 3.5, innerX: 34, innerY: -37, innerW: 5 },
  farBrow: { outerX: 82, outerY: -43, outerW: 3.5, innerX: 42, innerY: -36, innerW: 5 },
  beak: { x: 40, y: 22, length: 104, upper: 15, lower: 11, jaw: 92, hook: 1, gape: 0.42 },
  lidBias: -0.02,
  angerBias: -0.1,
  under(ctx) {
    // White throat and a pale spot behind the bill, as on a real kingfisher.
    ellipse(ctx, 40, 38, 34, 20, -0.1, '#f7fcff');
    ellipse(ctx, -44, -4, 15, 10, 0.5, '#f7fcff');
    dots(ctx, [[-30, -56, 4], [-46, -40, 3.5], [-12, -66, 3.5], [-60, -22, 3], [-70, 6, 3.5]], '#7fe8ee');
  },
};

// ---------------------------------------------------------------- Zip, the swift (Dasher)

const ZIP_TONES: BirdTones = {
  ...FACE_TONES,
  ...BEAK_SLATE,
  hi: '#f587cb',
  body: BIRD_COLORS.zip.body,
  lo: '#9c2378',
  shade: '#74165a99',
  rim: '#ffc8ea85',
  belly: '#ffe6f3',
  lid: '#b8308a',
  brow: '#5c1147',
  crest: '#a82a82',
  tail: '#7a1a60',
};

const ZIP: BirdDesign = {
  // A teardrop: blunt at the nose, drawn out to a point at the back.
  body: outline([
    [-90, 80],
    [-60, 84],
    [-30, 93],
    [0, 100],
    [30, 95],
    [60, 85],
    [90, 79],
    [120, 83],
    [150, 96],
    [180, 109],
    [210, 96],
    [240, 84],
  ]),
  // Long forked tail streamers.
  tail: [plume(-98, -6, 197, 188, 80, 15, -6, 0.95, 0.3, 16), plume(-98, 10, 163, 172, 80, 15, 6, 0.95, 1.6, -16)],
  crest: [plume(-12, -77, -166, -181, 44, 16, -3, 0.9, 0.5, -14), plume(-2, -79, -150, -176, 32, 14, -3, 0.9, 1.6, 10)],
  belly: { x: 44, y: 54, rx: 46, ry: 26 },
  gloss: { x: -40, y: -44, size: 12 },
  near: { x: 22, y: -14, rx: 21, ry: 20, pupil: 9 },
  far: { x: 62, y: -12, rx: 16, ry: 18, pupil: 8 },
  nearBrow: { outerX: -6, outerY: -38, outerW: 3.5, innerX: 42, innerY: -30, innerW: 5 },
  farBrow: { outerX: 84, outerY: -36, outerW: 3.5, innerX: 50, innerY: -29, innerW: 5 },
  beak: { x: 56, y: 22, length: 42, upper: 12, lower: 8, jaw: 33, hook: 3, gape: 0.6 },
  lidBias: 0.2,
  angerBias: -0.05,
  under(ctx, _pose, t) {
    // Racing mask through the eyes and a sickle wing along the flank.
    ctx.fillStyle = t.tail;
    ctx.beginPath();
    ctx.moveTo(96, -22);
    ctx.quadraticCurveTo(40, -44, -30, -24);
    ctx.quadraticCurveTo(20, -8, 96, -2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 8);
    ctx.quadraticCurveTo(-50, 4, -112, 30);
    ctx.quadraticCurveTo(-56, 50, 2, 40);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffc8ea';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-4, 22);
    ctx.quadraticCurveTo(-50, 22, -92, 32);
    ctx.stroke();
  },
};

// ---------------------------------------------------------------- Ember, the firefinch (Bomber)

interface EmberTones extends BirdTones {
  glowCore: string;
  glowMid: string;
  glowEdge: string;
  fleck: string;
}

const EMBER_TONES: EmberTones = {
  ...FACE_TONES,
  ...BEAK_HORN,
  hi: '#ff9c4c',
  body: BIRD_COLORS.ember.body,
  lo: '#c2361b',
  shade: '#8f1f1299',
  rim: '#ffd9a085',
  belly: '#ffd45e',
  lid: '#d9501f',
  brow: '#a3300f',
  crest: '#ffb42e',
  tail: '#b32f17',
  glowCore: '#fff0a8',
  glowMid: '#ff8a1f',
  glowEdge: '#c21a12',
  fleck: '#fff3d0',
};

/** Number of heat pulses over a whole fuse; they are spaced quadratically, so the rhythm accelerates. */
const HEAT_PULSES = 9;
/** Slow pulse that keeps a held fuse value alive, in Hz. */
const HEAT_IDLE_HZ = 1.3;

const EMBER: BirdDesign = {
  body: blobPolar([94, 94, 95, 94, 95, 96, 95, 96, 95, 94, 94, 94]),
  tail: [plume(-86, 14, 200, 188, 38, 22, -3, 0.5, 0.4, 12), plume(-88, 33, 168, 178, 36, 21, 3, 0.5, 1.6, -12)],
  // Flame-shaped crest.
  crest: [
    plume(-38, -72, -140, -168, 44, 24, -8, 0.8, 0.3, -18),
    plume(-22, -82, -118, -160, 62, 27, -10, 0.8, 0.9, -8),
    plume(-4, -88, -96, -150, 84, 30, -13, 0.8, 1.5, 0),
    plume(14, -84, -74, -140, 56, 24, -9, 0.8, 2.3, 16),
  ],
  belly: { x: 12, y: 74, rx: 58, ry: 40 },
  gloss: { x: -50, y: -52, size: 15 },
  near: { x: 12, y: -12, rx: 24, ry: 25, pupil: 9.5 },
  far: { x: 57, y: -10, rx: 19, ry: 23, pupil: 8.5 },
  nearBrow: { outerX: -16, outerY: -44, outerW: 4, innerX: 36, innerY: -34, innerW: 6.5 },
  farBrow: { outerX: 84, outerY: -41, outerW: 4, innerX: 40, innerY: -33, innerW: 6.5 },
  beak: { x: 38, y: 25, length: 58, upper: 23, lower: 16, jaw: 44, hook: 4, gape: 0.6 },
  lidBias: 0.1,
  angerBias: 0.05,
  under(ctx, pose, tones) {
    const t = tones as EmberTones;
    // Golden face mask fading into the crown, like banked coals.
    ellipse(ctx, 40, -18, 62, 40, -0.15, '#ffc247');
    // The white flecks of a firefinch along the flank.
    dots(ctx, [[-52, 20, 4.5], [-66, 40, 4], [-38, 44, 4], [-56, 60, 3.5], [-28, 64, 3.5], [-74, 14, 3]], t.fleck);
    // The body heats up with the fuse: a glow from the core that pulses faster and faster.
    const fuse = clamp01(pose.fuse ?? 0);
    if (fuse <= 0) return;
    const beat = 0.5 + 0.5 * Math.sin(TAU * (HEAT_PULSES * fuse * fuse + pose.time * HEAT_IDLE_HZ));
    const glow = ctx.createRadialGradient(6, 24, 4, 0, 6, 110);
    glow.addColorStop(0, t.glowCore);
    glow.addColorStop(0.42, t.glowMid);
    glow.addColorStop(1, t.glowEdge);
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * (0.25 + 0.55 * fuse) * (0.58 + 0.42 * beat);
    ctx.fillStyle = glow;
    ctx.fillRect(-120, -120, 240, 240);
    ctx.globalAlpha = alpha;
  },
};

// ---------------------------------------------------------------- The Sprigs, three wrens (Splitter)

const SPRIG_TONES: BirdTones = {
  ...FACE_TONES,
  beak: '#c79552',
  beakDark: '#96692f',
  beakLight: '#ecc98f',
  hi: '#cdee80',
  body: BIRD_COLORS.sprig.body,
  lo: '#5f9a22',
  shade: '#3f7a1a80',
  rim: '#eeffc492',
  belly: '#fff4d2',
  lid: '#7ab52f',
  brow: '#3b6a16',
  crest: '#6fae28',
  tail: '#4f8a1e',
};

const SPRIG: BirdDesign = {
  body: blobPolar([94, 95, 94, 94, 95, 95, 94, 95, 95, 94, 94, 94]),
  // The cocked-up tail of a wren.
  tail: [plume(-66, -44, -126, -150, 54, 19, -3, 0.5, 0.4, -10), plume(-76, -26, -146, -162, 48, 18, 2, 0.5, 1.5, 10)],
  crest: [plume(-2, -88, -96, -150, 22, 12, -2, 0.6, 1, 10)],
  belly: { x: 16, y: 70, rx: 64, ry: 44 },
  gloss: { x: -50, y: -52, size: 15 },
  near: { x: 10, y: -8, rx: 28, ry: 30, pupil: 14 },
  far: { x: 60, y: -6, rx: 22, ry: 27, pupil: 12 },
  nearBrow: { outerX: -18, outerY: -46, outerW: 3, innerX: 26, innerY: -42, innerW: 4 },
  farBrow: { outerX: 82, outerY: -41, outerW: 3, innerX: 50, innerY: -39, innerW: 4 },
  beak: { x: 50, y: 24, length: 50, upper: 10, lower: 7, jaw: 42, hook: 2, gape: 0.7 },
  lidBias: -0.08,
  angerBias: -0.15,
  under(ctx, _pose, t) {
    // Pale eyebrow stripe and barred wing.
    ctx.strokeStyle = '#fff4d2';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-50, -34);
    ctx.quadraticCurveTo(10, -62, 86, -40);
    ctx.stroke();
    ctx.strokeStyle = t.tail;
    ctx.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-84 + i * 12, 14 + i * 4);
      ctx.lineTo(-62 + i * 12, 34 + i * 4);
      ctx.stroke();
    }
  },
};

// ---------------------------------------------------------------- Brawn, the owl (Crusher)

interface BrawnTones extends BirdTones {
  disc: string;
  discRim: string;
  chevron: string;
}

const BRAWN_TONES: BrawnTones = {
  ...FACE_TONES,
  beak: '#e2a23a',
  beakDark: '#b0721c',
  beakLight: '#f6cf7c',
  hi: '#b98f66',
  body: BIRD_COLORS.brawn.body,
  lo: '#5c432c',
  shade: '#3a281899',
  rim: '#ecd0aa80',
  belly: '#ead5b0',
  lid: '#7a5c40',
  brow: '#39281a',
  crest: '#6e5238',
  tail: '#4e3a28',
  disc: '#f1dfc0',
  discRim: '#a8825a',
  chevron: '#8a6a4a',
};

const BRAWN: BirdDesign = {
  // Squat and broad-shouldered.
  body: outline([
    [-90, 92],
    [-60, 98],
    [-30, 104],
    [0, 105],
    [30, 103],
    [60, 98],
    [90, 94],
    [120, 98],
    [150, 103],
    [180, 105],
    [210, 104],
    [240, 98],
  ]),
  tail: [plume(-96, 34, 182, 180, 30, 30, 0, 0.3, 0.6, 8)],
  // Ear tufts on both corners of the head.
  crest: [plume(-50, -76, -124, -152, 52, 25, -4, 0.72, 0.3, -14), plume(46, -78, -58, -84, 50, 24, 4, 0.72, 1.4, 14)],
  belly: { x: 4, y: 78, rx: 66, ry: 44 },
  gloss: { x: -58, y: -50, size: 14 },
  near: { x: -4, y: -14, rx: 26, ry: 27, pupil: 11 },
  far: { x: 54, y: -12, rx: 22, ry: 25, pupil: 10 },
  nearBrow: { outerX: -40, outerY: -44, outerW: 9, innerX: 22, innerY: -30, innerW: 13 },
  farBrow: { outerX: 88, outerY: -40, outerW: 9, innerX: 30, innerY: -29, innerW: 13 },
  beak: { x: 28, y: 22, length: 42, upper: 20, lower: 12, jaw: 27, hook: 17, gape: 0.5 },
  lidBias: 0.3,
  angerBias: 0.2,
  under(ctx, _pose, tones) {
    const t = tones as BrawnTones;
    // Facial discs around the eyes.
    ctx.lineWidth = 4;
    ctx.strokeStyle = t.discRim;
    for (const [x, y, r] of [[-4, -12, 41], [56, -10, 35]] as const) {
      ellipse(ctx, x, y, r, r * 1.02, 0, t.disc);
      ctx.stroke();
    }
    // Chest chevrons.
    ctx.strokeStyle = t.chevron;
    ctx.lineWidth = 5;
    for (const [x, y] of [[-28, 54], [4, 60], [36, 54], [-12, 78], [20, 78]] as const) {
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 5);
      ctx.lineTo(x, y + 4);
      ctx.lineTo(x + 9, y - 5);
      ctx.stroke();
    }
  },
};

// ---------------------------------------------------------------- Rime, the snow petrel (Frostwing)

const RIME_TONES: BirdTones = {
  ...FACE_TONES,
  ...BEAK_SLATE,
  pupil: '#12324a',
  hi: '#ffffff',
  body: BIRD_COLORS.rime.body,
  lo: '#a6d6f1',
  shade: '#78b4da80',
  rim: '#ffffffc8',
  belly: '#ffffff',
  lid: '#b6e0f7',
  brow: '#5b9cc4',
  crest: '#a5e0fa',
  tail: '#7cc4ea',
};

const RIME: BirdDesign = {
  body: blobPolar([95, 94, 94, 95, 95, 94, 93, 94, 95, 95, 94, 94]),
  tail: [plume(-88, 10, 196, 186, 46, 18, -3, 0.8, 0.5, 12), plume(-88, 28, 166, 176, 42, 17, 3, 0.8, 1.8, -12)],
  // Icicle crest.
  crest: [
    plume(-22, -80, -128, -165, 40, 14, -2, 1, 0.2, -16),
    plume(-6, -88, -104, -158, 58, 15, -3, 1, 1.2, 0),
    plume(10, -86, -82, -150, 42, 14, -2, 1, 2.2, 16),
  ],
  belly: null,
  gloss: { x: -50, y: -52, size: 15 },
  near: { x: 12, y: -12, rx: 24, ry: 26, pupil: 11 },
  far: { x: 58, y: -10, rx: 19, ry: 23, pupil: 9.5 },
  nearBrow: { outerX: -14, outerY: -46, outerW: 3, innerX: 34, innerY: -40, innerW: 4 },
  farBrow: { outerX: 82, outerY: -42, outerW: 3, innerX: 44, innerY: -38, innerW: 4 },
  beak: { x: 44, y: 24, length: 52, upper: 14, lower: 9, jaw: 40, hook: 6, gape: 0.55 },
  lidBias: 0,
  angerBias: -0.12,
  under(ctx, pose) {
    // Pale blue wing and a dusting of frost that glitters.
    ellipse(ctx, -46, 30, 44, 26, 0.35, '#c4e8fb');
    ellipse(ctx, 34, 40, 13, 8, 0, '#bfe4f8');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const spots = [[-60, 18, 0], [-38, 40, 1.3], [-70, 46, 2.1], [-22, 22, 3.4], [-50, 60, 4.2]] as const;
    for (const [x, y, phase] of spots) sparkle(ctx, x, y, 5 + 2.5 * Math.sin(pose.time * 3 + phase));
    ctx.fill();
  },
};

// ---------------------------------------------------------------- Jolt, the storm swallow (Voltwing)

const JOLT_TONES: BirdTones = {
  ...FACE_TONES,
  ...BEAK_YELLOW,
  hi: '#9498ff',
  body: BIRD_COLORS.jolt.body,
  lo: '#3838a6',
  shade: '#24247899',
  rim: '#ccceff85',
  belly: '#ffe24d',
  lid: '#4a4ec8',
  brow: '#2e2e9a',
  crest: '#ffd21f',
  tail: '#2e2e8c',
};

/** Lightning-bolt crest, as [x, y] corners. */
const JOLT_BOLT: readonly (readonly [number, number])[] = [
  [-6, -84],
  [-34, -128],
  [-12, -124],
  [-30, -164],
  [18, -112],
  [-2, -116],
  [20, -84],
];

const JOLT: BirdDesign = {
  body: blobPolar([95, 94, 95, 95, 95, 94, 93, 94, 95, 95, 95, 94]),
  tail: [plume(-94, 0, 198, 188, 66, 13, -5, 1, 0.3, 16), plume(-94, 18, 162, 172, 66, 13, 5, 1, 1.6, -16)],
  crest: [],
  belly: null,
  gloss: { x: -50, y: -52, size: 14 },
  near: { x: 14, y: -14, rx: 23, ry: 24, pupil: 10 },
  far: { x: 58, y: -12, rx: 18, ry: 22, pupil: 9 },
  nearBrow: { outerX: -14, outerY: -44, outerW: 4, innerX: 36, innerY: -32, innerW: 6 },
  farBrow: { outerX: 84, outerY: -40, outerW: 4, innerX: 42, innerY: -31, innerW: 6 },
  beak: { x: 46, y: 22, length: 60, upper: 14, lower: 9, jaw: 48, hook: 2, gape: 0.6 },
  lidBias: 0.05,
  angerBias: 0.05,
  behind(ctx, pose, t) {
    // The crest is a bolt of lightning; it leans back in flight and flickers when the charge is spent.
    const lean = pose.state === 'flying' || pose.state === 'ability' ? -0.32 : 0;
    const flicker = pose.state === 'ability' ? 0.75 + 0.25 * Math.sin(pose.time * 60) : 1;
    ctx.save();
    ctx.translate(4, -84);
    ctx.rotate(lean + 0.04 * Math.sin(pose.time * 5));
    ctx.translate(-4, 84);
    ctx.beginPath();
    JOLT_BOLT.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.lineWidth = FEATURE_LINE;
    ctx.strokeStyle = t.ink;
    ctx.globalAlpha *= flicker;
    ctx.fillStyle = pose.abilityUsed ? '#fff3b0' : t.crest;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },
  under(ctx, _pose, t) {
    // A jagged yellow flash across the chest.
    ctx.fillStyle = t.belly;
    ctx.beginPath();
    ctx.moveTo(-70, 40);
    ctx.lineTo(-30, 28);
    ctx.lineTo(-40, 50);
    ctx.lineTo(8, 36);
    ctx.lineTo(-2, 58);
    ctx.lineTo(60, 40);
    ctx.lineTo(80, 100);
    ctx.lineTo(-90, 100);
    ctx.closePath();
    ctx.fill();
  },
};

// ---------------------------------------------------------------- Nova, the nightjar (Gravity bird)

interface NovaTones extends BirdTones {
  star: string;
  halo: string;
}

const NOVA_TONES: NovaTones = {
  ...FACE_TONES,
  beak: '#3a2a5c',
  beakDark: '#22163c',
  beakLight: '#6a56a0',
  eyeWhite: '#fff4c2',
  hi: '#ab80f2',
  body: BIRD_COLORS.nova.body,
  lo: '#472890',
  shade: '#2a156299',
  rim: '#e0ccff85',
  belly: '#b79af0',
  lid: '#6a3cc0',
  brow: '#27135a',
  crest: '#5a34ac',
  tail: '#3d2180',
  star: '#ffe9a3',
  halo: '#c9a8ff',
};

const NOVA_STARS: readonly (readonly [number, number, number, number])[] = [
  [-58, -34, 7, 0],
  [-70, 8, 5, 1.7],
  [-40, 38, 8, 3.1],
  [-14, 62, 5, 4.4],
  [-76, 44, 4, 2.4],
  [-26, -62, 5, 5.2],
  [40, 66, 4, 0.9],
];

const NOVA: BirdDesign = {
  // Wide, flat-crowned head: all eyes.
  body: outline([
    [-90, 86],
    [-60, 92],
    [-30, 100],
    [0, 104],
    [30, 100],
    [60, 94],
    [90, 90],
    [120, 94],
    [150, 100],
    [180, 104],
    [210, 100],
    [240, 92],
  ]),
  tail: [plume(-92, 6, 200, 190, 44, 22, -3, 0.35, 0.3, 14), plume(-94, 24, 180, 180, 46, 22, 0, 0.35, 1.2, 0), plume(-90, 42, 160, 172, 40, 20, 3, 0.35, 2.1, -14)],
  crest: [plume(-30, -74, -160, -178, 40, 20, -3, 0.4, 0.4, -12), plume(-14, -80, -140, -170, 34, 18, -3, 0.4, 1.5, 10)],
  belly: { x: 10, y: 80, rx: 56, ry: 34 },
  gloss: { x: -52, y: -46, size: 13 },
  near: { x: 4, y: -10, rx: 30, ry: 32, pupil: 15 },
  far: { x: 60, y: -8, rx: 24, ry: 28, pupil: 13 },
  nearBrow: { outerX: -30, outerY: -48, outerW: 3, innerX: 22, innerY: -46, innerW: 4 },
  farBrow: { outerX: 86, outerY: -42, outerW: 3, innerX: 50, innerY: -42, innerW: 4 },
  beak: { x: 54, y: 30, length: 32, upper: 10, lower: 7, jaw: 25, hook: 5, gape: 0.9 },
  lidBias: 0.12,
  angerBias: -0.2,
  behind(ctx, pose, tones) {
    // While the well is open a ring of light turns behind the bird.
    if (pose.state !== 'ability') return;
    const t = tones as NovaTones;
    ctx.save();
    ctx.rotate(pose.time * 4);
    ctx.strokeStyle = t.halo;
    ctx.lineWidth = 7;
    ctx.setLineDash([26, 18]);
    ctx.beginPath();
    ctx.arc(0, 0, 132, 0, TAU);
    ctx.stroke();
    ctx.restore();
  },
  under(ctx, pose, tones) {
    const t = tones as NovaTones;
    // A sky full of stars across the back.
    ctx.fillStyle = t.star;
    ctx.beginPath();
    for (const [x, y, size, phase] of NOVA_STARS) sparkle(ctx, x, y, size * (0.75 + 0.25 * Math.sin(pose.time * 2.4 + phase)));
    ctx.fill();
    // Crescent on the chest.
    ctx.strokeStyle = '#e9dcff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(14, 56, 26, 0.25, Math.PI - 0.25);
    ctx.stroke();
  },
  over(ctx, _pose, t) {
    // Bristles at the corner of the mouth.
    ctx.strokeStyle = t.ink;
    ctx.lineWidth = 3;
    for (const dy of [-6, 2, 10]) {
      ctx.beginPath();
      ctx.moveTo(48, 32 + dy * 0.4);
      ctx.lineTo(26, 36 + dy);
      ctx.stroke();
    }
  },
};

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

/** What "special ability active" looks like for each bird; Pip keeps the generic battle cry. */
function abilityRig(type: BirdType, rig: Rig): Rig {
  switch (type) {
    case 'zip':
      return { ...rig, top: 0.5, bottom: 0.32, eye: 1, pupil: 0.9, open: 0, clench: 0.4, sweep: 1.12, flutter: 0.05, speed: 44, lookX: 0.6 };
    case 'ember':
      return { ...rig, anger: 0, lift: 1, top: 0, eye: 1.28, pupil: 0.55, open: 0, clench: 1, sweep: 0.2, flutter: 0.09, speed: 34, lookX: 0.1 };
    case 'sprig':
      return { ...rig, anger: 0, lift: 0.8, top: 0, eye: 1.1, pupil: 1.1, open: 0.85, sweep: 0.7, flutter: 0.14, speed: 24 };
    case 'brawn':
      return { ...rig, anger: 1, top: 0.4, bottom: 0.36, eye: 1, pupil: 1, open: 0, clench: 1, sweep: -0.6, flutter: 0.03, speed: 40, lookX: 0.1, lookY: 0.6 };
    case 'rime':
      return { ...rig, anger: 0.2, lift: 0.5, top: 0, eye: 1.12, pupil: 0.8, open: 1.1, sweep: 0.5, ruffle: 0.6, flutter: 0.1, speed: 30 };
    case 'jolt':
      return { ...rig, anger: 0.6, lift: 0.4, top: 0, eye: 1.2, pupil: 0.5, open: 1.2, sweep: 0.6, ruffle: 1, flutter: 0.3, speed: 70 };
    case 'nova':
      return { ...rig, anger: 0, lift: 0.9, top: 0, bottom: 0, eye: 1.18, pupil: 1.25, open: 0.2, sweep: 0, ruffle: 0.3, flutter: 0.12, speed: 9, lookX: 0, lookY: 0 };
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
  if (type === 'ember') {
    const fuse = clamp01(pose.fuse ?? 0);
    rig.eye *= 1 + 0.2 * fuse;
    rig.pupil *= 1 - 0.35 * fuse;
    rig.top *= 1 - fuse;
    rig.anger *= 1 - fuse;
    rig.lift = Math.max(rig.lift, fuse * 0.9);
    // The flame crest flares as the heat builds.
    rig.flutter += 0.2 * fuse;
    rig.speed += 30 * fuse;
  }
  if (pose.abilityUsed && type === 'zip') {
    rig.sweep = Math.max(rig.sweep, 0.85);
    rig.ruffle = Math.max(rig.ruffle, 0.35);
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

const DESIGNS: Record<BirdType, BirdDesign> = { pip: PIP, zip: ZIP, ember: EMBER, sprig: SPRIG, brawn: BRAWN, rime: RIME, jolt: JOLT, nova: NOVA };
const TONES: Record<BirdType, BirdTones> = {
  pip: PIP_TONES,
  zip: ZIP_TONES,
  ember: EMBER_TONES,
  sprig: SPRIG_TONES,
  brawn: BRAWN_TONES,
  rime: RIME_TONES,
  jolt: JOLT_TONES,
  nova: NOVA_TONES,
};

export function paintBird(ctx: CanvasRenderingContext2D, type: BirdType, pose: BirdPose): void {
  const design = DESIGNS[type];
  const flash = pose.flash ?? 0;
  const tones = flashTones(TONES[type], flash);
  const rig = buildRig(type, design, pose);
  const plumes: PlumePose = { sweep: rig.sweep, ruffle: rig.ruffle, flutter: rig.flutter, speed: rig.speed, time: pose.time };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paintPlumes(ctx, design.tail, plumes, tones.tail, tones.ink);
  paintPlumes(ctx, design.crest, plumes, tones.crest, tones.ink);
  design.behind?.(ctx, pose, tones);

  beginBody(ctx, design.body, tones);
  if (design.belly) {
    ctx.beginPath();
    ctx.ellipse(design.belly.x, design.belly.y, design.belly.rx, design.belly.ry, 0, 0, TAU);
    ctx.fillStyle = tones.belly;
    ctx.fill();
  }
  design.under?.(ctx, pose, tones);
  shadeBody(ctx, design.body, tones);
  paintGloss(ctx, design.gloss.x, design.gloss.y, design.gloss.size, tones.gloss);
  endBody(ctx);

  paintFace(ctx, design, rig, pose, tones);
  design.over?.(ctx, pose, tones);
  ctx.restore();
}

/** Outline of a bird's body for tools that need the silhouette (collision-fit overlays, tests). */
export function traceBirdBody(ctx: CanvasRenderingContext2D, type: BirdType): void {
  traceBlob(ctx, DESIGNS[type].body);
}
