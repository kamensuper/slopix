/** Radial explosions: damage and outward impulses that fall off with distance from the blast centre. */
import { EXPLOSION_FALLOFF, EXPLOSION_LIFT, EXPLOSION_MAX_KICK, type ExplosionConfig } from '../core/config';
import type { DynamicEntity } from './entities';
import { closestOnPolygon, type XY } from './geometry';

const local: XY = { x: 0, y: 0 };
const nearest: XY = { x: 0, y: 0 };
const impulse: XY = { x: 0, y: 0 };
const point: XY = { x: 0, y: 0 };

/** Distance from (x, y) to the surface of an entity (0 when inside it); writes the nearest surface point in world space. */
export function surfaceDistance(entity: DynamicEntity, x: number, y: number, out: XY): number {
  const p = entity.body.getPosition();
  const angle = entity.body.getAngle();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = x - p.x;
  const dy = y - p.y;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  let distance: number;
  if (entity.kind === 'block' && entity.outline) {
    distance = closestOnPolygon(entity.outline, lx, ly, local);
  } else {
    const radius = entity.kind === 'block' ? entity.w / 2 : entity.radius;
    const len = Math.hypot(lx, ly);
    if (len <= radius) {
      distance = 0;
      local.x = lx;
      local.y = ly;
    } else {
      distance = len - radius;
      local.x = (lx / len) * radius;
      local.y = (ly / len) * radius;
    }
  }
  out.x = p.x + local.x * c - local.y * s;
  out.y = p.y + local.x * s + local.y * c;
  return distance;
}

/** Strength of a blast (0..1) at the given surface distance. */
export function blastFalloff(distance: number, config: ExplosionConfig): number {
  if (distance >= config.radius) return 0;
  return Math.pow(1 - distance / config.radius, EXPLOSION_FALLOFF);
}

/**
 * Pushes an entity away from the blast centre. Returns the falloff and the nearest surface point
 * (in `hit`) so the caller can apply damage there. Call only while the world is not stepping.
 */
export function pushFromBlast(entity: DynamicEntity, x: number, y: number, config: ExplosionConfig, hit: XY): number {
  const distance = surfaceDistance(entity, x, y, nearest);
  hit.x = nearest.x;
  hit.y = nearest.y;
  const falloff = blastFalloff(distance, config);
  if (falloff <= 0 || entity.invMass === 0) return falloff;

  const centre = entity.body.getWorldCenter();
  let dx = centre.x - x;
  let dy = centre.y - y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) {
    dx = 0;
    dy = 1;
  } else {
    dx /= len;
    dy /= len;
  }
  // A little lift makes debris arc instead of skidding along the ground.
  dy += EXPLOSION_LIFT;
  const norm = Math.hypot(dx, dy) || 1;
  const exposed = Math.min(2 * entity.boundRadius, 2.2);
  // Light pieces would otherwise be launched at absurd speeds.
  const strength = Math.min(config.impulse * falloff * exposed, EXPLOSION_MAX_KICK / entity.invMass);
  impulse.x = (dx / norm) * strength;
  impulse.y = (dy / norm) * strength;
  // Between the surface and the centre of mass: some spin, but no wild tumbling.
  point.x = (nearest.x + centre.x) / 2;
  point.y = (nearest.y + centre.y) / 2;
  entity.body.applyLinearImpulse(impulse, point, true);
  return falloff;
}
