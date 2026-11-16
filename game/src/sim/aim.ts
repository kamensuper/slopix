/** Aiming helpers: find the launch angle that sends a bird through a target point. */
import { PHYSICS, SLING } from '../core/config';
import type { Vec } from './slingshot';

export interface AimSolution {
  /** Flat, fast trajectory (radians above the horizon), or null if the target is out of range. */
  low: number | null;
  /** Lobbed trajectory, or null if out of range. */
  high: number | null;
}

/**
 * Launch angles that hit (targetX, targetY) at the given power (0..1).
 * Accounts for the bird starting from the pulled-back pouch position rather than the anchor.
 */
export function solveAim(anchor: Vec, targetX: number, targetY: number, power: number, launchScale = 1, gravityScale = 1, wind = 0): AimSolution {
  if (wind !== 0) return solveAimInWind(anchor, targetX, targetY, power, launchScale, gravityScale, wind);
  const speed = SLING.maxSpeed * power * launchScale;
  const pull = SLING.maxPull * power;
  const g = PHYSICS.gravity * gravityScale;
  const solve = (pickHigh: boolean): number | null => {
    let angle = Math.atan2(targetY - anchor.y, targetX - anchor.x);
    for (let i = 0; i < 6; i++) {
      // The start point depends on the angle, so iterate to a fixed point.
      const dx = targetX - (anchor.x - Math.cos(angle) * pull);
      const dy = targetY - (anchor.y - Math.sin(angle) * pull);
      if (Math.abs(dx) < 1e-6) return null;
      const v2 = speed * speed;
      const disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
      if (disc < 0) return null;
      const root = Math.sqrt(disc);
      const tan = (v2 + (pickHigh ? root : -root)) / (g * dx);
      angle = dx > 0 ? Math.atan(tan) : Math.PI + Math.atan(tan);
    }
    return angle;
  };
  return { low: solve(false), high: solve(true) };
}

/**
 * Same question with a steady horizontal wind (an acceleration on the bird). There is no closed
 * form worth having, so the launch angle is scanned and the crossings refined by bisection.
 */
function solveAimInWind(anchor: Vec, targetX: number, targetY: number, power: number, launchScale: number, gravityScale: number, wind: number): AimSolution {
  const speed = SLING.maxSpeed * power * launchScale;
  const pull = SLING.maxPull * power;
  const g = PHYSICS.gravity * gravityScale;
  /** Height above the target when the bird passes the target's x; NaN when it never gets there. */
  const miss = (angle: number): number => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const dx = targetX - (anchor.x - c * pull);
    const dy = targetY - (anchor.y - s * pull);
    const vx = speed * c;
    // dx = vx t + wind t^2 / 2, first positive root.
    const disc = vx * vx + 2 * wind * dx;
    if (disc < 0) return NaN;
    const t = (-vx + Math.sqrt(disc)) / wind;
    if (!(t > 0)) return NaN;
    return speed * s * t - 0.5 * g * t * t - dy;
  };
  const roots: number[] = [];
  const step = 0.01;
  let prevAngle = -0.5;
  let prev = miss(prevAngle);
  for (let angle = prevAngle + step; angle <= 1.52; angle += step) {
    const value = miss(angle);
    if (!Number.isNaN(prev) && !Number.isNaN(value) && prev * value <= 0 && prev !== value) {
      let lo = prevAngle;
      let hi = angle;
      let flo = prev;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        const fm = miss(mid);
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      roots.push((lo + hi) / 2);
    }
    prevAngle = angle;
    prev = value;
  }
  return { low: roots[0] ?? null, high: roots.length > 1 ? (roots[roots.length - 1] as number) : null };
}
