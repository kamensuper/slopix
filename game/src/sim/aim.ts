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
export function solveAim(anchor: Vec, targetX: number, targetY: number, power: number): AimSolution {
  const speed = SLING.maxSpeed * power;
  const pull = SLING.maxPull * power;
  const g = PHYSICS.gravity;
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
