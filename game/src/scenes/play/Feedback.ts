/**
 * Game feel: turns simulation events into particles, sounds, floating score numbers, screen shake,
 * camera impulses and brief slow motion. Purely cosmetic; the simulation never reads any of it.
 *
 * Every effect is scaled by the real collision energy / impact speed, so taps stay subtle and big
 * collapses get loud. Each material has its own debris recipe. A per-frame spawn budget and the
 * pool load keep a chain reaction from flooding the particle pool.
 */
import type { IAudioManager, SfxName } from '../../audio/types';
import { BIRDS, PIGS } from '../../core/config';
import type { SimEvent, SimEventOf, SurfaceKind } from '../../core/events';
import { clamp, clamp01 } from '../../core/math';
import { BIRD_COLORS, DUST_COLORS, MATERIAL_COLORS, SCORE_COLORS } from '../../core/palette';
import type { BlockMaterial, BlockShape, ThemeId } from '../../core/types';
import { PARTICLE_HALF, type ParticleKind } from '../../render/art/types';
import type { Camera } from '../../render/Camera';
import type { FloatingText } from '../../render/FloatingText';
import type { ParticleSystem } from '../../render/ParticleSystem';
import type { WorldRenderer } from '../../render/WorldRenderer';
import type { ActorViews } from './ActorViews';

const DESIGN = PARTICLE_HALF * 2;
const ACCESSORY_DESIGN = 360;
/** This many blocks breaking within the window triggers slow motion. */
const STREAK_BLOCKS = 7;
const STREAK_WINDOW = 0.7;
/** Most particles spawned in one visual frame, however many events arrive. */
const FRAME_BUDGET = 110;
/** Impacts below this strength (0..1) only make a sound. */
const QUIET_IMPACT = 0.06;

/** Dust tints of each material's debris cloud. */
const MATERIAL_DUST: Record<BlockMaterial, string> = {
  wood: '#e6cc9c',
  glass: '#e4f6ff',
  stone: '#cfcac0',
  metal: '#8a8f96',
  tnt: '#6a5a50',
};
/** How hard each material shakes the camera when it breaks. */
const MATERIAL_WEIGHT: Record<BlockMaterial, number> = { wood: 1, glass: 0.55, stone: 1.5, metal: 1.7, tnt: 1 };
const PIG_POOF = '#e7ffd0';
const SMOKE_GREY = '#5b5652';

function rnd(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function pick(n: number): number {
  return Math.floor(Math.random() * n);
}

interface EmitOptions {
  vx?: number;
  vy?: number;
  size: number;
  sizeEnd?: number;
  life: number;
  gravity?: number;
  drag?: number;
  bounce?: number;
  alpha?: number;
  spin?: number;
  color?: string;
  additive?: boolean;
  fadeFrom?: number;
  align?: boolean;
  /** Leave a trail of dust puffs in this colour. */
  trail?: string;
  trailSize?: number;
  /** Fixed sprite variant (default random). */
  variant?: number;
}

export interface FeedbackDeps {
  renderer: WorldRenderer;
  particles: ParticleSystem;
  texts: FloatingText;
  camera: Camera;
  audio: IAudioManager;
  actors: ActorViews;
  theme: ThemeId;
  /** Requests slow motion for a number of (real) seconds. */
  slowMotion(seconds: number): void;
  /** Visual clock in seconds. */
  now(): number;
}

export class Feedback {
  private readonly recentBreaks: number[] = [];
  private budgetStamp = Number.NaN;
  private budgetUsed = 0;

  constructor(private readonly deps: FeedbackDeps) {}

  private pan(x: number): number {
    const cam = this.deps.camera;
    return clamp((cam.toScreenX(x) / cam.viewW) * 2 - 1, -1, 1) * 0.7;
  }

  private sound(name: SfxName, x: number, intensity = 0.7): void {
    this.deps.audio.play(name, { intensity: clamp01(intensity), pan: this.pan(x) });
  }

  /**
   * How many of `wanted` particles may actually be spawned: scaled down as the pool fills and capped
   * by what is left of this frame's budget. Always grants at least `min` while budget remains.
   */
  private quota(wanted: number, min = 0): number {
    const now = this.deps.now();
    if (now !== this.budgetStamp) {
      this.budgetStamp = now;
      this.budgetUsed = 0;
    }
    const load = this.deps.particles.load;
    const lod = load > 0.85 ? 0.25 : load > 0.6 ? 0.55 : 1;
    const left = FRAME_BUDGET - this.budgetUsed;
    const n = Math.max(0, Math.min(left, Math.max(Math.min(min, left), Math.round(wanted * lod))));
    this.budgetUsed += n;
    return n;
  }

  private emit(kind: ParticleKind, x: number, y: number, o: EmitOptions): void {
    const renderer = this.deps.renderer;
    const sprite = renderer.particleSprite(kind, o.variant ?? pick(4), o.color);
    this.deps.particles.spawn({
      sprite,
      designSize: DESIGN,
      x,
      y,
      vx: o.vx,
      vy: o.vy,
      size: o.size,
      sizeEnd: o.sizeEnd,
      life: o.life,
      rot: rnd(0, Math.PI * 2),
      vrot: o.spin === undefined ? rnd(-6, 6) : rnd(-o.spin, o.spin),
      gravity: o.gravity,
      drag: o.drag,
      bounce: o.bounce,
      alpha: o.alpha,
      additive: o.additive,
      fadeFrom: o.fadeFrom,
      align: o.align,
      trail: o.trail ? renderer.particleSprite('dust', pick(4), o.trail) : undefined,
      trailSize: o.trailSize,
    });
  }

  // ------------------------------------------------------------------ building blocks

  /** Soft puffs, e.g. dust kicked up from the ground. */
  private puffs(x: number, y: number, count: number, color: string, scale = 1, kind: ParticleKind = 'dust', life = 1): void {
    const n = this.quota(count, 1);
    for (let i = 0; i < n; i++) {
      const size = rnd(0.45, 0.8) * scale;
      this.emit(kind, x + rnd(-0.3, 0.3) * scale, y + rnd(0, 0.25) * scale, {
        vx: rnd(-2.2, 2.2) * scale,
        vy: rnd(0.3, 1.6) * scale,
        size,
        sizeEnd: size * 2.1,
        life: rnd(0.45, 0.9) * life,
        gravity: -0.03,
        drag: 3,
        alpha: 0.6,
        spin: 1.5,
        color,
        fadeFrom: 0.2,
      });
    }
  }

  private stars(x: number, y: number, count: number, speed = 4.5): void {
    const n = this.quota(count);
    for (let i = 0; i < n; i++) {
      const angle = rnd(0, Math.PI * 2);
      this.emit('star', x, y, {
        vx: Math.cos(angle) * speed * rnd(0.6, 1.1),
        vy: Math.sin(angle) * speed * rnd(0.6, 1.1) + 1,
        size: rnd(0.3, 0.5),
        sizeEnd: 0.1,
        life: rnd(0.3, 0.5),
        gravity: 0.2,
        drag: 2.5,
        spin: 8,
      });
    }
  }

  private feathers(x: number, y: number, count: number, color: string): void {
    const n = this.quota(count);
    for (let i = 0; i < n; i++) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(1.5, 5);
      this.emit('feather', x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 1.5,
        size: rnd(0.28, 0.46),
        life: rnd(0.9, 1.6),
        gravity: 0.3,
        drag: 2.4,
        spin: 5,
        color,
      });
    }
  }

  /** A brief additive flash at a point of impact; `size` in metres. */
  private flash(x: number, y: number, size: number, alpha = 0.85, life = 0.14): void {
    if (this.quota(1) === 0) return;
    this.emit('flash', x, y, { size: size * 0.6, sizeEnd: size, life, gravity: 0, additive: true, alpha, spin: 0, fadeFrom: 0.05 });
  }

  /** Hot sparks streaking away; they skid along the surface (tangent) more than off it. */
  private sparks(x: number, y: number, count: number, speed: number, nx = 0, ny = 1, life = 0.4): void {
    const n = this.quota(count);
    const tx = -ny;
    const ty = nx;
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = Math.random() < 0.5 ? -1 : 1;
      const along = rnd(0.5, 1);
      const away = rnd(0.2, 0.9) * off;
      const v = speed * rnd(0.5, 1.15);
      this.emit('spark', x, y, {
        vx: (tx * side * along + nx * away) * v,
        vy: (ty * side * along + ny * away) * v + rnd(0, 2),
        size: rnd(0.22, 0.42),
        sizeEnd: 0.05,
        life: rnd(life * 0.5, life),
        gravity: 0.65,
        drag: 1.4,
        additive: true,
        align: true,
        spin: 0,
      });
    }
  }

  private glints(x: number, y: number, count: number, spread: number): void {
    const n = this.quota(count);
    for (let i = 0; i < n; i++) {
      const size = rnd(0.25, 0.5);
      this.emit('glint', x + rnd(-spread, spread), y + rnd(-spread, spread), {
        vx: rnd(-1, 1),
        vy: rnd(0, 1.5),
        size,
        sizeEnd: 0,
        life: rnd(0.25, 0.5),
        gravity: 0.1,
        additive: true,
        spin: 3,
        fadeFrom: 0.3,
      });
    }
  }

  /**
   * Material-specific debris. `force` 0..1 scales count, speed and size; (vx, vy) is the velocity
   * the debris inherits; `spread` is the radius of the source area in metres.
   */
  private debris(material: BlockMaterial, x: number, y: number, force: number, vx: number, vy: number, spread: number, big: boolean): void {
    const f = clamp01(force);
    const speed = 1.5 + f * 5.5;
    const at = (): [number, number] => [x + rnd(-spread, spread), Math.max(0.08, y + rnd(-spread, spread))];
    const launch = (s: number): [number, number] => {
      const a = rnd(0, Math.PI * 2);
      const v = s * rnd(0.45, 1.1);
      return [vx * 0.45 + Math.cos(a) * v, vy * 0.45 + Math.sin(a) * v + 1.8 * (0.5 + f)];
    };
    switch (material) {
      case 'wood':
      case 'tnt': {
        const tint = material === 'tnt' ? MATERIAL_COLORS.tnt.base : undefined;
        const chipTint = material === 'tnt' ? MATERIAL_COLORS.tnt.dark : undefined;
        const splinters = this.quota((big ? 5 : 1) + f * (big ? 9 : 4), 1);
        for (let i = 0; i < splinters; i++) {
          const [px, py] = at();
          const [svx, svy] = launch(speed * 1.1);
          this.emit('splinter', px, py, { vx: svx, vy: svy, size: rnd(0.25, 0.45) + (big ? f * 0.3 : 0), life: rnd(0.9, 1.5), bounce: 0.3, spin: 13, color: tint });
        }
        const chips = this.quota((big ? 3 : 1) + f * 4);
        for (let i = 0; i < chips; i++) {
          const [px, py] = at();
          const [svx, svy] = launch(speed);
          this.emit('woodchip', px, py, { vx: svx, vy: svy, size: rnd(0.12, 0.28), life: rnd(0.9, 1.6), bounce: 0.35, spin: 10, color: chipTint });
        }
        break;
      }
      case 'stone': {
        // A few heavy chunks that leave dust trails, many small stones, and a lot of dust.
        if (big) {
          const chunks = this.quota(1 + f * 2.5, 1);
          for (let i = 0; i < chunks; i++) {
            const [px, py] = at();
            const [svx, svy] = launch(speed * 0.8);
            this.emit('rock', px, py, { vx: svx, vy: svy, size: rnd(0.32, 0.5), life: rnd(1.4, 2), bounce: 0.18, spin: 6, gravity: 1.15, trail: MATERIAL_DUST.stone, trailSize: 0.3 });
          }
        }
        const stones = this.quota((big ? 4 : 1) + f * (big ? 7 : 3), 1);
        for (let i = 0; i < stones; i++) {
          const [px, py] = at();
          const [svx, svy] = launch(speed * 0.9);
          this.emit('rock', px, py, { vx: svx, vy: svy, size: rnd(0.1, 0.26), life: rnd(1, 1.7), bounce: 0.22, spin: 9, gravity: 1.1 });
        }
        break;
      }
      case 'glass': {
        const shards = this.quota((big ? 7 : 2) + f * (big ? 9 : 4), 1);
        for (let i = 0; i < shards; i++) {
          const [px, py] = at();
          const [svx, svy] = launch(speed * 1.2);
          this.emit('shard', px, py, { vx: svx, vy: svy, size: rnd(0.12, 0.38) * (i % 3 === 0 ? 0.5 : 1), life: rnd(0.7, 1.3), bounce: 0.38, spin: 14 });
        }
        break;
      }
      case 'metal': {
        const pieces = this.quota((big ? 3 : 0) + f * (big ? 3 : 1));
        for (let i = 0; i < pieces; i++) {
          const [px, py] = at();
          const [svx, svy] = launch(speed * 0.85);
          this.emit('metal', px, py, { vx: svx, vy: svy, size: rnd(0.2, 0.36), life: rnd(1.2, 1.8), bounce: 0.45, spin: 11, gravity: 1.2, trail: big && i === 0 ? SMOKE_GREY : undefined, trailSize: 0.22 });
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ events

  handle(event: SimEvent): void {
    switch (event.type) {
      case 'birdLaunched':
        this.onLaunch(event);
        break;
      case 'birdImpact':
        this.onBirdImpact(event);
        break;
      case 'impact':
        this.onImpact(event);
        break;
      case 'blockDamaged':
        if (event.stageChanged) {
          // A visible new crack: a little puff of the material.
          const force = clamp01(event.damage / 60);
          this.debris(event.material, event.x, event.y, 0.25 + force * 0.4, 0, 0, 0.35, false);
          this.puffs(event.x, event.y, 1, MATERIAL_DUST[event.material], 0.45);
        }
        break;
      case 'blockDestroyed':
        this.onBlockDestroyed(event);
        break;
      case 'pigDamaged':
        this.deps.actors.hit(event.id, this.deps.now());
        this.stars(event.x, event.y, event.armored ? 3 : 2, 3.5);
        if (event.armored) this.sparks(event.x, event.y + PIGS[event.variant].radius * 0.6, 3 + Math.round(event.damage / 30), 5, 0, 1, 0.3);
        this.sound(event.armored ? 'armor_hit' : 'pig_hurt', event.x, 0.5 + event.damage / 80);
        break;
      case 'armorBroken':
        this.onArmorBroken(event);
        break;
      case 'pigDefeated':
        this.onPigDefeated(event);
        break;
      case 'score':
        this.onScore(event);
        break;
      case 'ability':
        this.onAbility(event);
        break;
      case 'explosion':
        this.onExplosion(event);
        break;
      case 'birdExpired':
        if (event.reason === 'rest' || event.reason === 'timeout' || event.reason === 'resolved') {
          this.puffs(event.x, event.y, 5, '#ffffff', 0.8);
          if (event.bird !== 'egg') this.feathers(event.x, event.y, 3, this.featherColor(event.bird));
          this.sound('bird_poof', event.x, 0.5);
        }
        break;
      default:
        break;
    }
  }

  private featherColor(bird: keyof typeof BIRDS | 'egg'): string {
    if (bird === 'egg' || bird === 'matilda') return '#ffffff';
    if (bird === 'bomb') return '#5a5a66';
    return BIRD_COLORS[bird].body;
  }

  private onLaunch(event: SimEventOf<'birdLaunched'>): void {
    this.deps.audio.play('sling_release', { intensity: event.power, pan: this.pan(event.x) });
    this.deps.audio.play('bird_launch', { bird: event.bird, pan: this.pan(event.x) });
    // The pouch snaps: a pale shock ring, a puff of air and a loose feather or two.
    this.deps.particles.ring(event.x, event.y, 0.15, 0.6 + event.power * 0.6, 0.22, '#ffffff', 0.12);
    this.puffs(event.x, event.y, 2, '#ffffff', 0.5 + event.power * 0.3);
    if (event.power > 0.6) this.feathers(event.x, event.y, 1 + Math.round(event.power), this.featherColor(event.bird));
  }

  private onBirdImpact(event: SimEventOf<'birdImpact'>): void {
    const strength = clamp01(event.speed / 22);
    this.deps.actors.hit(event.id, this.deps.now(), 0.6 + strength);
    this.feathers(event.x, event.y, Math.round(2 + strength * 5), this.featherColor(event.bird));
    this.stars(event.x, event.y, 2 + Math.round(strength * 2));
    if (event.first && strength > 0.35) this.flash(event.x, event.y, 0.8 + strength * 1.2, 0.5 + strength * 0.4);
    if (event.bird !== 'egg') this.deps.audio.play('bird_impact', { bird: event.bird, intensity: 0.4 + strength * 0.6, pan: this.pan(event.x) });
    if (event.bird === 'bomb') this.sound('bomb_fuse', event.x, 0.8);
    this.deps.camera.shake(0.06 + strength * 0.14);
  }

  private onImpact(event: SimEventOf<'impact'>): void {
    const strength = clamp01(event.energy / 70);
    const a = this.materialOf(event.a);
    const b = this.materialOf(event.b);
    const material = a ?? b;
    if (material) this.sound(`${material === 'tnt' ? 'wood' : material}_hit` as SfxName, event.x, 0.2 + strength * 0.8);
    if (event.a === 'ground' || event.b === 'ground') {
      if (!material) this.sound('ground_hit', event.x, 0.2 + strength * 0.8);
      if (event.speed > 2.5 && event.y < 0.6) {
        this.puffs(event.x, Math.max(0.05, event.y), Math.round(1 + strength * 4), DUST_COLORS[this.deps.theme], 0.7 + strength * 0.6);
      }
    }
    if (strength >= QUIET_IMPACT) {
      for (const m of a && b && a !== b ? [a, b] : material ? [material] : []) this.impactFx(m, event, strength);
    }
    if (event.energy > 120) this.deps.camera.shake(clamp01(event.energy / 900) * 0.4);
  }

  /** What one surface throws off when it is struck. */
  private impactFx(material: BlockMaterial, event: SimEventOf<'impact'>, strength: number): void {
    const { x, y } = event;
    const len = Math.hypot(event.nx, event.ny) || 1;
    const nx = event.nx / len;
    const ny = event.ny / len;
    switch (material) {
      case 'metal':
        // Steel answers with a hot white flash and a fan of sparks skidding along the surface.
        this.sparks(x, y, 2 + strength * 12, 5 + strength * 9, nx, ny, 0.45);
        if (strength > 0.2) this.flash(x, y, 0.5 + strength * 0.9, 0.65 + strength * 0.3, 0.1);
        break;
      case 'glass':
        this.debris('glass', x, y, strength * 0.7, 0, 0, 0.15, false);
        this.glints(x, y, 1 + strength * 3, 0.25);
        break;
      case 'stone':
        this.debris('stone', x, y, strength * 0.8, 0, 0, 0.15, false);
        this.puffs(x, y, 1 + strength * 3, MATERIAL_DUST.stone, 0.5 + strength * 0.5);
        if (strength > 0.4) this.flash(x, y, 0.6 + strength * 0.6, 0.35, 0.12);
        break;
      default:
        this.debris(material, x, y, strength * 0.8, 0, 0, 0.15, false);
        if (strength > 0.3) this.puffs(x, y, 1, MATERIAL_DUST[material], 0.4 + strength * 0.3);
        break;
    }
  }

  private materialOf(surface: SurfaceKind): BlockMaterial | null {
    return surface === 'wood' || surface === 'glass' || surface === 'stone' || surface === 'metal' || surface === 'tnt' ? surface : null;
  }

  private onBlockDestroyed(event: SimEventOf<'blockDestroyed'>): void {
    const area = blockArea(event.shape, event.w, event.h);
    const speed = Math.hypot(event.vx, event.vy);
    const size = clamp(Math.sqrt(area), 0.4, 1.6);
    // Bigger pieces and harder hits make a bigger mess.
    const force = clamp01(0.25 + size * 0.35 + speed / 30);
    const spread = Math.min(1, Math.max(event.w, event.h) / 2) * 0.8;
    const { x, y, material } = event;
    this.debris(material, x, y, force, event.vx, event.vy, spread, true);

    switch (material) {
      case 'glass':
        this.glints(x, y, 2 + force * 4, spread);
        this.deps.particles.ring(x, y, 0.1, 0.5 + size * 0.6, 0.25, '#e6f8ff', 0.1);
        break;
      case 'stone': {
        // Heavy, lingering dust that rolls out low.
        const n = this.quota(3 + force * 4, 2);
        for (let i = 0; i < n; i++) {
          const s = rnd(0.7, 1.25) * size;
          this.emit('dust', x + rnd(-spread, spread), y + rnd(-spread, spread) * 0.6, {
            vx: rnd(-1.8, 1.8) + event.vx * 0.15,
            vy: rnd(-0.2, 1),
            size: s,
            sizeEnd: s * 2.3,
            life: rnd(1.1, 1.8),
            gravity: -0.02,
            drag: 2.2,
            alpha: 0.7,
            spin: 1,
            color: MATERIAL_DUST.stone,
            fadeFrom: 0.25,
          });
        }
        break;
      }
      case 'metal':
        this.flash(x, y, 1 + size * 0.8, 0.9, 0.16);
        this.sparks(x, y, 8 + force * 12, 7 + force * 6, 0, 1, 0.55);
        this.puffs(x, y, 2, SMOKE_GREY, size * 0.8, 'smoke', 1.3);
        break;
      default:
        this.puffs(x, y, 2 + Math.round(force * 2), MATERIAL_DUST[material], size);
        break;
    }
    if (material !== 'tnt') this.sound(`${material}_break` as SfxName, x, 0.4 + force * 0.6);
    const weight = MATERIAL_WEIGHT[material];
    this.deps.camera.shake((0.04 + size * 0.06) * weight * (0.6 + force * 0.6));
    if (weight > 1.2 && speed > 4) this.deps.camera.kick(clamp(event.vx * 0.04, -0.6, 0.6), -0.4 * weight * force);

    // Lots of pieces breaking at once deserves a moment of slow motion.
    const now = this.deps.now();
    const breaks = this.recentBreaks;
    breaks.push(now);
    while (breaks.length > 0 && now - (breaks[0] as number) > STREAK_WINDOW) breaks.shift();
    if (breaks.length >= STREAK_BLOCKS) {
      breaks.length = 0;
      this.deps.slowMotion(0.45);
    }
  }

  private onArmorBroken(event: SimEventOf<'armorBroken'>): void {
    const radius = PIGS[event.variant].radius;
    const sprite = this.deps.renderer.accessorySprite(event.variant === 'helmet' ? 'helmet' : 'armor');
    // The accessory sprite covers the whole character space, so scale it with the pig.
    this.deps.particles.spawn({
      sprite,
      designSize: ACCESSORY_DESIGN,
      x: event.x,
      y: event.y,
      vx: event.vx * 0.4 + rnd(-2, 2),
      vy: event.vy * 0.3 + rnd(5, 7.5),
      size: radius * 3.6,
      life: 1.8,
      vrot: rnd(-9, 9),
      bounce: 0.4,
      fadeFrom: 0.7,
    });
    this.flash(event.x, event.y + radius * 0.6, radius * 3, 0.8, 0.14);
    this.sparks(event.x, event.y + radius * 0.6, 10, 8, 0, 1, 0.45);
    this.debris('metal', event.x, event.y + radius * 0.5, 0.4, event.vx, event.vy, radius * 0.5, false);
    this.stars(event.x, event.y + radius * 0.6, 5);
    this.sound('armor_break', event.x, 0.9);
    this.deps.camera.shake(0.17);
  }

  private onPigDefeated(event: SimEventOf<'pigDefeated'>): void {
    const radius = PIGS[event.variant].radius;
    this.deps.actors.popPig(event, radius, 0);
    // A round green-white poof that bursts outwards, then drifts up.
    const n = this.quota(7, 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3);
      const s = rnd(0.5, 0.8) * radius * 2;
      this.emit('dust', event.x + Math.cos(a) * radius * 0.4, event.y + Math.sin(a) * radius * 0.4, {
        vx: Math.cos(a) * rnd(2, 3.5) * radius * 2,
        vy: Math.sin(a) * rnd(2, 3.5) * radius * 2 + 0.6,
        size: s,
        sizeEnd: s * 1.9,
        life: rnd(0.55, 0.85),
        gravity: -0.05,
        drag: 5,
        alpha: 0.85,
        spin: 2,
        color: PIG_POOF,
        fadeFrom: 0.3,
      });
    }
    this.deps.particles.ring(event.x, event.y, radius * 0.4, radius * 2.6, 0.3, '#f4ffe6', 0.14);
    this.flash(event.x, event.y, radius * 3.2, 0.6, 0.16);
    this.stars(event.x, event.y, 6, 5.5);
    if (event.variant === 'king') {
      this.deps.particles.spawn({
        sprite: this.deps.renderer.accessorySprite('crown'),
        designSize: ACCESSORY_DESIGN,
        x: event.x,
        y: event.y,
        vx: rnd(-2, 2),
        vy: rnd(6, 8),
        size: radius * 3.6,
        life: 2.2,
        vrot: rnd(-8, 8),
        bounce: 0.45,
        fadeFrom: 0.75,
      });
      this.glints(event.x, event.y + radius, 4, radius);
    }
    this.sound('pig_defeat', event.x, 0.6 + radius * 0.4);
    this.deps.camera.shake(0.16 + radius * 0.12);
    if (event.remaining === 0) this.deps.slowMotion(0.7);
  }

  private onScore(event: SimEventOf<'score'>): void {
    const text = `+${event.points.toLocaleString('en-US')}`;
    if (event.reason === 'pig') {
      this.deps.texts.spawn(text, event.x, event.y + 0.6, SCORE_COLORS.pig, 30, 1.3, 1.8);
      this.sound('score_tick', event.x, 0.9);
    } else if (event.reason === 'block') {
      this.deps.texts.spawn(text, event.x, event.y + 0.3, SCORE_COLORS.block, 17, 0.9, 1.2);
    }
  }

  private onAbility(event: SimEventOf<'ability'>): void {
    const { x, y } = event;
    const particles = this.deps.particles;
    switch (event.ability) {
      case 'boost': {
        particles.ring(x, y, 0.2, 1.6, 0.3, '#fff3a0', 0.2);
        this.flash(x, y, 1.4, 0.7, 0.12);
        const speed = Math.hypot(event.vx, event.vy) || 1;
        const n = this.quota(10);
        for (let i = 0; i < n; i++) {
          this.emit('spark', x, y, {
            vx: (-event.vx / speed) * rnd(3, 9) + rnd(-2, 2),
            vy: (-event.vy / speed) * rnd(3, 9) + rnd(-2, 2),
            size: rnd(0.3, 0.55),
            sizeEnd: 0,
            life: rnd(0.25, 0.45),
            gravity: 0,
            additive: true,
            align: true,
          });
        }
        this.sound('ability_boost', x, 1);
        break;
      }
      case 'split':
        particles.ring(x, y, 0.15, 1.3, 0.28, '#d6f1ff', 0.18);
        this.flash(x, y, 1.1, 0.5, 0.12);
        this.puffs(x, y, 4, '#e8f7ff', 0.7);
        this.feathers(x, y, 5, BIRD_COLORS.blues.body);
        this.sound('ability_split', x, 1);
        break;
      case 'egg':
        this.feathers(x, y, 5, '#ffffff');
        this.puffs(x, y - 0.3, 3, '#ffffff', 0.7);
        this.sound('ability_egg', x, 1);
        break;
      default:
        break;
    }
  }

  private onExplosion(event: SimEventOf<'explosion'>): void {
    const { x, y, radius } = event;
    const scale = event.source === 'bomb' ? 1 : event.source === 'tnt' ? 0.85 : 0.7;
    const particles = this.deps.particles;
    // 1. White-hot core flash.
    this.flash(x, y, radius * 2.2, 1, 0.2);
    // 2. Fireball: overlapping blobs that swell and cool.
    const fire = this.quota(5 + 3 * scale, 4);
    for (let i = 0; i < fire; i++) {
      const a = rnd(0, Math.PI * 2);
      const d = i === 0 ? 0 : rnd(0.2, 0.55) * radius;
      this.emit('fire', x + Math.cos(a) * d, y + Math.sin(a) * d, {
        vx: Math.cos(a) * rnd(0.5, 2),
        vy: Math.sin(a) * rnd(0.5, 2) + 1,
        size: radius * rnd(0.45, 0.7),
        sizeEnd: radius * rnd(1.1, 1.6),
        life: rnd(0.24, 0.4),
        gravity: -0.1,
        additive: true,
        alpha: 0.95,
        spin: 1.5,
        fadeFrom: 0.2,
      });
    }
    // 3. Shock waves.
    particles.ring(x, y, radius * 0.1, radius * 1.05, 0.34, '#ffffff', 0.42);
    particles.ring(x, y, radius * 0.05, radius * 0.7, 0.5, '#ffd27a', 0.28);
    // 4. A rolling smoke column, darker and slower than the fire.
    const smoke = this.quota(9 * scale + 2, 4);
    for (let i = 0; i < smoke; i++) {
      const angle = rnd(0, Math.PI * 2);
      const size = rnd(0.8, 1.35) * scale * Math.max(1, radius / 2.2);
      this.emit('smoke', x + Math.cos(angle) * rnd(0, 0.8), y + Math.sin(angle) * rnd(0, 0.8), {
        vx: Math.cos(angle) * rnd(0.8, 2.8),
        vy: Math.sin(angle) * rnd(0.5, 2) + rnd(1.2, 2.6),
        size,
        sizeEnd: size * 2.4,
        life: rnd(1.1, 2),
        gravity: -0.08,
        drag: 1.6,
        alpha: 0.72,
        spin: 1.2,
        fadeFrom: 0.3,
      });
    }
    // 5. Sparks and burning embers; some embers trail smoke.
    const embers = this.quota(18 * scale, 6);
    for (let i = 0; i < embers; i++) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(6, 15) * scale;
      const ember = i % 3 === 0;
      this.emit(ember ? 'fire' : 'spark', x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 2,
        size: ember ? rnd(0.18, 0.32) : rnd(0.3, 0.55),
        sizeEnd: 0.04,
        life: rnd(0.4, 0.85),
        gravity: 0.7,
        drag: 1.2,
        additive: true,
        align: !ember,
        trail: ember && i % 2 === 0 ? SMOKE_GREY : undefined,
        trailSize: 0.18,
      });
    }
    // 6. Charred debris.
    const bits = this.quota(5 * scale);
    for (let i = 0; i < bits; i++) {
      const angle = rnd(0.15, Math.PI - 0.15);
      const speed = rnd(5, 11) * scale;
      this.emit(i % 2 === 0 ? 'woodchip' : 'rock', x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: rnd(0.14, 0.28),
        life: rnd(1, 1.6),
        bounce: 0.3,
        spin: 12,
        color: '#4a3a30',
      });
    }
    // 7. Dust rolling out along the ground.
    if (y < radius) {
      const n = this.quota(6, 2);
      for (let i = 0; i < n; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const s = rnd(0.7, 1.1) * scale;
        this.emit('dust', x + dir * rnd(0, 0.6), 0.15, {
          vx: dir * rnd(3, 7),
          vy: rnd(0.2, 1),
          size: s,
          sizeEnd: s * 2.2,
          life: rnd(0.7, 1.1),
          gravity: -0.02,
          drag: 2.6,
          alpha: 0.65,
          spin: 1,
          color: DUST_COLORS[this.deps.theme],
          fadeFrom: 0.2,
        });
      }
    }
    this.sound('explosion', x, scale);
    this.deps.camera.shake(0.55 * scale + 0.25);
    this.deps.camera.kick(rnd(-1.2, 1.2), 2.2 * scale);
    if (event.source === 'bomb') this.deps.slowMotion(0.3);
  }

  /** Speed streaks behind a boosting Chuck; call once per frame while it applies. */
  boostTrail(x: number, y: number, vx: number, vy: number): void {
    if (this.quota(2) < 2) return;
    this.emit('spark', x + rnd(-0.15, 0.15), y + rnd(-0.15, 0.15), {
      vx: -vx * 0.08,
      vy: -vy * 0.08,
      size: rnd(0.4, 0.6),
      sizeEnd: 0,
      life: 0.22,
      gravity: 0,
      additive: true,
      align: true,
      spin: 0,
    });
    this.emit('dust', x, y, { vx: -vx * 0.05, vy: -vy * 0.05, size: 0.5, sizeEnd: 0.15, life: 0.3, gravity: 0, alpha: 0.35, color: BIRD_COLORS.chuck.light, spin: 0.5 });
  }

  /** Smoke and sparks from a lit fuse. */
  fuseSmoke(x: number, y: number): void {
    if (this.quota(1) === 0) return;
    this.emit('smoke', x, y, { vx: rnd(-0.4, 0.4), vy: rnd(0.8, 1.6), size: 0.25, sizeEnd: 0.6, life: 0.5, gravity: -0.05, drag: 1, alpha: 0.5, spin: 1 });
    if (Math.random() < 0.5 && this.quota(1) > 0) this.emit('spark', x, y, { vx: rnd(-2, 2), vy: rnd(1, 3), size: 0.22, sizeEnd: 0, life: 0.2, gravity: 0.4, additive: true, align: true });
  }

  /** "+10,000" over an unused bird during the victory tally. */
  bonus(points: number, x: number, y: number): void {
    this.deps.texts.spawn(`+${points.toLocaleString('en-US')}`, x, y, SCORE_COLORS.bird, 32, 1.4, 1.6);
    this.stars(x, y, 5, 4);
    this.glints(x, y, 2, 0.3);
    this.sound('score_bonus', x, 0.9);
  }
}

function blockArea(shape: BlockShape, w: number, h: number): number {
  if (shape === 'circle') return Math.PI * (w / 2) ** 2;
  return w * h * (shape === 'rect' ? 1 : 0.5);
}
