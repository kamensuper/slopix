/**
 * Painters for the baked (once per level and screen size) part of the environment: sky
 * gradients, sun glow, light shafts, far mountain ranges and atmospheric haze. These run on an
 * offscreen canvas in layer units (view height = 1000), so gradients are affordable here.
 */
import { Rng, TAU } from '../../core/math';
import { rgba, smoothOpen } from './envKit';
import type { BackdropFrame } from './envLayers';

export function skyGradient(ctx: CanvasRenderingContext2D, f: BackdropFrame, stops: [number, string][]): void {
  const g = ctx.createLinearGradient(0, f.top, 0, 0);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(-2, f.top - 2, f.w + 4, f.bottom - f.top + 4);
}

/** Soft sun or moon: wide glow, halo ring and a crisp disc. */
export function sun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, disc: string, glow: string, glowR: number, glowA = 0.55): void {
  let g = ctx.createRadialGradient(x, y, r * 0.5, x, y, glowR);
  g.addColorStop(0, rgba(glow, glowA));
  g.addColorStop(0.35, rgba(glow, glowA * 0.35));
  g.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - glowR, y - glowR, glowR * 2, glowR * 2);
  g = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 2.1);
  g.addColorStop(0, rgba(disc, 0.55));
  g.addColorStop(1, rgba(disc, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Faint light shafts fanning down-right from the sun. */
export function rays(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, color: string, alpha: number, seed: number): void {
  const rng = new Rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const a = 0.35 + i * 0.2 + rng.range(-0.06, 0.06);
    const spread = rng.range(0.025, 0.06);
    const g = ctx.createRadialGradient(x, y, 0, x, y, len);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a - spread) * len, y + Math.sin(a - spread) * len);
    ctx.lineTo(x + Math.cos(a + spread) * len, y + Math.sin(a + spread) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Vertical haze band: transparent at y0, `alpha` at y1 (and below). */
export function haze(ctx: CanvasRenderingContext2D, f: BackdropFrame, y0: number, y1: number, color: string, alpha: number): void {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(1, rgba(color, alpha));
  ctx.fillStyle = g;
  ctx.fillRect(-2, y0, f.w + 4, f.bottom - y0 + 2);
}

export interface RangeStyle {
  light: string;
  base: string;
  shade: string;
  /** Snow caps (optional): lit and shaded tones and the fraction of the peak height they cover. */
  snow?: string;
  snowShade?: string;
  snowFrac?: number;
  /** Peak heights (layer units above `baseY`), widths and spacing. */
  minH: number;
  maxH: number;
  spacing: number;
  baseY: number;
  /** 0 = rounded hills .. 1 = sharp alpine peaks. */
  sharp: number;
  /** Flat-topped mesas instead of peaks. */
  mesa?: boolean;
  /** Horizontal strata stripes (mesas). */
  strata?: string;
}

interface Peak {
  x: number;
  h: number;
  w: number;
}

/** A painterly mountain / mesa range across the whole backdrop. */
export function range(ctx: CanvasRenderingContext2D, f: BackdropFrame, s: RangeStyle, seed: number): void {
  const rng = new Rng(seed);
  const peaks: Peak[] = [];
  for (let x = -s.spacing * 0.5; x < f.w + s.spacing; x += s.spacing * rng.range(0.6, 1.25)) {
    const h = rng.range(s.minH, s.maxH);
    peaks.push({ x, h, w: h * (s.mesa ? rng.range(1.6, 2.6) : rng.range(1.25, 1.9)) * (1.25 - s.sharp * 0.35) });
  }
  const height = (u: number): number => {
    let best = 0;
    for (const p of peaks) {
      const d = Math.abs(u - p.x) / p.w;
      if (d >= 1) continue;
      let v: number;
      if (s.mesa) {
        // Flat top, steep cliff, talus slope.
        const top = 0.42;
        v = d < top ? 1 - d * 0.04 : d < top + 0.1 ? 1 - (d - top) * 6 : Math.max(0, 0.4 * (1 - (d - top - 0.1) / (0.9 - top)));
      } else {
        const k = 1 - d;
        v = s.sharp > 0.5 ? Math.pow(k, 1.15) : k * k * (3 - 2 * k);
      }
      best = Math.max(best, v * p.h);
    }
    return best;
  };
  const jag = new Rng(seed + 9);
  const pts: [number, number][] = [];
  for (let u = -10; u <= f.w + 10; u += 7) pts.push([u, s.baseY - height(u) + (s.sharp > 0.5 ? jag.range(-3, 3) : 0)]);
  const sil = new Path2D();
  sil.moveTo(-10, f.bottom + 5);
  for (const [u, y] of pts) sil.lineTo(u, y);
  sil.lineTo(f.w + 10, f.bottom + 5);
  sil.closePath();

  // Body gradient: lighter at the crest, a little hazier at the foot.
  const g = ctx.createLinearGradient(0, s.baseY - s.maxH, 0, s.baseY);
  g.addColorStop(0, s.light);
  g.addColorStop(0.55, s.base);
  g.addColorStop(1, s.base);
  ctx.fillStyle = g;
  ctx.fill(sil);

  ctx.save();
  ctx.clip(sil);
  for (const p of peaks) {
    const tipY = s.baseY - height(p.x);
    // Shadow face on the right of each crest, with a jagged boundary.
    const face = new Path2D();
    face.moveTo(p.x, tipY - 4);
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      face.lineTo(p.x + p.w * (s.mesa ? 0.42 : 0.12) * t + rng.range(-1, 1) * p.w * 0.05, tipY + (s.baseY - tipY + 40) * t);
    }
    face.lineTo(p.x + p.w, s.baseY + 60);
    face.lineTo(p.x + p.w, tipY - 10);
    face.closePath();
    ctx.fillStyle = s.shade;
    ctx.fill(face);

    if (s.snow && !s.mesa) {
      const capY = tipY + p.h * (s.snowFrac ?? 0.35);
      const cap = new Path2D();
      const capPts: [number, number][] = [];
      for (let u = p.x - p.w * 0.8; u <= p.x + p.w * 0.8; u += 10) capPts.push([u, capY + Math.sin(u * 0.13 + p.x) * 9 + rng.range(-6, 10)]);
      cap.moveTo(p.x - p.w, tipY - 30);
      smoothOpen(cap, capPts);
      cap.lineTo(p.x + p.w, tipY - 30);
      cap.closePath();
      ctx.save();
      ctx.clip(cap);
      ctx.fillStyle = s.snow;
      ctx.fillRect(p.x - p.w, tipY - 40, p.w * 2, capY - tipY + 60);
      ctx.fillStyle = s.snowShade ?? s.shade;
      ctx.fill(face);
      ctx.restore();
    }
  }
  if (s.strata) {
    ctx.strokeStyle = s.strata;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.55;
    for (let k = 0; k < 7; k++) {
      const y = s.baseY - s.maxH * (0.15 + k * 0.12);
      ctx.beginPath();
      for (let u = 0; u <= f.w; u += 30) {
        const yy = y + Math.sin(u * 0.01 + k) * 4;
        if (u === 0) ctx.moveTo(u, yy);
        else ctx.lineTo(u, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
