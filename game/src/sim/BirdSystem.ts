/** Bird controller and ability system: launching, in-flight steering, special powers, fuses and clean-up. */
import { ABILITY, BIRDS, FOES, MATERIAL_RULES, MATERIALS, PHYSICS, SHOT, SLING, WORLD } from '../core/config';
import { clamp, DEG, wrapAngle } from '../core/math';
import type { BirdEntity, BlockEntity, Entity, FoeEntity, SurfaceTag } from './entities';
import { surfaceDistance } from './explosions';
import type { GameSim } from './GameSim';
import type { XY } from './geometry';
import { canLaunch, constrainPull, launchVelocity, pullPower, type Vec } from './slingshot';

const REST_TICKS = Math.round(SHOT.birdRestTime * PHYSICS.hz);
const LIFE_TICKS = Math.round(SHOT.birdLifeAfterImpact * PHYSICS.hz);
const FUSE_TICKS = Math.round(ABILITY.explode.fuse * PHYSICS.hz);
const WELL_TICKS = Math.round(ABILITY.gravity.duration * PHYSICS.hz);
/** How hard a flying bird turns to face its direction of travel. */
const STEER_GAIN = 14;
const STEER_MAX = 12;

const pull: Vec = { x: 0, y: 0 };
const velocity: Vec = { x: 0, y: 0 };
const force: Vec = { x: 0, y: 0 };
const nearest: XY = { x: 0, y: 0 };

/** True when segments p-q and a-b cross. */
function segmentsCross(px: number, py: number, qx: number, qy: number, ax: number, ay: number, bx: number, by: number): boolean {
  const d1x = qx - px;
  const d1y = qy - py;
  const d2x = bx - ax;
  const d2y = by - ay;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false;
  const t = ((ax - px) * d2y - (ay - py) * d2x) / denom;
  const u = ((ax - px) * d1y - (ay - py) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export class BirdSystem {
  constructor(private readonly sim: GameSim) {}

  /** Launches the bird that sits in the pouch. `pullX/Y` is the pouch offset from the anchor. */
  launch(pullX: number, pullY: number): BirdEntity | null {
    const sim = this.sim;
    const type = sim.queue[0];
    if (sim.phase !== 'aiming' || !type) return null;
    constrainPull(pullX, pullY, BIRDS[type].radius, SLING.anchor.y, pull);
    if (!canLaunch(pull.x, pull.y)) return null;
    launchVelocity(pull.x, pull.y, velocity, BIRDS[type].launch);

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
    if (sim.phase !== 'flying' || !bird || !bird.alive || bird.abilityUsed) return false;
    const config = BIRDS[bird.type];
    if (config.ability === 'none') return false;
    return config.abilityAfterImpact || !bird.impacted;
  }

  activateAbility(): boolean {
    const bird = this.sim.activeBird;
    if (!bird || !this.canUseAbility()) return false;
    this.fire(bird);
    return true;
  }

  private fire(bird: BirdEntity): void {
    const sim = this.sim;
    const ability = BIRDS[bird.type].ability;
    const body = bird.body;
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    const x = p.x;
    const y = p.y;
    const vx = v.x;
    const vy = v.y;
    bird.abilityUsed = true;
    bird.abilityTick = sim.tick;
    bird.pendingAbility = false;
    sim.emit({ type: 'ability', ability, id: bird.id, bird: bird.type, x, y, vx, vy });

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
            type: bird.type,
            x,
            y,
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
      case 'explode':
        this.detonate(bird);
        break;
      case 'slam': {
        velocity.x = vx * ABILITY.slam.keepX;
        velocity.y = -Math.max(ABILITY.slam.dropSpeed, -vy);
        body.setLinearVelocity(velocity);
        body.setAngularVelocity(0);
        bird.slamming = true;
        break;
      }
      case 'freeze':
        this.freeze(x, y);
        break;
      case 'shock':
        this.shock(x, y);
        break;
      case 'gravity': {
        // The bird hangs where it is and becomes the centre of the well.
        velocity.x = 0;
        velocity.y = 0;
        body.setLinearVelocity(velocity);
        body.setGravityScale(0);
        body.setLinearDamping(12);
        body.setAngularDamping(4);
        bird.wellEndTick = sim.tick + WELL_TICKS;
        if (!bird.impacted) {
          bird.impacted = true;
          bird.impactTick = sim.tick;
          sim.noteImpact();
        }
        sim.emit({ type: 'gravityWell', x, y, radius: ABILITY.gravity.radius, active: true });
        break;
      }
      default:
        break;
    }
  }

  private detonate(bird: BirdEntity): void {
    const p = bird.body.getPosition();
    const x = p.x;
    const y = p.y;
    bird.fuseEndTick = -1;
    this.sim.removeBird(bird, 'exploded');
    this.sim.explode(x, y, 'ember', bird);
  }

  /** Rime's frost burst: everything freezable within the radius turns brittle and slippery. */
  private freeze(x: number, y: number): void {
    const sim = this.sim;
    const radius = ABILITY.freeze.radius;
    let count = 0;
    for (const block of sim.blocks) {
      if (!block.alive || block.frozen || !MATERIALS[block.material].freezes) continue;
      if (surfaceDistance(block, x, y, nearest) > radius) continue;
      sim.freezeBlock(block);
      count++;
    }
    for (const foe of sim.foes) {
      if (!foe.alive || foe.frozen) continue;
      if (surfaceDistance(foe, x, y, nearest) > radius) continue;
      sim.freezeFoe(foe);
      count++;
    }
    sim.emit({ type: 'freeze', x, y, radius, count });
  }

  /**
   * Jolt's lightning: jumps to the nearest conductor and runs through everything conductive that
   * touches it. Foes in contact with a live piece are shocked, crates in contact go off, crystal bursts.
   */
  private shock(x: number, y: number): void {
    const sim = this.sim;
    const cfg = ABILITY.shock;
    const arcs: number[] = [];
    let hits = 0;

    let first: BlockEntity | null = null;
    let firstDistance: number = cfg.reach;
    let fx = x;
    let fy = y;
    for (const block of sim.blocks) {
      if (!block.alive || !MATERIALS[block.material].conducts) continue;
      const d = surfaceDistance(block, x, y, nearest);
      if (d < firstDistance) {
        firstDistance = d;
        first = block;
        fx = nearest.x;
        fy = nearest.y;
      }
    }
    let direct: FoeEntity | null = null;
    let directDistance: number = first ? firstDistance : cfg.reach;
    for (const foe of sim.foes) {
      if (!foe.alive) continue;
      const d = surfaceDistance(foe, x, y, nearest);
      // Metal armour attracts the bolt from further away than bare fur does.
      const metal = foe.armor > 0 && (FOES[foe.variant].armorKind === 'helmet' || FOES[foe.variant].armorKind === 'plate');
      if (d < (metal ? cfg.reach : directDistance)) {
        if (!direct || d < directDistance) {
          direct = foe;
          directDistance = d;
        }
      }
    }

    const shocked = new Set<FoeEntity>();
    const crates = new Set<BlockEntity>();
    const live: BlockEntity[] = [];
    if (first && (!direct || firstDistance <= directDistance)) {
      arcs.push(x, y, fx, fy);
      const seen = new Set<BlockEntity>([first]);
      live.push(first);
      for (let i = 0; i < live.length && live.length < cfg.maxChain; i++) {
        const from = live[i] as BlockEntity;
        const fp = from.body.getPosition();
        for (let edge = from.body.getContactList(); edge; edge = edge.next) {
          if (!edge.contact.isTouching()) continue;
          const other = edge.other?.getUserData() as Entity | null;
          if (!other || !other.alive) continue;
          if (other.kind === 'foe') shocked.add(other);
          else if (other.kind === 'block') {
            if (other.material === 'tnt') crates.add(other);
            else if (MATERIALS[other.material].conducts && !seen.has(other) && live.length < cfg.maxChain) {
              seen.add(other);
              live.push(other);
              const op = other.body.getPosition();
              arcs.push(fp.x, fp.y, op.x, op.y);
            }
          }
        }
      }
    } else if (direct) {
      const dp = direct.body.getPosition();
      arcs.push(x, y, dp.x, dp.y);
      shocked.add(direct);
    }

    for (const block of live) {
      block.shockTick = sim.tick;
      hits++;
      const p = block.body.getPosition();
      // Crystal cannot take the current at all; metal only heats up.
      sim.applyDamage(block, block.material === 'crystal' ? block.hp + 1 : cfg.metalDamage * sim.vulnerability(block), p.x, p.y, 'shock');
    }
    for (const crate of crates) {
      const p = crate.body.getPosition();
      sim.applyDamage(crate, crate.hp + 1, p.x, p.y, 'shock');
      hits++;
    }
    for (const foe of shocked) {
      if (!foe.alive) continue;
      const kind = FOES[foe.variant].armorKind;
      const metal = foe.armor > 0 && (kind === 'helmet' || kind === 'plate');
      const p = foe.body.getPosition();
      if (live.length > 0) arcs.push(p.x, p.y + foe.radius, p.x, p.y);
      foe.shockTick = sim.tick;
      sim.applyDamage(foe, cfg.foeDamage * (metal ? cfg.armorFactor : 1) * sim.vulnerability(foe), p.x, p.y, 'shock');
      hits++;
    }
    if (arcs.length === 0) {
      // Nothing in reach: the bolt fizzles into the air below the bird.
      arcs.push(x, y, x + 0.6, y - 1.4);
    }
    sim.emit({ type: 'shock', x, y, arcs, hits });
  }

  /** Brawn landed after an anvil drop: the ground shakes. */
  private quake(bird: BirdEntity): void {
    bird.slamming = false;
    if (bird.impactSpeed < ABILITY.slam.quakeSpeed) return;
    const p = bird.body.getPosition();
    this.sim.explode(p.x, p.y - bird.radius * 0.6, 'quake', bird);
  }

  /**
   * Contact listener hook. The world is locked here: only flags and scalar body properties may change.
   * `tag` is set when the other fixture is a special terrain surface.
   */
  onBeginContact(bird: BirdEntity, other: Entity, tag: SurfaceTag | null): void {
    if (!bird.alive || other.kind === 'bird') return;
    const sim = this.sim;
    const springy = (other.kind === 'block' && other.material === 'rubber' && !other.frozen) || tag?.surface === 'bouncy';
    if (springy && !bird.impacted && bird.bounces < MATERIAL_RULES.rubberBounces) {
      // A bounce keeps the shot alive: the ability stays armed and the bird keeps its flight feathers.
      bird.bounces++;
      const p = bird.body.getPosition();
      const v = bird.body.getLinearVelocity();
      sim.emit({ type: 'bounce', x: p.x, y: p.y, speed: Math.hypot(v.x, v.y) });
      // Rime's frost goes off on the first touch of anything, a bounce included: that is how rubber gets frozen.
      if (BIRDS[bird.type].ability === 'freeze' && !bird.abilityUsed && !bird.spawned) bird.pendingAbility = true;
      return;
    }
    if (bird.impacted) return;
    bird.impacted = true;
    bird.impactTick = sim.tick;
    // Without damping a round bird rolls on forever.
    bird.body.setAngularDamping(SHOT.birdAngularDamping);
    bird.body.setLinearDamping(SHOT.birdLinearDamping);
    const v = bird.body.getLinearVelocity();
    bird.impactSpeed = Math.hypot(v.x, v.y);
    const ability = BIRDS[bird.type].ability;
    if (ability === 'explode' && !bird.abilityUsed) bird.fuseEndTick = sim.tick + FUSE_TICKS;
    // Rime bursts on landing if the player did not tap; Brawn's dive ends in a quake.
    if ((ability === 'freeze' && !bird.abilityUsed && !bird.spawned) || bird.slamming) bird.pendingAbility = true;
    sim.noteImpact();
    const p = bird.body.getPosition();
    sim.emit({
      type: 'birdImpact',
      id: bird.id,
      bird: bird.type,
      x: p.x,
      y: p.y,
      speed: bird.impactSpeed,
      first: true,
      other: sim.surfaceOf(other),
    });
  }

  /** Before the physics step: steer flying birds, burn fuses, close wells. */
  preStep(): void {
    const sim = this.sim;
    for (const bird of sim.birds) {
      if (!bird.alive) continue;
      if (bird.fuseEndTick >= 0 && sim.tick >= bird.fuseEndTick) {
        bird.abilityUsed = true;
        this.detonate(bird);
        continue;
      }
      if (bird.wellEndTick >= 0) {
        if (sim.tick >= bird.wellEndTick) {
          const p = bird.body.getPosition();
          const x = p.x;
          const y = p.y;
          bird.wellEndTick = -1;
          sim.emit({ type: 'gravityWell', x, y, radius: ABILITY.gravity.radius, active: false });
          sim.removeBird(bird, 'exploded');
          sim.explode(x, y, 'nova', bird);
        }
        continue;
      }
      if (bird.impacted) continue;
      const v = bird.body.getLinearVelocity();
      if (v.x * v.x + v.y * v.y < 1) continue;
      const error = wrapAngle(Math.atan2(v.y, v.x) - bird.body.getAngle());
      bird.body.setAngularVelocity(clamp(error * STEER_GAIN, -STEER_MAX, STEER_MAX));
    }
  }

  /** Before every physics sub-step: wind on flying birds and the pull of open gravity wells. */
  applyForces(): void {
    const sim = this.sim;
    const wind = sim.wind;
    for (const bird of sim.birds) {
      if (!bird.alive) continue;
      if (bird.wellEndTick >= 0) {
        this.pullTowards(bird);
        continue;
      }
      if (wind !== 0 && !bird.impacted && bird.invMass > 0) {
        force.x = wind / bird.invMass;
        force.y = 0;
        bird.body.applyForceToCenter(force, true);
      }
    }
  }

  private pullTowards(bird: BirdEntity): void {
    const sim = this.sim;
    const cfg = ABILITY.gravity;
    const centre = bird.body.getPosition();
    const cx = centre.x;
    const cy = centre.y;
    const pullOn = (e: BlockEntity | FoeEntity): void => {
      if (!e.alive || e.invMass === 0) return;
      if (e.kind === 'block' && e.motorized) return;
      const p = e.body.getWorldCenter();
      const dx = cx - p.x;
      const dy = cy - p.y;
      const d = Math.hypot(dx, dy);
      if (d >= cfg.radius || d < 1e-3) return;
      const mass = 1 / e.invMass;
      const a = cfg.pull * (1 - d / cfg.radius);
      const v = e.body.getLinearVelocity();
      // Close to the centre things are held rather than slung through.
      const hold = d < 1.5 ? cfg.drag * (1 - d / 1.5) : 0;
      force.x = mass * ((dx / d) * a - v.x * hold);
      force.y = mass * ((dy / d) * a - v.y * hold);
      e.body.applyForceToCenter(force, true);
    };
    for (const block of sim.blocks) pullOn(block);
    for (const foe of sim.foes) pullOn(foe);
  }

  /** After the physics step: fire deferred abilities, cut ropes, retire spent or lost projectiles. */
  postStep(): void {
    const sim = this.sim;
    const minX = -WORLD.outOfBoundsMargin;
    const maxX = sim.level.world.width + WORLD.outOfBoundsMargin;
    for (const bird of sim.birds) {
      if (!bird.alive) continue;
      if (bird.pendingAbility) {
        bird.pendingAbility = false;
        if (bird.slamming) this.quake(bird);
        else if (!bird.abilityUsed) this.fire(bird);
      }
      this.cutRopes(bird);
      if (bird.x < minX || bird.x > maxX || bird.y < -3) {
        sim.removeBird(bird, 'bounds');
        continue;
      }
      if (!bird.impacted) continue;
      const resting = bird.vx * bird.vx + bird.vy * bird.vy < SHOT.restSpeed * SHOT.restSpeed;
      bird.restTicks = resting ? bird.restTicks + 1 : 0;
      // A lit fuse or an open well keeps the bird around until it is done.
      if (bird.fuseEndTick >= 0 || bird.wellEndTick >= 0) continue;
      if (bird.restTicks >= REST_TICKS) sim.removeBird(bird, 'rest');
      else if (sim.tick - bird.impactTick >= LIFE_TICKS) sim.removeBird(bird, 'timeout');
    }
  }

  /** A bird that flies through a rope cuts it. */
  private cutRopes(bird: BirdEntity): void {
    const sim = this.sim;
    if (sim.joints.length === 0) return;
    const limit = MATERIAL_RULES.ropeCutSpeed;
    if (bird.vx * bird.vx + bird.vy * bird.vy < limit * limit) return;
    for (const j of sim.joints) {
      if (!j.alive || j.kind !== 'rope') continue;
      const a = j.joint.getAnchorA();
      const ax = a.x;
      const ay = a.y;
      const b = j.joint.getAnchorB();
      if (segmentsCross(bird.px, bird.py, bird.x, bird.y, ax, ay, b.x, b.y)) sim.breakJoint(j, true);
    }
  }
}
