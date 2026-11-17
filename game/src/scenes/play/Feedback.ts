/**
 * Game feel: turns simulation events into particles, sounds, floating score numbers, screen shake,
 * camera impulses and brief slow motion. Purely cosmetic; the simulation never reads any of it.
 *
 * Every effect is scaled by the real collision energy / impact speed, so taps stay subtle and big
 * collapses get loud. Each material has its own debris recipe. A per-frame spawn budget and the
 * pool load keep a chain reaction from flooding the particle pool.
 */
import type { IAudioManager, SfxName } from '../../audio/types';
import { BIRDS, FOES } from '../../core/config';
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
  ice: '#f2fbff',
  ironwood: '#b08a66',
  crystal: '#ecd6ff',
  rubber: '#4a505c',
  tnt: '#6a5a50',
};
/** How hard each material shakes the camera when it breaks. */
const MATERIAL_WEIGHT: Record<BlockMaterial, number> = { wood: 1, glass: 0.55, stone: 1.5, metal: 1.7, ice: 0.6, ironwood: 1.3, crystal: 0.8, rubber: 0.9, tnt: 1 };
/** The debris recipe and impact sound each material borrows. */
type Family = 'wood' | 'glass' | 'stone' | 'metal' | 'tnt';
const FAMILY: Record<BlockMaterial, Family> = { wood: 'wood', ironwood: 'wood', glass: 'glass', ice: 'glass', crystal: 'glass', stone: 'stone', rubber: 'stone', metal: 'metal', tnt: 'tnt' };
/** Tint of the borrowed debris, where the material is not the family's own colour. */
const DEBRIS_TINT: Partial<Record<BlockMaterial, string>> = { ice: '#dff6ff', crystal: '#d9a8ff', rubber: '#3a404c', ironwood: '#7a4e2c' };
const FOE_POOF = '#e9eef6';
const FROST = '#dff6ff';
const VOLT = '#fff27a';
const NOVA = '#c9a8ff';

/** A lightning bolt or gravity well that is drawn directly, on top of the particles. */
interface Bolt {
  /** x0, y0, x1, y1 per arc, world metres. */
  arcs: number[];
  until: number;
  seed: number;
}
interface Well {
  x: number;
  y: number;
  radius: number;
  since: number;
  /** Set when the well closes. */
  until: number;
}
const BOLT_LIFE = 0.34;
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
  fadeIn?: number;
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
  private readonly bolts: Bolt[] = [];
  private readonly wells: Well[] = [];
  /** Dots left along the last shot's flight path: x, y pairs in metres. */
  private readonly trailDots: number[] = [];
  private readonly trailLast = new Map<number, { x: number; y: number }>();
  /** Burn marks explosions leave on the ground. */
  private readonly scorches: { x: number; r: number; born: number }[] = [];

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
      fadeIn: o.fadeIn,
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
        // Normal blending: additive sparks vanish against snow and bright sand.
        align: true,
        spin: 0,
      });
    }
  }

  /** Comic burst star that pops outwards; `color` tints it (default fiery). */
  private burst(x: number, y: number, size: number, sizeEnd: number, life: number, color?: string): void {
    if (this.quota(1, 1) === 0) return;
    const o: EmitOptions = { size, sizeEnd, life, gravity: 0, spin: 1.2, fadeFrom: 0.6 };
    if (color) o.color = color;
    this.emit('burst', x, y, o);
  }

  /** Speed lines flying straight out from a point. */
  private streaks(x: number, y: number, count: number, speed: number, color = '#ffffff', r0 = 0.2): void {
    const n = this.quota(count);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.25, 0.25);
      const v = speed * rnd(0.6, 1.1);
      this.emit('streak', x + Math.cos(a) * r0, y + Math.sin(a) * r0, {
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        size: rnd(0.7, 1.3),
        sizeEnd: 0.3,
        life: rnd(0.16, 0.3),
        gravity: 0,
        drag: 3,
        align: true,
        spin: 0,
        color,
        fadeFrom: 0.3,
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
    switch (FAMILY[material]) {
      case 'wood':
      case 'tnt': {
        const tint = material === 'tnt' ? MATERIAL_COLORS.tnt.base : DEBRIS_TINT[material];
        const chipTint = material === 'tnt' ? MATERIAL_COLORS.tnt.dark : DEBRIS_TINT[material];
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
          this.emit('rock', px, py, { vx: svx, vy: svy, size: rnd(0.1, 0.26), life: rnd(1, 1.7), bounce: material === 'rubber' ? 0.7 : 0.22, spin: 9, gravity: 1.1, color: DEBRIS_TINT[material] });
        }
        break;
      }
      case 'glass': {
        const shards = this.quota((big ? 7 : 2) + f * (big ? 9 : 4), 1);
        for (let i = 0; i < shards; i++) {
          const [px, py] = at();
          const [svx, svy] = launch(speed * 1.2);
          this.emit('shard', px, py, { vx: svx, vy: svy, size: rnd(0.18, 0.44) * (i % 3 === 0 ? 0.5 : 1), life: rnd(0.7, 1.3), bounce: 0.38, spin: 14, color: DEBRIS_TINT[material] });
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
      case 'foeDamaged':
        this.deps.actors.hit(event.id, this.deps.now());
        this.stars(event.x, event.y, event.armored ? 3 : 2, 3.5);
        if (event.armored) this.sparks(event.x, event.y + FOES[event.variant].radius * 0.6, 3 + Math.round(event.damage / 30), 5, 0, 1, 0.3);
        this.sound(event.armored ? 'armor_hit' : 'foe_hurt', event.x, 0.5 + event.damage / 80);
        break;
      case 'armorBroken':
        this.onArmorBroken(event);
        break;
      case 'foeDefeated':
        this.onFoeDefeated(event);
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
          this.feathers(event.x, event.y, 3, this.featherColor(event.bird));
          this.sound('bird_poof', event.x, 0.5);
        }
        break;
      case 'freeze':
        this.onFreeze(event);
        break;
      case 'shock':
        this.onShock(event);
        break;
      case 'gravityWell':
        this.onWell(event);
        break;
      case 'resonance':
        this.onResonance(event);
        break;
      case 'bounce':
        this.deps.particles.ring(event.x, event.y, 0.1, 0.9, 0.22, '#ffb86b', 0.14);
        this.stars(event.x, event.y, 2, 3);
        this.deps.audio.play('bounce', { intensity: clamp01(event.speed / 20), rate: 0.85 + Math.random() * 0.3, pan: this.pan(event.x) });
        break;
      case 'balloonPopped':
        this.flash(event.x, event.y, 1.1, 0.7, 0.1);
        this.deps.particles.ring(event.x, event.y, 0.1, 0.9, 0.2, '#ffffff', 0.12);
        this.confetti(event.x, event.y, 8, '#ff5d73');
        this.sound('balloon_pop', event.x, 1);
        break;
      case 'iceCrack':
        this.glints(event.x, event.y, 2, 0.3);
        this.sound('ice_crack', event.x, 0.7);
        break;
      case 'jointBroken':
        this.sound(event.kind === 'rope' ? 'rope_snap' : 'metal_hit', event.x, 0.9);
        this.puffs(event.x, event.y, 2, '#ecd1a0', 0.4);
        if (event.cut) this.stars(event.x, event.y, 3, 3);
        break;
      default:
        break;
    }
  }

  private featherColor(bird: keyof typeof BIRDS): string {
    return BIRD_COLORS[bird].body;
  }

  /** Scraps of something flimsy fluttering down (a popped balloon). */
  private confetti(x: number, y: number, count: number, color: string): void {
    const n = this.quota(count);
    for (let i = 0; i < n; i++) {
      const angle = rnd(0, Math.PI * 2);
      this.emit('feather', x, y, { vx: Math.cos(angle) * rnd(2, 6), vy: Math.sin(angle) * rnd(2, 6) + 2, size: rnd(0.16, 0.3), life: rnd(0.7, 1.2), gravity: 0.5, drag: 2.5, spin: 12, color });
    }
  }

  private onLaunch(event: SimEventOf<'birdLaunched'>): void {
    this.deps.audio.play('sling_release', { intensity: event.power, pan: this.pan(event.x) });
    this.deps.audio.play('bird_launch', { bird: event.bird, pan: this.pan(event.x) });
    this.trailDots.length = 0;
    this.trailLast.clear();
    // The pouch snaps: a pale shock ring, a puff of air and a loose feather or two.
    this.streaks(event.x, event.y, 5, 6 + event.power * 5, '#ffffff', 0.3);
    this.deps.particles.ring(event.x, event.y, 0.15, 0.6 + event.power * 0.6, 0.22, '#ffffff', 0.12);
    this.puffs(event.x, event.y, 2, '#ffffff', 0.5 + event.power * 0.3);
    if (event.power > 0.6) this.feathers(event.x, event.y, 1 + Math.round(event.power), this.featherColor(event.bird));
  }

  private onBirdImpact(event: SimEventOf<'birdImpact'>): void {
    const strength = clamp01(event.speed / 22);
    this.deps.actors.hit(event.id, this.deps.now(), 0.6 + strength);
    this.feathers(event.x, event.y, Math.round(2 + strength * 5), this.featherColor(event.bird));
    this.stars(event.x, event.y, 2 + Math.round(strength * 2));
    if (event.first && strength > 0.3) {
      this.burst(event.x, event.y, 0.5 + strength * 0.6, 1.1 + strength * 1.6, 0.18);
      this.streaks(event.x, event.y, Math.round(4 + strength * 6), 8 + strength * 8, '#ffffff', 0.3);
    }
    this.deps.audio.play('bird_impact', { bird: event.bird, intensity: 0.4 + strength * 0.6, pan: this.pan(event.x) });
    if (event.bird === 'ember') this.sound('fuse', event.x, 0.8);
    this.deps.camera.shake(0.06 + strength * 0.14);
  }

  private onImpact(event: SimEventOf<'impact'>): void {
    const strength = clamp01(event.energy / 70);
    const a = this.materialOf(event.a);
    const b = this.materialOf(event.b);
    const material = a ?? b;
    if (material) this.sound(`${FAMILY[material] === 'tnt' ? 'wood' : FAMILY[material]}_hit` as SfxName, event.x, 0.2 + strength * 0.8);
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
    switch (FAMILY[material]) {
      case 'metal':
        // Steel answers with a hot white flash and a fan of sparks skidding along the surface.
        this.sparks(x, y, 2 + strength * 12, 5 + strength * 9, nx, ny, 0.45);
        if (strength > 0.2) this.flash(x, y, 0.5 + strength * 0.9, 0.65 + strength * 0.3, 0.1);
        break;
      case 'glass':
        this.debris(material, x, y, strength * 0.7, 0, 0, 0.15, false);
        this.glints(x, y, 1 + strength * 3, 0.25);
        break;
      case 'stone':
        this.debris(material, x, y, strength * 0.8, 0, 0, 0.15, false);
        this.puffs(x, y, 1 + strength * 3, MATERIAL_DUST[material], 0.5 + strength * 0.5);
        if (strength > 0.4) this.flash(x, y, 0.6 + strength * 0.6, 0.35, 0.12);
        break;
      default:
        this.debris(material, x, y, strength * 0.8, 0, 0, 0.15, false);
        if (strength > 0.3) this.puffs(x, y, 1, MATERIAL_DUST[material], 0.4 + strength * 0.3);
        break;
    }
  }

  private materialOf(surface: SurfaceKind): BlockMaterial | null {
    return surface === 'foe' || surface === 'bird' || surface === 'ground' ? null : surface;
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

    switch (FAMILY[material]) {
      case 'glass':
        this.glints(x, y, 2 + force * 4, spread);
        this.deps.particles.ring(x, y, 0.1, 0.5 + size * 0.6, 0.25, material === 'crystal' ? '#e2b8ff' : '#e6f8ff', 0.1);
        if (material === 'ice') this.puffs(x, y, 2 + Math.round(force * 3), FROST, size * 0.9);
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
            color: MATERIAL_DUST[material],
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
    if (material !== 'tnt') this.sound(`${FAMILY[material]}_break` as SfxName, x, 0.4 + force * 0.6);
    if (material === 'rubber') this.deps.audio.play('bounce', { intensity: 0.8, rate: 0.6, pan: this.pan(x) });
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
    const radius = FOES[event.variant].radius;
    const sprite = this.deps.renderer.accessorySprite(event.variant === 'helmet' ? 'helmet' : event.variant === 'shield' ? 'shield' : 'armor');
    // The accessory sprite covers the whole character space, so scale it with the foe.
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

  private onFoeDefeated(event: SimEventOf<'foeDefeated'>): void {
    const radius = FOES[event.variant].radius;
    this.deps.actors.popFoe(event, radius, 0);
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
        color: FOE_POOF,
        fadeFrom: 0.3,
      });
    }
    this.deps.particles.ring(event.x, event.y, radius * 0.4, radius * 2.6, 0.3, '#f4ffe6', 0.14);
    this.burst(event.x, event.y, radius * 1.6, radius * 3.8, 0.2, '#ffffff');
    this.streaks(event.x, event.y, 8, 9, '#ffffff', radius);
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
    this.sound('foe_defeat', event.x, 0.6 + radius * 0.4);
    this.deps.camera.shake(0.16 + radius * 0.12);
    if (event.remaining === 0) this.deps.slowMotion(0.7);
  }

  private onScore(event: SimEventOf<'score'>): void {
    const text = `+${event.points.toLocaleString('en-US')}`;
    if (event.reason === 'foe') {
      this.deps.texts.spawn(text, event.x, event.y + 0.6, SCORE_COLORS.foe, 30, 1.3, 1.8);
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
        particles.ring(x, y, 0.2, 1.8, 0.3, '#fff3a0', 0.24);
        this.burst(x, y, 0.6, 1.7, 0.18, '#ffd23f');
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
        this.burst(x, y, 0.5, 1.3, 0.18, '#b7e36a');
        this.streaks(x, y, 6, 8, '#eeffc4', 0.2);
        this.puffs(x, y, 4, '#e8f7ff', 0.7);
        this.feathers(x, y, 5, BIRD_COLORS.sprig.body);
        this.sound('ability_split', x, 1);
        break;
      case 'slam':
        particles.ring(x, y, 0.3, 1.5, 0.25, '#f1dfc0', 0.22);
        this.burst(x, y, 0.6, 1.6, 0.2, '#ead5b0');
        this.feathers(x, y, 4, BIRD_COLORS.brawn.body);
        this.puffs(x, y + 0.4, 3, '#ffffff', 0.7);
        this.sound('ability_slam', x, 1);
        break;
      case 'gravity':
        this.sound('ability_gravity', x, 1);
        this.flash(x, y, 2.4, 0.6, 0.25);
        break;
      default:
        break;
    }
  }

  private onExplosion(event: SimEventOf<'explosion'>): void {
    const { x, y, radius } = event;
    const scale = event.source === 'ember' ? 1 : event.source === 'tnt' ? 0.85 : event.source === 'quake' ? 0.55 : 0.7;
    if (event.source === 'quake') {
      this.onQuake(x, y, radius);
      return;
    }
    if (event.source === 'nova') {
      this.onNovaBurst(x, y, radius);
      return;
    }
    const particles = this.deps.particles;
    // 1. A short white pop.
    this.flash(x, y, radius * 1.5, 0.9, 0.1);
    // 2. Fireball: cel-shaded blobs that swell, roll outwards and burn away, under a comic burst.
    const fire = this.quota(6 + 4 * scale, 5);
    for (let i = 0; i < fire; i++) {
      const a = (i / fire) * Math.PI * 2 + rnd(-0.4, 0.4);
      const d = i === 0 ? 0 : rnd(0.15, 0.45) * radius;
      this.emit('fire', x + Math.cos(a) * d, y + Math.sin(a) * d, {
        vx: Math.cos(a) * rnd(1.5, 4) * scale,
        vy: Math.sin(a) * rnd(1.5, 4) * scale + 1.2,
        size: radius * rnd(0.4, 0.6),
        sizeEnd: radius * rnd(0.9, 1.25),
        life: rnd(0.3, 0.5),
        gravity: -0.12,
        drag: 2.2,
        alpha: 0.96,
        spin: 2.5,
        fadeFrom: 0.55,
      });
    }
    this.burst(x, y, radius * 0.9, radius * 2.2, 0.24);
    // 3. Shock waves, speed lines and a burn mark on the ground.
    particles.ring(x, y, radius * 0.1, radius * 1.15, 0.36, '#ffffff', 0.5);
    particles.ring(x, y, radius * 0.05, radius * 0.75, 0.5, '#ffb347', 0.3);
    this.streaks(x, y, Math.round(12 * scale), 16 * scale, '#fff3c4', radius * 0.3);
    if (y < radius * 0.7) {
      this.scorches.push({ x, r: radius * 0.55 * scale, born: this.deps.now() });
      if (this.scorches.length > 12) this.scorches.shift();
    }
    // 4. A rolling smoke column, darker and slower than the fire.
    const smoke = this.quota(9 * scale + 2, 4);
    for (let i = 0; i < smoke; i++) {
      const angle = rnd(0, Math.PI * 2);
      const size = rnd(0.8, 1.35) * scale * Math.max(1, radius / 2.2);
      this.emit('smoke', x + Math.cos(angle) * rnd(0, 0.8), y + radius * 0.15 + Math.sin(angle) * rnd(0, 0.8), {
        vx: Math.cos(angle) * rnd(0.8, 2.8),
        vy: Math.sin(angle) * rnd(0.5, 2) + rnd(1.2, 2.6),
        size,
        sizeEnd: size * 2.4,
        life: rnd(1.1, 2),
        gravity: -0.08,
        drag: 1.6,
        alpha: 0.72,
        fadeIn: 0.28,
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
    if (event.source === 'ember') this.deps.slowMotion(0.3);
  }

  /** Brawn's landing: a low ring of dust and flying grit, no fire. */
  private onQuake(x: number, y: number, radius: number): void {
    const particles = this.deps.particles;
    particles.ring(x, y, radius * 0.1, radius, 0.3, '#ffffff', 0.34);
    particles.ring(x, y, radius * 0.05, radius * 0.6, 0.42, '#e6cc9c', 0.22);
    const dust = DUST_COLORS[this.deps.theme];
    const n = this.quota(12, 5);
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const size = rnd(0.7, 1.2);
      this.emit('dust', x + dir * rnd(0, 0.5), Math.max(0.1, y - 0.2), { vx: dir * rnd(3, 9), vy: rnd(0.3, 2.2), size, sizeEnd: size * 2.3, life: rnd(0.7, 1.2), gravity: -0.02, drag: 2.4, alpha: 0.7, spin: 1, color: dust, fadeFrom: 0.2 });
    }
    this.debris('stone', x, y, 0.8, 0, 3, 0.6, false);
    this.burst(x, y + 0.2, radius * 0.45, radius * 1.15, 0.22, '#e6cc9c');
    this.streaks(x, y + 0.2, 10, 12, '#ffffff', 0.4);
    this.stars(x, y, 5, 6);
    this.sound('explosion', x, 0.45);
    this.sound('stone_break', x, 1);
    this.deps.camera.shake(0.6);
    this.deps.camera.kick(0, -1.6);
  }

  /** The gravity well lets go: a violet flash and a ring of stars, no smoke. */
  private onNovaBurst(x: number, y: number, radius: number): void {
    const particles = this.deps.particles;
    this.flash(x, y, radius * 1.8, 0.9, 0.18);
    this.burst(x, y, radius * 0.5, radius * 1.5, 0.24, NOVA);
    this.streaks(x, y, 12, 14, '#f0dcff', radius * 0.2);
    particles.ring(x, y, radius * 0.1, radius * 1.1, 0.36, NOVA, 0.36);
    particles.ring(x, y, radius * 0.05, radius * 0.7, 0.5, '#ffffff', 0.2);
    this.glints(x, y, 10, radius * 0.6);
    this.stars(x, y, 8, 8);
    this.feathers(x, y, 5, BIRD_COLORS.nova.body);
    this.sound('gravity_release', x, 1);
    this.deps.camera.shake(0.4);
  }

  private onFreeze(event: SimEventOf<'freeze'>): void {
    const { x, y, radius } = event;
    const particles = this.deps.particles;
    this.flash(x, y, radius * 1.6, 0.75, 0.2);
    particles.ring(x, y, radius * 0.1, radius, 0.4, '#ffffff', 0.3);
    particles.ring(x, y, radius * 0.05, radius * 0.75, 0.55, '#9fdcf8', 0.2);
    this.glints(x, y, 10 + event.count * 2, radius * 0.7);
    const n = this.quota(14, 6);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const d = rnd(0.2, 1) * radius;
      const size = rnd(0.4, 0.8);
      this.emit('dust', x + Math.cos(a) * d, y + Math.sin(a) * d, { vx: Math.cos(a) * rnd(0.5, 2), vy: rnd(-0.6, 0.4), size, sizeEnd: size * 1.8, life: rnd(0.8, 1.4), gravity: 0.03, drag: 2, alpha: 0.55, spin: 1, color: FROST, fadeFrom: 0.3 });
    }
    this.burst(x, y, radius * 0.35, radius * 1.0, 0.24, '#8fd4f7');
    this.streaks(x, y, 10, 11, '#eafaff', radius * 0.2);
    const flakes = this.quota(12, 4);
    for (let i = 0; i < flakes; i++) {
      const a = rnd(0, Math.PI * 2);
      const d = rnd(0.1, 0.9) * radius;
      this.emit('snow', x + Math.cos(a) * d, y + Math.sin(a) * d, { vx: rnd(-1.2, 1.2), vy: rnd(0.5, 2.2), size: rnd(0.3, 0.55), life: rnd(1.1, 1.9), gravity: 0.12, drag: 1.5, spin: 2.5, fadeFrom: 0.5 });
    }
    this.feathers(x, y, 4, BIRD_COLORS.rime.dark);
    this.sound('ability_freeze', x, 1);
    this.deps.camera.shake(0.12);
  }

  private onShock(event: SimEventOf<'shock'>): void {
    const now = this.deps.now();
    this.bolts.push({ arcs: event.arcs, until: now + BOLT_LIFE, seed: Math.random() * 1000 });
    this.flash(event.x, event.y, 2.2, 0.9, 0.12);
    this.burst(event.x, event.y, 0.6, 1.8, 0.18, VOLT);
    for (let i = 0; i < event.arcs.length; i += 4) {
      const ex = event.arcs[i + 2] as number;
      const ey = event.arcs[i + 3] as number;
      this.sparks(ex, ey, 3, 7, 0, 1, 0.35);
      if (this.quota(2) === 2) for (let k = 0; k < 2; k++) this.emit('zap', ex, ey, { vx: rnd(-3, 3), vy: rnd(-1, 4), size: rnd(0.5, 0.9), sizeEnd: 0.2, life: rnd(0.15, 0.3), gravity: 0, spin: 14 });
      if (i % 8 === 0) this.flash(ex, ey, 1.1, 0.7, 0.1);
    }
    this.deps.audio.play('ability_shock', { intensity: clamp01(event.hits / 8), pan: this.pan(event.x) });
    this.deps.camera.shake(0.18 + Math.min(0.3, event.hits * 0.03));
    if (event.hits >= 6) this.deps.slowMotion(0.25);
  }

  private onWell(event: SimEventOf<'gravityWell'>): void {
    const now = this.deps.now();
    if (event.active) this.wells.push({ x: event.x, y: event.y, radius: event.radius, since: now, until: Infinity });
    else for (const well of this.wells) if (well.until === Infinity) well.until = now + 0.25;
  }

  private onResonance(event: SimEventOf<'resonance'>): void {
    const { x, y, radius } = event;
    const particles = this.deps.particles;
    particles.ring(x, y, 0.2, radius, 0.45, '#e2b8ff', 0.2);
    particles.ring(x, y, 0.1, radius * 0.7, 0.6, '#ffffff', 0.12);
    this.flash(x, y, radius * 1.2, 0.6, 0.16);
    this.glints(x, y, 8, radius * 0.5);
    this.deps.audio.play('crystal_ring', { rate: 0.85 + Math.random() * 0.4, pan: this.pan(x) });
  }

  /** Dust streaming into an open gravity well; call once per frame. */
  wellDust(): void {
    for (const well of this.wells) {
      if (well.until !== Infinity || this.quota(2) < 2) continue;
      for (let i = 0; i < 2; i++) {
        const a = rnd(0, Math.PI * 2);
        const d = well.radius * rnd(0.5, 1);
        this.emit('glint', well.x + Math.cos(a) * d, well.y + Math.sin(a) * d, { vx: -Math.cos(a) * d * 2.2 - Math.sin(a) * 2, vy: -Math.sin(a) * d * 2.2 + Math.cos(a) * 2, size: rnd(0.2, 0.4), sizeEnd: 0.05, life: 0.42, gravity: 0, additive: true, color: NOVA });
      }
    }
  }

  /** Lightning bolts and gravity wells, drawn in screen space over the particles. */
  drawOverlays(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const now = this.deps.now();
    const z = cam.zoom;
    for (let i = this.wells.length - 1; i >= 0; i--) {
      const well = this.wells[i] as Well;
      if (now > well.until) {
        this.wells.splice(i, 1);
        continue;
      }
      const grow = clamp01((now - well.since) / 0.25);
      const fade = well.until === Infinity ? 1 : clamp01((well.until - now) / 0.25);
      const sx = cam.toScreenX(well.x);
      const sy = cam.toScreenY(well.y);
      const r = well.radius * z * grow;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      glow.addColorStop(0, `rgba(40, 10, 90, ${0.55 * fade})`);
      glow.addColorStop(0.35, `rgba(125, 75, 209, ${0.28 * fade})`);
      glow.addColorStop(1, 'rgba(125, 75, 209, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        // Rings that shrink into the centre over and over.
        const phase = ((now - well.since) * 0.9 + k / 3) % 1;
        const rr = r * (1 - phase);
        ctx.globalAlpha = fade * phase * 0.8;
        ctx.strokeStyle = k === 1 ? '#ffffff' : NOVA;
        ctx.lineWidth = Math.max(1.5, 0.07 * z);
        ctx.setLineDash([rr * 0.5, rr * 0.35]);
        ctx.lineDashOffset = -(now * 60 + k * 40);
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1, rr), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (this.bolts.length === 0) return;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i] as Bolt;
      if (now > bolt.until) {
        this.bolts.splice(i, 1);
        continue;
      }
      const life = (bolt.until - now) / BOLT_LIFE;
      // The bolt re-forks a few times while it lasts.
      const flicker = Math.floor(now * 40);
      ctx.beginPath();
      for (let a = 0; a < bolt.arcs.length; a += 4) {
        const x0 = cam.toScreenX(bolt.arcs[a] as number);
        const y0 = cam.toScreenY(bolt.arcs[a + 1] as number);
        const x1 = cam.toScreenX(bolt.arcs[a + 2] as number);
        const y1 = cam.toScreenY(bolt.arcs[a + 3] as number);
        const len = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.max(2, Math.round(len / 18));
        const nx = -(y1 - y0) / (len || 1);
        const ny = (x1 - x0) / (len || 1);
        ctx.moveTo(x0, y0);
        for (let k = 1; k < steps; k++) {
          const t = k / steps;
          const jitter = Math.sin(bolt.seed + a * 3.1 + k * 12.9898 + flicker * 78.233) * 43758.5453;
          const off = ((jitter - Math.floor(jitter)) - 0.5) * Math.min(26, len * 0.3);
          ctx.lineTo(x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off);
        }
        ctx.lineTo(x1, y1);
      }
      ctx.globalAlpha = Math.min(1, life * 1.6);
      ctx.strokeStyle = '#5b5fe0';
      ctx.lineWidth = Math.max(6, 0.3 * z) * (0.5 + life * 0.5);
      ctx.stroke();
      ctx.strokeStyle = VOLT;
      ctx.lineWidth = Math.max(3, 0.14 * z) * (0.5 + life * 0.5);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.2, 0.05 * z);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Drops a dot along a flying bird's path; the dots stay until the next launch. */
  flightDot(id: number, x: number, y: number): void {
    const last = this.trailLast.get(id);
    if (last && (x - last.x) ** 2 + (y - last.y) ** 2 < 0.36) return;
    if (last) {
      last.x = x;
      last.y = y;
    } else this.trailLast.set(id, { x, y });
    if (this.trailDots.length < 600) this.trailDots.push(x, y);
  }

  /** The dotted flight path, drawn behind the birds (screen space). */
  drawTrail(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number): void {
    const dots = this.trailDots;
    if (dots.length === 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(43, 26, 18, 0.35)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    for (let i = 0; i < dots.length; i += 2) {
      const r = Math.max(1.5, (i % 4 === 0 ? 0.085 : 0.06) * cam.zoom);
      ctx.beginPath();
      ctx.arc(cam.toScreenX(dots[i] as number), cam.toScreenY(dots[i + 1] as number), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Burn marks on the ground, drawn under the playfield (screen space). */
  drawUnder(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number): void {
    if (this.scorches.length === 0) return;
    const now = this.deps.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const s = this.scorches[i] as { x: number; r: number; born: number };
      const age = now - s.born;
      if (age > 14) {
        this.scorches.splice(i, 1);
        continue;
      }
      const a = 0.55 * clamp01((14 - age) / 5);
      const rx = s.r * cam.zoom;
      const ry = Math.max(3, rx * 0.16);
      ctx.save();
      ctx.translate(cam.toScreenX(s.x), cam.toScreenY(0) + ry * 0.4);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
      g.addColorStop(0, `rgba(24, 16, 12, ${a})`);
      g.addColorStop(0.6, `rgba(40, 26, 18, ${a * 0.6})`);
      g.addColorStop(1, 'rgba(40, 26, 18, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Speed streaks behind a dashing Zip or a diving Brawn; call once per frame while it applies. */
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
    this.emit('streak', x + rnd(-0.3, 0.3), y + rnd(-0.3, 0.3), { vx: vx * 0.25, vy: vy * 0.25, size: rnd(1, 1.6), sizeEnd: 0.5, life: 0.2, gravity: 0, align: true, spin: 0, color: '#ffffff', fadeFrom: 0.2 });
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
