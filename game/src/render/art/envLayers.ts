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
  /** How strongly the layer scales with camera zoom (exponent). */
  zoomK: number;
  /** Baseline offset in layer units (negative = higher on screen). */
  lift?: number;
  fills: LayerFill[];
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

export type AmbientKind = 'pollen' | 'sand' | 'snow';

export interface SceneDef {
  /**
   * Paints sky and far scenery into the opaque backdrop. The context is in layer units, origin
   * at the left edge on the horizon, y down; the rectangle [0, w] x [top, bottom] must be covered.
   */
  paintBackdrop(ctx: CanvasRenderingContext2D, w: number, top: number, bottom: number, seed: number): void;
  backdropPx: number;
  backdropPv: number;
  layers: ParallaxLayer[];
  clouds: { style: CloudStyle; items: CloudDef[] };
  ground: GroundDef;
  ambient: AmbientKind;
}

const BACK_MARGIN_V = 0.18;
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(back, Math.round((-this.mx - shiftX) * dpr), Math.round((-this.my + shiftY) * dpr));

    // 2. Clouds.
    this.drawClouds(ctx, scene, view, dpr, horizon - lift * 0.14);

    // 3. Vector parallax layers, far to near.
    const unit = H / LAYER_UNITS;
    const zRef = H / 13;
    for (const layer of scene.layers) {
      const s = unit * Math.min(1.45, Math.max(0.72, Math.pow(view.zoom / zRef, layer.zoomK)));
      const base = horizon + lift * layer.pv + (layer.lift ?? 0) * s;
      const tileW = layer.tile * s;
      const offset = -view.camX * view.zoom * layer.px - ((seed * 7919) % layer.tile) * s;
      let x = mod(offset, tileW) - tileW;
      for (; x < W; x += tileW) {
        if (x + tileW < 0) continue;
        for (const f of layer.fills) {
          ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (x + (f.dx ?? 0) * s), dpr * (base + (f.dy ?? 0) * s));
          ctx.globalAlpha = f.alpha ?? 1;
          ctx.fillStyle = f.color;
          ctx.fill(f.path);
        }
      }
    }
    ctx.globalAlpha = 1;
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
    scene.paintBackdrop(c, wUnits, -(this.my + horizon) / unit, (H - horizon) / unit, seed);
    this.backdrop = canvas;
    this.backKey = key;
  }

  private drawClouds(ctx: CanvasRenderingContext2D, scene: SceneDef, view: EnvView, dpr: number, horizon: number): void {
    const { style, items } = scene.clouds;
    const unit = view.height / LAYER_UNITS;
    ctx.globalAlpha = style.alpha;
    for (const c of items) {
      const s = unit * c.scale;
      const half = (c.w / 2) * s;
      const range = view.width + half * 2 + 40;
      const x = mod(c.x * range + view.time * c.speed * s - view.camX * view.zoom * c.depth, range) - half - 20;
      const y = horizon - c.alt * unit;
      const path = cloudPaths(c);
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * x, dpr * y);
      ctx.fillStyle = style.shade;
      ctx.fill(path.shade);
      ctx.fillStyle = style.base;
      ctx.fill(path.base);
      ctx.fillStyle = style.light;
      ctx.fill(path.light);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ ground strip

  drawGround(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView, dpr: number): void {
    const { width: W, height: H, groundY } = view;
    if (groundY >= H + 40) return;
    const g = this.scenes(theme).ground;
    const k = view.zoom / 100;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = g.soil;
    const deepY = groundY + g.deepAt * k;
    ctx.fillRect(0, Math.max(0, groundY), W, Math.max(0, Math.min(H, deepY) - groundY));
    if (deepY < H) {
      ctx.fillStyle = g.deep;
      ctx.fillRect(0, Math.max(0, deepY), W, H - Math.max(0, deepY));
    }
    // World-anchored tiles: tile i starts at world x = i * tile / 100.
    const tileM = g.tile / 100;
    const left = view.camX - W / 2 / view.zoom;
    const first = Math.floor(left / tileM) - 1;
    const last = Math.ceil((view.camX + W / 2 / view.zoom) / tileM) + 1;
    const sway = !view.reducedMotion && view.zoom > 12;
    for (let i = first; i <= last; i++) {
      const sx = (i * tileM - view.camX) * view.zoom + W / 2;
      this.fillTile(ctx, g.fills, dpr, k, sx, groundY, 0);
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
      if (g.over) this.fillTile(ctx, g.over, dpr, k, sx, groundY, 0);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    for (const [x, y, r] of c.lobes) {
      shade.moveTo(x + r, y);
      shade.arc(x, y, r, 0, Math.PI * 2);
      // Base: lobes nudged up-left leave a lavender rim at the lower right.
      const bx = x - r * 0.07;
      const by = y - r * 0.12;
      base.moveTo(bx + r * 0.95, by);
      base.arc(bx, by, r * 0.95, 0, Math.PI * 2);
      // Light: sunlit caps on the upper-left of each lobe.
      const lx = x - r * 0.22;
      const ly = y - r * 0.32;
      light.moveTo(lx + r * 0.6, ly);
      light.arc(lx, ly, r * 0.6, 0, Math.PI * 2);
    }
    // Flat-ish bellies.
    const minX = Math.min(...c.lobes.map(([x, , r]) => x - r * 0.6));
    const maxX = Math.max(...c.lobes.map(([x, , r]) => x + r * 0.6));
    shade.rect(minX, -c.lobes[0]![2] * 0.9, maxX - minX, c.lobes[0]![2] * 0.9);
    base.rect(minX + 6, -c.lobes[0]![2] * 1.1, maxX - minX - 10, c.lobes[0]![2] * 0.92);
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
