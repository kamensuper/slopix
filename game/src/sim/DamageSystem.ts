/**
 * Damage system: turns collisions into damage.
 *
 * - Only real impacts count: a contact must be closing faster than DAMAGE.minImpactSpeed, which
 *   filters resting and sliding contact, and a pair of bodies cannot hurt each other again for
 *   DAMAGE.pairCooldown seconds.
 * - Damage is an energy: 1/2 * (effective mass at the contact point) * (closing speed)^2 for a free
 *   two-body hit, or 1/2 * (solver impulse) * (closing speed) when the solver reports a larger impulse
 *   because the victim is pinned against something (this is what lets a falling slab crush glass).
 * - Birds are tuned projectiles: their hits always use the two-body estimate multiplied by the
 *   bird's power against the target material, which keeps shots predictable.
 * - When a hit is strong enough to destroy its target outright, the contact is cancelled before the
 *   solver runs and the attacker carries on with reduced speed: it smashes through instead of bouncing.
 */
import { WorldManifold, type Contact, type ContactImpulse } from 'planck';
import { BIRDS, DAMAGE, MATERIALS, PIGS, SUBSTEP } from '../core/config';
import type { DynamicEntity, Entity } from './entities';
import type { GameSim } from './GameSim';

interface ImpactRecord {
  speed: number;
  energy: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
}

type TrackedContact = Contact & { ffImpact?: ImpactRecord };

const PAIR_KEY_BASE = 1 << 20;

function pairKey(a: Entity, b: Entity): number {
  return a.id < b.id ? a.id * PAIR_KEY_BASE + b.id : b.id * PAIR_KEY_BASE + a.id;
}

/** Damage multiplier of `attacker` against `target`. */
function powerAgainst(attacker: Entity, target: Entity): number {
  if (attacker.kind !== 'bird' || attacker.type === 'egg') return 1;
  const table = BIRDS[attacker.type].power;
  if (target.kind === 'pig') return table.pig;
  if (target.kind === 'block') return table[target.material];
  return 1;
}

function minEnergy(target: Entity): number {
  if (target.kind === 'block') return MATERIALS[target.material].minEnergy;
  if (target.kind === 'pig') return PIGS[target.variant].minEnergy;
  return Infinity;
}

/** Damage `target` takes from an impact of the given energy; 0 when it shrugs the hit off. */
function damageTo(target: Entity, attacker: Entity, energy: number): number {
  if (target.kind !== 'block' && target.kind !== 'pig') return 0;
  const scaled = energy * powerAgainst(attacker, target);
  return scaled >= minEnergy(target) ? scaled : 0;
}

function wouldDestroy(target: Entity, damage: number): boolean {
  if (damage <= 0) return false;
  if (target.kind === 'block') return damage >= target.hp;
  // Armour has to be broken first; an armoured pig never pops in a single hit.
  if (target.kind === 'pig') return target.armor <= 0 && damage >= target.hp;
  return false;
}

function passThrough(target: Entity): number {
  return target.kind === 'block' ? MATERIALS[target.material].passThrough : DAMAGE.pigPassThrough;
}

export class DamageSystem {
  private readonly cooldownUntil = new Map<number, number>();
  private readonly cooldownSteps = Math.max(1, Math.round(DAMAGE.pairCooldown / SUBSTEP));
  private readonly settleSteps = Math.round(DAMAGE.settleTime / SUBSTEP);
  private readonly manifold = new WorldManifold();
  private readonly velocity = { x: 0, y: 0 };

  constructor(private readonly sim: GameSim) {}

  private cooling(key: number): boolean {
    const until = this.cooldownUntil.get(key);
    return until !== undefined && this.sim.stepCount < until;
  }

  private startCooldown(key: number): void {
    this.cooldownUntil.set(key, this.sim.stepCount + this.cooldownSteps);
    if (this.cooldownUntil.size > 4096) this.prune();
  }

  private prune(): void {
    const now = this.sim.stepCount;
    for (const [key, until] of this.cooldownUntil) {
      if (until <= now) this.cooldownUntil.delete(key);
    }
  }

  /** Runs before the solver for every touching contact with at least one awake body. */
  preSolve(contact: Contact): void {
    const tracked = contact as TrackedContact;
    if (tracked.ffImpact) tracked.ffImpact.speed = 0;

    const bodyA = contact.getFixtureA().getBody();
    const bodyB = contact.getFixtureB().getBody();
    const a = bodyA.getUserData() as Entity | null;
    const b = bodyB.getUserData() as Entity | null;
    if (!a || !b) return;
    if (!a.alive || !b.alive) {
      // Destroyed this step: no longer solid.
      contact.setEnabled(false);
      return;
    }
    if (this.sim.stepCount < this.settleSteps) return;

    const vA = bodyA.getLinearVelocity();
    const vB = bodyB.getLinearVelocity();
    const wA = bodyA.getAngularVelocity();
    const wB = bodyB.getAngularVelocity();
    const dvx = vA.x - vB.x;
    const dvy = vA.y - vB.y;
    // Cheap upper bound of the closing speed: most contacts are resting and stop here.
    if (Math.sqrt(dvx * dvx + dvy * dvy) + Math.abs(wA) * a.boundRadius + Math.abs(wB) * b.boundRadius < DAMAGE.minImpactSpeed) return;

    const wm = contact.getWorldManifold(this.manifold);
    if (!wm || wm.pointCount === 0) return;
    const nx = wm.normal.x;
    const ny = wm.normal.y;
    let px = (wm.points[0] as { x: number; y: number }).x;
    let py = (wm.points[0] as { x: number; y: number }).y;
    if (wm.pointCount > 1) {
      px = (px + (wm.points[1] as { x: number; y: number }).x) / 2;
      py = (py + (wm.points[1] as { x: number; y: number }).y) / 2;
    }
    const cA = bodyA.getWorldCenter();
    const cB = bodyB.getWorldCenter();
    const rAx = px - cA.x;
    const rAy = py - cA.y;
    const rBx = px - cB.x;
    const rBy = py - cB.y;
    // Closing speed along the contact normal (which points from A to B).
    const speed = (vA.x - wA * rAy - (vB.x - wB * rBy)) * nx + (vA.y + wA * rAx - (vB.y + wB * rBx)) * ny;
    if (speed < DAMAGE.minImpactSpeed) return;

    const rnA = rAx * ny - rAy * nx;
    const rnB = rBx * ny - rBy * nx;
    const k = a.invMass + b.invMass + a.invInertia * rnA * rnA + b.invInertia * rnB * rnB;
    const effectiveMass = k > 0 ? 1 / k : 0;
    const energy = 0.5 * effectiveMass * speed * speed;

    const key = pairKey(a, b);
    const cooling = this.cooling(key);
    const damageA = cooling ? 0 : damageTo(a, b, energy);
    const damageB = cooling ? 0 : damageTo(b, a, energy);
    const destroyA = wouldDestroy(a, damageA);
    const destroyB = wouldDestroy(b, damageB);

    if (destroyA || destroyB) {
      // Smash-through: the victim breaks before it can push back.
      contact.setEnabled(false);
      this.startCooldown(key);
      this.sim.emitImpact(px, py, nx, ny, speed, energy, a, b);
      const vAx = vA.x;
      const vAy = vA.y;
      const vBx = vB.x;
      const vBy = vB.y;
      if (destroyA && !destroyB) this.slow(b, vAx, vAy, (a as DynamicEntity & { hp: number }).hp / damageA, passThrough(a), effectiveMass);
      if (destroyB && !destroyA) this.slow(a, vBx, vBy, (b as DynamicEntity & { hp: number }).hp / damageB, passThrough(b), effectiveMass);
      if (damageA > 0) this.sim.applyDamage(a, damageA, px, py);
      if (damageB > 0) this.sim.applyDamage(b, damageB, px, py);
      return;
    }

    if (a.kind === 'bird' || b.kind === 'bird') {
      // Bird hits are resolved right here from the two-body estimate; the bounce itself is left to the solver.
      if (!cooling && (damageA > 0 || damageB > 0 || energy >= DAMAGE.impactEventEnergy)) {
        this.startCooldown(key);
        this.sim.emitImpact(px, py, nx, ny, speed, energy, a, b);
        if (damageA > 0) this.sim.applyDamage(a, damageA, px, py);
        if (damageB > 0) this.sim.applyDamage(b, damageB, px, py);
      }
      return;
    }

    if (cooling) return;
    // Everything else waits for the solver so the real transmitted impulse can be used.
    const record = tracked.ffImpact ?? (tracked.ffImpact = { speed: 0, energy: 0, x: 0, y: 0, nx: 0, ny: 0 });
    record.speed = speed;
    record.energy = energy;
    record.x = px;
    record.y = py;
    record.nx = nx;
    record.ny = ny;
  }

  /** Runs after the solver with the impulses it applied. */
  postSolve(contact: Contact, impulse: ContactImpulse): void {
    const record = (contact as TrackedContact).ffImpact;
    if (!record || record.speed <= 0) return;
    const speed = record.speed;
    record.speed = 0;

    const a = contact.getFixtureA().getBody().getUserData() as Entity | null;
    const b = contact.getFixtureB().getBody().getUserData() as Entity | null;
    if (!a || !b || !a.alive || !b.alive) return;
    const key = pairKey(a, b);
    if (this.cooling(key)) return;

    const normalImpulses = impulse.normalImpulses;
    let total = 0;
    for (let i = 0; i < normalImpulses.length; i++) total += normalImpulses[i] ?? 0;
    // Remove the elastic part so a bouncy hit is not counted twice.
    const solved = (0.5 * total * speed) / (1 + contact.getRestitution());
    const energy = Math.max(record.energy, solved);

    const damageA = damageTo(a, b, energy);
    const damageB = damageTo(b, a, energy);
    if (damageA <= 0 && damageB <= 0 && energy < DAMAGE.impactEventEnergy) return;
    this.startCooldown(key);
    this.sim.emitImpact(record.x, record.y, record.nx, record.ny, speed, energy, a, b);
    if (damageA > 0) this.sim.applyDamage(a, damageA, record.x, record.y);
    if (damageB > 0) this.sim.applyDamage(b, damageB, record.x, record.y);
  }

  /**
   * The attacker keeps flying after breaking its target, but pays for it: the more of the available
   * energy the break consumed, and the heavier the target relative to the attacker, the more speed is lost.
   */
  private slow(attacker: Entity, targetVx: number, targetVy: number, consumed: number, materialKeep: number, effectiveMass: number): void {
    if (attacker.invMass === 0) return;
    const keepRelative = Math.sqrt(Math.max(0, 1 - Math.min(1, consumed))) * materialKeep;
    const share = Math.min(1, effectiveMass * attacker.invMass * DAMAGE.passMassBias);
    const keep = 1 - (1 - keepRelative) * share;
    const v = attacker.body.getLinearVelocity();
    this.velocity.x = targetVx + (v.x - targetVx) * keep;
    this.velocity.y = targetVy + (v.y - targetVy) * keep;
    attacker.body.setLinearVelocity(this.velocity);
  }
}
