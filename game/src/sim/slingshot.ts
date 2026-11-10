/**
 * Slingshot launch maths. Pure functions shared by the simulation, the trajectory preview,
 * keyboard aiming and the automated level solver, so they can never disagree.
 *
 * A "pull" is the offset of the pouch from the launch anchor, in world metres.
 */
import { PHYSICS, SLING, SUBSTEP } from '../core/config';

export interface Vec {
  x: number;
  y: number;
}

/** Clamps a pull vector to the circular launch region. Returns the clamped length. */
export function clampPull(px: number, py: number, out: Vec): number {
  const len = Math.hypot(px, py);
  if (len > SLING.maxPull) {
    const k = SLING.maxPull / len;
    out.x = px * k;
    out.y = py * k;
    return SLING.maxPull;
  }
  out.x = px;
  out.y = py;
  return len;
}

/**
 * Clamps a pull to the launch circle and keeps a bird of the given radius above the surface
 * the slingshot stands on (`anchorHeight` = height of the anchor above that surface).
 */
export function constrainPull(px: number, py: number, radius: number, anchorHeight: number, out: Vec): number {
  clampPull(px, py, out);
  const minY = radius + 0.04 - anchorHeight;
  if (out.y < minY) out.y = minY;
  return Math.hypot(out.x, out.y);
}

/** Pull strength 0..1. */
export function pullPower(px: number, py: number): number {
  return Math.min(1, Math.hypot(px, py) / SLING.maxPull);
}

/** A pull shorter than the minimum threshold cancels the shot. */
export function canLaunch(px: number, py: number): boolean {
  return Math.hypot(px, py) >= SLING.minPull;
}

/** Launch velocity: exactly opposite to the pull, speed proportional to the pull distance. */
export function launchVelocity(px: number, py: number, out: Vec): Vec {
  const len = Math.hypot(px, py);
  if (len < 1e-6) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const speed = (SLING.maxSpeed * Math.min(len, SLING.maxPull)) / SLING.maxPull;
  out.x = (-px / len) * speed;
  out.y = (-py / len) * speed;
  return out;
}

/** Converts an aim (launch angle above the horizon in radians, power 0..1) into the pull that produces it. */
export function pullFromAim(angle: number, power: number, out: Vec): Vec {
  const len = Math.min(1, Math.max(0, power)) * SLING.maxPull;
  out.x = -Math.cos(angle) * len;
  out.y = -Math.sin(angle) * len;
  return out;
}

/**
 * Predicts a ballistic path with the same integrator and step size as the physics engine
 * (semi-implicit Euler at the sub-step rate, no drag), so the preview matches the real flight.
 *
 * Writes interleaved x, y pairs into `out`; point k is the state after k * stride sub-steps.
 * Stops below `minY`. Returns the number of points written.
 */
export function predictTrajectory(
  x: number,
  y: number,
  vx: number,
  vy: number,
  out: Float32Array,
  maxPoints: number,
  stride = 4,
  minY = 0,
): number {
  const capacity = Math.min(maxPoints, out.length >> 1);
  const g = PHYSICS.gravity;
  let count = 0;
  while (count < capacity) {
    out[count * 2] = x;
    out[count * 2 + 1] = y;
    count++;
    if (y < minY) break;
    for (let i = 0; i < stride; i++) {
      vy -= g * SUBSTEP;
      x += vx * SUBSTEP;
      y += vy * SUBSTEP;
    }
  }
  return count;
}
