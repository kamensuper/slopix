/** Bird controller and ability system: launching, in-flight steering, special powers, fuses and clean-up. */
import { ABILITY, BIRDS, PHYSICS, SHOT, SLING, WORLD } from '../core/config';
import { clamp, DEG, wrapAngle } from '../core/math';
import { refreshMass } from './bodies';
import type { BirdEntity, Entity } from './entities';
import type { GameSim } from './GameSim';
import { canLaunch, constrainPull, launchVelocity, pullPower, type Vec } from './slingshot';

const REST_TICKS = Math.round(SHOT.birdRestTime * PHYSICS.hz);
const LIFE_TICKS = Math.round(SHOT.birdLifeAfterImpact * PHYSICS.hz);
const FUSE_TICKS = Math.round(ABILITY.bomb.fuse * PHYSICS.hz);
/** How hard a flying bird turns to face its direction of travel. */
const STEER_GAIN = 14;
const STEER_MAX = 12;

const pull: Vec = { x: 0, y: 0 };
const velocity: Vec = { x: 0, y: 0 };

export class BirdSystem {
  constructor(private readonly sim: GameSim) {}

  /** Launches the bird that sits in the pouch. `pullX/Y` is the pouch offset from the anchor. */
  launch(pullX: number, pullY: number): BirdEntity | null {
    const sim = this.sim;
    const type = sim.queue[0];
    if (sim.phase !== 'aiming' || !type) return null;
    constrainPull(pullX, pullY, BIRDS[type].radius, SLING.anchor.y, pull);
    if (!canLaunch(pull.x, pull.y)) return null;
    launchVelocity(pull.x, pull.y, velocity);

    sim.queue.shift();
    const bird = sim.spawnProjectile({
      type,
      x: sim.anchor.x + pull.x,
      y: sim.anchor.y + pull.y,
      vx: velocity.x,
      vy: velocity.y,
      tick: sim.tick,
      spawned: false,
    });
    sim.beginShot(bird);
    sim.emit({
      type: 'birdLaunched',
      id: bird.id,
      bird: type,
      x: bird.x,
      y: bird.y,
      vx: velocity.x,
      vy: velocity.y,
      power: pullPower(pull.x, pull.y),
    });
    return bird;
  }

  /** True while a tap would trigger the active bird's special power. */
  canUseAbility(): boolean {
    const sim = this.sim;
    const bird = sim.activeBird;
    if (sim.phase !== 'flying' || !bird || !bird.alive || bird.abilityUsed || bird.type === 'egg') return false;
    const ability = BIRDS[bird.type].ability;
    if (ability === 'none') return false;
    // Only the bomb can still be triggered after hitting something.
    return ability === 'explode' || !bird.impacted;
  }

  activateAbility(): boolean {
    const sim = this.sim;
    const bird = sim.activeBird;
    if (!bird || bird.type === 'egg' || !this.canUseAbility()) return false;
    const ability = BIRDS[bird.type].ability;
    const body = bird.body;
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    const vx = v.x;
    const vy = v.y;
    bird.abilityUsed = true;
    bird.abilityTick = sim.tick;
    sim.emit({ type: 'ability', ability, id: bird.id, bird: bird.type, x: p.x, y: p.y, vx, vy });

    switch (ability) {
      case 'boost': {
        const speed = Math.hypot(vx, vy);
        const target = clamp(speed * ABILITY.boost.speedFactor, ABILITY.boost.minSpeed, ABILITY.boost.maxSpeed);
        velocity.x = speed > 0.01 ? (vx / speed) * target : target;
        velocity.y = speed > 0.01 ? (vy / speed) * target : 0;
        body.setLinearVelocity(velocity);
        break;
      }
      case 'split': {
        for (const side of [-1, 1]) {
          const angle = side * ABILITY.split.spreadDeg * DEG;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          const scale = 1 + side * ABILITY.split.speedJitter;
          const clone = sim.spawnProjectile({
            type: 'blues',
            x: p.x,
            y: p.y,
            vx: (vx * c - vy * s) * scale,
            vy: (vx * s + vy * c) * scale,
            tick: sim.tick,
            spawned: true,
          });
          clone.abilityUsed = true;
          clone.abilityTick = sim.tick;
        }
        break;
      }
      case 'egg': {
        const egg = ABILITY.egg;
        sim.spawnProjectile({
          type: 'egg',
          x: p.x,
          y: p.y - bird.radius * 0.5,
          vx: vx * egg.inheritX,
          vy: Math.min(vy, 0) - egg.dropSpeed,
          tick: sim.tick,
          spawned: true,
        });
        // Lighter and kicked up and forwards, as if the egg had been a counterweight.
        velocity.x = vx + (vx < 0 ? -1 : 1) * egg.kickForward;
        velocity.y = Math.max(vy, 0) * 0.4 + egg.kickUp;
        body.setLinearVelocity(velocity);
        body.getFixtureList()?.setDensity(egg.densityAfter);
        refreshMass(bird);
        break;
      }
      case 'explode':
        this.detonateBomb(bird);
        break;
      default:
        break;
    }
    return true;
  }

  private detonateBomb(bird: BirdEntity): void {
    const p = bird.body.getPosition();
    const x = p.x;
    const y = p.y;
    bird.fuseEndTick = -1;
    this.sim.removeBird(bird, 'exploded');
    this.sim.explode(x, y, 'bomb', bird);
  }

  /** Contact listener hook. The world is locked here: only flags and scalar body properties may change. */
  onBeginContact(bird: BirdEntity, other: Entity): void {
    if (!bird.alive || other.kind === 'bird') return;
    if (bird.type === 'egg') {
      bird.detonate = true;
      return;
    }
    if (bird.impacted) return;
    const sim = this.sim;
    bird.impacted = true;
    bird.impactTick = sim.tick;
    // Without damping a round bird rolls on forever.
    bird.body.setAngularDamping(SHOT.birdAngularDamping);
    bird.body.setLinearDamping(SHOT.birdLinearDamping);
    if (bird.type === 'bomb' && !bird.abilityUsed) bird.fuseEndTick = sim.tick + FUSE_TICKS;
    sim.noteImpact();
    const p = bird.body.getPosition();
    const v = bird.body.getLinearVelocity();
    sim.emit({
      type: 'birdImpact',
      id: bird.id,
      bird: bird.type,
      x: p.x,
      y: p.y,
      speed: Math.hypot(v.x, v.y),
      first: true,
      other: sim.surfaceOf(other),
    });
  }

  /** Before the physics step: steer flying birds, burn fuses. */
  preStep(): void {
    const sim = this.sim;
    for (const bird of sim.birds) {
      if (!bird.alive) continue;
      if (bird.fuseEndTick >= 0 && sim.tick >= bird.fuseEndTick) {
        bird.abilityUsed = true;
        this.detonateBomb(bird);
        continue;
      }
      if (bird.impacted || bird.type === 'egg') continue;
      const v = bird.body.getLinearVelocity();
      if (v.x * v.x + v.y * v.y < 1) continue;
      const error = wrapAngle(Math.atan2(v.y, v.x) - bird.body.getAngle());
      bird.body.setAngularVelocity(clamp(error * STEER_GAIN, -STEER_MAX, STEER_MAX));
    }
  }

  /** After the physics step: explode eggs, retire spent or lost projectiles. */
  postStep(): void {
    const sim = this.sim;
    const minX = -WORLD.outOfBoundsMargin;
    const maxX = sim.level.world.width + WORLD.outOfBoundsMargin;
    for (const bird of sim.birds) {
      if (!bird.alive) continue;
      if (bird.detonate) {
        sim.removeBird(bird, 'exploded');
        sim.explode(bird.x, bird.y, 'egg', bird);
        continue;
      }
      if (bird.x < minX || bird.x > maxX || bird.y < -3) {
        sim.removeBird(bird, 'bounds');
        continue;
      }
      if (!bird.impacted) continue;
      const resting = bird.vx * bird.vx + bird.vy * bird.vy < SHOT.restSpeed * SHOT.restSpeed;
      bird.restTicks = resting ? bird.restTicks + 1 : 0;
      // A bomb with a lit fuse stays until it goes off.
      if (bird.fuseEndTick >= 0) continue;
      if (bird.restTicks >= REST_TICKS) sim.removeBird(bird, 'rest');
      else if (sim.tick - bird.impactTick >= LIFE_TICKS) sim.removeBird(bird, 'timeout');
    }
  }
}
