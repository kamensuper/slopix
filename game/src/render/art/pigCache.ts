/**
 * Resolution-aware layer cache for the static parts of the pigs (shaded body, helmets, crown).
 *
 * Pigs are painted live because their faces animate, but most of their pixels never change. Those
 * layers are rendered once per screen-scale bucket (a third of an octave apart, always rounded up
 * so the cached copy is only ever downsampled) and blitted under the current transform.
 */

export interface LayerBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PigLayer {
  canvas: HTMLCanvasElement;
  /** Context with the design-space transform applied; paint into it when `blank`. */
  ctx: CanvasRenderingContext2D;
  /** Pixels per design unit. */
  scale: number;
  ox: number;
  oy: number;
  blank: boolean;
  used: number;
}

const MAX_LAYERS = 192;
const PAD = 2;
const MIN_SCALE = 1 / 32;
const MAX_SCALE = 3;
const layers = new Map<string, PigLayer>();
let clock = 0;
const canCache = typeof document !== 'undefined';

/** Device pixels per design unit under the current transform (geometric mean of both axes). */
export function deviceScale(ctx: CanvasRenderingContext2D): number {
  if (typeof ctx.getTransform !== 'function') return 0;
  const m = ctx.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}

function bucket(k: number): number {
  const steps = Math.ceil(Math.log2(Math.max(k, MIN_SCALE)) * 3) / 3;
  return Math.min(MAX_SCALE, 2 ** steps);
}

function evict(): void {
  let oldestKey = '';
  let oldest = Infinity;
  for (const [key, layer] of layers) {
    if (layer.used < oldest) {
      oldest = layer.used;
      oldestKey = key;
    }
  }
  layers.delete(oldestKey);
}

/**
 * The cached layer `key` for device scale `k`, or null when caching is unavailable (then paint
 * live). A layer returned with `blank` set must be painted by the caller through `layer.ctx`.
 */
export function pigLayer(key: string, bounds: LayerBounds, k: number): PigLayer | null {
  if (!canCache || !(k > 0)) return null;
  const scale = bucket(k);
  const fullKey = `${key}@${scale.toFixed(4)}`;
  let layer = layers.get(fullKey);
  if (layer) {
    layer.used = ++clock;
    layer.blank = false;
    return layer;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(bounds.width * scale) + PAD * 2);
  canvas.height = Math.max(1, Math.ceil(bounds.height * scale) + PAD * 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const ox = -bounds.left * scale + PAD;
  const oy = -bounds.top * scale + PAD;
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  layer = { canvas, ctx, scale, ox, oy, blank: true, used: ++clock };
  if (layers.size >= MAX_LAYERS) evict();
  layers.set(fullKey, layer);
  return layer;
}

/** Draws a layer so that its design space lines up with the current transform. */
export function blitLayer(ctx: CanvasRenderingContext2D, layer: PigLayer): void {
  const inv = 1 / layer.scale;
  ctx.drawImage(layer.canvas, -layer.ox * inv, -layer.oy * inv, layer.canvas.width * inv, layer.canvas.height * inv);
}
