/**
 * Shared pieces of the pig artwork: palettes, a gradient cache and the body painter.
 *
 * Pigs are painted live every frame, so gradients are created once per (context, palette) and
 * reused: a CanvasGradient lives in user space and follows whatever transform is current when it
 * is used, which is exactly what character-space painting needs.
 */
import { TAU } from '../../core/math';
import { INK, PIG_COLORS } from '../../core/palette';
import type { PigVariant } from '../../core/types';
import { OUTLINE, traceBlob, type Blob, type BodyTones, type EyeTones } from './charParts';

// ---------------------------------------------------------------- gradient cache

const gradientCache = new WeakMap<CanvasRenderingContext2D, WeakMap<object, Map<string, CanvasGradient>>>();

/** Returns the gradient `key` built for `tones` on this context, creating it on first use. */
export function cachedGradient(
  ctx: CanvasRenderingContext2D,
  tones: object,
  key: string,
  make: (ctx: CanvasRenderingContext2D) => CanvasGradient,
): CanvasGradient {
  let perTones = gradientCache.get(ctx);
  if (!perTones) {
    perTones = new WeakMap();
    gradientCache.set(ctx, perTones);
  }
  let map = perTones.get(tones);
  if (!map) {
    map = new Map();
    perTones.set(tones, map);
  }
  let gradient = map.get(key);
  if (!gradient) {
    gradient = make(ctx);
    map.set(key, gradient);
  }
  return gradient;
}

// ---------------------------------------------------------------- palettes

export interface PigTones extends BodyTones, EyeTones {
  snout: string;
  snoutHi: string;
  snoutLo: string;
  nostril: string;
  earInner: string;
  brow: string;
  crease: string;
  mouth: string;
  tongue: string;
  tooth: string;
  blush: string;
  bruise: string;
  blackEye: string;
  sweat: string;
  bandage: string;
  bandagePad: string;
  star: string;
}

const FACE = {
  ink: INK,
  eyeWhite: '#ffffff',
  pupil: '#1b120f',
  gloss: '#ffffffb8',
  mouth: '#5b1f24',
  tongue: '#f27d8c',
  tooth: '#fffbea',
  blush: '#ff8f7a59',
  bruise: '#6a4a9e55',
  blackEye: '#3f2d5ccc',
  sweat: '#c8ecff',
  bandage: '#f4dcae',
  bandagePad: '#e2bd84',
  star: '#ffd94a',
} as const;

const BASE: PigTones = {
  ...FACE,
  hi: '#c8f191',
  body: PIG_COLORS.body,
  lo: '#62ad31',
  shade: '#4b952299',
  rim: '#e6ffb880',
  lid: '#7cc23f',
  snout: PIG_COLORS.snout,
  snoutHi: '#d6f8a8',
  snoutLo: '#7cc044',
  nostril: PIG_COLORS.nostril,
  earInner: '#5aa52e',
  brow: '#3b6f1f',
  crease: '#4f8f2a',
};

export const PIG_TONES: Record<PigVariant, PigTones> = {
  small: { ...BASE, hi: '#d9f9a4', body: '#9fdc5c', lo: '#6cbb3a', lid: '#8bce4c', snout: '#b6ec7c', snoutHi: '#e4fbbe', snoutLo: '#88cc52', rim: '#f0ffc890' },
  medium: BASE,
  large: {
    ...BASE,
    hi: '#b8e17e',
    body: '#80c046',
    lo: '#4e9128',
    shade: '#3f822099',
    lid: '#6daf38',
    snout: '#97d460',
    snoutHi: '#c6ee95',
    snoutLo: '#6aae3a',
    brow: '#2f5c18',
    crease: '#43801f',
  },
  helmet: { ...BASE, hi: '#c2ee88', body: '#8ccd4b', lo: '#5ca72e' },
  armored: { ...BASE, hi: '#c5ef8c', body: '#8ed04e', lo: '#5eaa2f' },
  king: { ...BASE, hi: '#cff59a', body: '#95d752', lo: '#5aa82c', lid: '#80c442', snout: '#abe672', snoutHi: '#dcfab2' },
};

export interface MetalTones {
  ink: string;
  hi: string;
  body: string;
  lo: string;
  dark: string;
  spec: string;
  rivet: string;
  rivetHi: string;
  hole: string;
  scratch: string;
}

export const IRON: MetalTones = {
  ink: INK,
  hi: '#dfe6ea',
  body: '#9aa8b2',
  lo: '#5c6973',
  dark: '#46515a',
  spec: '#ffffffe0',
  rivet: '#b9c4cc',
  rivetHi: '#f2f6f8',
  hole: '#2a2f35',
  scratch: '#e9eff2b0',
};

export const STEEL: MetalTones = {
  ink: INK,
  hi: '#eef3f7',
  body: '#b3c0cc',
  lo: '#6b7a89',
  dark: '#505d6b',
  spec: '#ffffffee',
  rivet: '#d5a640',
  rivetHi: '#fff0b0',
  hole: '#262b31',
  scratch: '#ffffffa8',
};

export interface RoyalTones {
  ink: string;
  gold: string;
  goldHi: string;
  goldLo: string;
  goldDark: string;
  ruby: string;
  rubyHi: string;
  sapphire: string;
  sapphireHi: string;
  pearl: string;
  velvet: string;
  velvetLo: string;
  velvetHi: string;
  ermine: string;
  ermineShade: string;
  ermineTail: string;
  stache: string;
  stacheHi: string;
  stacheLo: string;
  plume: string;
  plumeLo: string;
  leather: string;
  leatherLo: string;
  buckle: string;
}

export const ROYAL: RoyalTones = {
  ink: INK,
  gold: '#ffc93a',
  goldHi: '#fff1a6',
  goldLo: '#e39614',
  goldDark: '#b86d0c',
  ruby: '#e2304a',
  rubyHi: '#ffb3bf',
  sapphire: '#3f8fe8',
  sapphireHi: '#c4e4ff',
  pearl: '#fff8ea',
  velvet: '#c42a3a',
  velvetLo: '#8a1626',
  velvetHi: '#e8566a',
  ermine: '#fffaf0',
  ermineShade: '#dcd3c4',
  ermineTail: '#2b1a12',
  stache: '#8a5a2b',
  stacheHi: '#c48a4e',
  stacheLo: '#5e3a18',
  plume: '#e04a36',
  plumeLo: '#a82a22',
  leather: '#8a5a32',
  leatherLo: '#5f3b1e',
  buckle: '#e8c25a',
};

// ---------------------------------------------------------------- body

const INK_SHIFT_X = 1.3;
const INK_SHIFT_Y = 1.8;

/**
 * Same contract as charParts.beginBody (ink, gradient fill, leaves the context clipped to the
 * body; pair with endBody) but with a cached gradient.
 */
export function beginPigBody(ctx: CanvasRenderingContext2D, blob: Blob, tones: BodyTones): void {
  ctx.beginPath();
  traceBlob(ctx, blob, INK_SHIFT_X, INK_SHIFT_Y);
  ctx.lineWidth = OUTLINE * 2;
  ctx.strokeStyle = tones.ink;
  ctx.stroke();

  ctx.beginPath();
  traceBlob(ctx, blob);
  ctx.fillStyle = cachedGradient(ctx, tones, 'body', (c) => {
    const gradient = c.createRadialGradient(-38, -50, 6, -6, -6, 142);
    gradient.addColorStop(0, tones.hi);
    gradient.addColorStop(0.5, tones.body);
    gradient.addColorStop(1, tones.lo);
    return gradient;
  });
  ctx.fill();
  ctx.save();
  ctx.clip();
}

/** Five-pointed cartoon star, used for the dizzy stars. */
export function traceStar(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, spin: number): void {
  const inner = outer * 0.48;
  for (let i = 0; i < 10; i++) {
    const angle = spin - Math.PI / 2 + (i / 10) * TAU;
    const radius = i % 2 === 0 ? outer : inner;
    if (i === 0) ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    else ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
}

/** Small round rivet with a highlight; `missing` leaves an empty hole. */
export function paintRivet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: MetalTones, missing: boolean): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  if (missing) {
    ctx.fillStyle = t.hole;
    ctx.fill();
    return;
  }
  ctx.fillStyle = t.rivet;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.fillStyle = t.rivetHi;
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.34, r * 0.38, 0, TAU);
  ctx.fill();
}
