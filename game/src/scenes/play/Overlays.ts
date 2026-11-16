/**
 * Screen-space drawing of everything that is state rather than artwork: ropes, chains and hinges,
 * balloons, frost on frozen pieces, live current, special terrain surfaces and the wind.
 * All of it reads the simulation and never changes it.
 */
import { PHYSICS } from '../../core/config';
import { clamp01, DEG, TAU } from '../../core/math';
import { INK } from '../../core/palette';
import type { LevelDef, TerrainDef } from '../../core/types';
import type { Camera } from '../../render/Camera';
import type { BlockEntity, FoeEntity } from '../../sim/entities';
import type { GameSim } from '../../sim/GameSim';

/** Rope and revolute joints both expose their body-local anchors. */
interface LocalAnchors {
  getLocalAnchorA(): { x: number; y: number };
  getLocalAnchorB(): { x: number; y: number };
}

interface Lerped {
  px: number;
  py: number;
  pangle: number;
  x: number;
  y: number;
  angle: number;
}

const ptA = { x: 0, y: 0 };
const ptB = { x: 0, y: 0 };
const SHOCK_TICKS = Math.round(0.45 * PHYSICS.hz);
const BALLOON_COLORS = ['#ff5d73', '#ffb02e', '#4fc3f7', '#b06cf0'];

function anchorOf(e: Lerped, local: { x: number; y: number }, alpha: number, out: { x: number; y: number }): { x: number; y: number } {
  const x = e.px + (e.x - e.px) * alpha;
  const y = e.py + (e.y - e.py) * alpha;
  const angle = e.pangle + (e.angle - e.pangle) * alpha;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out.x = x + local.x * c - local.y * s;
  out.y = y + local.x * s + local.y * c;
  return out;
}

/** Traces a block's outline in screen space. */
function tracePiece(ctx: CanvasRenderingContext2D, cam: Camera, block: BlockEntity, alpha: number, grow = 0): void {
  const x = block.px + (block.x - block.px) * alpha;
  const y = block.py + (block.y - block.py) * alpha;
  const angle = block.pangle + (block.angle - block.pangle) * alpha;
  ctx.beginPath();
  if (!block.outline) {
    ctx.arc(cam.toScreenX(x), cam.toScreenY(y), (block.w / 2) * cam.zoom + grow, 0, TAU);
    return;
  }
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  block.outline.forEach(([lx, ly], i) => {
    const sx = cam.toScreenX(x + lx * c - ly * s);
    const sy = cam.toScreenY(y + lx * s + ly * c);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
}

// ---------------------------------------------------------------- joints

function drawBolt(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, motor: boolean, time: number): void {
  const r = Math.max(2.5, (motor ? 0.2 : 0.11) * z);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = motor ? '#c9854a' : '#9aa6b2';
  ctx.fill();
  ctx.lineWidth = Math.max(1, 0.035 * z);
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (motor) {
    // A turning hub with three spokes.
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = time * 2 + (i * TAU) / 3;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    }
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU);
  ctx.fillStyle = '#e8eef4';
  ctx.fill();
}

/** Iron ring screwed into the world where a rope is tied off. */
function drawHook(ctx: CanvasRenderingContext2D, x: number, y: number, z: number): void {
  const r = Math.max(3, 0.13 * z);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.lineWidth = Math.max(2.5, 0.09 * z);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = Math.max(1.2, 0.05 * z);
  ctx.strokeStyle = '#7d8894';
  ctx.stroke();
}

/** Ropes (with sag when slack), chains for unbreakable ties, hooks and hinge bolts. */
export function drawJoints(ctx: CanvasRenderingContext2D, cam: Camera, sim: GameSim, alpha: number, time: number): void {
  const joints = sim.joints;
  if (joints.length === 0) return;
  const z = cam.zoom;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const j of joints) {
    if (!j.alive) continue;
    const local = j.joint as unknown as LocalAnchors;
    const a = anchorOf(j.a, local.getLocalAnchorA(), alpha, ptA);
    if (j.kind === 'pin') {
      drawBolt(ctx, cam.toScreenX(a.x), cam.toScreenY(a.y), z, j.motor, time);
      continue;
    }
    const b = j.b ? anchorOf(j.b, local.getLocalAnchorB(), alpha, ptB) : j.joint.getAnchorB();
    const max = (j.joint as unknown as { getMaxLength(): number }).getMaxLength();
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const sag = Math.sqrt(Math.max(0, max * max - d * d)) * 0.5;
    const x0 = cam.toScreenX(a.x);
    const y0 = cam.toScreenY(a.y);
    const x1 = cam.toScreenX(b.x);
    const y1 = cam.toScreenY(b.y);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 + sag * z;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2.5, 0.12 * z);
    ctx.stroke();
    ctx.strokeStyle = '#c99a5b';
    ctx.lineWidth = Math.max(1.5, 0.075 * z);
    ctx.stroke();
    // Twisted fibre: short light dashes along the rope.
    ctx.setLineDash([Math.max(2, 0.08 * z), Math.max(2, 0.08 * z)]);
    ctx.strokeStyle = '#ecd1a0';
    ctx.lineWidth = Math.max(0.8, 0.03 * z);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!j.b) drawHook(ctx, x1, y1, z);
  }
}

// ---------------------------------------------------------------- balloons

/** The balloon above every floating foe, bobbing on its string. */
export function drawBalloons(ctx: CanvasRenderingContext2D, cam: Camera, foes: readonly FoeEntity[], alpha: number, time: number): void {
  const z = cam.zoom;
  for (const foe of foes) {
    if (!foe.alive || !foe.floating) continue;
    const x = foe.px + (foe.x - foe.px) * alpha;
    const y = foe.py + (foe.y - foe.py) * alpha;
    const sway = Math.sin(time * 1.3 + foe.id) * 0.12;
    const bx = cam.toScreenX(x + sway);
    const by = cam.toScreenY(y + foe.radius * 3.1);
    const fx = cam.toScreenX(x);
    const fy = cam.toScreenY(y + foe.radius * 0.9);
    const r = foe.radius * 1.25 * z;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo((fx + bx) / 2 + sway * z, (fy + by) / 2, bx, by + r * 1.15);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, 0.035 * z);
    ctx.stroke();
    const color = BALLOON_COLORS[foe.id % BALLOON_COLORS.length] as string;
    ctx.beginPath();
    ctx.moveTo(bx, by + r * 1.12);
    ctx.bezierCurveTo(bx - r * 1.25, by + r * 0.3, bx - r * 1.05, by - r * 1.1, bx, by - r * 1.1);
    ctx.bezierCurveTo(bx + r * 1.05, by - r * 1.1, bx + r * 1.25, by + r * 0.3, bx, by + r * 1.12);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(2, 0.07 * z);
    ctx.strokeStyle = INK;
    ctx.stroke();
    // Knot and highlight.
    ctx.beginPath();
    ctx.moveTo(bx - r * 0.14, by + r * 1.28);
    ctx.lineTo(bx, by + r * 1.1);
    ctx.lineTo(bx + r * 0.14, by + r * 1.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(bx - r * 0.38, by - r * 0.45, r * 0.2, r * 0.36, -0.5, 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- frost and current

/** Frost over frozen pieces and foes; a flicker of current over anything lightning just ran through. */
export function drawConditions(ctx: CanvasRenderingContext2D, cam: Camera, sim: GameSim, alpha: number, time: number): void {
  const z = cam.zoom;
  for (const block of sim.blocks) {
    const shocked = block.shockTick >= 0 && sim.tick - block.shockTick < SHOCK_TICKS;
    if (!block.frozen && !shocked) continue;
    if (!cam.sees(block.x, block.y, block.boundRadius + 0.2)) continue;
    if (block.frozen) {
      tracePiece(ctx, cam, block, alpha);
      ctx.fillStyle = 'rgba(190, 232, 255, 0.5)';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, 0.06 * z);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();
      // Glitter that drifts over the piece.
      const sx = cam.toScreenX(block.x);
      const sy = cam.toScreenY(block.y);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 2; i++) {
        const phase = time * 1.7 + block.id * 1.3 + i * 2.1;
        const k = 0.5 + 0.5 * Math.sin(phase * 2);
        const gx = sx + Math.cos(phase) * block.boundRadius * 0.5 * z;
        const gy = sy + Math.sin(phase * 1.4) * block.boundRadius * 0.35 * z;
        const s = Math.max(1.5, 0.09 * z) * k;
        ctx.beginPath();
        ctx.moveTo(gx, gy - s * 2);
        ctx.lineTo(gx + s * 0.5, gy);
        ctx.lineTo(gx, gy + s * 2);
        ctx.lineTo(gx - s * 0.5, gy);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (shocked) {
      const k = 1 - (sim.tick - block.shockTick) / SHOCK_TICKS;
      tracePiece(ctx, cam, block, alpha, 2);
      ctx.globalAlpha = k * (0.6 + 0.4 * Math.sin(time * 70));
      ctx.lineWidth = Math.max(2, 0.1 * z);
      ctx.strokeStyle = '#fff27a';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 242, 122, 0.25)';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  for (const foe of sim.foes) {
    if (!foe.alive || !foe.frozen) continue;
    const x = cam.toScreenX(foe.px + (foe.x - foe.px) * alpha);
    const y = cam.toScreenY(foe.py + (foe.y - foe.py) * alpha);
    const r = foe.radius * 1.12 * z;
    // A block of ice around the foe.
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + foe.id;
      const rr = r * (1 + 0.1 * Math.sin(i * 2.7 + foe.id));
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(190, 232, 255, 0.5)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, 0.06 * z);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5, y - r * 0.55);
    ctx.lineTo(x - r * 0.15, y - r * 0.2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- terrain surfaces

function surfaceTop(piece: TerrainDef): { ax: number; ay: number; bx: number; by: number } | null {
  if (piece.shape !== 'rect' || piece.w === undefined || piece.h === undefined) return null;
  const angle = (piece.angle ?? 0) * DEG;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const hw = piece.w / 2;
  const hh = piece.h / 2;
  return { ax: piece.x - hw * c - hh * s, ay: piece.y - hw * s + hh * c, bx: piece.x + hw * c - hh * s, by: piece.y + hw * s + hh * c };
}

/** Ice glaze, rubber pads and moving conveyor belts along the top of special terrain. */
export function drawSurfaces(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, time: number): void {
  const z = cam.zoom;
  ctx.lineCap = 'butt';
  for (const piece of level.terrain) {
    if (!piece.surface) continue;
    const top = surfaceTop(piece);
    if (!top) continue;
    const x0 = cam.toScreenX(top.ax);
    const y0 = cam.toScreenY(top.ay);
    const x1 = cam.toScreenX(top.bx);
    const y1 = cam.toScreenY(top.by);
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 2) continue;
    const band = Math.max(4, 0.22 * z);
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
    if (piece.surface === 'ice') {
      const g = ctx.createLinearGradient(0, -band * 0.3, 0, band);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#8fd3f4');
      ctx.fillStyle = g;
      ctx.fillRect(0, -band * 0.3, len, band * 1.2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, 0.05 * z);
      ctx.strokeRect(0, -band * 0.3, len, band * 1.2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = Math.max(1, 0.03 * z);
      for (let x = band; x < len - band; x += band * 3.5) {
        ctx.beginPath();
        ctx.moveTo(x, band * 0.55);
        ctx.lineTo(x + band * 1.2, band * 0.05);
        ctx.stroke();
      }
    } else if (piece.surface === 'bouncy') {
      ctx.fillStyle = '#3f4654';
      ctx.fillRect(0, -band * 0.5, len, band * 1.5);
      ctx.fillStyle = '#ff8a2b';
      ctx.fillRect(0, -band * 0.1, len, band * 0.45);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, 0.05 * z);
      ctx.strokeRect(0, -band * 0.5, len, band * 1.5);
    } else {
      const speed = piece.speed ?? 2;
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(0, -band * 0.4, len, band * 1.5);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, 0.05 * z);
      ctx.strokeRect(0, -band * 0.4, len, band * 1.5);
      // Chevrons that travel with the belt.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, -band * 0.4, len, band * 1.5);
      ctx.clip();
      const step = band * 2.2;
      const shift = ((time * speed * z) % step + step) % step;
      const dir = speed >= 0 ? 1 : -1;
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = Math.max(1.5, 0.07 * z);
      ctx.lineJoin = 'miter';
      for (let x = -step + shift; x < len + step; x += step) {
        ctx.beginPath();
        ctx.moveTo(x - dir * band * 0.4, -band * 0.15);
        ctx.lineTo(x + dir * band * 0.3, band * 0.35);
        ctx.lineTo(x - dir * band * 0.4, band * 0.85);
        ctx.stroke();
      }
      ctx.restore();
      // Rollers at both ends.
      ctx.fillStyle = '#9aa6b2';
      for (const x of [0, len]) {
        ctx.beginPath();
        ctx.arc(x, band * 0.35, band * 0.75, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- wind

/** Streaks of air drifting with the wind; `strength` is the level's wind acceleration. */
export function drawWind(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, strength: number, time: number, calm: number): void {
  if (strength === 0) return;
  const count = Math.round(6 + Math.min(10, Math.abs(strength) * 3) * calm);
  const dir = Math.sign(strength);
  const speed = 60 + Math.abs(strength) * 70;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  for (let i = 0; i < count; i++) {
    const seed = i * 127.1;
    const span = viewW + 300;
    const offset = (((seed * 53.7 + time * speed * dir * (0.7 + (i % 5) * 0.12)) % span) + span) % span;
    const x = offset - 150;
    const y = ((seed * 91.3) % (viewH * 0.78)) + viewH * 0.04 + Math.sin(time * 1.1 + i) * 8;
    const len = 50 + (i % 4) * 26 + Math.abs(strength) * 10;
    const fade = clamp01(Math.sin((offset / span) * Math.PI) * 1.4);
    ctx.globalAlpha = 0.28 * fade;
    ctx.lineWidth = 1.5 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (len / 2) * dir, y - 6, x + len * dir, y + Math.sin(time * 2 + i) * 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
