/**
 * Sprite cache: procedural artwork is painted once into an off-screen canvas and re-used every
 * frame. Entries are evicted least-recently-used first once a pixel budget is exceeded.
 */
export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Pixels per design unit the sprite was painted at. */
  scale: number;
  /** Position of the design-space origin inside the canvas, in pixels. */
  ox: number;
  oy: number;
  lastUsed: number;
}

const PADDING = 2;
const MAX_SIDE = 2048;

export class SpriteCache {
  private readonly sprites = new Map<string, Sprite>();
  private pixels = 0;
  private frame = 0;

  constructor(private readonly budgetPixels = 28_000_000) {}

  get size(): number {
    return this.sprites.size;
  }

  /**
   * Returns the cached sprite for `key`, painting it first if needed.
   * (left, top, width, height) is the design-space rectangle the artwork occupies (y down);
   * `scale` is the resolution in pixels per design unit.
   */
  get(
    key: string,
    left: number,
    top: number,
    width: number,
    height: number,
    scale: number,
    paint: (ctx: CanvasRenderingContext2D) => void,
  ): Sprite {
    const cached = this.sprites.get(key);
    if (cached) {
      cached.lastUsed = this.frame;
      return cached;
    }
    const fit = Math.min(1, (MAX_SIDE - PADDING * 2) / (Math.max(width, height) * scale));
    const s = scale * fit;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * s) + PADDING * 2);
    canvas.height = Math.max(1, Math.ceil(height * s) + PADDING * 2);
    const ctx = canvas.getContext('2d');
    const sprite: Sprite = { canvas, scale: s, ox: -left * s + PADDING, oy: -top * s + PADDING, lastUsed: this.frame };
    if (ctx) {
      ctx.translate(sprite.ox, sprite.oy);
      ctx.scale(s, s);
      paint(ctx);
    }
    this.sprites.set(key, sprite);
    this.pixels += canvas.width * canvas.height;
    return sprite;
  }

  /** Call once per rendered frame: advances the usage clock and trims the cache if it is over budget. */
  endFrame(): void {
    this.frame++;
    if (this.pixels <= this.budgetPixels) return;
    const byAge = [...this.sprites.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, sprite] of byAge) {
      if (this.pixels <= this.budgetPixels * 0.7 || sprite.lastUsed >= this.frame - 1) break;
      this.pixels -= sprite.canvas.width * sprite.canvas.height;
      // Shrinking the canvas releases its backing store right away.
      sprite.canvas.width = 0;
      sprite.canvas.height = 0;
      this.sprites.delete(key);
    }
  }

  clear(): void {
    for (const sprite of this.sprites.values()) {
      sprite.canvas.width = 0;
      sprite.canvas.height = 0;
    }
    this.sprites.clear();
    this.pixels = 0;
  }
}
