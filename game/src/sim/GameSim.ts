/**
 * GameSim: the complete, deterministic simulation of one level.
 *
 * It owns the physics world and all gameplay rules (damage, abilities, scoring, turn flow) and has
 * no dependency on the DOM, rendering or audio: the presentation layer steps it at a fixed rate,
 * reads entity transforms and drains `events`. The same class runs headless in tests and in the
 * level solver.
 */
import { RevoluteJoint, RopeJoint, World, type Body, type Contact, type Joint } from 'planck';
import { ABILITY, DAMAGE, EXPLOSIONS, FLOATER, FOES, MATERIAL_RULES, MATERIALS, PHYSICS, SCORE, SHOT, SLING, SUBSTEP, TNT_CHAIN_DELAY, WORLD } from '../core/config';
import type { ExplosionSource, ExpireReason, ScoreReason, SimEvent, SurfaceKind } from '../core/events';
import type { BirdType, LevelDef } from '../core/types';
import { BirdSystem } from './BirdSystem';
import { createBlock, createFoe, createProjectile, createTerrain, type ProjectileSpawn } from './bodies';
import { DamageSystem } from './DamageSystem';
import type { BirdEntity, BlockEntity, DynamicEntity, Entity, JointEntity, FoeEntity, SurfaceTag, TerrainEntity } from './entities';
import { pushFromBlast, surfaceDistance } from './explosions';
import type { XY } from './geometry';

export type SimPhase =
  /** A bird sits in the pouch, waiting to be launched. */
  | 'aiming'
  /** A shot is in progress and has not been resolved yet. */
  | 'flying'
  | 'won'
  | 'lost';

export interface WinSummary {
  baseScore: number;
  clearBonus: number;
  unusedBirds: number;
  birdBonus: number;
  score: number;
}

/** What caused a hit: decides whether armour and shields apply. */
export type DamageSource = 'impact' | 'blast' | 'shock' | 'crack' | 'resonance';

/** Delayed effects: chained explosions, ice cracks reaching a neighbour, crystal pulses. */
type Pending =
  | { tick: number; kind: 'blast'; x: number; y: number; source: ExplosionSource }
  | { tick: number; kind: 'crack'; x: number; y: number; target: BlockEntity; amount: number }
  | { tick: number; kind: 'resonance'; x: number; y: number };

const CALM_TICKS = Math.round(SHOT.calmTime * PHYSICS.hz);
const WIN_DELAY_TICKS = Math.round(SHOT.winDelay * PHYSICS.hz);
/** Never keep the player waiting for stragglers longer than this after the last foe is gone. */
const WIN_MAX_TICKS = WIN_DELAY_TICKS + 3 * PHYSICS.hz;
const MAX_AFTER_IMPACT_TICKS = Math.round(SHOT.maxAfterImpact * PHYSICS.hz);
const MAX_AFTER_LAUNCH_TICKS = Math.round(SHOT.maxAfterLaunch * PHYSICS.hz);
const BIRD_IDLE_TICKS = Math.round(0.4 * PHYSICS.hz);
const TNT_DELAY_TICKS = Math.max(1, Math.round(TNT_CHAIN_DELAY * PHYSICS.hz));
const CRACK_DELAY_TICKS = Math.max(1, Math.round(MATERIAL_RULES.iceCrackDelay * PHYSICS.hz));
const RESONANCE_DELAY_TICKS = Math.max(1, Math.round(MATERIAL_RULES.resonance.delay * PHYSICS.hz));
const TWO_PI = Math.PI * 2;

function stageFor(healthFraction: number): 0 | 1 | 2 | 3 {
  const [light, medium, heavy] = DAMAGE.stageThresholds;
  if (healthFraction > light) return 0;
  if (healthFraction > medium) return 1;
  if (healthFraction > heavy) return 2;
  return 3;
}

export class GameSim {
  readonly level: LevelDef;
  readonly world: World;
  readonly terrain: TerrainEntity;
  /** Live entities in creation order (stable draw order). Destroyed entities are dropped after each tick. */
  blocks: BlockEntity[] = [];
  foes: FoeEntity[] = [];
  birds: BirdEntity[] = [];
  /** Live ropes and hinges. */
  joints: JointEntity[] = [];
  /** Filled while stepping; the consumer reads the events and then sets `events.length = 0`. */
  readonly events: SimEvent[] = [];
  /** World position of the launch anchor (pouch at rest). */
  readonly anchor: XY;
  /** Birds not launched yet; the first one sits in the pouch while aiming. */
  readonly queue: BirdType[];
  readonly flock: BirdSystem;
  /** Level-wide wind (m/s^2 on flying birds) and gravity multiplier. */
  readonly wind: number;
  readonly gravityScale: number;

  phase: SimPhase = 'aiming';
  score = 0;
  /** Number of completed ticks (PHYSICS.hz per second). */
  tick = 0;
  /** Number of completed physics sub-steps. */
  stepCount = 0;
  birdsUsed = 0;
  blocksDestroyed = 0;
  readonly foesTotal: number;
  foesAlive: number;
  /** The bird of the current shot (kept after it is gone, until the shot resolves). */
  activeBird: BirdEntity | null = null;
  /** Set once the level has been won. */
  summary: WinSummary | null = null;

  private nextId = 1;
  private readonly damage: DamageSystem;
  private readonly removals: Body[] = [];
  private readonly pending: Pending[] = [];
  private readonly force: XY = { x: 0, y: 0 };
  private hasFloaters = false;
  private readonly hit: XY = { x: 0, y: 0 };
  private listsDirty = false;
  private shotLaunchTick = 0;
  private firstImpactTick = -1;
  private calmTicks = 0;
  private winTick = -1;

  constructor(level: LevelDef) {
    this.level = level;
    this.wind = level.env?.wind ?? 0;
    this.gravityScale = level.env?.gravity ?? 1;
    this.world = new World({ gravity: { x: 0, y: -PHYSICS.gravity * this.gravityScale }, allowSleep: true });
    this.anchor = { x: level.slingshot.x + SLING.anchor.x, y: level.slingshot.y + SLING.anchor.y };
    this.queue = [...level.birds];
    this.terrain = createTerrain(this.world, level, this.nextId++);
    for (const def of level.blocks) this.blocks.push(createBlock(this.world, def, this.nextId++));
    for (const def of level.foes) this.foes.push(createFoe(this.world, def, this.nextId++));
    this.createJoints(level);
    this.hasFloaters = this.foes.some((foe) => foe.floating);
    this.foesTotal = this.foes.length;
    this.foesAlive = this.foes.length;

    this.damage = new DamageSystem(this);
    this.flock = new BirdSystem(this);
    this.world.on('pre-solve', (contact) => {
      this.conveyors(contact);
      this.damage.preSolve(contact);
    });
    this.world.on('post-solve', (contact, impulse) => this.damage.postSolve(contact, impulse));
    this.world.on('begin-contact', (contact) => this.onBeginContact(contact));

    const first = this.queue[0];
    if (first) this.emit({ type: 'birdReady', bird: first, remaining: this.queue.length });
  }

  // ------------------------------------------------------------------ joints

  private createJoints(level: LevelDef): void {
    for (const def of level.joints ?? []) {
      const a = this.blocks[def.a];
      const b = def.b !== undefined ? this.blocks[def.b] : null;
      if (!a) continue;
      const bodyB = b ? b.body : this.terrain.body;
      let joint: Joint | null;
      if (def.kind === 'rope') {
        const bx = def.bx ?? def.ax;
        const by = def.by ?? def.ay;
        const anchorA = a.body.getLocalPoint({ x: def.ax, y: def.ay });
        const anchorB = bodyB.getLocalPoint({ x: bx, y: by });
        const maxLength = Math.max(0.05, Math.hypot(bx - def.ax, by - def.ay));
        joint = this.world.createJoint(new RopeJoint({ bodyA: a.body, bodyB, localAnchorA: anchorA, localAnchorB: anchorB, maxLength, collideConnected: true }));
      } else {
        const motor = def.motor !== undefined && def.motor !== 0;
        joint = this.world.createJoint(
          new RevoluteJoint(
            motor ? { collideConnected: false, enableMotor: true, motorSpeed: (def.motor as number) * (Math.PI / 180), maxMotorTorque: 1e6 } : { collideConnected: false },
            a.body,
            bodyB,
            { x: def.ax, y: def.ay },
          ),
        );
        if (motor) {
          a.motorized = true;
          a.body.setSleepingAllowed(false);
        }
      }
      if (joint) this.joints.push({ kind: def.kind, joint, strength: def.strength ?? Infinity, alive: true, a, b, motor: def.kind === 'pin' && !!def.motor });
    }
  }

  /** Snaps overloaded joints and forgets joints whose pieces were destroyed. */
  private checkJoints(): void {
    if (this.joints.length === 0) return;
    let dirty = false;
    for (const j of this.joints) {
      if (!j.alive) continue;
      if (!j.a.alive || (j.b && !j.b.alive)) {
        // Planck destroys joints together with their bodies.
        j.alive = false;
        dirty = true;
        continue;
      }
      if (j.strength === Infinity) continue;
      const force = j.joint.getReactionForce(1 / SUBSTEP);
      if (Math.hypot(force.x, force.y) > j.strength) this.breakJoint(j, false);
    }
    if (dirty || this.jointsDirty) {
      this.jointsDirty = false;
      this.joints = this.joints.filter((j) => j.alive);
    }
  }

  private jointsDirty = false;

  /** Snaps a rope or hinge. `cut` = a bird flew through it. Must not be called while the world is stepping. */
  breakJoint(j: JointEntity, cut: boolean): void {
    if (!j.alive) return;
    const a = j.joint.getAnchorA();
    const b = j.joint.getAnchorB();
    const x = cut ? (a.x + b.x) / 2 : a.x;
    const y = cut ? (a.y + b.y) / 2 : a.y;
    this.world.destroyJoint(j.joint);
    j.alive = false;
    this.jointsDirty = true;
    j.a.body.setAwake(true);
    j.b?.body.setAwake(true);
    this.emit({ type: 'jointBroken', kind: j.kind, x, y, cut });
  }

  // ------------------------------------------------------------------ environment

  /** Conveyor belts drag whatever touches them along their surface. */
  private conveyors(contact: Contact): void {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const ta = fa.getUserData() as SurfaceTag | null;
    const tb = fb.getUserData() as SurfaceTag | null;
    // Positive speed carries things towards +x (away from the slingshot).
    if (ta && ta.surface === 'conveyor') contact.setTangentSpeed(ta.speed);
    else if (tb && tb.surface === 'conveyor') contact.setTangentSpeed(-tb.speed);
  }

  /** Before every sub-step: balloons hold their foes up, wind and gravity wells act on the flock. */
  private applyForces(): void {
    this.flock.applyForces();
    if (!this.hasFloaters) return;
    const t = (this.stepCount * SUBSTEP * TWO_PI) / FLOATER.patrolPeriod;
    const f = this.force;
    for (const foe of this.foes) {
      if (!foe.alive || !foe.floating) continue;
      const p = foe.body.getPosition();
      const v = foe.body.getLinearVelocity();
      const targetX = foe.homeX + (foe.patrol !== 0 ? Math.sin(t) * foe.patrol : 0);
      const dx = targetX - p.x;
      const dy = foe.homeY - p.y;
      // Dragged too far from its post (a gravity well, a falling beam): the string snaps.
      if (dx * dx + dy * dy > 2.25) {
        this.popBalloon(foe);
        continue;
      }
      const mass = 1 / foe.invMass;
      f.x = mass * (FLOATER.spring * dx - FLOATER.damping * v.x);
      f.y = mass * (FLOATER.spring * dy - FLOATER.damping * v.y);
      foe.body.applyForceToCenter(f, true);
    }
  }

  /** The balloon is gone: the foe falls like everything else. */
  popBalloon(foe: FoeEntity): void {
    if (!foe.floating) return;
    foe.floating = false;
    foe.body.setGravityScale(1);
    foe.body.setLinearDamping(0);
    foe.body.setAwake(true);
    const p = foe.body.getPosition();
    this.emit({ type: 'balloonPopped', id: foe.id, x: p.x, y: p.y + foe.radius * 2.4 });
  }

  /** Damage multiplier from the target's condition (frozen things are brittle). */
  vulnerability(target: Entity): number {
    return (target.kind === 'block' || target.kind === 'foe') && target.frozen ? ABILITY.freeze.brittle : 1;
  }

  /** Frost makes a piece brittle and nearly frictionless; frozen rubber stops bouncing. */
  freezeBlock(block: BlockEntity): void {
    if (block.frozen || !MATERIALS[block.material].freezes) return;
    block.frozen = true;
    const fixture = block.body.getFixtureList();
    if (fixture) {
      fixture.setFriction(ABILITY.freeze.friction);
      if (block.material === 'rubber') fixture.setRestitution(ABILITY.freeze.restitution);
    }
    for (let edge = block.body.getContactList(); edge; edge = edge.next) {
      edge.contact.resetFriction();
      edge.contact.resetRestitution();
    }
    block.body.setAwake(true);
  }

  freezeFoe(foe: FoeEntity): void {
    if (foe.frozen) return;
    foe.frozen = true;
    // A frozen balloon bursts.
    this.popBalloon(foe);
    foe.body.setAwake(true);
  }

  // ------------------------------------------------------------------ public API

  /** Bird waiting in the pouch, or null while a shot is in progress / the level is over. */
  get loadedBird(): BirdType | null {
    return this.phase === 'aiming' ? (this.queue[0] ?? null) : null;
  }

  get time(): number {
    return this.tick / PHYSICS.hz;
  }

  get foesDefeated(): number {
    return this.foesTotal - this.foesAlive;
  }

  get isOver(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }

  /** Launches the loaded bird; `pullX/Y` is the pouch offset from the anchor. Returns false if the shot was not valid. */
  launch(pullX: number, pullY: number): boolean {
    return this.flock.launch(pullX, pullY) !== null;
  }

  canUseAbility(): boolean {
    return this.flock.canUseAbility();
  }

  activateAbility(): boolean {
    return this.flock.activateAbility();
  }

  /** Advances the simulation by one fixed tick. */
  step(): void {
    this.rememberTransforms();
    this.tick++;
    this.flock.preStep();
    this.fireBlasts();
    for (let i = 0; i < PHYSICS.substeps; i++) {
      this.applyForces();
      this.world.step(SUBSTEP, PHYSICS.velocityIterations, PHYSICS.positionIterations);
      this.checkJoints();
      this.stepCount++;
      this.flushRemovals();
    }
    this.syncTransforms();
    this.flock.postStep();
    this.cullOutOfBounds();
    this.flushRemovals();
    this.compactLists();
    this.updateFlow();
  }

  // ------------------------------------------------------------------ internals used by the sub-systems

  emit(event: SimEvent): void {
    this.events.push(event);
  }

  surfaceOf(entity: Entity): SurfaceKind {
    switch (entity.kind) {
      case 'block':
        return entity.material;
      case 'foe':
        return 'foe';
      case 'bird':
        return 'bird';
      default:
        return 'ground';
    }
  }

  emitImpact(x: number, y: number, nx: number, ny: number, speed: number, energy: number, a: Entity, b: Entity): void {
    this.emit({ type: 'impact', x, y, nx, ny, speed, energy, a: this.surfaceOf(a), b: this.surfaceOf(b) });
  }

  spawnProjectile(spawn: ProjectileSpawn): BirdEntity {
    const bird = createProjectile(this.world, spawn, this.nextId++);
    this.birds.push(bird);
    return bird;
  }

  beginShot(bird: BirdEntity): void {
    this.activeBird = bird;
    this.birdsUsed++;
    this.phase = 'flying';
    this.shotLaunchTick = this.tick;
    this.firstImpactTick = -1;
    this.calmTicks = 0;
  }

  noteImpact(): void {
    if (this.firstImpactTick < 0) this.firstImpactTick = this.tick;
  }

  removeBird(bird: BirdEntity, reason: ExpireReason): void {
    if (!bird.alive) return;
    bird.alive = false;
    const p = bird.body.getPosition();
    this.retire(bird.body);
    this.emit({ type: 'birdExpired', id: bird.id, bird: bird.type, x: p.x, y: p.y, reason });
  }

  applyDamage(target: Entity, amount: number, x: number, y: number, source: DamageSource = 'impact'): void {
    if (!target.alive || amount <= 0) return;
    if (target.kind === 'block') this.damageBlock(target, amount, source);
    else if (target.kind === 'foe') this.damageFoe(target, amount, x, y, source);
  }

  /** Radial explosion. Must not be called while the physics world is stepping. */
  explode(x: number, y: number, source: ExplosionSource, ignore?: DynamicEntity): void {
    const config = EXPLOSIONS[source];
    this.emit({ type: 'explosion', source, x, y, radius: config.radius });
    const hit = this.hit;
    for (const block of this.blocks) {
      if (!block.alive || block === ignore) continue;
      const falloff = pushFromBlast(block, x, y, config, hit);
      if (falloff > 0) this.applyDamage(block, config.energy * falloff * config.power[block.material] * this.vulnerability(block), hit.x, hit.y, 'blast');
    }
    for (const foe of this.foes) {
      if (!foe.alive) continue;
      const falloff = pushFromBlast(foe, x, y, config, hit);
      if (falloff > 0) this.applyDamage(foe, config.energy * falloff * config.power.foe * this.vulnerability(foe), hit.x, hit.y, 'blast');
    }
    for (const bird of this.birds) {
      if (bird.alive && bird !== ignore) pushFromBlast(bird, x, y, config, hit);
    }
  }

  // ------------------------------------------------------------------ damage, destruction, score

  private addScore(points: number, x: number, y: number, reason: ScoreReason): void {
    if (points <= 0) return;
    this.score += points;
    this.emit({ type: 'score', points, x, y, reason });
  }

  /** Pays out banked fractional points in steps of 10. */
  private payBank(entity: BlockEntity | FoeEntity, x: number, y: number): void {
    const payout = Math.floor(entity.scoreBank / 10) * 10;
    if (payout <= 0) return;
    entity.scoreBank -= payout;
    this.addScore(payout, x, y, 'damage');
  }

  private damageBlock(block: BlockEntity, amount: number, source: DamageSource): void {
    const material = MATERIALS[block.material];
    const p = block.body.getPosition();
    const dealt = Math.min(block.hp, amount);
    block.hp -= amount;
    block.hitTick = this.tick;
    block.scoreBank += (dealt / block.maxHp) * material.destroyScore * SCORE.damageShare;
    this.payBank(block, p.x, p.y);
    if (block.hp <= 0) {
      this.destroyBlock(block, source);
      return;
    }
    const stage = stageFor(block.hp / block.maxHp);
    const stageChanged = stage !== block.stage;
    block.stage = stage;
    this.emit({ type: 'blockDamaged', id: block.id, material: block.material, x: p.x, y: p.y, damage: dealt, stage, stageChanged });
  }

  private destroyBlock(block: BlockEntity, source: DamageSource = 'impact'): void {
    if (!block.alive) return;
    if (block.material === 'ice' && source !== 'blast') this.spreadCrack(block);
    block.alive = false;
    block.hp = 0;
    this.blocksDestroyed++;
    const p = block.body.getPosition();
    const v = block.body.getLinearVelocity();
    this.retire(block.body);
    this.emit({
      type: 'blockDestroyed',
      id: block.id,
      material: block.material,
      shape: block.shape,
      x: p.x,
      y: p.y,
      w: block.w,
      h: block.h,
      angle: block.body.getAngle(),
      vx: v.x,
      vy: v.y,
    });
    this.addScore(MATERIALS[block.material].destroyScore, p.x, p.y, 'block');
    if (block.material === 'tnt') this.pending.push({ tick: this.tick + TNT_DELAY_TICKS, kind: 'blast', x: p.x, y: p.y, source: 'tnt' });
    else if (block.material === 'crystal') this.pending.push({ tick: this.tick + RESONANCE_DELAY_TICKS, kind: 'resonance', x: p.x, y: p.y });
  }

  /** A shattering ice piece sends a crack into every ice piece it touches. */
  private spreadCrack(block: BlockEntity): void {
    const amount = block.maxHp * MATERIAL_RULES.iceCrackShare;
    for (let edge = block.body.getContactList(); edge; edge = edge.next) {
      if (!edge.contact.isTouching()) continue;
      const other = edge.other?.getUserData() as Entity | null;
      if (!other || !other.alive || other.kind !== 'block' || other.material !== 'ice') continue;
      const p = other.body.getPosition();
      this.pending.push({ tick: this.tick + CRACK_DELAY_TICKS, kind: 'crack', x: p.x, y: p.y, target: other, amount });
    }
  }

  /** The pulse of a shattered crystal: hurts foes, shatters other crystals, moves nothing. */
  private resonate(x: number, y: number): void {
    const cfg = MATERIAL_RULES.resonance;
    this.emit({ type: 'resonance', x, y, radius: cfg.radius });
    const hit = this.hit;
    for (const foe of this.foes) {
      if (!foe.alive) continue;
      const d = surfaceDistance(foe, x, y, hit);
      if (d < cfg.radius) this.applyDamage(foe, cfg.foeDamage * (1 - d / cfg.radius) * this.vulnerability(foe), hit.x, hit.y, 'resonance');
    }
    for (const block of this.blocks) {
      if (!block.alive || block.material !== 'crystal') continue;
      const d = surfaceDistance(block, x, y, hit);
      if (d < cfg.radius) this.applyDamage(block, cfg.crystalDamage, hit.x, hit.y, 'resonance');
    }
  }

  private damageFoe(foe: FoeEntity, amount: number, x: number, y: number, source: DamageSource): void {
    const config = FOES[foe.variant];
    const p = foe.body.getPosition();
    foe.hitTick = this.tick;
    this.popBalloon(foe);
    let remaining = amount;
    // Lightning and crystal pulses go straight through armour. A shield only covers the front:
    // impacts that land on the slingshot side below the crown of the head.
    let armored = foe.armor > 0 && source !== 'shock' && source !== 'resonance';
    if (armored && config.armorKind === 'shield') armored = source === 'impact' && x < p.x - foe.radius * 0.15 && y < p.y + foe.radius * 0.7;
    if (armored) {
      const absorbed = amount * config.armorFactor;
      if (absorbed < foe.armor) {
        foe.armor -= absorbed;
        this.emit({ type: 'foeDamaged', id: foe.id, variant: foe.variant, x, y, damage: absorbed, hpFraction: foe.hp / foe.maxHp, armored: true });
        return;
      }
      // The armour gives way; whatever is left of the blow reaches the foe.
      remaining = (absorbed - foe.armor) / config.armorFactor;
      foe.armor = 0;
      const v = foe.body.getLinearVelocity();
      this.emit({ type: 'armorBroken', id: foe.id, variant: foe.variant, x: p.x, y: p.y, vx: v.x, vy: v.y });
      if (remaining < config.minEnergy) return;
    }
    const dealt = Math.min(foe.hp, remaining);
    foe.hp -= remaining;
    foe.scoreBank += (dealt / foe.maxHp) * SCORE.foeDamagePool;
    this.payBank(foe, p.x, p.y);
    if (foe.hp <= 0) {
      this.defeatFoe(foe);
      return;
    }
    this.emit({ type: 'foeDamaged', id: foe.id, variant: foe.variant, x, y, damage: dealt, hpFraction: foe.hp / foe.maxHp, armored: false });
  }

  private defeatFoe(foe: FoeEntity): void {
    if (!foe.alive) return;
    foe.alive = false;
    foe.hp = 0;
    this.foesAlive--;
    const p = foe.body.getPosition();
    const v = foe.body.getLinearVelocity();
    this.retire(foe.body);
    this.emit({ type: 'foeDefeated', id: foe.id, variant: foe.variant, x: p.x, y: p.y, vx: v.x, vy: v.y, remaining: this.foesAlive });
    this.addScore(FOES[foe.variant].score, p.x, p.y, 'foe');
    if (foe.variant === 'sapper') this.pending.push({ tick: this.tick + TNT_DELAY_TICKS, kind: 'blast', x: p.x, y: p.y, source: 'sapper' });
    if (this.foesAlive === 0 && this.winTick < 0) this.winTick = this.tick;
  }

  // ------------------------------------------------------------------ stepping helpers

  private onBeginContact(contact: Contact): void {
    const a = contact.getFixtureA().getBody().getUserData() as Entity | null;
    const b = contact.getFixtureB().getBody().getUserData() as Entity | null;
    if (!a || !b) return;
    if (a.kind === 'bird') this.flock.onBeginContact(a, b, contact.getFixtureB().getUserData() as SurfaceTag | null);
    if (b.kind === 'bird') this.flock.onBeginContact(b, a, contact.getFixtureA().getUserData() as SurfaceTag | null);
    // Anything solid bumping into a balloonist bursts the balloon.
    if (a.kind === 'foe' && a.floating && b.kind !== 'terrain') this.bumped.push(a);
    if (b.kind === 'foe' && b.floating && a.kind !== 'terrain') this.bumped.push(b);
  }

  private readonly bumped: FoeEntity[] = [];

  /** Bodies cannot be destroyed while the world is stepping, so they are queued and removed afterwards. */
  private retire(body: Body): void {
    this.removals.push(body);
    this.listsDirty = true;
  }

  private flushRemovals(): void {
    if (this.removals.length === 0) return;
    for (const body of this.removals) this.world.destroyBody(body);
    this.removals.length = 0;
  }

  private compactLists(): void {
    if (!this.listsDirty) return;
    this.listsDirty = false;
    this.blocks = this.blocks.filter((e) => e.alive);
    this.foes = this.foes.filter((e) => e.alive);
    this.birds = this.birds.filter((e) => e.alive);
  }

  private fireBlasts(): void {
    if (this.bumped.length > 0) {
      for (const foe of this.bumped) if (foe.alive) this.popBalloon(foe);
      this.bumped.length = 0;
    }
    if (this.pending.length === 0) return;
    // Oldest first so chains unfold in the order they were set off.
    const due = this.pending.filter((item) => this.tick >= item.tick);
    if (due.length === 0) return;
    for (const item of due) this.pending.splice(this.pending.indexOf(item), 1);
    for (const item of due) {
      if (item.kind === 'blast') this.explode(item.x, item.y, item.source);
      else if (item.kind === 'resonance') this.resonate(item.x, item.y);
      else if (item.target.alive) {
        this.emit({ type: 'iceCrack', x: item.x, y: item.y });
        this.applyDamage(item.target, item.amount, item.x, item.y, 'crack');
      }
    }
    this.flushRemovals();
  }

  private rememberTransforms(): void {
    for (const list of [this.blocks, this.foes, this.birds] as DynamicEntity[][]) {
      for (const e of list) {
        e.px = e.x;
        e.py = e.y;
        e.pangle = e.angle;
      }
    }
  }

  private syncTransforms(): void {
    for (const list of [this.blocks, this.foes, this.birds] as DynamicEntity[][]) {
      for (const e of list) {
        if (!e.alive) continue;
        const p = e.body.getPosition();
        const v = e.body.getLinearVelocity();
        e.x = p.x;
        e.y = p.y;
        e.angle = e.body.getAngle();
        e.vx = v.x;
        e.vy = v.y;
      }
    }
  }

  /** Anything knocked far off the playfield is gone for good (and counts as destroyed / defeated). */
  private cullOutOfBounds(): void {
    const minX = -WORLD.outOfBoundsMargin;
    const maxX = this.level.world.width + WORLD.outOfBoundsMargin;
    for (const block of this.blocks) {
      if (block.alive && (block.x < minX || block.x > maxX || block.y < -3)) this.destroyBlock(block);
    }
    for (const foe of this.foes) {
      if (foe.alive && (foe.x < minX || foe.x > maxX || foe.y < -3)) this.defeatFoe(foe);
    }
  }

  private worldIsMoving(): boolean {
    const limit = SHOT.calmSpeed;
    for (const list of [this.blocks, this.foes, this.birds] as DynamicEntity[][]) {
      for (const e of list) {
        if (!e.alive || !e.body.isAwake()) continue;
        if ((e.kind === 'block' && e.motorized) || (e.kind === 'foe' && e.floating)) continue;
        if (e.vx * e.vx + e.vy * e.vy > limit * limit) return true;
        if (Math.abs(e.body.getAngularVelocity()) * e.boundRadius > limit * 2) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ turn flow

  private updateFlow(): void {
    if (this.isOver) return;
    this.calmTicks = this.worldIsMoving() ? 0 : this.calmTicks + 1;
    const calm = this.calmTicks >= CALM_TICKS;

    if (this.foesAlive === 0) {
      // Let the collapse play out (and keep scoring) for a moment before the victory tally.
      const since = this.tick - this.winTick;
      if (since >= WIN_DELAY_TICKS && (calm || since >= WIN_MAX_TICKS)) this.finishWon();
      return;
    }
    if (this.phase !== 'flying') return;

    const sinceLaunch = this.tick - this.shotLaunchTick;
    const sinceImpact = this.firstImpactTick >= 0 ? this.tick - this.firstImpactTick : -1;
    let settled = this.pending.length === 0 && calm;
    if (settled) {
      for (const bird of this.birds) {
        // In flight, burning a fuse or still rolling: the shot is not over.
        if (bird.alive && (!bird.impacted || bird.fuseEndTick >= 0 || bird.wellEndTick >= 0 || bird.restTicks < BIRD_IDLE_TICKS)) {
          settled = false;
          break;
        }
      }
    }
    if (settled || sinceImpact >= MAX_AFTER_IMPACT_TICKS || sinceLaunch >= MAX_AFTER_LAUNCH_TICKS) this.resolveShot();
  }

  private resolveShot(): void {
    for (const bird of this.birds) this.removeBird(bird, 'resolved');
    this.flushRemovals();
    this.compactLists();
    this.activeBird = null;
    this.emit({ type: 'shotResolved', foesLeft: this.foesAlive, birdsLeft: this.queue.length });
    const next = this.queue[0];
    if (next) {
      this.phase = 'aiming';
      this.emit({ type: 'birdReady', bird: next, remaining: this.queue.length });
    } else {
      this.phase = 'lost';
      this.emit({ type: 'levelLost', score: this.score, foesLeft: this.foesAlive });
    }
  }

  private finishWon(): void {
    const unusedBirds = this.queue.length;
    const baseScore = this.score;
    const birdBonus = unusedBirds * SCORE.unusedBird;
    this.score = baseScore + SCORE.clearBonus + birdBonus;
    this.phase = 'won';
    this.summary = { baseScore, clearBonus: SCORE.clearBonus, unusedBirds, birdBonus, score: this.score };
    this.emit({ type: 'levelWon', ...this.summary });
  }
}
