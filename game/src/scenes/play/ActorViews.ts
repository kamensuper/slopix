/**
 * Cosmetic state of the characters: blinking, gaze, expressions, squash and stretch, hit flashes
 * and the short "pop" animations of defeated pigs. Nothing here feeds back into the simulation,
 * and bodies are always drawn at their interpolated physics transform: animation only scales the
 * artwork about its centre (by a few percent at rest, more during impacts).
 *
 * Pig behaviour, from highest priority down:
 *   hurt      just got hit (wince)               stunned   for a while after a hit (dizzy)
 *   surprised a bird is about to hit / a block    laugh     a shot missed (staggered per pig)
 *             right next to it broke             worried   a bird is coming (builds up with fear)
 *   idle      smug; breathes, blinks and looks around (slingshot, neighbours, the player)
 */
import { ABILITY, PHYSICS } from '../../core/config';
import type { SimEventOf } from '../../core/events';
import { clamp, clamp01, ease } from '../../core/math';
import type { PigVariant } from '../../core/types';
import type { BirdPose, PigExpression, PigPose } from '../../render/art/types';
import type { WorldRenderer } from '../../render/WorldRenderer';
import type { BirdEntity, BlockEntity, PigEntity } from '../../sim/entities';
import type { GameSim } from '../../sim/GameSim';

interface ActorView {
  /** Time of the next blink, and whether it is a quick double blink. */
  blinkAt: number;
  doubleBlink: boolean;
  /** Squash spring: displacement (+ = flattened) and velocity. */
  squash: number;
  squashVel: number;
  hurtUntil: number;
  stunUntil: number;
  surpriseUntil: number;
  /** Smoothed fear 0..1. */
  fear: number;
  /** Smoothed gaze direction in world space (y up). */
  lookX: number;
  lookY: number;
  /** Idle gaze target: what to look at and until when. */
  gaze: Gaze;
  gazeX: number;
  gazeY: number;
  gazeUntil: number;
  /** Breathing phase offset and rate, so a group of pigs never breathes in sync. */
  phase: number;
  rate: number;
  seen: number;
}

/** 0 = the slingshot, 1 = a fixed direction, 2 = the nearest other pig, 3 = straight at the player. */
type Gaze = 0 | 1 | 2 | 3;

interface PigGhost {
  variant: PigVariant;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  radius: number;
  age: number;
}

interface Shock {
  x: number;
  y: number;
  radius: number;
}

const BLINK_TIME = 0.16;
const HIT_FLASH_TICKS = 7;
const IMPACT_FLASH_TICKS = 6;
const GHOST_LIFE = 0.36;
const FUSE_TICKS = ABILITY.bomb.fuse * PHYSICS.hz;
/** Squash spring stiffness and damping (a quick, slightly bouncy wobble). */
const SPRING_K = 240;
const SPRING_D = 13;
const HURT_TIME = 0.42;
const STUN_TIME = 1.15;
const SURPRISE_TIME = 0.65;
/** Distances in metres. */
const FEAR_RANGE = 13;
const SHOCK_RANGE = 3.2;
const POP_SHOCK_RANGE = 5;

function nextBlink(time: number): number {
  return time + 1.2 + Math.random() * 3.8;
}

function smooth(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export class ActorViews {
  /** While `time` is below this, every pig laughs (missed shot, lost level). */
  laughUntil = 0;
  private laughSeen = 0;
  private laughStart = 0;
  private readonly views = new Map<number, ActorView>();
  private readonly ghosts: PigGhost[] = [];
  private readonly shocks: Shock[] = [];
  private lastBlocks: readonly BlockEntity[] | null = null;
  private lastSim: GameSim | null = null;
  private frame = 0;
  private dt = 1 / 60;
  private readonly pigPose: PigPose = {
    time: 0,
    expression: 'idle',
    blink: 0,
    damage: 0,
    armorOn: false,
    armorDamage: 0,
    lookX: 0,
    lookY: 0,
    flash: 0,
    intensity: 1,
  };
  private readonly birdPose: BirdPose = { time: 0, state: 'flying', blink: 0, pull: 0, lookX: 0.4, lookY: 0, abilityUsed: false, fuse: 0, flash: 0 };

  private view(id: number, time: number): ActorView {
    let view = this.views.get(id);
    if (!view) {
      view = {
        blinkAt: time + Math.random() * 3,
        doubleBlink: false,
        squash: 0,
        squashVel: 0,
        hurtUntil: 0,
        stunUntil: 0,
        surpriseUntil: 0,
        fear: 0,
        lookX: -1,
        lookY: 0,
        gaze: 0,
        gazeX: -1,
        gazeY: 0,
        gazeUntil: time + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        rate: 2.1 + Math.random() * 0.6,
        seen: this.frame,
      };
      this.views.set(id, view);
    }
    view.seen = this.frame;
    return view;
  }

  private blink(view: ActorView, time: number): number {
    if (time < view.blinkAt) return 0;
    const t = (time - view.blinkAt) / BLINK_TIME;
    if (t >= 1) {
      // Every so often a second blink follows right away.
      view.doubleBlink = !view.doubleBlink && Math.random() < 0.22;
      view.blinkAt = view.doubleBlink ? time + 0.09 : nextBlink(time);
      return 0;
    }
    return 1 - Math.abs(t * 2 - 1);
  }

  /** A character got hit: wince, squash, then (pigs) see stars for a moment. */
  hit(id: number, time: number, strength = 1): void {
    const view = this.view(id, time);
    view.squashVel += 7 * clamp(strength, 0.3, 1.6);
    view.hurtUntil = time + HURT_TIME;
    view.stunUntil = time + HURT_TIME + STUN_TIME * clamp(strength, 0.5, 1.3);
  }

  /** Starts the short pop animation of a defeated pig; its neighbours flinch. */
  popPig(event: SimEventOf<'pigDefeated'>, radius: number, angle: number): void {
    this.ghosts.push({
      variant: event.variant,
      x: event.x,
      y: event.y,
      vx: event.vx * 0.3,
      vy: event.vy * 0.3 + 1.5,
      angle,
      spin: event.vx >= 0 ? -1 : 1,
      radius,
      age: 0,
    });
    this.shocks.push({ x: event.x, y: event.y, radius: POP_SHOCK_RANGE });
  }

  clear(): void {
    this.views.clear();
    this.ghosts.length = 0;
    this.shocks.length = 0;
    this.laughUntil = 0;
    this.laughSeen = 0;
    this.lastBlocks = null;
    this.lastSim = null;
  }

  update(dt: number): void {
    this.frame++;
    this.dt = clamp(dt, 0, 0.1);
    const step = this.dt;
    for (const view of this.views.values()) {
      view.squashVel += (-SPRING_K * view.squash - SPRING_D * view.squashVel) * step;
      view.squash = clamp(view.squash + view.squashVel * step, -0.6, 1);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const ghost = this.ghosts[i] as PigGhost;
      ghost.age += dt;
      ghost.x += ghost.vx * dt;
      ghost.y += ghost.vy * dt;
      if (ghost.age >= GHOST_LIFE) this.ghosts.splice(i, 1);
    }
    // Forget characters that left the simulation a while ago.
    if (this.frame % 240 === 0) {
      for (const [id, view] of this.views) {
        if (view.seen < this.frame - 240) this.views.delete(id);
      }
    }
  }

  /** Blocks that broke since the last frame startle the pigs next to them. */
  private collectShocks(sim: GameSim): void {
    if (this.lastSim !== sim) {
      this.lastSim = sim;
      this.lastBlocks = sim.blocks;
      return;
    }
    if (this.lastBlocks && this.lastBlocks !== sim.blocks) {
      for (const block of this.lastBlocks) {
        if (!block.alive) this.shocks.push({ x: block.x, y: block.y, radius: SHOCK_RANGE + Math.max(block.w, block.h) * 0.5 });
      }
    }
    this.lastBlocks = sim.blocks;
  }

  drawPigs(r: WorldRenderer, sim: GameSim, alpha: number, time: number): void {
    this.collectShocks(sim);
    if (this.laughUntil !== this.laughSeen) {
      this.laughSeen = this.laughUntil;
      this.laughStart = time;
    }
    const pose = this.pigPose;
    const bird = sim.activeBird;
    const threat = bird && bird.alive && !bird.impacted ? bird : null;
    const calm = r.reducedMotion ? 0.4 : 1;
    const dt = this.dt;
    for (const pig of sim.pigs) {
      const x = pig.px + (pig.x - pig.px) * alpha;
      const y = pig.py + (pig.y - pig.py) * alpha;
      const angle = pig.pangle + (pig.angle - pig.pangle) * alpha;
      const view = this.view(pig.id, time);
      for (const shock of this.shocks) {
        const d = Math.hypot(shock.x - x, shock.y - y);
        if (d < shock.radius && time >= view.hurtUntil) view.surpriseUntil = Math.max(view.surpriseUntil, time + SURPRISE_TIME * (1 - d / (shock.radius * 2)));
      }

      // Fear grows as a bird closes in; time-to-impact makes it spike just before the hit.
      let fearTarget = 0;
      let imminent = false;
      if (threat) {
        const dx = threat.x - x;
        const dy = threat.y - y;
        const dist = Math.hypot(dx, dy) || 1;
        const closing = -(dx * (threat.vx - pig.vx) + dy * (threat.vy - pig.vy)) / dist;
        if (closing > 0.5) {
          const ttc = (dist - pig.radius - threat.radius) / closing;
          fearTarget = Math.max(clamp01((FEAR_RANGE - dist) / (FEAR_RANGE * 0.7)), clamp01(1 - ttc / 1.4));
          imminent = ttc < 0.3 && dist < 6;
        }
      }
      if (pig.vx * pig.vx + pig.vy * pig.vy > 9) fearTarget = Math.max(fearTarget, 0.75);
      view.fear = smooth(view.fear, fearTarget, fearTarget > view.fear ? 9 : 1.8, dt);
      if (imminent) view.surpriseUntil = Math.max(view.surpriseUntil, time + 0.25);

      this.fillPigPose(pose, pig, view, sim, time);
      this.aimGaze(pose, pig, view, sim, threat, x, y, angle, time);

      // Squash spring + breathing (+ belly laugh), applied as a scale about the centre.
      const s = view.squash * calm;
      let sx = 1 + s * 0.24;
      let sy = 1 - s * 0.26;
      const nervous = pose.expression === 'worried' || pose.expression === 'surprised';
      const breath = Math.sin(time * view.rate * (nervous ? 2.6 : 1) + view.phase) * calm;
      sx *= 1 - 0.016 * breath;
      sy *= 1 + 0.026 * breath;
      if (pose.expression === 'laugh') {
        const shake = Math.abs(Math.sin(time * 15 + view.phase)) * 0.05 * calm;
        sx *= 1 + shake * 0.6;
        sy *= 1 - shake;
      } else if (pose.expression === 'surprised') {
        // A startled jolt: stretch up for an instant.
        const jolt = clamp01((view.surpriseUntil - time) / SURPRISE_TIME) * 0.06 * calm;
        sx *= 1 - jolt;
        sy *= 1 + jolt;
      }
      r.drawPig(pig.variant, x, y, angle, pig.radius, pose, sx, sy);
    }
    this.shocks.length = 0;
  }

  private fillPigPose(pose: PigPose, pig: PigEntity, view: ActorView, sim: GameSim, time: number): void {
    const health = pig.hp / pig.maxHp;
    // Pigs burst out laughing one after another rather than in unison.
    const laughDelay = ((pig.id * 0.137) % 1) * 0.35;
    let expression: PigExpression = 'idle';
    let intensity = 1;
    if (time < view.hurtUntil) expression = 'hurt';
    else if (time < view.surpriseUntil) expression = 'surprised';
    else if (time < view.stunUntil) expression = 'stunned';
    else if (time < this.laughUntil && time >= this.laughStart + laughDelay && view.fear < 0.3) expression = 'laugh';
    else if (view.fear > 0.12) {
      expression = 'worried';
      intensity = clamp01(view.fear * 1.25);
    }
    pose.time = time + pig.id * 0.7;
    pose.expression = expression;
    pose.intensity = intensity;
    const blink = this.blink(view, time);
    pose.blink = expression === 'idle' || expression === 'worried' ? blink : 0;
    pose.damage = health > 0.66 ? 0 : health > 0.33 ? 1 : 2;
    pose.armorOn = pig.armor > 0;
    const armor = pig.maxArmor > 0 ? pig.armor / pig.maxArmor : 1;
    pose.armorDamage = armor > 0.66 ? 0 : armor > 0.33 ? 1 : 2;
    pose.flash = pig.hitTick >= 0 ? clamp01(1 - (sim.tick - pig.hitTick) / HIT_FLASH_TICKS) : 0;
  }

  /** Points the pupils: at the incoming bird, otherwise wherever the pig's idle curiosity leads. */
  private aimGaze(pose: PigPose, pig: PigEntity, view: ActorView, sim: GameSim, threat: BirdEntity | null, x: number, y: number, angle: number, time: number): void {
    let tx: number;
    let ty: number;
    let reach = 0.8;
    if (threat) {
      tx = threat.x - x;
      ty = threat.y - y;
      reach = 0.95;
    } else {
      if (time >= view.gazeUntil) this.pickGaze(view, time);
      if (view.gaze === 0) {
        tx = sim.anchor.x - x;
        ty = sim.anchor.y - y;
      } else if (view.gaze === 2) {
        let best: PigEntity | null = null;
        let bestD = Infinity;
        for (const other of sim.pigs) {
          if (other === pig) continue;
          const d = (other.x - x) ** 2 + (other.y - y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = other;
          }
        }
        tx = best ? best.x - x : view.gazeX;
        ty = best ? best.y - y : view.gazeY;
      } else if (view.gaze === 3) {
        tx = 0;
        ty = 0;
      } else {
        tx = view.gazeX;
        ty = view.gazeY;
      }
    }
    const len = Math.hypot(tx, ty);
    const gx = len > 1e-3 ? (tx / len) * reach : 0;
    const gy = len > 1e-3 ? (ty / len) * reach : 0;
    // Quick saccade-like eye movement.
    view.lookX = smooth(view.lookX, gx, 16, this.dt);
    view.lookY = smooth(view.lookY, gy, 16, this.dt);
    // Pupils are drawn in the pig's rotated frame (y down), so rotate the gaze back into it.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    pose.lookX = view.lookX * cos + view.lookY * sin;
    pose.lookY = -(-view.lookX * sin + view.lookY * cos);
  }

  private pickGaze(view: ActorView, time: number): void {
    const roll = Math.random();
    if (roll < 0.45) view.gaze = 0;
    else if (roll < 0.7) {
      view.gaze = 1;
      const a = (Math.random() * 1.2 - 0.1) * Math.PI;
      view.gazeX = Math.cos(a);
      view.gazeY = Math.sin(a) * 0.6;
    } else if (roll < 0.85) view.gaze = 2;
    else view.gaze = 3;
    view.gazeUntil = time + 1.1 + Math.random() * 2.6;
  }

  drawBirds(r: WorldRenderer, sim: GameSim, alpha: number, time: number): void {
    const pose = this.birdPose;
    const calm = r.reducedMotion ? 0.4 : 1;
    for (const bird of sim.birds) {
      const x = bird.px + (bird.x - bird.px) * alpha;
      const y = bird.py + (bird.y - bird.py) * alpha;
      const angle = bird.pangle + (bird.angle - bird.pangle) * alpha;
      const view = this.view(bird.id, time);
      this.fillBirdPose(pose, bird, view, sim, time, angle);
      const speed = Math.hypot(bird.vx, bird.vy);
      let sx: number;
      let sy: number;
      if (bird.impacted) {
        // Squash spring on impact (flattened along the body's forward axis).
        const s = view.squash * calm;
        sx = 1 - s * 0.26;
        sy = 1 + s * 0.22;
      } else {
        // Stretch with speed; a springy pop when the ability fires.
        const stretch = clamp(speed / 300, 0, 0.1) * calm;
        sx = 1 + stretch;
        sy = 1 - stretch * 0.8;
        const sinceAbility = bird.abilityUsed ? (sim.tick - bird.abilityTick) / PHYSICS.hz : 99;
        if (sinceAbility < 0.3) {
          const pop = (1 - ease.outCubic(sinceAbility / 0.3)) * 0.18 * calm;
          sx *= 1 + pop;
          sy *= 1 + pop;
        }
      }
      // A lit bomb swells and throbs faster and faster before it blows.
      const fuse = pose.fuse ?? 0;
      if (fuse > 0.35) {
        const heat = (fuse - 0.35) / 0.65;
        const throb = 1 + heat * (0.04 + 0.05 * (0.5 + 0.5 * Math.sin(time * (12 + 34 * heat)))) * calm;
        sx *= throb;
        sy *= throb;
      }
      r.drawBird(bird.type, x, y, angle, bird.radius, pose, sx, sy);
    }
  }

  private fillBirdPose(pose: BirdPose, bird: BirdEntity, view: ActorView, sim: GameSim, time: number, angle: number): void {
    pose.time = time + bird.id * 0.37;
    pose.blink = bird.impacted ? this.blink(view, time) : 0;
    pose.pull = 0;
    pose.abilityUsed = bird.abilityUsed && !bird.spawned;
    pose.fuse = bird.fuseEndTick >= 0 ? clamp01(1 - (bird.fuseEndTick - sim.tick) / FUSE_TICKS) : 0;
    pose.flash = bird.impacted ? clamp01(1 - (sim.tick - bird.impactTick) / IMPACT_FLASH_TICKS) * 0.45 : 0;
    // In flight the bird keeps its eyes on where it is heading (in its own rotated frame).
    const speed = Math.hypot(bird.vx, bird.vy);
    if (!bird.impacted && speed > 1) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const fx = bird.vx / speed;
      const fy = bird.vy / speed;
      pose.lookX = clamp((fx * cos + fy * sin) * 0.6, -0.6, 0.6);
      pose.lookY = clamp(-(-fx * sin + fy * cos) * 0.6, -0.6, 0.6);
    } else {
      pose.lookX = 0.5;
      pose.lookY = 0;
    }
    if (!bird.impacted) {
      const boosting = bird.type === 'chuck' && bird.abilityUsed;
      pose.state = boosting || (bird.abilityUsed && sim.tick - bird.abilityTick < 24) ? 'ability' : 'flying';
    } else if (bird.fuseEndTick >= 0) {
      pose.state = 'ability';
    } else {
      pose.state = sim.tick - bird.impactTick < 10 ? 'hit' : 'dazed';
    }
  }

  /** Defeated pigs puff up, then squash flat and spin away in a white flash. */
  drawGhosts(r: WorldRenderer, time: number): void {
    const pose = this.pigPose;
    const calm = r.reducedMotion ? 0.4 : 1;
    for (const ghost of this.ghosts) {
      const t = ghost.age / GHOST_LIFE;
      pose.time = time;
      pose.expression = 'defeated';
      pose.intensity = 1;
      pose.blink = 0;
      pose.damage = 2;
      pose.armorOn = false;
      pose.armorDamage = 2;
      pose.lookX = 0;
      pose.lookY = 0;
      pose.flash = clamp01(0.85 - t * 1.6);
      const PUFF = 0.4;
      let sx: number;
      let sy: number;
      let spin = 0;
      if (t < PUFF) {
        const u = ease.outBack(t / PUFF);
        sx = 1 + 0.3 * u;
        sy = 1 + 0.38 * u;
      } else {
        const u = (t - PUFF) / (1 - PUFF);
        const k = ease.inCubic(u);
        sx = 1.3 + 0.35 * k;
        sy = 1.38 - 1.05 * k;
        spin = ghost.spin * 1.3 * k * calm;
      }
      const alphaOut = t < 0.55 ? 1 : 1 - ease.inCubic((t - 0.55) / 0.45);
      r.drawPig(ghost.variant, ghost.x, ghost.y, ghost.angle + spin, ghost.radius, pose, 1 + (sx - 1) * calm, Math.max(0.2, 1 + (sy - 1) * calm), alphaOut);
    }
  }
}
