/**
 * Game feel: turns simulation events into particles, sounds, floating score numbers, screen shake,
 * camera impulses and brief slow motion. Purely cosmetic; the simulation never reads any of it.
 */
import type { IAudioManager, SfxName } from '../../audio/types';
import { BIRDS, PIGS } from '../../core/config';
import type { SimEvent, SimEventOf, SurfaceKind } from '../../core/events';
import { clamp, clamp01 } from '../../core/math';
import { BIRD_COLORS, DUST_COLORS, MATERIAL_COLORS, SCORE_COLORS } from '../../core/palette';
import type { BlockMaterial, ThemeId } from '../../core/types';
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

  constructor(private readonly deps: FeedbackDeps) {}

  private pan(x: number): number {
    const cam = this.deps.camera;
    return clamp((cam.toScreenX(x) / cam.viewW) * 2 - 1, -1, 1) * 0.7;
  }

  private sound(name: SfxName, x: number, intensity = 0.7): void {
    this.deps.audio.play(name, { intensity: clamp01(intensity), pan: this.pan(x) });
  }

  private emit(kind: ParticleKind, x: number, y: number, o: EmitOptions): void {
    const sprite = this.deps.renderer.particleSprite(kind, pick(4), o.color);
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
    });
  }

  /** Soft puffs, e.g. dust kicked up from the ground. */
  private puffs(x: number, y: number, count: number, color: string, scale = 1, kind: ParticleKind = 'dust'): void {
    for (let i = 0; i < count; i++) {
      const size = rnd(0.45, 0.8) * scale;
      this.emit(kind, x + rnd(-0.3, 0.3) * scale, y + rnd(0, 0.25) * scale, {
        vx: rnd(-2.2, 2.2) * scale,
        vy: rnd(0.3, 1.6) * scale,
        size,
        sizeEnd: size * 2.1,
        life: rnd(0.45, 0.9),
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
    for (let i = 0; i < count; i++) {
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
    for (let i = 0; i < count; i++) {
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

  handle(event: SimEvent): void {
    switch (event.type) {
      case 'birdLaunched':
        this.deps.audio.play('sling_release', { intensity: event.power, pan: this.pan(event.x) });
        this.deps.audio.play('bird_launch', { bird: event.bird, pan: this.pan(event.x) });
        this.puffs(event.x, event.y, 2, '#ffffff', 0.6);
        break;
      case 'birdImpact':
        this.onBirdImpact(event);
        break;
      case 'impact':
        this.onImpact(event);
        break;
      case 'blockDamaged':
        if (event.stageChanged) this.chips(event.material, event.x, event.y, 3, 0, 0, 0.7);
        break;
      case 'blockDestroyed':
        this.onBlockDestroyed(event);
        break;
      case 'pigDamaged':
        this.deps.actors.hit(event.id, this.deps.now());
        this.stars(event.x, event.y, 2, 3.5);
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

  private onBirdImpact(event: SimEventOf<'birdImpact'>): void {
    const strength = clamp01(event.speed / 22);
    this.deps.actors.hit(event.id, this.deps.now(), 0.6 + strength);
    this.feathers(event.x, event.y, Math.round(3 + strength * 5), this.featherColor(event.bird));
    this.stars(event.x, event.y, 3);
    if (event.bird !== 'egg') this.deps.audio.play('bird_impact', { bird: event.bird, intensity: 0.4 + strength * 0.6, pan: this.pan(event.x) });
    if (event.bird === 'bomb') this.sound('bomb_fuse', event.x, 0.8);
    this.deps.camera.shake(0.08 + strength * 0.14);
  }

  private onImpact(event: SimEventOf<'impact'>): void {
    const strength = clamp01(event.energy / 70);
    const material = this.materialOf(event.a) ?? this.materialOf(event.b);
    if (material) this.sound(`${material === 'tnt' ? 'wood' : material}_hit` as SfxName, event.x, 0.25 + strength * 0.75);
    if (event.a === 'ground' || event.b === 'ground') {
      if (!material) this.sound('ground_hit', event.x, 0.2 + strength * 0.8);
      if (event.speed > 2.5 && event.y < 0.6) {
        this.puffs(event.x, Math.max(0.05, event.y), Math.round(1 + strength * 4), DUST_COLORS[this.deps.theme], 0.7 + strength * 0.6);
      }
    }
    if (event.energy > 120) this.deps.camera.shake(clamp01(event.energy / 900) * 0.4);
  }

  private materialOf(surface: SurfaceKind): BlockMaterial | null {
    return surface === 'wood' || surface === 'glass' || surface === 'stone' || surface === 'tnt' ? surface : null;
  }

  /** Material-specific debris flying off a block. */
  private chips(material: BlockMaterial, x: number, y: number, count: number, vx: number, vy: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(1.2, 5);
      const px = x + rnd(-spread, spread);
      const py = Math.max(0.1, y + rnd(-spread, spread));
      const base = { vx: vx * 0.45 + Math.cos(angle) * speed, vy: vy * 0.45 + Math.sin(angle) * speed + 1.8, bounce: 0.32, spin: 11 };
      if (material === 'glass') {
        this.emit('shard', px, py, { ...base, size: rnd(0.16, 0.42), life: rnd(0.8, 1.4) });
      } else if (material === 'stone') {
        this.emit('rock', px, py, { ...base, size: rnd(0.16, 0.44), life: rnd(1, 1.7), bounce: 0.22 });
      } else if (Math.random() < 0.6) {
        this.emit('splinter', px, py, { ...base, size: rnd(0.3, 0.62), life: rnd(0.9, 1.5), color: material === 'tnt' ? MATERIAL_COLORS.tnt.base : undefined });
      } else {
        this.emit('woodchip', px, py, { ...base, size: rnd(0.14, 0.3), life: rnd(0.9, 1.6), color: material === 'tnt' ? MATERIAL_COLORS.tnt.dark : undefined });
      }
    }
  }

  private onBlockDestroyed(event: SimEventOf<'blockDestroyed'>): void {
    const area = event.shape === 'circle' ? Math.PI * (event.w / 2) ** 2 : event.w * event.h * (event.shape === 'rect' ? 1 : 0.5);
    const count = clamp(Math.round(5 + area * 7), 5, 15);
    const spread = Math.min(1, Math.max(event.w, event.h) / 2) * 0.8;
    this.chips(event.material, event.x, event.y, count, event.vx, event.vy, spread);
    const size = clamp(Math.sqrt(area), 0.5, 1.6);
    if (event.material === 'glass') {
      for (let i = 0; i < 4; i++) {
        this.emit('spark', event.x + rnd(-spread, spread), event.y + rnd(-spread, spread), { size: rnd(0.25, 0.5), sizeEnd: 0, life: rnd(0.2, 0.4), gravity: 0, additive: true, spin: 2 });
      }
    } else {
      this.puffs(event.x, event.y, event.material === 'stone' ? 4 : 2, MATERIAL_COLORS[event.material].light, size);
    }
    if (event.material !== 'tnt') this.sound(`${event.material}_break` as SfxName, event.x, 0.45 + size * 0.35);
    this.deps.camera.shake(0.05 + size * 0.07);

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
    this.stars(event.x, event.y + radius * 0.6, 5);
    this.sound('armor_break', event.x, 0.9);
    this.deps.camera.shake(0.15);
  }

  private onPigDefeated(event: SimEventOf<'pigDefeated'>): void {
    const radius = PIGS[event.variant].radius;
    this.deps.actors.popPig(event, radius, 0);
    this.puffs(event.x, event.y, 6, '#eaffd0', radius * 1.8);
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
    }
    this.sound('pig_defeat', event.x, 0.6 + radius * 0.4);
    this.deps.camera.shake(0.18 + radius * 0.12);
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
        const speed = Math.hypot(event.vx, event.vy) || 1;
        for (let i = 0; i < 8; i++) {
          this.emit('spark', x, y, {
            vx: (-event.vx / speed) * rnd(3, 9) + rnd(-2, 2),
            vy: (-event.vy / speed) * rnd(3, 9) + rnd(-2, 2),
            size: rnd(0.3, 0.55),
            sizeEnd: 0,
            life: rnd(0.25, 0.45),
            gravity: 0,
            additive: true,
          });
        }
        this.sound('ability_boost', x, 1);
        break;
      }
      case 'split':
        particles.ring(x, y, 0.15, 1.3, 0.28, '#d6f1ff', 0.18);
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
    // Fireball flash.
    for (let i = 0; i < 3; i++) {
      this.emit('fire', x + rnd(-0.3, 0.3), y + rnd(-0.3, 0.3), {
        size: radius * 0.45,
        sizeEnd: radius * rnd(1.2, 1.7),
        life: rnd(0.22, 0.34),
        gravity: 0,
        additive: true,
        alpha: 0.95,
        spin: 1,
        fadeFrom: 0.15,
      });
    }
    // Shock waves.
    particles.ring(x, y, radius * 0.1, radius * 0.95, 0.36, '#ffffff', 0.4);
    particles.ring(x, y, radius * 0.05, radius * 0.65, 0.5, '#ffd27a', 0.28);
    // Rising smoke.
    for (let i = 0; i < Math.round(9 * scale); i++) {
      const angle = rnd(0, Math.PI * 2);
      const size = rnd(0.8, 1.3) * scale;
      this.emit('smoke', x + Math.cos(angle) * rnd(0, 0.8), y + Math.sin(angle) * rnd(0, 0.8), {
        vx: Math.cos(angle) * rnd(0.8, 2.8),
        vy: Math.sin(angle) * rnd(0.5, 2) + rnd(1, 2.4),
        size,
        sizeEnd: size * 2.3,
        life: rnd(0.9, 1.6),
        gravity: -0.08,
        drag: 1.7,
        alpha: 0.7,
        spin: 1.2,
        fadeFrom: 0.25,
      });
    }
    // Sparks and embers.
    for (let i = 0; i < Math.round(16 * scale); i++) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(6, 15) * scale;
      this.emit(i % 3 === 0 ? 'fire' : 'spark', x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 2,
        size: rnd(0.25, 0.5),
        sizeEnd: 0.04,
        life: rnd(0.35, 0.75),
        gravity: 0.7,
        drag: 1.2,
        additive: true,
      });
    }
    if (y < radius) this.puffs(x, 0.1, 5, DUST_COLORS[this.deps.theme], 1.3);
    this.sound('explosion', x, scale);
    this.deps.camera.shake(0.55 * scale + 0.25);
    this.deps.camera.kick(rnd(-1.2, 1.2), 2.2 * scale);
    if (event.source === 'bomb') this.deps.slowMotion(0.3);
  }

  /** Speed streaks behind a boosting Chuck; call once per frame while it applies. */
  boostTrail(x: number, y: number, vx: number, vy: number): void {
    this.emit('spark', x + rnd(-0.15, 0.15), y + rnd(-0.15, 0.15), {
      vx: -vx * 0.08,
      vy: -vy * 0.08,
      size: rnd(0.3, 0.5),
      sizeEnd: 0,
      life: 0.22,
      gravity: 0,
      additive: true,
      spin: 0,
    });
    this.emit('dust', x, y, { vx: -vx * 0.05, vy: -vy * 0.05, size: 0.5, sizeEnd: 0.15, life: 0.3, gravity: 0, alpha: 0.35, color: BIRD_COLORS.chuck.light, spin: 0.5 });
  }

  /** Smoke and sparks from a lit fuse. */
  fuseSmoke(x: number, y: number): void {
    this.emit('smoke', x, y, { vx: rnd(-0.4, 0.4), vy: rnd(0.8, 1.6), size: 0.25, sizeEnd: 0.6, life: 0.5, gravity: -0.05, drag: 1, alpha: 0.5, spin: 1 });
    if (Math.random() < 0.5) this.emit('spark', x, y, { vx: rnd(-2, 2), vy: rnd(1, 3), size: 0.22, sizeEnd: 0, life: 0.2, gravity: 0.4, additive: true });
  }

  /** "+10,000" over an unused bird during the victory tally. */
  bonus(points: number, x: number, y: number): void {
    this.deps.texts.spawn(`+${points.toLocaleString('en-US')}`, x, y, SCORE_COLORS.bird, 32, 1.4, 1.6);
    this.stars(x, y, 5, 4);
    this.sound('score_bonus', x, 0.9);
  }
}
