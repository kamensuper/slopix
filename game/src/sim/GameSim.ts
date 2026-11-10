/**
 * GameSim: the complete, deterministic simulation of one level.
 *
 * It owns the physics world and all gameplay rules (damage, abilities, scoring, turn flow) and has
 * no dependency on the DOM, rendering or audio: the presentation layer steps it at a fixed rate,
 * reads entity transforms and drains `events`. The same class runs headless in tests and in the
 * level solver.
 */
import { World, type Body, type Contact } from 'planck';
import { DAMAGE, EXPLOSIONS, MATERIALS, PHYSICS, PIGS, SCORE, SHOT, SLING, SUBSTEP, TNT_CHAIN_DELAY, WORLD } from '../core/config';
import type { ExplosionSource, ExpireReason, ScoreReason, SimEvent, SurfaceKind } from '../core/events';
import type { BirdType, LevelDef } from '../core/types';
import { BirdSystem } from './BirdSystem';
import { createBlock, createPig, createProjectile, createTerrain, type ProjectileSpawn } from './bodies';
import { DamageSystem } from './DamageSystem';
import type { BirdEntity, BlockEntity, DynamicEntity, Entity, PigEntity, TerrainEntity } from './entities';
import { pushFromBlast } from './explosions';
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

interface PendingBlast {
  tick: number;
  x: number;
  y: number;
  source: ExplosionSource;
}

const CALM_TICKS = Math.round(SHOT.calmTime * PHYSICS.hz);
const WIN_DELAY_TICKS = Math.round(SHOT.winDelay * PHYSICS.hz);
/** Never keep the player waiting for stragglers longer than this after the last pig is gone. */
const WIN_MAX_TICKS = WIN_DELAY_TICKS + 3 * PHYSICS.hz;
const MAX_AFTER_IMPACT_TICKS = Math.round(SHOT.maxAfterImpact * PHYSICS.hz);
const MAX_AFTER_LAUNCH_TICKS = Math.round(SHOT.maxAfterLaunch * PHYSICS.hz);
const BIRD_IDLE_TICKS = Math.round(0.4 * PHYSICS.hz);
const TNT_DELAY_TICKS = Math.max(1, Math.round(TNT_CHAIN_DELAY * PHYSICS.hz));

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
  pigs: PigEntity[] = [];
  birds: BirdEntity[] = [];
  /** Filled while stepping; the consumer reads the events and then sets `events.length = 0`. */
  readonly events: SimEvent[] = [];
  /** World position of the launch anchor (pouch at rest). */
  readonly anchor: XY;
  /** Birds not launched yet; the first one sits in the pouch while aiming. */
  readonly queue: BirdType[];
  readonly flock: BirdSystem;

  phase: SimPhase = 'aiming';
  score = 0;
  /** Number of completed ticks (PHYSICS.hz per second). */
  tick = 0;
  /** Number of completed physics sub-steps. */
  stepCount = 0;
  birdsUsed = 0;
  blocksDestroyed = 0;
  readonly pigsTotal: number;
  pigsAlive: number;
  /** The bird of the current shot (kept after it is gone, until the shot resolves). */
  activeBird: BirdEntity | null = null;
  /** Set once the level has been won. */
  summary: WinSummary | null = null;

  private nextId = 1;
  private readonly damage: DamageSystem;
  private readonly removals: Body[] = [];
  private readonly blasts: PendingBlast[] = [];
  private readonly hit: XY = { x: 0, y: 0 };
  private listsDirty = false;
  private shotLaunchTick = 0;
  private firstImpactTick = -1;
  private calmTicks = 0;
  private winTick = -1;

  constructor(level: LevelDef) {
    this.level = level;
    this.world = new World({ gravity: { x: 0, y: -PHYSICS.gravity }, allowSleep: true });
    this.anchor = { x: level.slingshot.x + SLING.anchor.x, y: level.slingshot.y + SLING.anchor.y };
    this.queue = [...level.birds];
    this.terrain = createTerrain(this.world, level, this.nextId++);
    for (const def of level.blocks) this.blocks.push(createBlock(this.world, def, this.nextId++));
    for (const def of level.pigs) this.pigs.push(createPig(this.world, def, this.nextId++));
    this.pigsTotal = this.pigs.length;
    this.pigsAlive = this.pigs.length;

    this.damage = new DamageSystem(this);
    this.flock = new BirdSystem(this);
    this.world.on('pre-solve', (contact) => this.damage.preSolve(contact));
    this.world.on('post-solve', (contact, impulse) => this.damage.postSolve(contact, impulse));
    this.world.on('begin-contact', (contact) => this.onBeginContact(contact));

    const first = this.queue[0];
    if (first) this.emit({ type: 'birdReady', bird: first, remaining: this.queue.length });
  }

  // ------------------------------------------------------------------ public API

  /** Bird waiting in the pouch, or null while a shot is in progress / the level is over. */
  get loadedBird(): BirdType | null {
    return this.phase === 'aiming' ? (this.queue[0] ?? null) : null;
  }

  get time(): number {
    return this.tick / PHYSICS.hz;
  }

  get pigsDefeated(): number {
    return this.pigsTotal - this.pigsAlive;
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
      this.world.step(SUBSTEP, PHYSICS.velocityIterations, PHYSICS.positionIterations);
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
      case 'pig':
        return 'pig';
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

  applyDamage(target: Entity, amount: number, x: number, y: number): void {
    if (!target.alive || amount <= 0) return;
    if (target.kind === 'block') this.damageBlock(target, amount);
    else if (target.kind === 'pig') this.damagePig(target, amount, x, y);
  }

  /** Radial explosion. Must not be called while the physics world is stepping. */
  explode(x: number, y: number, source: ExplosionSource, ignore?: DynamicEntity): void {
    const config = EXPLOSIONS[source];
    this.emit({ type: 'explosion', source, x, y, radius: config.radius });
    const hit = this.hit;
    for (const block of this.blocks) {
      if (!block.alive || block === ignore) continue;
      const falloff = pushFromBlast(block, x, y, config, hit);
      if (falloff > 0) this.applyDamage(block, config.energy * falloff * config.power[block.material], hit.x, hit.y);
    }
    for (const pig of this.pigs) {
      if (!pig.alive) continue;
      const falloff = pushFromBlast(pig, x, y, config, hit);
      if (falloff > 0) this.applyDamage(pig, config.energy * falloff * config.power.pig, hit.x, hit.y);
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
  private payBank(entity: BlockEntity | PigEntity, x: number, y: number): void {
    const payout = Math.floor(entity.scoreBank / 10) * 10;
    if (payout <= 0) return;
    entity.scoreBank -= payout;
    this.addScore(payout, x, y, 'damage');
  }

  private damageBlock(block: BlockEntity, amount: number): void {
    const material = MATERIALS[block.material];
    const p = block.body.getPosition();
    const dealt = Math.min(block.hp, amount);
    block.hp -= amount;
    block.hitTick = this.tick;
    block.scoreBank += (dealt / block.maxHp) * material.destroyScore * SCORE.damageShare;
    this.payBank(block, p.x, p.y);
    if (block.hp <= 0) {
      this.destroyBlock(block);
      return;
    }
    const stage = stageFor(block.hp / block.maxHp);
    const stageChanged = stage !== block.stage;
    block.stage = stage;
    this.emit({ type: 'blockDamaged', id: block.id, material: block.material, x: p.x, y: p.y, damage: dealt, stage, stageChanged });
  }

  private destroyBlock(block: BlockEntity): void {
    if (!block.alive) return;
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
    if (block.material === 'tnt') this.blasts.push({ tick: this.tick + TNT_DELAY_TICKS, x: p.x, y: p.y, source: 'tnt' });
  }

  private damagePig(pig: PigEntity, amount: number, x: number, y: number): void {
    const config = PIGS[pig.variant];
    const p = pig.body.getPosition();
    pig.hitTick = this.tick;
    let remaining = amount;
    if (pig.armor > 0) {
      const absorbed = amount * config.armorFactor;
      if (absorbed < pig.armor) {
        pig.armor -= absorbed;
        this.emit({ type: 'pigDamaged', id: pig.id, variant: pig.variant, x, y, damage: absorbed, hpFraction: pig.hp / pig.maxHp, armored: true });
        return;
      }
      // The armour gives way; whatever is left of the blow reaches the pig.
      remaining = (absorbed - pig.armor) / config.armorFactor;
      pig.armor = 0;
      const v = pig.body.getLinearVelocity();
      this.emit({ type: 'armorBroken', id: pig.id, variant: pig.variant, x: p.x, y: p.y, vx: v.x, vy: v.y });
      if (remaining < config.minEnergy) return;
    }
    const dealt = Math.min(pig.hp, remaining);
    pig.hp -= remaining;
    pig.scoreBank += (dealt / pig.maxHp) * SCORE.pigDamagePool;
    this.payBank(pig, p.x, p.y);
    if (pig.hp <= 0) {
      this.defeatPig(pig);
      return;
    }
    this.emit({ type: 'pigDamaged', id: pig.id, variant: pig.variant, x, y, damage: dealt, hpFraction: pig.hp / pig.maxHp, armored: false });
  }

  private defeatPig(pig: PigEntity): void {
    if (!pig.alive) return;
    pig.alive = false;
    pig.hp = 0;
    this.pigsAlive--;
    const p = pig.body.getPosition();
    const v = pig.body.getLinearVelocity();
    this.retire(pig.body);
    this.emit({ type: 'pigDefeated', id: pig.id, variant: pig.variant, x: p.x, y: p.y, vx: v.x, vy: v.y, remaining: this.pigsAlive });
    this.addScore(PIGS[pig.variant].score, p.x, p.y, 'pig');
    if (this.pigsAlive === 0 && this.winTick < 0) this.winTick = this.tick;
  }

  // ------------------------------------------------------------------ stepping helpers

  private onBeginContact(contact: Contact): void {
    const a = contact.getFixtureA().getBody().getUserData() as Entity | null;
    const b = contact.getFixtureB().getBody().getUserData() as Entity | null;
    if (!a || !b) return;
    if (a.kind === 'bird') this.flock.onBeginContact(a, b);
    if (b.kind === 'bird') this.flock.onBeginContact(b, a);
  }

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
    this.pigs = this.pigs.filter((e) => e.alive);
    this.birds = this.birds.filter((e) => e.alive);
  }

  private fireBlasts(): void {
    if (this.blasts.length === 0) return;
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const blast = this.blasts[i] as PendingBlast;
      if (this.tick < blast.tick) continue;
      this.blasts.splice(i, 1);
      this.explode(blast.x, blast.y, blast.source);
    }
    this.flushRemovals();
  }

  private rememberTransforms(): void {
    for (const list of [this.blocks, this.pigs, this.birds] as DynamicEntity[][]) {
      for (const e of list) {
        e.px = e.x;
        e.py = e.y;
        e.pangle = e.angle;
      }
    }
  }

  private syncTransforms(): void {
    for (const list of [this.blocks, this.pigs, this.birds] as DynamicEntity[][]) {
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
    for (const pig of this.pigs) {
      if (pig.alive && (pig.x < minX || pig.x > maxX || pig.y < -3)) this.defeatPig(pig);
    }
  }

  private worldIsMoving(): boolean {
    const limit = SHOT.calmSpeed;
    for (const list of [this.blocks, this.pigs, this.birds] as DynamicEntity[][]) {
      for (const e of list) {
        if (!e.alive || !e.body.isAwake()) continue;
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

    if (this.pigsAlive === 0) {
      // Let the collapse play out (and keep scoring) for a moment before the victory tally.
      const since = this.tick - this.winTick;
      if (since >= WIN_DELAY_TICKS && (calm || since >= WIN_MAX_TICKS)) this.finishWon();
      return;
    }
    if (this.phase !== 'flying') return;

    const sinceLaunch = this.tick - this.shotLaunchTick;
    const sinceImpact = this.firstImpactTick >= 0 ? this.tick - this.firstImpactTick : -1;
    let settled = this.blasts.length === 0 && calm;
    if (settled) {
      for (const bird of this.birds) {
        // In flight, burning a fuse or still rolling: the shot is not over.
        if (bird.alive && (!bird.impacted || bird.fuseEndTick >= 0 || bird.restTicks < BIRD_IDLE_TICKS)) {
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
    this.emit({ type: 'shotResolved', pigsLeft: this.pigsAlive, birdsLeft: this.queue.length });
    const next = this.queue[0];
    if (next) {
      this.phase = 'aiming';
      this.emit({ type: 'birdReady', bird: next, remaining: this.queue.length });
    } else {
      this.phase = 'lost';
      this.emit({ type: 'levelLost', score: this.score, pigsLeft: this.pigsAlive });
    }
  }

  private finishWon(): void {
    const unusedBirds = this.phase === 'aiming' ? this.queue.length : this.queue.length;
    const baseScore = this.score;
    const birdBonus = unusedBirds * SCORE.unusedBird;
    this.score = baseScore + SCORE.clearBonus + birdBonus;
    this.phase = 'won';
    this.summary = { baseScore, clearBonus: SCORE.clearBonus, unusedBirds, birdBonus, score: this.score };
    this.emit({ type: 'levelWon', ...this.summary });
  }
}
