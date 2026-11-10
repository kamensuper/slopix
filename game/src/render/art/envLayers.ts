/**
 * Runtime of the environment: parallax backdrop, vector parallax layers, drifting clouds, the
 * world-anchored ground strip and foreground ambience.
 *
 * Performance notes (software-rasterised canvases are the worst case):
 *  - Alpha-blended full-width image blits are very expensive (~4 ns per pixel), while an opaque
 *    blit at an integer offset is a plain copy and solid path fills are cheap. So the sky and the
 *    farthest scenery are baked once into an oversized opaque canvas that slides at integer
 *    pixel offsets, and every nearer layer is a cached Path2D re-filled with flat colours.
 *  - Painterly cel shading of the layers comes from re-filling the same silhouette with small
 *    offsets (rim light along the ridges, shade on slopes facing away from the top-left sun).
 *  - No gradients are created per frame.
 */
import { CAMERA } from '../../core/config';
import type { ThemeId } from '../../core/types';
import { rgba } from './envKit';
import type { EnvView } from './types';

/** Layer units: the view height is 1000 units at zoom factor 1. */
export const LAYER_UNITS = 1000;

export interface LayerFill {
  path: Path2D;
  color: string;
  alpha?: number;
  /** Offset of this fill in layer units (cel-shading passes re-use one silhouette). */
  dx?: number;
  dy?: number;
}

export interface ParallaxLayer {
  /** Horizontal repeat in layer units; the paths must tile seamlessly over it. */
  tile: number;
  /** Fraction of the camera's horizontal motion the layer follows (0 = fixed, 1 = world). */
  px: number;
  /** Fraction of the ground line's vertical motion the layer follows. */
  pv: number;
  /** Vertical extent of the artwork in layer units (top < 0 above the baseline); below `bottom` the layer continues as a flat fill. */
  top: number;
  bottom: number;
  /** Baseline offset in layer units (negative = higher on screen). */
  lift?: number;
  fills: LayerFill[];
  /** Mist pooling towards the foot: colour, strength at `bottom`, and where it starts (layer units). */
  haze?: [color: string, alpha: number, from: number];
}

export interface CloudDef {
  lobes: [number, number, number][];
  /** Width of the cloud in layer units (for wrapping). */
  w: number;
  /** Start position as a fraction of the wrap range, altitude above the horizon in layer units. */
  x: number;
  alt: number;
  /** Drift in layer units per second, parallax factor and size. */
  speed: number;
  depth: number;
  scale: number;
  /** Vertical squash (< 1 gives long, flat streak clouds). */
  squash?: number;
}

export interface CloudStyle {
  shade: string;
  base: string;
  light: string;
  /** Opacity of the whole cloud (distant clouds can be fainter). */
  alpha: number;
  /** Optional streak clouds (desert cirrus): drawn as thin stretched ellipses. */
  flat?: boolean;
}

export interface SwayGroup {
  fills: LayerFill[];
  phase: number;
}

export interface GroundDef {
  /** Repeat of the ground tile in design units (100 per metre). */
  tile: number;
  /** Solid colours below the surface and the depth (design units) where `deep` starts. */
  soil: string;
  deep: string;
  deepAt: number;
  fills: LayerFill[];
  sway: SwayGroup[];
  /** Static fills drawn over the swaying tufts (flower heads ...). */
  over?: LayerFill[];
}

export interface BackdropFrame {
  /** Canvas extent in layer units: x in [0, w], y in [top, bottom] (horizon at y = 0). */
  w: number;
  top: number;
  bottom: number;
  /** Horizontal range that is on screen when the backdrop is centred. */
  viewL: number;
  viewR: number;
}

export type AmbientKind = 'pollen' | 'sand' | 'snow';

export interface SceneDef {
  /**
   * Paints sky and far scenery into the opaque backdrop. The context is in layer units, origin
   * at the left edge on the horizon, y down; the whole frame rectangle must be covered.
   */
  paintBackdrop(ctx: CanvasRenderingContext2D, frame: BackdropFrame, seed: number): void;
  backdropPx: number;
  backdropPv: number;
  layers: ParallaxLayer[];
  clouds: { style: CloudStyle; items: CloudDef[] };
  ground: GroundDef;
  ambient: AmbientKind;
}

interface Strip {
  canvas: HTMLCanvasElement;
  key: string;
  /** Flat colour continuing below the strip. */
  under: string;
}

interface LayerStrip {
  key: string;
  /** Tile width in device pixels. */
  width: number;
  /** Translucent skyline pieces (x, y in strip pixels). */
  chunks: { canvas: HTMLCanvasElement; x: number; y: number }[];
  /** Opaque part of the strip from row `bodyY` down. */
  body: HTMLCanvasElement;
  bodyY: number;
  under: string;
}

/** Copies a canvas 1:1 at an integer position, skipping rows at or below `clipBottom`. */
function blitRows(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, dx: number, dy: number, clipBottom: number): void {
  const top = Math.max(0, -dy);
  const rows = Math.min(img.height, clipBottom - dy) - top;
  if (rows <= 0) return;
  ctx.drawImage(img, 0, top, img.width, rows, dx, dy + top, img.width, rows);
}

const CHUNK = 512;
const ZOOM_TOLERANCE = 5e-4;
const BACK_MARGIN_V = 0.18;
/** Room above the ground line in the cached ground tile (design units): lip, blades, flowers. */
const GROUND_TOP = 40;
const MAX_PARTICLES = 72;
// Per particle: x, y, vx, vy, size, phase, kind/tint, spin
const STRIDE = 8;

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export class EnvRenderer {
  private backdrop: HTMLCanvasElement | null = null;
  private backKey = '';
  private mx = 0;
  private my = 0;
  private readonly parts = new Float32Array(MAX_PARTICLES * STRIDE);
  private partTheme: ThemeId | null = null;
  private partW = 0;
  private partH = 0;
  private lastTime = -1;
  private lastCamX = 0;
  private lastCamY = 0;
  private gust = 0;
  private seedCounter = 1;
  private readonly strips = new Map<ParallaxLayer, LayerStrip>();
  private readonly clouds = new Map<CloudDef, Strip>();
  private ground: Strip | null = null;
  private groundZoom = 0;
  private lastZoom = 0;

  constructor(private readonly scenes: (theme: ThemeId) => SceneDef) {}

  private horizon(view: EnvView): number {
    return view.height * (1 - CAMERA.groundBand);
  }

  // ------------------------------------------------------------------ sky, clouds, parallax layers

  drawSky(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView, dpr: number, seed: number): void {
    const scene = this.scenes(theme);
    const { width: W, height: H } = view;
    const horizon = this.horizon(view);
    const lift = Math.max(0, view.groundY - horizon);

    // 1. Opaque backdrop at an integer device-pixel offset.
    const key = `${theme}|${Math.round(W * dpr)}|${Math.round(H * dpr)}|${dpr}|${seed}|${view.worldWidth}`;
    if (key !== this.backKey) this.bakeBackdrop(scene, view, dpr, seed, key);
    const back = this.backdrop!;
    const shiftX = Math.max(-this.mx, Math.min(this.mx, (view.camX - view.worldWidth / 2) * view.zoom * scene.backdropPx));
    const shiftY = Math.min(this.my, lift * scene.backdropPv);
    const unit = H / LAYER_UNITS;
    const Hd = Math.round(H * dpr);
    const Wd = Math.round(W * dpr);

    // Plan the parallax strips first: every opaque layer body hides whatever lies below its top
    // edge in farther layers, so each farther draw is clipped there (the screen is covered
    // roughly once instead of four times). The ground covers everything below the ground line.
    const plans = scene.layers.map((layer) => {
      const strip = this.layerStrip(layer, H, dpr);
      const base = horizon + lift * layer.pv + (layer.lift ?? 0) * unit;
      const y = Math.round((base + layer.top * unit) * dpr);
      const offset = (-view.camX * view.zoom * layer.px - ((seed * 7919) % layer.tile) * unit) * dpr;
      return { strip, y, x0: Math.round(mod(offset, strip.width)) - strip.width, clip: Hd };
    });
    let cover = view.groundY < H + 40 ? Math.round((view.groundY + view.zoom * 0.2) * dpr) : Hd;
    for (let i = plans.length - 1; i >= 0; i--) {
      const p = plans[i]!;
      p.clip = Math.min(Hd, cover);
      cover = Math.min(cover, p.y + p.strip.bodyY);
    }

    // 1. Opaque backdrop at an integer device-pixel offset.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    blitRows(ctx, back, Math.round((-this.mx - shiftX) * dpr), Math.round((-this.my + shiftY) * dpr), Math.min(Hd, cover));

    // 2. Clouds.
    this.drawClouds(ctx, scene, view, dpr, horizon - lift * 0.14);

    // 3. Baked parallax strips, far to near, at integer device pixels (no resampling).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const { strip, y, x0, clip } of plans) {
      if (y >= clip) continue;
      for (let x = x0; x < Wd; x += strip.width) {
        if (x + strip.width <= 0) continue;
        for (const ch of strip.chunks) {
          const dx = x + ch.x;
          if (dx >= Wd || dx + ch.canvas.width <= 0) continue;
          blitRows(ctx, ch.canvas, dx, y + ch.y, clip);
        }
        blitRows(ctx, strip.body, x, y + strip.bodyY, clip);
      }
      const below = y + strip.bodyY + strip.body.height;
      if (below < clip) {
        ctx.fillStyle = strip.under;
        ctx.fillRect(0, below, Wd, clip - below);
      }
    }
  }

  /**
   * Paints a parallax layer once into a horizontally tileable strip at device resolution, then
   * splits it into an opaque body (fast copy) and cropped translucent chunks along the skyline.
   */
  private layerStrip(layer: ParallaxLayer, H: number, dpr: number): LayerStrip {
    const key = `${Math.round(H * dpr)}`;
    const cached = this.strips.get(layer);
    if (cached && cached.key === key) return cached;
    const unit = H / LAYER_UNITS;
    const canvas = document.createElement('canvas');
    // The canvas width is an exact whole number of pixels per tile so copies butt seamlessly.
    canvas.width = Math.max(1, Math.round(layer.tile * unit * dpr));
    canvas.height = Math.max(1, Math.ceil((layer.bottom - layer.top) * unit * dpr));
    const c = canvas.getContext('2d', { willReadFrequently: true })!;
    c.setTransform(canvas.width / layer.tile, 0, 0, unit * dpr, 0, -layer.top * unit * dpr);
    for (const f of layer.fills) {
      c.save();
      c.translate(f.dx ?? 0, f.dy ?? 0);
      c.globalAlpha = f.alpha ?? 1;
      c.fillStyle = f.color;
      c.fill(f.path);
      c.restore();
    }
    if (layer.haze) {
      // Mist pooling towards the foot of the layer (tints only the painted pixels).
      const [color, alpha, from] = layer.haze;
      const g = c.createLinearGradient(0, from, 0, layer.bottom);
      g.addColorStop(0, rgba(color, 0));
      g.addColorStop(1, rgba(color, alpha));
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = g;
      c.fillRect(-10, from, layer.tile + 20, layer.bottom - from);
      c.globalCompositeOperation = 'source-over';
    }
    const w = canvas.width;
    const h = canvas.height;
    const data = c.getImageData(0, 0, w, h).data;
    const alphaAt = (x: number, y: number) => data[(y * w + x) * 4 + 3]!;
    // Opaque body: the rows below the last row with any (sampled) transparency.
    let bodyY = 0;
    for (let y = h - 1; y >= 0 && !bodyY; y--) {
      for (let x = 0; x < w; x += 2) {
        if (alphaAt(x, y) < 255) {
          bodyY = y + 1;
          break;
        }
      }
    }
    bodyY = Math.min(bodyY, h - 1);
    const body = document.createElement('canvas');
    body.width = w;
    body.height = h - bodyY;
    const bc = body.getContext('2d', { alpha: false })!;
    bc.drawImage(canvas, 0, bodyY, w, h - bodyY, 0, 0, w, h - bodyY);
    // Translucent skyline chunks, each cropped to its first painted row.
    const chunks: LayerStrip['chunks'] = [];
    for (let x0 = 0; x0 < w; x0 += CHUNK) {
      const cw = Math.min(CHUNK, w - x0);
      let top = bodyY;
      for (let y = 0; y < bodyY && top === bodyY; y++) {
        for (let x = x0; x < x0 + cw; x++) {
          if (alphaAt(x, y) > 0) {
            top = y;
            break;
          }
        }
      }
      if (top >= bodyY) continue;
      const chunk = document.createElement('canvas');
      chunk.width = cw;
      chunk.height = bodyY - top;
      chunk.getContext('2d')!.drawImage(canvas, x0, top, cw, bodyY - top, 0, 0, cw, bodyY - top);
      chunks.push({ canvas: chunk, x: x0, y: top });
    }
    // Below the strip the layer continues as a flat fill of its bottom colour.
    const o = ((h - 1) * w + Math.floor(w / 2)) * 4;
    const strip: LayerStrip = { key, width: w, chunks, body, bodyY, under: `rgb(${data[o]},${data[o + 1]},${data[o + 2]})` };
    this.strips.set(layer, strip);
    return strip;
  }

  private bakeBackdrop(scene: SceneDef, view: EnvView, dpr: number, seed: number, key: string): void {
    const { width: W, height: H } = view;
    this.mx = Math.ceil(Math.min(W * 0.3, (view.worldWidth / 2 + 8) * CAMERA.maxZoom * scene.backdropPx));
    this.my = Math.ceil(H * BACK_MARGIN_V);
    const canvas = this.backdrop ?? document.createElement('canvas');
    canvas.width = Math.ceil((W + this.mx * 2) * dpr);
    canvas.height = Math.ceil((H + this.my) * dpr);
    const c = canvas.getContext('2d', { alpha: false })!;
    const unit = H / LAYER_UNITS;
    const horizon = this.horizon(view);
    c.setTransform(dpr * unit, 0, 0, dpr * unit, 0, dpr * (this.my + horizon));
    const wUnits = (W + this.mx * 2) / unit;
    scene.paintBackdrop(
      c,
      { w: wUnits, top: -(this.my + horizon) / unit, bottom: (H - horizon) / unit, viewL: this.mx / unit, viewR: (this.mx + W) / unit },
      seed,
    );
    this.backdrop = canvas;
    this.backKey = key;
  }

  private drawClouds(ctx: CanvasRenderingContext2D, scene: SceneDef, view: EnvView, dpr: number, horizon: number): void {
    const { style, items } = scene.clouds;
    const unit = view.height / LAYER_UNITS;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const c of items) {
      const sprite = this.cloudSprite(c, style, unit, dpr);
      const s = unit * c.scale;
      const half = (c.w / 2) * s;
      const range = view.width + half * 2 + 40;
      const x = mod(c.x * range + view.time * c.speed * s - view.camX * view.zoom * c.depth, range) - half - 20;
      const y = horizon - c.alt * unit;
      ctx.drawImage(sprite.canvas, Math.round((x - half) * dpr) - 2, Math.round(y * dpr) - sprite.canvas.height + 2);
    }
  }

  private cloudSprite(c: CloudDef, style: CloudStyle, unit: number, dpr: number): Strip {
    const key = `${unit * dpr}`;
    let sprite = this.clouds.get(c);
    if (sprite && sprite.key === key) return sprite;
    const s = unit * c.scale * dpr;
    const sy = s * (c.squash ?? 1);
    const top = Math.min(...c.lobes.map(([, y, r]) => y - r)) - 6;
    const canvas = sprite?.canvas ?? document.createElement('canvas');
    canvas.width = Math.ceil((c.w + 12) * s) + 4;
    canvas.height = Math.ceil(-top * sy) + 4;
    const g = canvas.getContext('2d')!;
    g.setTransform(s, 0, 0, sy, (c.w / 2) * s + 2, canvas.height - 2);
    const path = cloudPaths(c);
    g.fillStyle = style.shade;
    g.fill(path.shade);
    g.fillStyle = style.base;
    g.fill(path.base);
    g.fillStyle = style.light;
    g.fill(path.light);
    // Uniform translucency for the whole cloud (no darker overlaps between the passes).
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = `rgba(0,0,0,${style.alpha})`;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = 'source-over';
    sprite = { canvas, key, under: '' };
    this.clouds.set(c, sprite);
    return sprite;
  }

  // ------------------------------------------------------------------ ground strip

  drawGround(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView, dpr: number): void {
    const { width: W, height: H, groundY } = view;
    if (groundY >= H + 40) return;
    const g = this.scenes(theme).ground;
    const k = view.zoom / 100;
    // Static ground is baked into one world-anchored tile per zoom level and blitted at
    // integer device pixels; it is only re-painted while the zoom is changing.
    const tile = this.groundTile(theme, g, view, dpr);
    const tileM = g.tile / 100;
    const left = view.camX - W / 2 / view.zoom;
    const first = Math.floor(left / tileM);
    const last = Math.floor((view.camX + W / 2 / view.zoom) / tileM);
    const Wd = Math.round(W * dpr);
    const Hd = Math.round(H * dpr);
    const ratio = view.zoom / this.groundZoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let bottom: number;
    if (Math.abs(ratio - 1) < ZOOM_TOLERANCE) {
      const y = Math.round((groundY - GROUND_TOP * k) * dpr);
      let x = Math.round(((first * tileM - view.camX) * view.zoom + W / 2) * dpr);
      for (let i = first; i <= last && x < Wd; i++, x += tile.canvas.width) ctx.drawImage(tile.canvas, x, y);
      bottom = y + tile.canvas.height;
    } else {
      // Mid zoom transition: stretch the cached tile with nearest-neighbour sampling (about six
      // times cheaper than smoothed resampling); it is re-baked once the zoom settles.
      ctx.imageSmoothingEnabled = false;
      const y = (groundY - GROUND_TOP * k) * dpr;
      const w = tile.canvas.width * ratio;
      const h = tile.canvas.height * ratio;
      for (let i = first; i <= last; i++) ctx.drawImage(tile.canvas, ((i * tileM - view.camX) * view.zoom + W / 2) * dpr, y, w + 1, h);
      ctx.imageSmoothingEnabled = true;
      bottom = Math.floor(y + h);
    }
    if (bottom < Hd) {
      ctx.fillStyle = g.deep;
      ctx.fillRect(0, bottom, Wd, Hd - bottom);
    }
    // Wind-swept tufts stay vector so they can sway.
    const sway = !view.reducedMotion;
    if (view.zoom < 18) return;
    for (let i = first; i <= last; i++) {
      const sx = (i * tileM - view.camX) * view.zoom + W / 2;
      for (const group of g.sway) {
        let skew = 0;
        if (sway) {
          const t = view.time;
          const wx = i * tileM;
          // Wind: a slow travelling gust plus a quick flutter, leaning mostly downwind.
          const gust = 0.5 + 0.5 * Math.sin(t * 0.7 - wx * 0.08);
          skew = 0.1 * gust * gust + 0.06 * Math.sin(t * 2.6 + group.phase + wx * 0.3) + 0.03;
        }
        this.fillTile(ctx, group.fills, dpr, k, sx, groundY, skew);
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private groundTile(theme: ThemeId, g: GroundDef, view: EnvView, dpr: number): Strip {
    const k = view.zoom / 100;
    // Deepest ground ever visible: the camera keeps the ground line above the bottom band (+ shake).
    const depthPx = view.height * CAMERA.groundBand + 40;
    const key = `${theme}|${dpr}|${depthPx}`;
    let tile = this.ground;
    const settled = Math.abs(this.lastZoom / view.zoom - 1) < 2e-4;
    this.lastZoom = view.zoom;
    if (tile && tile.key === key) {
      // The eased camera zoom creeps towards its target forever: within a 0.05 % tolerance the
      // tile is blitted 1:1 (under ~1 px of drift across a tile); while zooming it is stretched,
      // and only re-painted once the zoom settles or drifts far.
      const off = Math.abs(view.zoom / this.groundZoom - 1);
      if (off < ZOOM_TOLERANCE || (!settled && off < 0.3)) return tile;
    }
    this.groundZoom = view.zoom;
    const canvas = tile?.canvas ?? document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((g.tile / 100) * view.zoom * dpr));
    canvas.height = Math.max(1, Math.ceil((GROUND_TOP * k + depthPx) * dpr));
    const c = canvas.getContext('2d')!;
    c.setTransform(canvas.width / g.tile, 0, 0, k * dpr, 0, GROUND_TOP * k * dpr);
    const depth = depthPx / k;
    c.fillStyle = g.soil;
    c.fillRect(-10, 0, g.tile + 20, Math.min(depth, g.deepAt));
    if (depth > g.deepAt) {
      c.fillStyle = g.deep;
      c.fillRect(-10, g.deepAt, g.tile + 20, depth - g.deepAt);
    }
    for (const f of g.over ? [...g.fills, ...g.over] : g.fills) {
      c.save();
      c.translate(f.dx ?? 0, f.dy ?? 0);
      c.globalAlpha = f.alpha ?? 1;
      c.fillStyle = f.color;
      c.fill(f.path);
      c.restore();
    }
    tile = { canvas, key, under: g.deep };
    this.ground = tile;
    return tile;
  }

  private fillTile(ctx: CanvasRenderingContext2D, fills: LayerFill[], dpr: number, k: number, sx: number, gy: number, skew: number): void {
    for (const f of fills) {
      ctx.setTransform(dpr * k, 0, dpr * k * skew, dpr * k, dpr * (sx + (f.dx ?? 0) * k), dpr * (gy + (f.dy ?? 0) * k));
      ctx.globalAlpha = f.alpha ?? 1;
      ctx.fillStyle = f.color;
      ctx.fill(f.path);
    }
  }

  // ------------------------------------------------------------------ foreground ambience

  drawForeground(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView, dpr: number): void {
    if (view.reducedMotion) {
      this.lastTime = -1;
      return;
    }
    const kind = this.scenes(theme).ambient;
    const { width: W, height: H } = view;
    if (this.partTheme !== theme || Math.abs(this.partW - W) > 1 || Math.abs(this.partH - H) > 1) {
      this.spawnAll(kind, W, H);
      this.partTheme = theme;
      this.partW = W;
      this.partH = H;
      this.lastTime = -1;
    }
    let dt = this.lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, view.time - this.lastTime));
    // Foreground motes sit in front of the playfield: they slide a little faster than the world.
    const panX = this.lastTime < 0 ? 0 : (view.camX - this.lastCamX) * view.zoom * 1.25;
    const panY = this.lastTime < 0 ? 0 : (view.camY - this.lastCamY) * view.zoom * 1.25;
    if (Math.abs(panX) > W * 0.5 || Math.abs(panY) > H * 0.5) dt = 0;
    this.lastTime = view.time;
    this.lastCamX = view.camX;
    this.lastCamY = view.camY;
    this.update(kind, dt, view.time, W, H, panX, panY);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw(ctx, kind, view.time, dpr);
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private rand(): number {
    // Cheap LCG; ambience does not need to be deterministic across runs.
    this.seedCounter = (Math.imul(this.seedCounter, 1664525) + 1013904223) >>> 0;
    return this.seedCounter / 4294967296;
  }

  private count(kind: AmbientKind): number {
    return kind === 'snow' ? MAX_PARTICLES : kind === 'sand' ? 46 : 34;
  }

  private spawnAll(kind: AmbientKind, W: number, H: number): void {
    const n = this.count(kind);
    for (let i = 0; i < n; i++) this.spawn(kind, i, W, H, true);
  }

  private spawn(kind: AmbientKind, i: number, W: number, H: number, anywhere: boolean): void {
    const p = this.parts;
    const o = i * STRIDE;
    const r = () => this.rand();
    const depth = r(); // 0 far .. 1 near
    p[o + 4] = depth;
    p[o + 5] = r() * 6.283;
    p[o + 7] = (r() - 0.5) * 4;
    if (kind === 'snow') {
      p[o] = r() * W;
      p[o + 1] = anywhere ? r() * H : -10;
      p[o + 2] = -6 - depth * 10;
      p[o + 3] = 16 + depth * 34;
      p[o + 6] = 0;
    } else if (kind === 'sand') {
      p[o] = anywhere ? r() * W : W + 10;
      p[o + 1] = H * (0.25 + r() * 0.75);
      p[o + 2] = -(40 + depth * 90);
      p[o + 3] = (r() - 0.5) * 8;
      p[o + 6] = r() < 0.5 ? 0 : 1;
    } else {
      // Pollen motes drifting on the breeze; every seventh particle is a falling leaf.
      const leaf = i % 7 === 3 ? 1 : 0;
      p[o] = r() * W;
      p[o + 1] = anywhere ? r() * H : leaf ? -16 : H * (0.2 + r() * 0.8);
      p[o + 2] = 8 + depth * 14 + leaf * 10;
      p[o + 3] = leaf ? 26 + depth * 22 : -(2 + r() * 6);
      p[o + 6] = leaf ? 1 + Math.floor(r() * 2) : 0;
    }
  }

  private update(kind: AmbientKind, dt: number, time: number, W: number, H: number, panX: number, panY: number): void {
    const n = this.count(kind);
    const p = this.parts;
    if (kind === 'sand') {
      // Occasional gusts: a 2.5 s swell roughly every 9 s.
      const cyc = mod(time, 9.3);
      this.gust = cyc > 6.8 ? Math.sin(((cyc - 6.8) / 2.5) * Math.PI) : 0;
    } else {
      this.gust = 0;
    }
    const boost = 1 + this.gust * 2.6;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const depth = p[o + 4]!;
      const par = 0.55 + depth * 0.7;
      let x = p[o]! - panX * par;
      let y = p[o + 1]! + panY * par;
      const wob = Math.sin(time * (0.9 + depth) + p[o + 5]!);
      if (kind === 'snow') {
        x += (p[o + 2]! + wob * 14) * dt;
        y += p[o + 3]! * dt;
      } else if (kind === 'sand') {
        x += p[o + 2]! * boost * dt;
        y += (p[o + 3]! + wob * 10 - this.gust * 12) * dt;
      } else {
        x += (p[o + 2]! + wob * 9) * dt;
        y += (p[o + 3]! + Math.cos(time * 1.3 + p[o + 5]!) * 7) * dt;
      }
      p[o] = x;
      p[o + 1] = y;
      const margin = 24;
      if (y > H + margin || x < -margin * 2 || x > W + margin * 2 || y < -margin * 3) {
        this.spawn(kind, i, W, H, false);
        // Re-enter from the side the camera is moving towards so the field never empties.
        if (x < -margin * 2) p[o] = W + margin;
        else if (x > W + margin * 2) p[o] = -margin;
        else if (kind !== 'sand') p[o] = this.rand() * W;
        if (y < -margin * 3) p[o + 1] = H + margin * 0.5;
        if (kind === 'pollen' && p[o + 6]! === 0 && y > H + margin) p[o + 1] = -margin * 0.5;
      }
    }
  }

  private draw(ctx: CanvasRenderingContext2D, kind: AmbientKind, time: number, dpr: number): void {
    const n = this.count(kind);
    const p = this.parts;
    if (kind === 'snow') {
      // Two depth buckets: small faint far flakes, larger soft near flakes.
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const o = i * STRIDE;
          const d = p[o + 4]!;
          if ((d > 0.6 ? 1 : 0) !== pass) continue;
          const r = 1.1 + d * 2.6;
          ctx.moveTo(p[o]! + r, p[o + 1]!);
          ctx.arc(p[o]!, p[o + 1]!, r, 0, 6.2832);
        }
        ctx.globalAlpha = pass ? 0.78 : 0.55;
        ctx.fillStyle = pass ? '#ffffff' : '#eef5ff';
        ctx.fill();
      }
    } else if (kind === 'sand') {
      const a = 0.22 + this.gust * 0.3;
      for (let tint = 0; tint < 2; tint++) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const o = i * STRIDE;
          if (p[o + 6]! !== tint) continue;
          const d = p[o + 4]!;
          const len = 2 + d * 4 + this.gust * (6 + d * 16);
          ctx.rect(p[o]!, p[o + 1]!, len, 0.9 + d * 1.1);
        }
        ctx.globalAlpha = a;
        ctx.fillStyle = tint ? '#fff1cf' : '#e9b56a';
        ctx.fill();
      }
      if (this.gust > 0.05) this.drawWisps(ctx, time);
    } else {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const o = i * STRIDE;
        if (p[o + 6]! !== 0) continue;
        const d = p[o + 4]!;
        const r = 0.9 + d * 1.6;
        ctx.moveTo(p[o]! + r, p[o + 1]!);
        ctx.arc(p[o]!, p[o + 1]!, r, 0, 6.2832);
      }
      // Twinkle as a group: cheap and reads as sunlit pollen.
      ctx.globalAlpha = 0.45 + 0.15 * Math.sin(time * 1.7);
      ctx.fillStyle = '#fff6c8';
      ctx.fill();
      for (let i = 0; i < n; i++) {
        const o = i * STRIDE;
        const leaf = p[o + 6]!;
        if (leaf === 0) continue;
        const d = p[o + 4]!;
        const size = 4 + d * 4;
        const ang = p[o + 5]! + time * p[o + 7]! * 0.6;
        const flip = Math.cos(time * 2.2 + p[o + 5]!);
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        ctx.setTransform(dpr * c * size, dpr * s * size, -dpr * s * size * flip, dpr * c * size * flip, dpr * p[o]!, dpr * p[o + 1]!);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = leaf === 1 ? '#8fcf4a' : '#e8b04a';
        ctx.fill(leafPath());
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  private drawWisps(ctx: CanvasRenderingContext2D, time: number): void {
    const W = this.partW;
    const H = this.partH;
    ctx.globalAlpha = this.gust * 0.22;
    ctx.strokeStyle = '#fff3d6';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const y = H * (0.45 + i * 0.1) + Math.sin(time + i) * 10;
      const x = mod(W - time * (420 + i * 60) + i * 377, W + 600) - 300;
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 80, y - 14, x + 160, y + 10, x + 260 + i * 20, y - 6);
    }
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ cached small paths

let leaf: Path2D | null = null;
function leafPath(): Path2D {
  if (!leaf) {
    leaf = new Path2D();
    leaf.moveTo(-1, 0);
    leaf.quadraticCurveTo(-0.2, -0.75, 1, 0);
    leaf.quadraticCurveTo(-0.2, 0.75, -1, 0);
    leaf.closePath();
  }
  return leaf;
}

const cloudCache = new WeakMap<CloudDef, { shade: Path2D; base: Path2D; light: Path2D }>();
function cloudPaths(c: CloudDef): { shade: Path2D; base: Path2D; light: Path2D } {
  let paths = cloudCache.get(c);
  if (!paths) {
    const shade = new Path2D();
    const base = new Path2D();
    const light = new Path2D();
    const lobes = c.lobes;
    const minX = Math.min(...lobes.map(([x, , r]) => x - r));
    const maxX = Math.max(...lobes.map(([x, , r]) => x + r));
    const rMin = Math.min(...lobes.map(([, , r]) => r));
    for (const [x, y, r] of lobes) {
      shade.moveTo(x + r, y);
      shade.arc(x, y, r, 0, Math.PI * 2);
      // Base: lobes lifted a little leave a cool shaded belly and lower-right rim.
      const bx = x - r * 0.06;
      const by = y - r * 0.2;
      base.moveTo(bx + r * 0.94, by);
      base.arc(bx, by, r * 0.94, 0, Math.PI * 2);
      // Light: sunlit caps on the upper-left of the upper lobes.
      if (y + r < -rMin * 0.6 || r > rMin * 1.6) {
        const lx = x - r * 0.24;
        const ly = y - r * 0.34;
        light.moveTo(lx + r * 0.58, ly);
        light.arc(lx, ly, r * 0.58, 0, Math.PI * 2);
      }
    }
    // Flat belly: a rounded slab under the lobes.
    shade.rect(minX + rMin, -rMin, maxX - minX - rMin * 2, rMin);
    base.rect(minX + rMin, -rMin * 1.2, maxX - minX - rMin * 2.2, rMin * 0.4);
    paths = { shade, base, light };
    cloudCache.set(c, paths);
  }
  return paths;
}

/** Utility for scenes: a translucent fill of a path. */
export function fill(path: Path2D, color: string, alpha?: number, dx?: number, dy?: number): LayerFill {
  return { path, color, alpha, dx, dy };
}

/** Utility: an rgba string from a hex colour (re-exported for scene modules). */
export const tint = rgba;
