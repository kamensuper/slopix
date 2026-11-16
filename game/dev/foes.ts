/**
 * Dev gallery: every foe variant in every expression and damage state, plus gameplay-sized foes
 * and the detached accessories. Served by Vite at /dev/foes.html. `?still` freezes time.
 */
import type { FoeVariant } from '../src/core/types';
import { paintBird } from '../src/render/art/birds';
import { paintFoe, paintFoeAccessory } from '../src/render/art/foes';
import { CHARACTER_RADIUS, type BirdPose, type FoeExpression, type FoePose } from '../src/render/art/types';

const ALL_VARIANTS: FoeVariant[] = ['small', 'medium', 'large', 'helmet', 'armored', 'king'];
const params = new URLSearchParams(location.search);
/** `?only=helmet,king` shows just those rows, large. */
const only = params.get('only')?.split(',');
const VARIANTS = only ? ALL_VARIANTS.filter((v) => only.includes(v)) : ALL_VARIANTS;
const EXPRESSIONS: FoeExpression[] = ['idle', 'worried', 'surprised', 'hurt', 'stunned', 'laugh', 'defeated'];
/** Extra columns: [damage, armorDamage, armorOn, label]. */
const STATES: [0 | 1 | 2, 0 | 1 | 2, boolean, string][] = [
  [1, 1, true, 'damage 1'],
  [2, 2, true, 'damage 2'],
  [2, 2, false, 'armour off'],
];

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const still = params.has('still');

function pose(expression: FoeExpression, time: number, damage: 0 | 1 | 2 = 0, armorDamage: 0 | 1 | 2 = 0, armorOn = true): FoePose {
  return { time, expression, blink: 0, damage, armorOn, armorDamage, lookX: -0.6, lookY: 0.1, flash: 0, intensity: 1 };
}

function drawFoe(variant: FoeVariant, x: number, y: number, radius: number, p: FoePose, dpr: number): void {
  const k = (radius / CHARACTER_RADIUS) * dpr;
  ctx.setTransform(k, 0, 0, k, x * dpr, y * dpr);
  paintFoe(ctx, variant, p);
}

function label(text: string, x: number, y: number, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2b1a12';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

function frame(now: number): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const time = still ? 1.3 : now / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#f3ecdc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '13px system-ui, sans-serif';

  if (only && only.length === 1 && params.has('big')) {
    // One variant, every state, large: 5 x 2 grid.
    const variant = VARIANTS[0] as FoeVariant;
    const cw = w / 5;
    const ch = h / 2;
    const r = Math.min(cw, ch) * 0.3;
    const cells: [string, FoePose][] = [
      ...EXPRESSIONS.map((e, i): [string, FoePose] => [e, pose(e, time + i * 0.37)]),
      ...STATES.map(([d, wear, on, name], i): [string, FoePose] => [name, pose('idle', time + i, d, wear, on)]),
    ];
    cells.forEach(([name, p], i) => {
      const cx = cw * (i % 5) + cw / 2;
      const cy = ch * Math.floor(i / 5) + ch * 0.55;
      label(name, cx, ch * Math.floor(i / 5) + 18, dpr);
      drawFoe(variant, cx, cy, r, p, dpr);
    });
    if (!still) requestAnimationFrame(frame);
    return;
  }
  const cols = EXPRESSIONS.length + STATES.length;
  const cellW = Math.min(150, (w - 30) / cols);
  const cellH = only ? (h - 40) / VARIANTS.length : Math.min(132, (h - 210) / VARIANTS.length);
  const radius = Math.min(cellW, cellH) * 0.3;
  const left = 15 + cellW / 2;
  const top = 26;
  EXPRESSIONS.forEach((e, i) => label(e, left + i * cellW, 16, dpr));
  STATES.forEach((s, i) => label(s[3], left + (EXPRESSIONS.length + i) * cellW, 16, dpr));
  VARIANTS.forEach((variant, row) => {
    const cy = top + row * cellH + cellH * 0.62;
    EXPRESSIONS.forEach((expression, col) => {
      drawFoe(variant, left + col * cellW, cy, radius, pose(expression, time + col * 0.37 + row * 0.21), dpr);
    });
    STATES.forEach(([damage, wear, on], i) => {
      drawFoe(variant, left + (EXPRESSIONS.length + i) * cellW, cy, radius, pose('idle', time + i, damage, wear, on), dpr);
    });
    label(variant, 34, cy + radius + 22, dpr);
  });

  if (only) {
    if (!still) requestAnimationFrame(frame);
    return;
  }
  // Gameplay sizes and accessories.
  const baseY = top + VARIANTS.length * cellH + 60;
  label('gameplay size (radius 30 / 20 px) | hit flash, blink, half worry | accessories', w / 2, baseY - 40, dpr);
  VARIANTS.forEach((variant, i) => {
    drawFoe(variant, 60 + i * 90, baseY + 20, 30, pose('idle', time + i), dpr);
    drawFoe(variant, 60 + i * 90, baseY + 85, 20, pose(i % 2 ? 'worried' : 'laugh', time + i), dpr);
  });
  const flashPose = pose('hurt', time);
  flashPose.flash = 0.6;
  drawFoe('medium', 640, baseY + 20, 30, flashPose, dpr);
  const blinkPose = pose('idle', time);
  blinkPose.blink = 1;
  drawFoe('medium', 720, baseY + 20, 30, blinkPose, dpr);
  const fearPose = pose('worried', time);
  fearPose.intensity = 0.5;
  drawFoe('medium', 800, baseY + 20, 30, fearPose, dpr);
  (['helmet', 'armor', 'crown'] as const).forEach((kind, i) => {
    const k = (40 / CHARACTER_RADIUS) * dpr;
    ctx.setTransform(k, 0, 0, k, (920 + i * 110) * dpr, (baseY + 40) * dpr);
    paintFoeAccessory(ctx, kind);
  });
  if (!still) requestAnimationFrame(frame);
}

/** Paint cost per foe at gameplay size (radius 30 px), averaged over many paints. */
function measure(): void {
  const off = document.createElement('canvas');
  off.width = 400;
  off.height = 400;
  const c = off.getContext('2d')!;
  const results: string[] = [];
  const perf: Record<string, number> = {};
  for (const variant of VARIANTS) {
    const p = pose('idle', 0, 1, 1, true);
    const k = 30 / CHARACTER_RADIUS;
    for (let i = 0; i < 50; i++) {
      c.setTransform(k, 0, 0, k, 200, 200);
      paintFoe(c, variant, p);
    }
    const n = 400;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      p.time = i * 0.01;
      c.setTransform(k, 0, 0, k, 200, 200);
      paintFoe(c, variant, p);
    }
    c.getImageData(0, 0, 1, 1); // forces the queued drawing to finish
    const ms = (performance.now() - t0) / n;
    perf[variant] = ms;
    results.push(`${variant} ${ms.toFixed(3)}`);
  }
  // Calibration: the same measurement for a bird, whose art is the quality / cost reference.
  const bird: BirdPose = { time: 0, state: 'idle', blink: 0, lookX: 0.4, lookY: 0 };
  const k = 30 / CHARACTER_RADIUS;
  for (let i = 0; i < 50; i++) {
    c.setTransform(k, 0, 0, k, 200, 200);
    paintBird(c, 'pip', bird);
  }
  const t0 = performance.now();
  for (let i = 0; i < 400; i++) {
    bird.time = i * 0.01;
    c.setTransform(k, 0, 0, k, 200, 200);
    paintBird(c, 'pip', bird);
  }
  c.getImageData(0, 0, 1, 1);
  perf.birdRed = (performance.now() - t0) / 400;
  results.push(`(red bird ${perf.birdRed.toFixed(3)})`);
  (window as unknown as { __foePerf: Record<string, number> }).__foePerf = perf;
  document.getElementById('perf')!.textContent = `ms / foe @30px: ${results.join(' | ')}`;
}

requestAnimationFrame(frame);
setTimeout(measure, 300);
