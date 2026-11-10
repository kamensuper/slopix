/**
 * Shared building blocks of the character artwork: hit-flash tinting, organic outlines, body
 * shading, eyes, brows, feathers and beaks.
 *
 * Everything is drawn in the character design space: the collision circle has radius 100 around
 * the origin, x to the right, y down.
 */
import { TAU, clamp, clamp01, lerp } from '../../core/math';

/** Ink outline of a character silhouette, in design units. */
export const OUTLINE = 7.5;
/** Outline of features sitting on the body (eyes, beak, feathers, snout). */
export const FEATURE_LINE = 5.5;
/** Fine inner details (lid edges, creases, veins). */
export const DETAIL_LINE = 4.5;

// ---------------------------------------------------------------- hit flash

/** A named set of colours, each `#rrggbb` or `#rrggbbaa`. */
export type Tones = Readonly<Record<string, string>>;

/** Flash strengths are quantised to this many steps so that tinted palettes can be cached. */
const FLASH_STEPS = 16;
const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;
const flashCache = new WeakMap<Tones, (Tones | undefined)[]>();

function whiten(color: string, amount: number): string {
  const hex = HEX_COLOR.exec(color);
  if (!hex) return color;
  const channel = (index: number): number => Math.round(lerp(parseInt(hex[index], 16), 255, amount));
  const alpha = hex[4] === undefined ? 1 : parseInt(hex[4], 16) / 255;
  return `rgba(${channel(1)},${channel(2)},${channel(3)},${alpha.toFixed(3)})`;
}

/**
 * Returns `tones` mixed towards white by `flash` (0..1). Painting a character with the result is
 * equivalent to laying a white overlay of that opacity over its finished silhouette, without a
 * second pass or an off-screen canvas.
 */
export function flashTones<T extends Tones>(tones: T, flash: number): T {
  const step = Math.round(clamp01(flash) * FLASH_STEPS);
  if (step === 0) return tones;
  let levels = flashCache.get(tones);
  if (!levels) {
    levels = [];
    flashCache.set(tones, levels);
  }
  let tinted = levels[step];
  if (!tinted) {
    const mixed: Record<string, string> = {};
    for (const key of Object.keys(tones)) mixed[key] = whiten(tones[key], step / FLASH_STEPS);
    tinted = mixed;
    levels[step] = tinted;
  }
  return tinted as T;
}

// ---------------------------------------------------------------- organic outlines

/** Closed smooth outline, flattened as [x0, y0, then (c1x, c1y, c2x, c2y, x, y) per segment]. */
export type Blob = readonly number[];

/** Smooth closed curve through `points` (a Catmull-Rom spline converted to cubic Beziers). */
export function blobThrough(points: readonly (readonly [number, number])[]): Blob {
  const count = points.length;
  const out: number[] = [points[0][0], points[0][1]];
  for (let i = 0; i < count; i++) {
    const before = points[(i + count - 1) % count];
    const from = points[i];
    const to = points[(i + 1) % count];
    const after = points[(i + 2) % count];
    out.push(
      from[0] + (to[0] - before[0]) / 6,
      from[1] + (to[1] - before[1]) / 6,
      to[0] - (after[0] - from[0]) / 6,
      to[1] - (after[1] - from[1]) / 6,
      to[0],
      to[1],
    );
  }
  return out;
}

/** Blob through points given as radii at equal angular steps, starting at the top and going clockwise. */
export function blobPolar(radii: readonly number[]): Blob {
  return blobThrough(
    radii.map((radius, i): [number, number] => {
      const angle = -Math.PI / 2 + (i / radii.length) * TAU;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    }),
  );
}

/** Adds the blob to the current path, optionally scaled about the origin and then shifted. */
export function traceBlob(ctx: CanvasRenderingContext2D, blob: Blob, dx = 0, dy = 0, scale = 1): void {
  ctx.moveTo(blob[0] * scale + dx, blob[1] * scale + dy);
  for (let i = 2; i < blob.length; i += 6) {
    ctx.bezierCurveTo(
      blob[i] * scale + dx,
      blob[i + 1] * scale + dy,
      blob[i + 2] * scale + dx,
      blob[i + 3] * scale + dy,
      blob[i + 4] * scale + dx,
      blob[i + 5] * scale + dy,
    );
  }
  ctx.closePath();
}

// ---------------------------------------------------------------- body shading

export interface BodyTones {
  ink: string;
  /** Lit side of the form (gradient start, top-left). */
  hi: string;
  body: string;
  /** Far side of the form (gradient end, bottom-right). */
  lo: string;
  /** Translucent cel-shade laid over the lower right. */
  shade: string;
  /** Translucent rim light along the upper left edge. */
  rim: string;
  /** Translucent specular highlight. */
  gloss: string;
}

/** The ink silhouette is shifted towards the shadow side: a heavier line bottom-right, a lighter one top-left. */
const INK_SHIFT_X = 1.3;
const INK_SHIFT_Y = 1.8;
/** The cel shade is what remains of the body after cutting out a copy moved towards the light. */
const SHADE_SHIFT_X = -15;
const SHADE_SHIFT_Y = -17;
const SHADE_SCALE = 0.99;
const RIM_SHIFT_X = 8;
const RIM_SHIFT_Y = 10;
/** Half size of the rectangle used as "everything" in even-odd cut-outs. */
const FAR = 400;

/**
 * Inks and fills a body, then leaves the context clipped to it so belly patches and markings can
 * be painted without spilling over the outline. Must be paired with `endBody`.
 */
export function beginBody(ctx: CanvasRenderingContext2D, blob: Blob, tones: BodyTones): void {
  ctx.beginPath();
  traceBlob(ctx, blob, INK_SHIFT_X, INK_SHIFT_Y);
  ctx.lineWidth = OUTLINE * 2;
  ctx.strokeStyle = tones.ink;
  ctx.stroke();

  const gradient = ctx.createRadialGradient(-38, -46, 6, -6, -6, 142);
  gradient.addColorStop(0, tones.hi);
  gradient.addColorStop(0.5, tones.body);
  gradient.addColorStop(1, tones.lo);
  ctx.beginPath();
  traceBlob(ctx, blob);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.save();
  ctx.clip();
}

/** Cel shade on the lower right and rim light on the upper left; call between `beginBody` and `endBody`. */
export function shadeBody(ctx: CanvasRenderingContext2D, blob: Blob, tones: BodyTones): void {
  ctx.beginPath();
  ctx.rect(-FAR, -FAR, FAR * 2, FAR * 2);
  traceBlob(ctx, blob, SHADE_SHIFT_X, SHADE_SHIFT_Y, SHADE_SCALE);
  ctx.fillStyle = tones.shade;
  ctx.fill('evenodd');

  ctx.beginPath();
  ctx.rect(-FAR, -FAR, FAR * 2, FAR * 2);
  traceBlob(ctx, blob, RIM_SHIFT_X, RIM_SHIFT_Y);
  ctx.fillStyle = tones.rim;
  ctx.fill('evenodd');
}

export function endBody(ctx: CanvasRenderingContext2D): void {
  ctx.restore();
}

/** Crisp specular highlight: a slanted bean with a small satellite dot. */
export function paintGloss(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, size, size * 0.52, -0.62, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + size * 1.25, y - size * 0.95, size * 0.3, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------- eyes

export interface EyeShape {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Pupil radius. */
  pupil: number;
}

export interface EyeLook {
  /** Pupil offset as a fraction of its travel inside the eye, each in -1..1. */
  lookX: number;
  lookY: number;
  /** Upper / lower lid closure, 0 = open .. 1 = covering the whole eye. */
  top: number;
  bottom: number;
  /** Design units by which the inner end of the upper lid drops (and the outer end rises): the angry slant. */
  slant: number;
  /** Size multipliers of the eyeball and the pupil. */
  size: number;
  pupil: number;
}

export interface EyeTones {
  ink: string;
  eyeWhite: string;
  pupil: string;
  lid: string;
}

/** Lids that leave less than this fraction of the eye open are drawn as a shut eye. */
const SHUT_THRESHOLD = 0.06;
const PUPIL_MARGIN = 2.5;

function lidAngle(level: number, y: number, ry: number): number {
  return Math.asin(clamp((level - y) / ry, -1, 1));
}

function paintPupil(ctx: CanvasRenderingContext2D, eye: EyeShape, look: EyeLook, rx: number, ry: number, tones: EyeTones): void {
  const radius = eye.pupil * look.pupil;
  const reach = Math.max(1, Math.hypot(look.lookX, look.lookY));
  const px = eye.x + (look.lookX / reach) * Math.max(0, rx - radius - PUPIL_MARGIN);
  const py = eye.y + (look.lookY / reach) * Math.max(0, ry - radius - PUPIL_MARGIN);
  ctx.fillStyle = tones.pupil;
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, TAU);
  ctx.fill();
  ctx.fillStyle = tones.eyeWhite;
  ctx.beginPath();
  ctx.arc(px - radius * 0.34, py - radius * 0.38, radius * 0.36, 0, TAU);
  ctx.fill();
}

/**
 * An eye with a movable pupil and two lids. `inner` is the side (+1 right, -1 left) on which the
 * neighbouring eye sits; a slanted upper lid drops towards it.
 */
export function paintEye(ctx: CanvasRenderingContext2D, eye: EyeShape, look: EyeLook, inner: 1 | -1, tones: EyeTones): void {
  const { x, y } = eye;
  const rx = eye.rx * look.size;
  const ry = eye.ry * look.size;
  const bottom = clamp01(look.bottom);
  const top = Math.min(clamp01(look.top), 1 - bottom);
  const shut = 1 - top - bottom < SHUT_THRESHOLD;

  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = shut ? tones.lid : tones.eyeWhite;
  ctx.fill();

  ctx.strokeStyle = tones.ink;
  ctx.lineWidth = DETAIL_LINE;
  const upperEdge = y - ry + top * 2 * ry;
  if (shut) {
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.86, upperEdge - ry * 0.06);
    ctx.quadraticCurveTo(x, upperEdge + ry * 0.2, x + rx * 0.86, upperEdge - ry * 0.06);
    ctx.stroke();
  } else {
    paintPupil(ctx, eye, look, rx, ry, tones);
    if (top > 0.01) {
      const left = lidAngle(upperEdge - inner * look.slant, y, ry);
      const right = lidAngle(upperEdge + inner * look.slant, y, ry);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, Math.PI - left, TAU + right);
      ctx.closePath();
      ctx.fillStyle = tones.lid;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - rx * Math.cos(left), y + ry * Math.sin(left));
      ctx.lineTo(x + rx * Math.cos(right), y + ry * Math.sin(right));
      ctx.stroke();
    }
    if (bottom > 0.01) {
      const angle = lidAngle(y + ry - bottom * 2 * ry, y, ry);
      const reachX = rx * Math.cos(angle);
      const edgeY = y + ry * Math.sin(angle);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, angle, Math.PI - angle);
      ctx.quadraticCurveTo(x, edgeY - ry * 0.16, x + reachX, edgeY);
      ctx.fillStyle = tones.lid;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - reachX, edgeY);
      ctx.quadraticCurveTo(x, edgeY - ry * 0.16, x + reachX, edgeY);
      ctx.stroke();
    }
  }

  ctx.lineWidth = FEATURE_LINE;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.stroke();
}

/** An eye screwed shut: a lid-coloured socket with a chevron pointing at the neighbouring eye (`inner`). */
export function paintSqueezedEye(ctx: CanvasRenderingContext2D, eye: EyeShape, inner: 1 | -1, tones: EyeTones): void {
  const { x, y, rx, ry } = eye;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = tones.lid;
  ctx.fill();
  ctx.strokeStyle = tones.ink;
  ctx.lineWidth = FEATURE_LINE;
  ctx.stroke();

  ctx.lineWidth = OUTLINE;
  ctx.beginPath();
  ctx.moveTo(x - inner * rx * 0.52, y - ry * 0.5);
  ctx.lineTo(x + inner * rx * 0.5, y);
  ctx.lineTo(x - inner * rx * 0.52, y + ry * 0.5);
  ctx.stroke();
}

// ---------------------------------------------------------------- brows

/**
 * Tapered slab from (x1, y1) with thickness w1 to (x2, y2) with thickness w2. A positive `bow`
 * arches it upwards.
 */
export function paintBrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  w1: number,
  x2: number,
  y2: number,
  w2: number,
  bow: number,
  fill: string,
  line: string,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const h1 = w1 / 2;
  const h2 = w2 / 2;
  const hm = (h1 + h2) / 2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - bow;
  ctx.beginPath();
  ctx.moveTo(x1 - nx * h1, y1 - ny * h1);
  ctx.quadraticCurveTo(mx - nx * hm, my - ny * hm, x2 - nx * h2, y2 - ny * h2);
  ctx.lineTo(x2 + nx * h2, y2 + ny * h2);
  ctx.quadraticCurveTo(mx + nx * hm, my + ny * hm, x1 + nx * h1, y1 + ny * h1);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = DETAIL_LINE;
  ctx.strokeStyle = line;
  ctx.stroke();
}

// ---------------------------------------------------------------- feathers

/** Control points sit this far out so that the widest part of the leaf matches the requested width. */
const LEAF_BULGE = 1.33;

/**
 * Adds a leaf-shaped feather to the current path, growing from its root (x, y) along `angle`.
 * `bend` curls the tip sideways (design units); `point` runs from 0 (round paddle) to 1 (spike).
 */
export function traceFeather(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  width: number,
  bend: number,
  point: number,
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const side = (width / 2) * LEAF_BULGE;
  const rootU = length * 0.1;
  const tipU = length * lerp(1, 0.66, point);
  const tipSide = side * lerp(1, 0.18, point);
  const tipBend = bend * lerp(1, 0.7, point);
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(
    x + rootU * cos + side * sin,
    y + rootU * sin - side * cos,
    x + tipU * cos - (tipBend - tipSide) * sin,
    y + tipU * sin + (tipBend - tipSide) * cos,
    x + length * cos - bend * sin,
    y + length * sin + bend * cos,
  );
  ctx.bezierCurveTo(
    x + tipU * cos - (tipBend + tipSide) * sin,
    y + tipU * sin + (tipBend + tipSide) * cos,
    x + rootU * cos - side * sin,
    y + rootU * sin + side * cos,
    x,
    y,
  );
}

/** A feather that sways, streams backwards and ruffles with the pose of its owner. */
export interface Plume {
  x: number;
  y: number;
  /** Direction at rest and when streaming backwards, radians. */
  angle: number;
  back: number;
  length: number;
  width: number;
  bend: number;
  point: number;
  /** Phase of its sway, so neighbouring feathers do not move in unison. */
  phase: number;
  /** Angular offset when the plumage is ruffled, radians. */
  ruffle: number;
}

/** How a set of plumes is posed this frame. */
export interface PlumePose {
  /** 0 = at rest .. 1 = streaming backwards (may overshoot slightly in both directions). */
  sweep: number;
  /** 0 = tidy .. 1 = ruffled. */
  ruffle: number;
  /** Sway amplitude in radians and its angular frequency in radians per second. */
  flutter: number;
  speed: number;
  time: number;
}

export function paintPlumes(ctx: CanvasRenderingContext2D, plumes: readonly Plume[], pose: PlumePose, fill: string, ink: string): void {
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = ink;
  ctx.fillStyle = fill;
  for (const plume of plumes) {
    const angle =
      lerp(plume.angle, plume.back, pose.sweep) +
      plume.ruffle * pose.ruffle +
      pose.flutter * Math.sin(pose.time * pose.speed + plume.phase);
    ctx.beginPath();
    traceFeather(ctx, plume.x, plume.y, angle, plume.length, plume.width, plume.bend, plume.point);
    ctx.fill();
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- beaks

export interface BeakShape {
  /** Hinge: the corner of the mouth. The beak grows from here towards +x. */
  x: number;
  y: number;
  /** Length of the upper mandible. */
  length: number;
  /** Height of the upper mandible above the hinge, depth of the lower one below it. */
  upper: number;
  lower: number;
  /** Length of the lower mandible. */
  jaw: number;
  /** How far the tip of the upper mandible hooks down below the hinge. */
  hook: number;
  /** Opening angle between the mandibles at open = 1, radians. */
  gape: number;
}

export interface BeakTones {
  ink: string;
  beak: string;
  beakDark: string;
  beakLight: string;
  mouth: string;
  tongue: string;
}

/** Share of the opening angle taken by the upper mandible; the lower jaw does most of the work. */
const UPPER_GAPE_SHARE = 0.28;

function traceUpperMandible(ctx: CanvasRenderingContext2D, beak: BeakShape): void {
  const { length, upper, hook } = beak;
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-upper * 0.38, -upper * 0.55, upper * 0.16, -upper);
  ctx.quadraticCurveTo(length * 0.54, -upper * 1.04, length, hook);
  ctx.quadraticCurveTo(length * 0.58, hook * 0.25 + 1.5, 0, 0);
}

function traceLowerMandible(ctx: CanvasRenderingContext2D, beak: BeakShape): void {
  const { jaw, lower, hook } = beak;
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(jaw * 0.55, hook * 0.2 - 1, jaw, hook * 0.5);
  ctx.quadraticCurveTo(jaw * 0.56, lower * 1.12, lower * 0.12, lower);
  ctx.quadraticCurveTo(-lower * 0.42, lower * 0.5, 0, 0);
}

/** Clenched mouth line: a tight zigzag along the seam plus a stress crease behind the corner. */
function paintClench(ctx: CanvasRenderingContext2D, beak: BeakShape, clench: number): void {
  const reach = beak.jaw * 0.82;
  const teeth = 5;
  const bite = 3.2 * clench;
  ctx.lineWidth = DETAIL_LINE;
  ctx.beginPath();
  ctx.moveTo(2, 0.5);
  for (let i = 1; i <= teeth; i++) {
    const u = i / teeth;
    ctx.lineTo(2 + reach * u, beak.hook * 0.3 * u + (i % 2 === 1 ? bite : -bite * 0.4));
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1, 0, 6 + 5 * clench, Math.PI * 0.62, Math.PI * 1.38);
  ctx.stroke();
}

/**
 * Two-part beak. `open` 0..1 (values above 1 overshoot for a scream) swings the mandibles apart
 * and shows the mouth; `clench` 0..1 grits a closed beak.
 */
export function paintBeak(ctx: CanvasRenderingContext2D, beak: BeakShape, open: number, clench: number, tones: BeakTones): void {
  const { length, upper, jaw, hook } = beak;
  const spread = clamp(open, 0, 1.5) * beak.gape;
  const lift = -spread * UPPER_GAPE_SHARE;
  const drop = spread * (1 - UPPER_GAPE_SHARE);
  ctx.save();
  ctx.translate(beak.x, beak.y);
  ctx.strokeStyle = tones.ink;
  ctx.lineWidth = FEATURE_LINE;

  if (spread > 0.02) {
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(Math.cos(lift) * length * 0.84, Math.sin(lift) * length * 0.84 + hook * 0.4);
    ctx.lineTo(Math.cos(drop) * jaw * 0.9, Math.sin(drop) * jaw * 0.9 + hook * 0.3);
    ctx.closePath();
    ctx.fillStyle = tones.mouth;
    ctx.fill();
    ctx.stroke();
  }

  ctx.save();
  ctx.rotate(drop);
  if (spread > 0.02) {
    ctx.beginPath();
    ctx.ellipse(jaw * 0.46, 0, jaw * 0.3, Math.min(9, 3 + spread * 9), 0, 0, TAU);
    ctx.fillStyle = tones.tongue;
    ctx.fill();
  }
  ctx.beginPath();
  traceLowerMandible(ctx, beak);
  ctx.fillStyle = tones.beakDark;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.rotate(lift);
  ctx.beginPath();
  traceUpperMandible(ctx, beak);
  ctx.fillStyle = tones.beak;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(upper * 0.62, -upper * 0.7);
  ctx.quadraticCurveTo(length * 0.46, -upper * 0.78, length * 0.7, hook * 0.3 - upper * 0.2);
  ctx.lineWidth = upper * 0.2;
  ctx.strokeStyle = tones.beakLight;
  ctx.stroke();
  ctx.fillStyle = tones.ink;
  ctx.beginPath();
  ctx.ellipse(length * 0.2, -upper * 0.36, 3.4, 2, -0.5, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = tones.ink;
  if (clench > 0.05 && spread <= 0.02) paintClench(ctx, beak, clench);
  ctx.restore();
}
