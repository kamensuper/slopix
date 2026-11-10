/**
 * Cosmetic state of the characters: blinking, expressions, squash and stretch, hit flashes and the
 * short "pop" animations of defeated pigs. Nothing here feeds back into the simulation, and bodies
 * are always drawn at their interpolated physics transform.
 */
import { ABILITY, PHYSICS } from '../../core/config';
import type { SimEventOf } from '../../core/events';
import { clamp, clamp01, ease } from '../../core/math';
import type { PigVariant } from '../../core/types';
import type { BirdPose, PigExpression, PigPose } from '../../render/art/types';
import type { WorldRenderer } from '../../render/WorldRenderer';
import type { BirdEntity, PigEntity } from '../../sim/entities';
import type { GameSim } from '../../sim/GameSim';

interface ActorView {
  /** Time of the next blink. */
  blinkAt: number;
  /** Squash amount 0..1, decays quickly after a hit. */
  squash: number;
  hurtUntil: number;
  seen: number;
}

interface PigGhost {
  variant: PigVariant;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  age: number;
}

const BLINK_TIME = 0.16;
const HIT_FLASH_TICKS = 7;
const GHOST_LIFE = 0.32;
const FUSE_TICKS = ABILITY.bomb.fuse * PHYSICS.hz;
const SQUASH_DECAY = 6;

function nextBlink(time: number): number {
  return time + 1.4 + Math.random() * 3.6;
}

export class ActorViews {
  /** While `time` is below this, every pig laughs (missed shot, lost level). */
  laughUntil = 0;
  private readonly views = new Map<number, ActorView>();
  private readonly ghosts: PigGhost[] = [];
  private frame = 0;
  private readonly pigPose: PigPose = { time: 0, expression: 'idle', blink: 0, damage: 0, armorOn: false, armorDamage: 0, lookX: 0, lookY: 0, flash: 0 };
  private readonly birdPose: BirdPose = { time: 0, state: 'flying', blink: 0, pull: 0, lookX: 0.4, lookY: 0, abilityUsed: false, fuse: 0, flash: 0 };

  private view(id: number, time: number): ActorView {
    let view = this.views.get(id);
    if (!view) {
      view = { blinkAt: time + Math.random() * 3, squash: 0, hurtUntil: 0, seen: this.frame };
      this.views.set(id, view);
    }
    view.seen = this.frame;
    return view;
  }

  private blink(view: ActorView, time: number): number {
    if (time < view.blinkAt) return 0;
    const t = (time - view.blinkAt) / BLINK_TIME;
    if (t >= 1) {
      view.blinkAt = nextBlink(time);
      return 0;
    }
    return 1 - Math.abs(t * 2 - 1);
  }

  /** A character got hit: wince and squash. */
  hit(id: number, time: number, strength = 1): void {
    const view = this.view(id, time);
    view.squash = Math.min(1, view.squash + 0.6 * strength);
    view.hurtUntil = time + 0.55;
  }

  /** Starts the short pop animation of a defeated pig. */
  popPig(event: SimEventOf<'pigDefeated'>, radius: number, angle: number): void {
    this.ghosts.push({ variant: event.variant, x: event.x, y: event.y, vx: event.vx * 0.3, vy: event.vy * 0.3 + 1.5, angle, radius, age: 0 });
  }

  clear(): void {
    this.views.clear();
    this.ghosts.length = 0;
    this.laughUntil = 0;
  }

  update(dt: number): void {
    this.frame++;
    for (const view of this.views.values()) view.squash = Math.max(0, view.squash - SQUASH_DECAY * dt);
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

  drawPigs(r: WorldRenderer, sim: GameSim, alpha: number, time: number): void {
    const pose = this.pigPose;
    const bird = sim.activeBird;
    const threat = bird && bird.alive && !bird.impacted ? bird : null;
    for (const pig of sim.pigs) {
      const x = pig.px + (pig.x - pig.px) * alpha;
      const y = pig.py + (pig.y - pig.py) * alpha;
      const view = this.view(pig.id, time);
      this.fillPigPose(pose, pig, view, sim, time);
      // Look at the incoming bird, otherwise keep an eye on the slingshot.
      const lookAtX = threat ? threat.x : sim.anchor.x;
      const lookAtY = threat ? threat.y : sim.anchor.y;
      const dx = lookAtX - x;
      const dy = lookAtY - y;
      const dist = Math.hypot(dx, dy) || 1;
      // Pupils are drawn in the pig's rotated frame, so rotate the gaze back into it.
      const cos = Math.cos(pig.angle);
      const sin = Math.sin(pig.angle);
      const gx = dx / dist;
      const gy = dy / dist;
      pose.lookX = (gx * cos + gy * sin) * 0.8;
      pose.lookY = -(-gx * sin + gy * cos) * 0.8;
      if (pose.expression === 'idle' && threat && dist < 11) pose.expression = 'worried';
      if (pose.expression === 'idle' && pig.vx * pig.vx + pig.vy * pig.vy > 9) pose.expression = 'worried';
      const squash = 1 - view.squash * 0.22;
      r.drawPig(pig.variant, x, y, pig.pangle + (pig.angle - pig.pangle) * alpha, pig.radius, pose, 2 - squash, squash);
    }
  }

  private fillPigPose(pose: PigPose, pig: PigEntity, view: ActorView, sim: GameSim, time: number): void {
    const health = pig.hp / pig.maxHp;
    let expression: PigExpression = 'idle';
    if (time < view.hurtUntil) expression = 'hurt';
    else if (time < this.laughUntil) expression = 'laugh';
    pose.time = time + pig.id * 0.7;
    pose.expression = expression;
    pose.blink = this.blink(view, time);
    pose.damage = health > 0.66 ? 0 : health > 0.33 ? 1 : 2;
    pose.armorOn = pig.armor > 0;
    const armor = pig.maxArmor > 0 ? pig.armor / pig.maxArmor : 1;
    pose.armorDamage = armor > 0.66 ? 0 : armor > 0.33 ? 1 : 2;
    pose.flash = pig.hitTick >= 0 ? clamp01(1 - (sim.tick - pig.hitTick) / HIT_FLASH_TICKS) : 0;
  }

  drawBirds(r: WorldRenderer, sim: GameSim, alpha: number, time: number): void {
    const pose = this.birdPose;
    for (const bird of sim.birds) {
      const x = bird.px + (bird.x - bird.px) * alpha;
      const y = bird.py + (bird.y - bird.py) * alpha;
      const view = this.view(bird.id, time);
      this.fillBirdPose(pose, bird, view, sim, time);
      // Stretch along the flight direction, squash on impact.
      const speed = Math.hypot(bird.vx, bird.vy);
      const stretch = bird.impacted ? 1 - view.squash * 0.25 : 1 + clamp(speed / 300, 0, 0.1);
      r.drawBird(bird.type, x, y, bird.pangle + (bird.angle - bird.pangle) * alpha, bird.radius, pose, stretch, 2 - stretch);
    }
  }

  private fillBirdPose(pose: BirdPose, bird: BirdEntity, view: ActorView, sim: GameSim, time: number): void {
    pose.time = time + bird.id * 0.37;
    pose.blink = bird.impacted ? this.blink(view, time) : 0;
    pose.pull = 0;
    pose.lookX = 0.5;
    pose.lookY = 0;
    pose.abilityUsed = bird.abilityUsed && !bird.spawned;
    pose.flash = 0;
    pose.fuse = bird.fuseEndTick >= 0 ? clamp01(1 - (bird.fuseEndTick - sim.tick) / FUSE_TICKS) : 0;
    if (!bird.impacted) {
      const boosting = bird.type === 'chuck' && bird.abilityUsed;
      pose.state = boosting || (bird.abilityUsed && sim.tick - bird.abilityTick < 24) ? 'ability' : 'flying';
    } else if (bird.fuseEndTick >= 0) {
      pose.state = 'ability';
    } else {
      pose.state = sim.tick - bird.impactTick < 10 ? 'hit' : 'dazed';
    }
  }

  /** Defeated pigs swell, fade and vanish. */
  drawGhosts(r: WorldRenderer, time: number): void {
    const pose = this.pigPose;
    for (const ghost of this.ghosts) {
      const t = ghost.age / GHOST_LIFE;
      pose.time = time;
      pose.expression = 'defeated';
      pose.blink = 0;
      pose.damage = 2;
      pose.armorOn = false;
      pose.armorDamage = 2;
      pose.lookX = 0;
      pose.lookY = 0;
      pose.flash = clamp01(0.7 - t);
      const scale = 1 + 0.35 * ease.outCubic(t);
      r.drawPig(ghost.variant, ghost.x, ghost.y, ghost.angle, ghost.radius, pose, scale, scale, 1 - ease.inCubic(t));
    }
  }
}
