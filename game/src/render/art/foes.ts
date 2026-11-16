/**
 * Foe artwork: six enemy characters built around the collision circle of radius CHARACTER_RADIUS
 * (helmets, crowns and plumes reach out to CHARACTER_EXTENT).
 *
 *   small    Pup   - round squeaky youngster: huge eyes, button snout, floppy ears, a hair curl.
 *   medium   Grunt    - the classic smug foe: wide head, pointed ears, half-lidded eyes, smirk.
 *   large    Brute    - heavy jowly bruiser: low unibrow, small mean eyes, big snout, tusks, scar.
 *   helmet   Corporal - square-jawed foot soldier in a riveted iron kettle helmet with chin strap.
 *   armored  Knight   - helm with a raised visor and plume over a riveted breastplate.
 *   king     King     - pear-shaped monarch: crown, handlebar moustache, cape and ermine trim.
 *
 * Like the birds, each foe is a static design posed every frame by a small rig derived from the
 * FoePose. Foes are painted live, so gradients are cached (see foeKit) and no shadows are used.
 */
import { DEG, TAU, clamp01, lerp } from '../../core/math';
import type { FoeVariant } from '../../core/types';
import {
  DETAIL_LINE,
  FEATURE_LINE,
  OUTLINE,
  blobThrough,
  endBody,
  flashTones,
  paintBrow,
  paintEye,
  paintGloss,
  paintSqueezedEye,
  shadeBody,
  traceFeather,
} from './charParts';
import type { Blob, EyeLook, EyeShape } from './charParts';
import { blitLayer, deviceScale, foeLayer, type LayerBounds } from './foeCache';
import {
  crownTransform,
  paintBreastplate,
  paintCape,
  paintChinStrap,
  paintCrownShape,
  paintErmine,
  paintKnightHelm,
  paintMoustache,
  paintPlume,
  paintSoldierHelmet,
} from './foeGear';
import { IRON, FOE_TONES, ROYAL, STEEL, beginFoeBody, traceStar, type MetalTones, type FoeTones, type RoyalTones } from './foeKit';
import type { FoeAccessory, FoeExpression, FoePose } from './types';

// ---------------------------------------------------------------- design data

interface Ear {
  /** Root of the left ear (the right one is mirrored). */
  x: number;
  y: number;
  /** Direction of the left ear at rest, degrees. */
  angle: number;
  length: number;
  width: number;
  /** Sideways curl of the tip (negative flops a left ear outwards / down). */
  bend: number;
  point: number;
  notch?: boolean;
}

interface Brow {
  outerX: number;
  outerY: number;
  outerW: number;
  innerX: number;
  innerY: number;
  innerW: number;
}

interface Oval {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

interface FoeDesign {
  body: Blob;
  gloss: { x: number; y: number; size: number };
  /** Viewer-left eye and brow; the right ones are mirrored. */
  eye: EyeShape;
  brow: Brow;
  browThick: number;
  ear: Ear;
  snout: Oval;
  mouth: { x: number; y: number; w: number; maxOpen: number };
  /** Resting heaviness of the lids (smugness) and frown. */
  lidBias: number;
  angerBias: number;
}

interface BodyShape {
  /** Half width, height above and below the centre. */
  rx: number;
  top: number;
  bottom: number;
  /** Superellipse exponent: 2 = ellipse, higher = boxier. */
  n: number;
  /** Extra width low on the body (jowls / belly), as a fraction of rx. */
  cheek: number;
  /** Narrower crown: width removed at the very top, as a fraction of rx. */
  taper: number;
}

/** Symmetric organic head-body outline through 24 points of a tuned superellipse. */
function bodyBlob(s: BodyShape): Blob {
  const points: [number, number][] = [];
  const e = 2 / s.n;
  for (let i = 0; i < 24; i++) {
    const a = -Math.PI / 2 + (i / 24) * TAU;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    let x = s.rx * Math.sign(c) * Math.abs(c) ** e;
    const y = (sn < 0 ? s.top : s.bottom) * Math.sign(sn) * Math.abs(sn) ** e;
    // Jowls peak 30 degrees below the equator; the crown narrows towards the top.
    const low = Math.max(0, sn);
    x *= 1 + s.cheek * 4 * low * (1 - low) - s.taper * Math.max(0, -sn) ** 2;
    points.push([x, y]);
  }
  return blobThrough(points);
}

const PUP: FoeDesign = {
  body: bodyBlob({ rx: 96, top: 94, bottom: 101, n: 2.15, cheek: 0.03, taper: 0.04 }),
  gloss: { x: -50, y: -56, size: 14 },
  eye: { x: -35, y: -14, rx: 27, ry: 31, pupil: 13 },
  brow: { outerX: -60, outerY: -56, outerW: 7, innerX: -20, innerY: -55, innerW: 9 },
  browThick: 0.9,
  ear: { x: -50, y: -72, angle: -138, length: 30, width: 40, bend: 0, point: 0.02 },
  snout: { x: 0, y: 30, rx: 26, ry: 19 },
  mouth: { x: 2, y: 64, w: 18, maxOpen: 0.8 },
  lidBias: 0,
  angerBias: 0,
};

const GRUNT: FoeDesign = {
  body: bodyBlob({ rx: 102, top: 90, bottom: 97, n: 2.35, cheek: 0.04, taper: 0.08 }),
  gloss: { x: -56, y: -54, size: 15 },
  eye: { x: -38, y: -28, rx: 21, ry: 24, pupil: 10 },
  brow: { outerX: -66, outerY: -60, outerW: 9, innerX: -22, innerY: -58, innerW: 14 },
  browThick: 1,
  ear: { x: -54, y: -72, angle: -122, length: 30, width: 40, bend: 0, point: 0.02 },
  snout: { x: 0, y: 14, rx: 39, ry: 28 },
  mouth: { x: 0, y: 62, w: 32, maxOpen: 1 },
  lidBias: 0.22,
  angerBias: 0.05,
};

const BRUTE: FoeDesign = {
  body: bodyBlob({ rx: 100, top: 86, bottom: 102, n: 2.9, cheek: 0.09, taper: 0.1 }),
  gloss: { x: -58, y: -56, size: 14 },
  eye: { x: -33, y: -30, rx: 16, ry: 17, pupil: 8.5 },
  brow: { outerX: -62, outerY: -56, outerW: 15, innerX: -4, innerY: -48, innerW: 21 },
  browThick: 1.15,
  ear: { x: -60, y: -66, angle: -140, length: 30, width: 40, bend: 0, point: 0.02, notch: true },
  snout: { x: 0, y: 14, rx: 47, ry: 32 },
  mouth: { x: 0, y: 68, w: 42, maxOpen: 1 },
  lidBias: 0.3,
  angerBias: 0.45,
};

const CORPORAL: FoeDesign = {
  body: bodyBlob({ rx: 100, top: 92, bottom: 99, n: 2.6, cheek: 0.02, taper: 0.06 }),
  gloss: { x: -56, y: -50, size: 14 },
  eye: { x: -37, y: -10, rx: 20, ry: 21, pupil: 9.5 },
  brow: { outerX: -60, outerY: -36, outerW: 9, innerX: -20, innerY: -33, innerW: 13 },
  browThick: 1,
  ear: { x: -86, y: -30, angle: 192, length: 30, width: 40, bend: 0, point: 0.02 },
  snout: { x: 0, y: 26, rx: 36, ry: 26 },
  mouth: { x: 0, y: 70, w: 30, maxOpen: 0.9 },
  lidBias: 0.12,
  angerBias: 0.35,
};

const KNIGHT: FoeDesign = {
  body: bodyBlob({ rx: 96, top: 98, bottom: 100, n: 2.2, cheek: 0.02, taper: 0.06 }),
  gloss: { x: -52, y: -58, size: 14 },
  eye: { x: -35, y: -18, rx: 20, ry: 23, pupil: 9.5 },
  brow: { outerX: -52, outerY: -48, outerW: 8, innerX: -18, innerY: -46, innerW: 12 },
  browThick: 1,
  ear: { x: -50, y: -78, angle: -118, length: 30, width: 40, bend: 0, point: 0.02 },
  snout: { x: 0, y: 15, rx: 34, ry: 25 },
  mouth: { x: 0, y: 47, w: 25, maxOpen: 0.65 },
  lidBias: 0.08,
  angerBias: 0.25,
};

const KING: FoeDesign = {
  body: bodyBlob({ rx: 96, top: 88, bottom: 102, n: 2.4, cheek: 0.13, taper: 0.2 }),
  gloss: { x: -52, y: -52, size: 14 },
  eye: { x: -33, y: -36, rx: 19, ry: 21, pupil: 9 },
  brow: { outerX: -58, outerY: -66, outerW: 11, innerX: -18, innerY: -64, innerW: 15 },
  browThick: 1.2,
  ear: { x: -54, y: -66, angle: -136, length: 30, width: 40, bend: 0, point: 0.02 },
  snout: { x: 0, y: 2, rx: 36, ry: 26 },
  mouth: { x: 0, y: 60, w: 28, maxOpen: 0.9 },
  lidBias: 0.36,
  angerBias: 0,
};

/** Shieldbearer: a stocky guard peering over its shield. */
const GUARD: FoeDesign = { ...CORPORAL, ear: { x: -58, y: -70, angle: -128, length: 30, width: 40, bend: 0, point: 0.02 }, eye: { x: -37, y: -24, rx: 20, ry: 22, pupil: 9.5 }, brow: { outerX: -62, outerY: -52, outerW: 10, innerX: -20, innerY: -47, innerW: 15 }, angerBias: 0.4 };
/** Sapper: wide-eyed and a little too keen. */
const SAPPER: FoeDesign = { ...GRUNT, eye: { x: -38, y: -26, rx: 24, ry: 27, pupil: 9 }, lidBias: -0.05, angerBias: 0.15 };
/** Balloonist: a pup with its head in the clouds. */
const AERONAUT: FoeDesign = { ...PUP, eye: { x: -35, y: -6, rx: 25, ry: 28, pupil: 12 }, brow: { outerX: -60, outerY: -40, outerW: 7, innerX: -20, innerY: -39, innerW: 9 }, lidBias: 0.05 };

const DESIGNS: Record<FoeVariant, FoeDesign> = {
  small: PUP,
  medium: GRUNT,
  large: BRUTE,
  helmet: CORPORAL,
  armored: KNIGHT,
  king: KING,
  shield: GUARD,
  sapper: SAPPER,
  floater: AERONAUT,
};

// ---------------------------------------------------------------- rig

type EyeMode = 'open' | 'squeeze' | 'happy' | 'spiral' | 'cross';
type MouthMode = 'smirk' | 'wobble' | 'o' | 'grit' | 'laugh' | 'slack';

interface Rig {
  top: number;
  bottom: number;
  anger: number;
  worry: number;
  lift: number;
  /** Extra lift of the right brow (the smug quirk). */
  quirk: number;
  eye: number;
  pupil: number;
  eyes: EyeMode;
  mouth: MouthMode;
  open: number;
  /** Ears: 1 = drooping, -1 = pricked up. */
  droop: number;
  snoutW: number;
  snoutH: number;
  snoutY: number;
  flare: number;
  sweat: boolean;
  stars: boolean;
  tears: boolean;
}

const IDLE: Rig = {
  top: 0.18,
  bottom: 0.06,
  anger: 0.1,
  worry: 0,
  lift: 0,
  quirk: 1,
  eye: 1,
  pupil: 1,
  eyes: 'open',
  mouth: 'smirk',
  open: 0,
  droop: 0,
  snoutW: 1,
  snoutH: 1,
  snoutY: 0,
  flare: 1,
  sweat: false,
  stars: false,
  tears: false,
};

function expressionRig(expression: FoeExpression, time: number): Rig {
  switch (expression) {
    case 'idle':
      return { ...IDLE };
    case 'worried':
      return { ...IDLE, top: 0.08, bottom: 0.02, anger: 0, worry: 1, quirk: 0, eye: 1.1, pupil: 0.74, mouth: 'wobble', droop: 0.45, flare: 1.15, sweat: true };
    case 'surprised':
      return { ...IDLE, top: 0, bottom: 0, anger: 0, lift: 1, quirk: 0, eye: 1.24, pupil: 0.56, mouth: 'o', open: 1, droop: -0.6, flare: 1.35, snoutY: -3 };
    case 'hurt':
      return { ...IDLE, anger: 0.7, quirk: 0, eyes: 'squeeze', mouth: 'grit', droop: 0.55, snoutW: 1.06, snoutH: 0.9, snoutY: -2, flare: 1.2 };
    case 'stunned':
      return { ...IDLE, anger: 0, lift: 0.4, quirk: 0, eyes: 'spiral', mouth: 'slack', open: 0.5, droop: 0.7 + 0.15 * Math.sin(time * 5), stars: true };
    case 'laugh': {
      const shake = 0.75 + 0.25 * Math.abs(Math.sin(time * 15));
      return { ...IDLE, anger: 0, lift: 0.55, quirk: 0, eyes: 'happy', mouth: 'laugh', open: shake, droop: -0.2, snoutW: 1.1, snoutH: 0.86, snoutY: -5, flare: 1.15, tears: true };
    }
    case 'defeated':
      return { ...IDLE, anger: 0, lift: 0.3, quirk: 0, eyes: 'cross', mouth: 'slack', open: 1, droop: 1, flare: 1.2 };
  }
}

function blendRig(from: Rig, to: Rig, k: number): Rig {
  const mix = (a: number, b: number): number => lerp(a, b, k);
  const discrete = k > 0.4 ? to : from;
  return {
    ...discrete,
    top: mix(from.top, to.top),
    bottom: mix(from.bottom, to.bottom),
    anger: mix(from.anger, to.anger),
    worry: mix(from.worry, to.worry),
    lift: mix(from.lift, to.lift),
    quirk: mix(from.quirk, to.quirk),
    eye: mix(from.eye, to.eye),
    pupil: mix(from.pupil, to.pupil),
    open: mix(from.open, to.open),
    droop: mix(from.droop, to.droop),
    snoutW: mix(from.snoutW, to.snoutW),
    snoutH: mix(from.snoutH, to.snoutH),
    snoutY: mix(from.snoutY, to.snoutY),
    flare: mix(from.flare, to.flare),
  };
}

function buildRig(design: FoeDesign, pose: FoePose): Rig {
  let rig = expressionRig(pose.expression, pose.time);
  const intensity = clamp01(pose.intensity ?? 1);
  if (intensity < 0.999 && (pose.expression === 'worried' || pose.expression === 'surprised')) {
    rig = blendRig(expressionRig('idle', pose.time), rig, intensity);
  }
  if (rig.eyes === 'open') {
    // Personality only colours the calmer expressions.
    const calm = pose.expression === 'idle' ? 1 : pose.expression === 'worried' ? 1 - intensity : 0;
    rig.top = clamp01(rig.top + design.lidBias * calm);
    rig.anger = clamp01(rig.anger + design.angerBias * (1 - rig.worry) * (1 - rig.lift));
  }
  return rig;
}

// ---------------------------------------------------------------- body parts

const EAR_TWITCH = 0.35;

function paintEars(ctx: CanvasRenderingContext2D, ear: Ear, rig: Rig, time: number, t: FoeTones): void {
  for (const side of [-1, 1] as const) {
    // Occasional quick twitch, each ear on its own rhythm.
    const twitch = Math.pow(Math.max(0, Math.sin(time * 1.3 + side * 1.7)), 40) * EAR_TWITCH;
    const base = side < 0 ? ear.angle : 180 - ear.angle;
    const droop = rig.droop * 26 * (side < 0 ? -1 : 1);
    const angle = (base + droop) * DEG + twitch * side;
    const ex = side < 0 ? ear.x : -ear.x;
    const bend = side < 0 ? ear.bend : -ear.bend;
    ctx.beginPath();
    traceFeather(ctx, ex, ear.y, angle, ear.length, ear.width, bend, ear.point);
    ctx.fillStyle = t.body;
    ctx.fill();
    ctx.lineWidth = FEATURE_LINE + 1;
    ctx.strokeStyle = t.ink;
    ctx.stroke();
    ctx.beginPath();
    traceFeather(ctx, ex, ear.y, angle, ear.length * 0.74, ear.width * 0.5, bend * 0.7, ear.point);
    ctx.fillStyle = t.earInner;
    ctx.fill();
    if (ear.notch) {
      // A nick bitten out of the right ear.
      if (side > 0) {
        const tipX = ex + Math.cos(angle) * ear.length * 0.72;
        const tipY = ear.y + Math.sin(angle) * ear.length * 0.72;
        ctx.lineWidth = DETAIL_LINE;
        ctx.beginPath();
        ctx.moveTo(tipX - 9, tipY - 5);
        ctx.lineTo(tipX - 1, tipY + 4);
        ctx.lineTo(tipX + 6, tipY - 6);
        ctx.stroke();
      }
    }
  }
}

function traceSnout(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  // A soft "squircle": the pale muzzle the nose sits on.
  const k = 0.86;
  ctx.moveTo(x, y - ry);
  ctx.bezierCurveTo(x + rx * k, y - ry, x + rx, y - ry * k, x + rx, y);
  ctx.bezierCurveTo(x + rx, y + ry * k, x + rx * k, y + ry, x, y + ry);
  ctx.bezierCurveTo(x - rx * k, y + ry, x - rx, y + ry * k, x - rx, y);
  ctx.bezierCurveTo(x - rx, y - ry * k, x - rx * k, y - ry, x, y - ry);
  ctx.closePath();
}

/** A mole's face: pale muzzle, big pink nose, whiskers and two buck teeth. */
function paintSnout(ctx: CanvasRenderingContext2D, s: Oval, rig: Rig, t: FoeTones): void {
  const rx = s.rx * rig.snoutW;
  const ry = s.ry * rig.snoutH;
  const x = s.x;
  const y = s.y + rig.snoutY;
  // Whiskers behind the muzzle.
  ctx.lineWidth = 3;
  ctx.strokeStyle = t.ink;
  for (const side of [-1, 1]) {
    for (const [dy, lift] of [[-0.25, -9], [0.2, 2], [0.6, 12]] as const) {
      ctx.beginPath();
      ctx.moveTo(x + side * rx * 0.7, y + ry * dy);
      ctx.quadraticCurveTo(x + side * (rx + 16), y + ry * dy + lift * 0.4, x + side * (rx + 30), y + ry * dy + lift);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  traceSnout(ctx, x, y + ry * 0.2, rx, ry * 0.86);
  ctx.fillStyle = '#e9eef5';
  ctx.fill();
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  // Buck teeth peeking out under the muzzle.
  const tw = rx * 0.2;
  const th = ry * 0.5;
  ctx.fillStyle = t.tooth;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.rect(x - tw - 1, y + ry * 0.92, tw, th);
  ctx.rect(x + 1, y + ry * 0.92, tw, th);
  ctx.fill();
  ctx.stroke();
  // The nose: a fat pink heart-shaped button, wider than tall.
  const nw = rx * 0.6 * (0.9 + 0.1 * rig.flare);
  const nh = ry * 0.62 * (0.9 + 0.1 * rig.flare);
  const ny = y - ry * 0.28;
  ctx.beginPath();
  ctx.moveTo(x, ny + nh);
  ctx.bezierCurveTo(x - nw * 1.1, ny + nh * 0.5, x - nw * 1.15, ny - nh * 0.9, x - nw * 0.4, ny - nh * 0.9);
  ctx.quadraticCurveTo(x, ny - nh * 0.95, x + nw * 0.4, ny - nh * 0.9);
  ctx.bezierCurveTo(x + nw * 1.15, ny - nh * 0.9, x + nw * 1.1, ny + nh * 0.5, x, ny + nh);
  ctx.closePath();
  ctx.fillStyle = t.snout;
  ctx.fill();
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.fillStyle = t.snoutLo;
  ctx.beginPath();
  ctx.ellipse(x + nw * 0.3, ny + nh * 0.3, nw * 0.45, nh * 0.3, -0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = t.snoutHi;
  ctx.beginPath();
  ctx.ellipse(x - nw * 0.38, ny - nh * 0.42, nw * 0.3, nh * 0.2, -0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = t.nostril;
  ctx.beginPath();
  ctx.ellipse(x - nw * 0.3, ny + nh * 0.12, nw * 0.1, nh * 0.16, -0.2, 0, TAU);
  ctx.ellipse(x + nw * 0.3, ny + nh * 0.12, nw * 0.1, nh * 0.16, 0.2, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------- extra gear

/** Tower shield carried on the slingshot side. `wear` 0..2 splinters it. */
function paintShield(ctx: CanvasRenderingContext2D, wear: 0 | 1 | 2): void {
  ctx.save();
  ctx.translate(-70, 18);
  ctx.rotate(-0.08);
  ctx.beginPath();
  ctx.moveTo(-44, -84);
  ctx.quadraticCurveTo(0, -98, 44, -84);
  ctx.lineTo(44, 44);
  ctx.quadraticCurveTo(40, 86, 0, 100);
  ctx.quadraticCurveTo(-40, 86, -44, 44);
  ctx.closePath();
  const wood = ctx.createLinearGradient(-44, 0, 44, 0);
  wood.addColorStop(0, '#e2b06a');
  wood.addColorStop(1, '#a8703a');
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#2b1a12';
  ctx.stroke();
  ctx.save();
  ctx.clip();
  // Planks, iron rim and boss.
  ctx.strokeStyle = '#7a4c22';
  ctx.lineWidth = 3;
  for (const px of [-16, 14]) {
    ctx.beginPath();
    ctx.moveTo(px, -100);
    ctx.lineTo(px, 110);
    ctx.stroke();
  }
  ctx.fillStyle = '#8d9bab';
  ctx.fillRect(-50, -92, 100, 16);
  ctx.fillRect(-50, 30, 100, 14);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, -22, 17, 0, TAU);
  ctx.fillStyle = '#b9c4d0';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#ffffffb0';
  ctx.beginPath();
  ctx.arc(-5, -27, 5, 0, TAU);
  ctx.fill();
  if (wear > 0) {
    ctx.strokeStyle = '#2b1a12';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-30, -70);
    ctx.lineTo(-12, -40);
    ctx.lineTo(-24, -8);
    if (wear > 1) {
      ctx.moveTo(34, 60);
      ctx.lineTo(10, 30);
      ctx.lineTo(26, 4);
      ctx.moveTo(-36, 50);
      ctx.lineTo(-10, 66);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Powder keg strapped to the sapper's back, with a fizzing fuse. */
function paintKeg(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  ctx.translate(44, -88);
  ctx.rotate(0.22);
  ctx.beginPath();
  ctx.roundRect(-34, -34, 68, 62, 12);
  ctx.fillStyle = '#b5482f';
  ctx.fill();
  ctx.lineWidth = 6.5;
  ctx.strokeStyle = '#2b1a12';
  ctx.stroke();
  ctx.fillStyle = '#f2e2b0';
  ctx.fillRect(-34, -8, 68, 16);
  ctx.fillStyle = '#2b1a12';
  ctx.fillRect(-34, -22, 68, 5);
  ctx.fillRect(-34, 14, 68, 5);
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.quadraticCurveTo(6, -54, 22, -56);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#dbb684';
  ctx.stroke();
  const flicker = 0.7 + 0.3 * Math.sin(time * 31);
  ctx.fillStyle = '#ffb629';
  ctx.beginPath();
  ctx.arc(24, -57, 9 * flicker, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff5c4';
  ctx.beginPath();
  ctx.arc(24, -57, 4 * flicker, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Flying goggles pushed up on the balloonist's forehead. */
function paintGoggles(ctx: CanvasRenderingContext2D): void {
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#2b1a12';
  ctx.beginPath();
  ctx.moveTo(-96, -58);
  ctx.quadraticCurveTo(0, -84, 96, -58);
  ctx.lineWidth = 11;
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#8a5a34';
  ctx.stroke();
  for (const x of [-30, 30]) {
    ctx.beginPath();
    ctx.ellipse(x, -72, 24, 19, x < 0 ? -0.12 : 0.12, 0, TAU);
    ctx.fillStyle = '#9fe0f5';
    ctx.fill();
    ctx.lineWidth = 6.5;
    ctx.strokeStyle = '#2b1a12';
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#d9a35b';
    ctx.stroke();
    ctx.fillStyle = '#ffffffc0';
    ctx.beginPath();
    ctx.ellipse(x - 8, -78, 7, 4, -0.5, 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- face

const BROW_DROP = 9;
const BROW_FLARE = 4;
const BROW_WORRY = 12;
const BROW_LIFT = 13;
const QUIRK_LIFT = 7;
const LID_SLANT = 0.32;
const BLINK_FROM_BELOW = 0.12;

function mirrorEye(eye: EyeShape): EyeShape {
  return { x: -eye.x, y: eye.y, rx: eye.rx, ry: eye.ry, pupil: eye.pupil };
}

function eyeLook(eye: EyeShape, rig: Rig, pose: FoePose, swollen: number): EyeLook {
  const blink = clamp01(pose.blink);
  const bottom = rig.bottom + swollen + blink * BLINK_FROM_BELOW;
  const top = Math.min(rig.top + swollen * 0.5, 1 - bottom);
  return {
    lookX: pose.lookX ?? 0,
    lookY: pose.lookY ?? 0,
    top: lerp(top, 1 - bottom, blink),
    bottom,
    slant: (rig.anger - rig.worry * 0.9) * eye.ry * LID_SLANT,
    size: rig.eye,
    pupil: rig.pupil,
  };
}

function paintHappyEye(ctx: CanvasRenderingContext2D, eye: EyeShape, t: FoeTones): void {
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = OUTLINE;
  ctx.beginPath();
  ctx.moveTo(eye.x - eye.rx * 0.85, eye.y + eye.ry * 0.25);
  ctx.quadraticCurveTo(eye.x, eye.y - eye.ry * 0.95, eye.x + eye.rx * 0.85, eye.y + eye.ry * 0.25);
  ctx.stroke();
}

function paintSpiralEye(ctx: CanvasRenderingContext2D, eye: EyeShape, spin: number, t: FoeTones): void {
  ctx.beginPath();
  ctx.ellipse(eye.x, eye.y, eye.rx, eye.ry, 0, 0, TAU);
  ctx.fillStyle = t.eyeWhite;
  ctx.fill();
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.lineWidth = DETAIL_LINE;
  ctx.beginPath();
  const turns = 16;
  for (let i = 0; i <= turns; i++) {
    const u = i / turns;
    const angle = spin + u * TAU * 2.2;
    const px = eye.x + Math.cos(angle) * eye.rx * 0.78 * u;
    const py = eye.y + Math.sin(angle) * eye.ry * 0.78 * u;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function paintCrossEye(ctx: CanvasRenderingContext2D, eye: EyeShape, t: FoeTones): void {
  const r = Math.min(eye.rx, eye.ry) * 0.72;
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = OUTLINE;
  ctx.beginPath();
  ctx.moveTo(eye.x - r, eye.y - r);
  ctx.lineTo(eye.x + r, eye.y + r);
  ctx.moveTo(eye.x + r, eye.y - r);
  ctx.lineTo(eye.x - r, eye.y + r);
  ctx.stroke();
}

function paintBrows(ctx: CanvasRenderingContext2D, design: FoeDesign, rig: Rig, t: FoeTones, fill: string): void {
  const b = design.brow;
  const k = design.browThick;
  for (const side of [-1, 1] as const) {
    const rise = rig.lift * BROW_LIFT + (side > 0 ? rig.quirk * QUIRK_LIFT : 0);
    const innerY = b.innerY + rig.anger * BROW_DROP - rig.worry * BROW_WORRY - rise;
    const outerY = b.outerY - rig.anger * BROW_FLARE + rig.worry * BROW_FLARE - rise;
    const s = side < 0 ? 1 : -1;
    paintBrow(ctx, b.outerX * s, outerY, b.outerW * k, b.innerX * s, innerY, b.innerW * k, rig.lift * 5 + rig.worry * 3, fill, t.ink);
  }
}

function paintMouth(ctx: CanvasRenderingContext2D, design: FoeDesign, rig: Rig, t: FoeTones): void {
  const { x, w } = design.mouth;
  const y = design.mouth.y;
  const open = rig.open * design.mouth.maxOpen;
  ctx.strokeStyle = t.ink;
  switch (rig.mouth) {
    case 'smirk': {
      ctx.lineWidth = FEATURE_LINE;
      ctx.beginPath();
      ctx.moveTo(x - w, y - 3);
      ctx.quadraticCurveTo(x - w * 0.05, y + 9, x + w, y - 11);
      ctx.stroke();
      ctx.lineWidth = DETAIL_LINE;
      ctx.beginPath();
      ctx.moveTo(x + w - 4, y - 18);
      ctx.quadraticCurveTo(x + w + 7, y - 12, x + w + 3, y - 3);
      ctx.stroke();
      break;
    }
    case 'wobble': {
      ctx.lineWidth = DETAIL_LINE + 0.5;
      ctx.beginPath();
      const half = w * 0.72;
      ctx.moveTo(x - half, y + 5);
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        const x0 = x - half + ((i + 0.5) / steps) * half * 2;
        const x1 = x - half + ((i + 1) / steps) * half * 2;
        ctx.quadraticCurveTo(x0, y + (i % 2 === 0 ? -5 : 5), x1, y + (i === steps - 1 ? 5 : 0));
      }
      ctx.stroke();
      break;
    }
    case 'o': {
      const rx = w * 0.3 * open + 5;
      const ry = w * 0.42 * open + 6;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, rx, ry, 0, 0, TAU);
      ctx.fillStyle = t.mouth;
      ctx.fill();
      ctx.fillStyle = t.tongue;
      ctx.beginPath();
      ctx.ellipse(x, y + 2 + ry * 0.52, rx * 0.62, ry * 0.32, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = FEATURE_LINE;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, rx, ry, 0, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'grit': {
      const half = w * 0.8;
      ctx.beginPath();
      ctx.moveTo(x - half, y - 6);
      ctx.quadraticCurveTo(x, y - 12, x + half, y - 6);
      ctx.lineTo(x + half * 0.92, y + 8);
      ctx.quadraticCurveTo(x, y + 2, x - half * 0.92, y + 8);
      ctx.closePath();
      ctx.fillStyle = t.tooth;
      ctx.fill();
      ctx.lineWidth = FEATURE_LINE;
      ctx.stroke();
      ctx.lineWidth = DETAIL_LINE * 0.7;
      ctx.beginPath();
      ctx.moveTo(x - half * 0.9, y + 1);
      ctx.quadraticCurveTo(x, y - 4, x + half * 0.9, y + 1);
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(x + i * half * 0.42, y - 9);
        ctx.lineTo(x + i * half * 0.42, y + 5);
      }
      ctx.stroke();
      // Corners pulled down.
      ctx.lineWidth = DETAIL_LINE;
      ctx.beginPath();
      ctx.moveTo(x - half - 2, y - 7);
      ctx.lineTo(x - half - 8, y + 2);
      ctx.moveTo(x + half + 2, y - 7);
      ctx.lineTo(x + half + 8, y + 2);
      ctx.stroke();
      break;
    }
    case 'laugh': {
      const depth = 10 + 26 * open;
      const half = w * 1.08;
      const trace = (): void => {
        ctx.beginPath();
        ctx.moveTo(x - half, y - 12);
        ctx.quadraticCurveTo(x, y - 2, x + half, y - 12);
        ctx.quadraticCurveTo(x + half * 0.86, y - 8 + depth, x, y - 8 + depth);
        ctx.quadraticCurveTo(x - half * 0.86, y - 8 + depth, x - half, y - 12);
        ctx.closePath();
      };
      trace();
      ctx.fillStyle = t.mouth;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = t.tongue;
      ctx.beginPath();
      ctx.ellipse(x + 3, y - 6 + depth, half * 0.55, depth * 0.42, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = t.tooth;
      ctx.fillRect(x - half * 0.5, y - 12, half * 0.42, 9);
      ctx.fillRect(x + half * 0.08, y - 12, half * 0.42, 9);
      ctx.restore();
      trace();
      ctx.lineWidth = FEATURE_LINE;
      ctx.stroke();
      break;
    }
    case 'slack': {
      ctx.lineWidth = FEATURE_LINE;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.8, y + 2);
      ctx.quadraticCurveTo(x - w * 0.1, y - 5, x + w * 0.8, y + 5);
      ctx.stroke();
      // Tongue lolling out of one corner.
      const len = 8 + 16 * open;
      const tx = x + w * 0.3;
      ctx.beginPath();
      ctx.moveTo(tx - 10, y);
      ctx.lineTo(tx - 9, y + len * 0.6);
      ctx.quadraticCurveTo(tx, y + len + 6, tx + 9, y + len * 0.6);
      ctx.lineTo(tx + 10, y + 2);
      ctx.closePath();
      ctx.fillStyle = t.tongue;
      ctx.fill();
      ctx.lineWidth = DETAIL_LINE;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx, y + 3);
      ctx.lineTo(tx, y + len * 0.55);
      ctx.stroke();
      break;
    }
  }
}

function paintTusks(ctx: CanvasRenderingContext2D, design: FoeDesign, rig: Rig, t: FoeTones): void {
  const { x, y, w } = design.mouth;
  const drop = rig.mouth === 'laugh' ? 8 : rig.mouth === 'o' ? 6 : 0;
  ctx.fillStyle = t.tooth;
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = DETAIL_LINE;
  for (const side of [-1, 1]) {
    const bx = x + side * w * 0.72;
    const by = y + drop - (side > 0 ? 6 : 1);
    ctx.beginPath();
    ctx.moveTo(bx - 7, by + 2);
    ctx.quadraticCurveTo(bx - 4 + side * 2, by - 12, bx + side * 4, by - 20);
    ctx.quadraticCurveTo(bx + 7, by - 6, bx + 7, by + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- skin details, damage, effects

function paintBlush(ctx: CanvasRenderingContext2D, design: FoeDesign, t: FoeTones): void {
  const x = -design.eye.x + 22;
  ctx.fillStyle = t.blush;
  ctx.beginPath();
  ctx.ellipse(-x, design.snout.y - 2, 16, 10, 0, 0, TAU);
  ctx.moveTo(x + 16, design.snout.y - 2);
  ctx.ellipse(x, design.snout.y - 2, 16, 10, 0, 0, TAU);
  ctx.fill();
}

/** Static skin markings (inside the body clip): muzzle glow, creases, scars, bruises. */
function paintSkin(ctx: CanvasRenderingContext2D, variant: FoeVariant, design: FoeDesign, damage: number, t: FoeTones): void {
  const right = mirrorEye(design.eye);
  // Muzzle glow around the snout.
  ctx.fillStyle = t.muzzle;
  ctx.beginPath();
  ctx.ellipse(design.snout.x - 4, design.snout.y - 4, design.snout.rx * 1.45, design.snout.ry * 1.6, 0, 0, TAU);
  ctx.fill();

  if (variant === 'small') paintBlush(ctx, design, t);
  ctx.strokeStyle = t.crease;
  ctx.lineWidth = DETAIL_LINE * 0.8;
  if (variant === 'medium' || variant === 'large' || variant === 'helmet') {
    // Cheek creases beside the snout.
    const s = design.snout;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(side * (s.rx + 8), s.y - s.ry * 0.7);
      ctx.quadraticCurveTo(side * (s.rx + 16), s.y, side * (s.rx + 8), s.y + s.ry * 0.8);
    }
    ctx.stroke();
  }
  if (variant === 'large') {
    // Jowls, stubble and a stitched scar.
    ctx.beginPath();
    ctx.moveTo(-86, 50);
    ctx.quadraticCurveTo(-74, 74, -52, 84);
    ctx.moveTo(86, 50);
    ctx.quadraticCurveTo(74, 74, 52, 84);
    ctx.stroke();
    ctx.fillStyle = t.crease;
    ctx.beginPath();
    for (const [sx, sy] of STUBBLE) {
      ctx.moveTo(sx + 2.4, sy);
      ctx.arc(sx, sy, 2.4, 0, TAU);
    }
    ctx.fill();
    ctx.strokeStyle = t.snoutHi;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(56, 6);
    ctx.lineTo(76, 40);
    ctx.stroke();
    ctx.strokeStyle = t.ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const u = 0.2 + i * 0.3;
      const cx = 56 + 20 * u;
      const cy = 6 + 34 * u;
      ctx.moveTo(cx - 6, cy + 3);
      ctx.lineTo(cx + 6, cy - 3);
    }
    ctx.stroke();
  }

  if (damage >= 1) {
    // Bruise around the right eye and scuffs on the left cheek.
    ctx.fillStyle = t.bruise;
    ctx.beginPath();
    ctx.ellipse(right.x + 6, right.y + 6, right.rx * 1.55, right.ry * 1.4, 0.3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = t.crease;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-74, 22);
    ctx.lineTo(-60, 14);
    ctx.moveTo(-76, 32);
    ctx.lineTo(-58, 24);
    ctx.moveTo(-70, 42);
    ctx.lineTo(-60, 37);
    ctx.stroke();
  }
  if (damage >= 2) {
    ctx.fillStyle = t.blackEye;
    ctx.beginPath();
    ctx.ellipse(right.x + 2, right.y + 3, right.rx * 1.38, right.ry * 1.3, 0.2, 0, TAU);
    ctx.fill();
  }
}

const STUBBLE: readonly (readonly [number, number])[] = [
  [-30, 86],
  [-16, 92],
  [0, 90],
  [16, 92],
  [30, 86],
  [-8, 82],
  [10, 82],
];

function paintBandage(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, t: FoeTones): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = DETAIL_LINE;
  for (const turn of [0, Math.PI / 2]) {
    ctx.save();
    ctx.rotate(turn + 0.0001);
    ctx.beginPath();
    ctx.moveTo(-24, -7);
    ctx.lineTo(24, -7);
    ctx.quadraticCurveTo(29, 0, 24, 7);
    ctx.lineTo(-24, 7);
    ctx.quadraticCurveTo(-29, 0, -24, -7);
    ctx.closePath();
    ctx.fillStyle = t.bandage;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = t.bandagePad;
  ctx.fillRect(-7, -7, 14, 14);
  ctx.strokeRect(-7, -7, 14, 14);
  ctx.restore();
}

function paintSweat(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, t: FoeTones): void {
  const cycle = (time * 0.9) % 1;
  const dy = cycle * 14;
  const alpha = cycle > 0.8 ? (1 - cycle) / 0.2 : 1;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.moveTo(x, y - 13 + dy);
  ctx.quadraticCurveTo(x + 11, y + 3 + dy, x, y + 8 + dy);
  ctx.quadraticCurveTo(x - 11, y + 3 + dy, x, y - 13 + dy);
  ctx.fillStyle = t.sweat;
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.fillStyle = t.eyeWhite;
  ctx.beginPath();
  ctx.arc(x - 2.5, y + 1 + dy, 2.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function paintStars(ctx: CanvasRenderingContext2D, y: number, time: number, t: FoeTones): void {
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 3.5;
  ctx.fillStyle = t.star;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const angle = time * 4.2 + (i / 3) * TAU;
    const depth = Math.sin(angle);
    traceStar(ctx, Math.cos(angle) * 68, y + depth * 15, 12 + depth * 3, time * 3 + i);
  }
  ctx.fill();
  ctx.stroke();
}

// ---------------------------------------------------------------- painters

const FLASH_STEPS = 16;
const BODY_BOUNDS: LayerBounds = { left: -128, top: -118, width: 256, height: 236 };
const KNIGHT_BOUNDS: LayerBounds = { left: -120, top: -134, width: 240, height: 202 };
const HELMET_BOUNDS: LayerBounds = { left: -126, top: -146, width: 252, height: 116 };
const CROWN_BOUNDS: LayerBounds = { left: -72, top: -166, width: 144, height: 96 };

/** Shaded body with its static markings and the gear that sits inside the silhouette. */
function paintBodyLayer(
  ctx: CanvasRenderingContext2D,
  variant: FoeVariant,
  design: FoeDesign,
  damage: number,
  helmet: boolean,
  knight: boolean,
  wear: 0 | 1 | 2,
  t: FoeTones,
  royal: RoyalTones,
  steel: MetalTones,
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  beginFoeBody(ctx, design.body, t);
  paintSkin(ctx, variant, design, damage, t);
  shadeBody(ctx, design.body, t);
  paintGloss(ctx, design.gloss.x, design.gloss.y, design.gloss.size, t.gloss);
  if (helmet) paintChinStrap(ctx, royal);
  if (knight) paintBreastplate(ctx, steel, royal, wear);
  if (variant === 'king') paintErmine(ctx, royal);
  endBody(ctx);
  ctx.restore();
}

/** Foe facing the viewer, collision circle of radius CHARACTER_RADIUS centred on the origin. */
export function paintFoe(ctx: CanvasRenderingContext2D, variant: FoeVariant, pose: FoePose): void {
  const design = DESIGNS[variant];
  const flash = pose.flash ?? 0;
  const t = flashTones(FOE_TONES[variant], flash);
  const rig = buildRig(design, pose);
  const wear = pose.armorDamage ?? 0;
  const helmet = variant === 'helmet' && pose.armorOn;
  const knight = variant === 'armored' && pose.armorOn;
  const king = variant === 'king';
  const shield = variant === 'shield' && pose.armorOn;
  const royal = flashTones(ROYAL, flash);
  const time = pose.time;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Behind the body.
  if (king) paintCape(ctx, royal, time);
  if (variant === 'sapper') paintKeg(ctx, time);
  if (knight) paintPlume(ctx, royal, wear, time);
  else paintEars(ctx, design.ear, rig, time, t);

  // Static layers come from the cache unless the foe is flashing white.
  const k = flash * FLASH_STEPS >= 0.5 ? 0 : deviceScale(ctx);
  const body = foeLayer(`body|${variant}|${pose.damage}|${helmet ? 1 : 0}${knight ? wear : 'x'}`, BODY_BOUNDS, k);
  if (body) {
    if (body.blank) paintBodyLayer(body.ctx, variant, design, pose.damage, helmet, knight, wear, FOE_TONES[variant], ROYAL, STEEL);
    blitLayer(ctx, body);
  } else {
    paintBodyLayer(ctx, variant, design, pose.damage, helmet, knight, wear, t, royal, flashTones(STEEL, flash));
  }
  if (rig.mouth === 'laugh' && variant !== 'small') paintBlush(ctx, design, t);

  if (knight) {
    const layer = foeLayer(`knight|${wear}`, KNIGHT_BOUNDS, k);
    if (layer) {
      if (layer.blank) paintKnightHelm(layer.ctx, STEEL, wear);
      blitLayer(ctx, layer);
    } else {
      paintKnightHelm(ctx, flashTones(STEEL, flash), wear);
    }
  }
  if (variant === 'small') {
    // Hair curl.
    ctx.strokeStyle = t.ink;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-4, -92);
    ctx.bezierCurveTo(-12, -116, 14, -128, 18, -114);
    ctx.bezierCurveTo(21, -102, 4, -101, 7, -111);
    ctx.stroke();
  }

  // Face.
  const left = design.eye;
  const right = mirrorEye(left);
  const swollen = pose.damage >= 2 ? 0.3 : 0;
  switch (rig.eyes) {
    case 'open':
      paintEye(ctx, left, eyeLook(left, rig, pose, 0), 1, t);
      paintEye(ctx, right, eyeLook(right, rig, pose, swollen), -1, t);
      break;
    case 'squeeze':
      paintSqueezedEye(ctx, left, 1, t);
      paintSqueezedEye(ctx, right, -1, t);
      break;
    case 'happy':
      paintHappyEye(ctx, left, t);
      paintHappyEye(ctx, right, t);
      break;
    case 'spiral':
      paintSpiralEye(ctx, left, time * 7, t);
      paintSpiralEye(ctx, right, -time * 7 + 1, t);
      break;
    case 'cross':
      paintCrossEye(ctx, left, t);
      paintCrossEye(ctx, right, t);
      break;
  }
  paintBrows(ctx, design, rig, t, king ? royal.stache : t.brow);
  paintSnout(ctx, design.snout, rig, t);
  if (king) paintMoustache(ctx, royal, design.snout.y + design.snout.ry * rig.snoutH + rig.snoutY + 4, rig.mouth === 'laugh' ? Math.sin(time * 15) : rig.droop * -0.6);
  paintMouth(ctx, design, rig, t);
  if (variant === 'large') paintTusks(ctx, design, rig, t);
  if (variant === 'small' && rig.mouth === 'smirk') {
    // One buck tooth.
    ctx.fillStyle = t.tooth;
    ctx.strokeStyle = t.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(-4, design.mouth.y + 2, 9, 8);
    ctx.fill();
    ctx.stroke();
  }

  // Equipment and effects in front of the face.
  if (helmet) {
    const layer = foeLayer(`helmet|${wear}`, HELMET_BOUNDS, k);
    if (layer) {
      if (layer.blank) paintSoldierHelmet(layer.ctx, IRON, wear);
      blitLayer(ctx, layer);
    } else {
      paintSoldierHelmet(ctx, flashTones(IRON, flash), wear);
    }
  }
  if (variant === 'floater') paintGoggles(ctx);
  if (shield) paintShield(ctx, wear);
  if (king && pose.expression !== 'defeated') {
    const lift = rig.lift * 10 + (pose.expression === 'surprised' ? 8 : 0);
    const tilt = pose.expression === 'hurt' || pose.expression === 'stunned' ? 0.2 : -0.08 + Math.sin(time * 1.1) * 0.02;
    ctx.save();
    crownTransform(ctx, lift, tilt);
    const layer = foeLayer('crown', CROWN_BOUNDS, k);
    if (layer) {
      if (layer.blank) paintCrownShape(layer.ctx, ROYAL);
      blitLayer(ctx, layer);
    } else {
      paintCrownShape(ctx, royal);
    }
    ctx.restore();
  }
  if (pose.damage >= 2) {
    if (helmet || knight) paintBandage(ctx, -50, 40, 0.6, t);
    else paintBandage(ctx, -46, -70, -0.5, t);
  }
  if (rig.sweat) paintSweat(ctx, right.x + right.rx + 12, right.y - right.ry * 0.5, time, t);
  if (rig.tears) {
    const bob = Math.abs(Math.sin(time * 15)) * 4;
    ctx.fillStyle = t.sweat;
    ctx.strokeStyle = t.ink;
    ctx.lineWidth = 3;
    for (const eye of [left, right]) {
      const side = eye.x < 0 ? -1 : 1;
      ctx.beginPath();
      ctx.ellipse(eye.x + side * (eye.rx + 7), eye.y + 8 - bob, 5, 7, side * 0.4, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }
  if (rig.stars) paintStars(ctx, helmet ? -150 : knight ? -138 : king ? -126 : -112, time, t);
  ctx.restore();
}

/** Pieces that fly off a foe, painted roughly centred on the origin so they tumble about themselves. */
export function paintFoeAccessory(ctx: CanvasRenderingContext2D, kind: FoeAccessory): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (kind === 'helmet') {
    ctx.translate(0, 88);
    paintSoldierHelmet(ctx, IRON, 2);
  } else if (kind === 'armor') {
    ctx.translate(0, 34);
    paintPlume(ctx, ROYAL, 2, 0);
    paintKnightHelm(ctx, STEEL, 2);
  } else if (kind === 'shield') {
    ctx.translate(70, -18);
    paintShield(ctx, 2);
  } else {
    ctx.translate(0, 116);
    paintCrownShape(ctx, ROYAL);
  }
  ctx.restore();
}
