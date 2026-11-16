/**
 * Shared pieces of the foe artwork: palettes, a gradient cache and the body painter.
 *
 * Foes are painted live every frame, so gradients are created once per (context, palette) and
 * reused: a CanvasGradient lives in user space and follows whatever transform is current when it
 * is used, which is exactly what character-space painting needs.
 */
import { TAU } from '../../core/math';
import { INK, FOE_COLORS } from '../../core/palette';
import type { FoeVariant } from '../../core/types';
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

export interface FoeTones extends BodyTones, EyeTones {
  snout: string;
  snoutHi: string;
  snoutLo: string;
  nostril: string;
  earInner: string;
  brow: string;
  crease: string;
  muzzle: string;
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

const BASE: FoeTones = {
  ...FACE,
  hi: '#b3c2d6',
  body: FOE_COLORS.body,
  lo: '#55647c',
  shade: '#3b485e99',
  rim: '#e2ecf880',
  lid: '#6a7a92',
  snout: FOE_COLORS.snout,
  snoutHi: '#ffd9de',
  snoutLo: '#e48a9b',
  nostril: FOE_COLORS.nostril,
  earInner: '#f0a3b0',
  brow: '#2e3848',
  crease: '#4d5b72',
  muzzle: '#eef3f94d',
};

export const FOE_TONES: Record<FoeVariant, FoeTones> = {
  small: { ...BASE, hi: '#c6d3e3', body: '#8d9db4', lo: '#63728b', lid: '#7c8ca4', rim: '#eef5fd90' },
  medium: BASE,
  large: { ...BASE, hi: '#9eaec4', body: '#66768e', lo: '#3f4c62', shade: '#2e394c99', lid: '#58677e', brow: '#222a38', crease: '#3c485c' },
  helmet: { ...BASE, hi: '#b8c6d8', body: '#7888a0', lo: '#526078' },
  armored: { ...BASE, hi: '#bac8da', body: '#7a8aa2', lo: '#54627a' },
  king: { ...BASE, hi: '#c0cbe0', body: '#8490ad', lo: '#55607f', lid: '#6f7b98' },
  shield: { ...BASE, hi: '#b0c0d2', body: '#72839a', lo: '#4f5d74' },
  sapper: { ...BASE, hi: '#c9bfc4', body: '#8f8088', lo: '#62555e', shade: '#42384099', lid: '#7c6e76', brow: '#30262c', crease: '#584c54' },
  floater: { ...BASE, hi: '#cfdcea', body: '#98a8be', lo: '#6c7b94', lid: '#8696ac', rim: '#f2f8ff90' },
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
export function beginFoeBody(ctx: CanvasRenderingContext2D, blob: Blob, tones: BodyTones): void {
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

/**
 * A row of round rivets with highlights, batched into a few paths. `rivets` is flattened
 * (x, y, r) triples; rivets whose index bit is set in `missing` are empty holes.
 */
export function paintRivets(ctx: CanvasRenderingContext2D, rivets: readonly number[], t: MetalTones, missing = 0): void {
  ctx.beginPath();
  let holes = false;
  for (let i = 0, n = 0; i < rivets.length; i += 3, n++) {
    if (missing & (1 << n)) {
      holes = true;
      continue;
    }
    ctx.moveTo(rivets[i] + rivets[i + 2], rivets[i + 1]);
    ctx.arc(rivets[i], rivets[i + 1], rivets[i + 2], 0, TAU);
  }
  ctx.fillStyle = t.rivet;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0, n = 0; i < rivets.length; i += 3, n++) {
    if (missing & (1 << n)) continue;
    const r = rivets[i + 2];
    ctx.moveTo(rivets[i] - r * 0.32 + r * 0.38, rivets[i + 1] - r * 0.34);
    ctx.arc(rivets[i] - r * 0.32, rivets[i + 1] - r * 0.34, r * 0.38, 0, TAU);
  }
  ctx.fillStyle = t.rivetHi;
  ctx.fill();
  if (!holes) return;
  ctx.beginPath();
  for (let i = 0, n = 0; i < rivets.length; i += 3, n++) {
    if (!(missing & (1 << n))) continue;
    ctx.moveTo(rivets[i] + rivets[i + 2], rivets[i + 1]);
    ctx.arc(rivets[i], rivets[i + 1], rivets[i + 2], 0, TAU);
  }
  ctx.fillStyle = t.hole;
  ctx.fill();
}
