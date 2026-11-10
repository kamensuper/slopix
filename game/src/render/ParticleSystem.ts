/**
 * Pooled particle system. Particles are purely cosmetic: they never touch the rigid-body world,
 * they only fall, drag, spin, optionally bounce on the ground plane and fade out.
 */
import { PHYSICS, RENDER } from '../core/config';
import type { Camera } from './Camera';
import type { Sprite } from './SpriteCache';
import type { WorldRenderer } from './WorldRenderer';

export interface ParticleOptions {
  sprite: Sprite;
  /** Size of the sprite's design-space box in units (particles: 64). */
  designSize: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  /** Diameter in metres at birth ... */
  size: number;
  /** ... and at death (defaults to `size`). */
  sizeEnd?: number;
  /** Lifetime in seconds. */
  life: number;
  rot?: number;
  vrot?: number;
  /** Multiplier of world gravity (0 = floats, negative = rises). */
  gravity?: number;
  /** Velocity damping per second. */
  drag?: number;
  alpha?: number;
  /** Fraction of the lifetime after which the particle starts fading out (default 0.55). */
  fadeFrom?: number;
  /** Restitution against the ground plane y = 0; 0 lets the particle fall through and vanish. */
  bounce?: number;
  /** Additive blending for glows and fire. */
  additive?: boolean;
}

interface Particle {
  active: boolean;
  sprite: Sprite | null;
  designSize: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  sizeEnd: number;
  age: number;
  life: number;
  rot: number;
  vrot: number;
  gravity: number;
  drag: number;
  alpha: number;
  fadeFrom: number;
  bounce: number;
  additive: boolean;
}

interface Ring {
  active: boolean;
  x: number;
  y: number;
  r0: number;
  r1: number;
  age: number;
  life: number;
  color: string;
  width: number;
}

const RING_POOL = 16;

function blankParticle(): Particle {
  return {
    active: false,
    sprite: null,
    designSize: 64,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 0.2,
    sizeEnd: 0.2,
    age: 0,
    life: 1,
    rot: 0,
    vrot: 0,
    gravity: 1,
    drag: 0,
    alpha: 1,
    fadeFrom: 0.55,
    bounce: 0,
    additive: false,
  };
}

export class ParticleSystem {
  private readonly pool: Particle[] = [];
  private readonly rings: Ring[] = [];
  private cursor = 0;
  private ringCursor = 0;
  /** Number of live particles after the last update (for the performance overlay). */
  alive = 0;

  constructor(capacity: number = RENDER.maxParticles) {
    for (let i = 0; i < capacity; i++) this.pool.push(blankParticle());
    for (let i = 0; i < RING_POOL; i++) this.rings.push({ active: false, x: 0, y: 0, r0: 0, r1: 1, age: 0, life: 1, color: '#fff', width: 0.2 });
  }

  /** Takes a slot from the pool; when everything is in use the oldest slot is recycled. */
  spawn(o: ParticleOptions): void {
    const pool = this.pool;
    let p = pool[this.cursor] as Particle;
    for (let i = 0; i < 8 && p.active; i++) {
      this.cursor = (this.cursor + 1) % pool.length;
      p = pool[this.cursor] as Particle;
    }
    this.cursor = (this.cursor + 1) % pool.length;
    p.active = true;
    p.sprite = o.sprite;
    p.designSize = o.designSize;
    p.x = o.x;
    p.y = o.y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.size = o.size;
    p.sizeEnd = o.sizeEnd ?? o.size;
    p.age = 0;
    p.life = Math.max(0.01, o.life);
    p.rot = o.rot ?? 0;
    p.vrot = o.vrot ?? 0;
    p.gravity = o.gravity ?? 1;
    p.drag = o.drag ?? 0;
    p.alpha = o.alpha ?? 1;
    p.fadeFrom = o.fadeFrom ?? 0.55;
    p.bounce = o.bounce ?? 0;
    p.additive = o.additive === true;
  }

  /** Expanding shock-wave ring (radii in metres). */
  ring(x: number, y: number, r0: number, r1: number, life: number, color: string, width = 0.25): void {
    const ring = this.rings[this.ringCursor] as Ring;
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    ring.active = true;
    ring.x = x;
    ring.y = y;
    ring.r0 = r0;
    ring.r1 = r1;
    ring.age = 0;
    ring.life = life;
    ring.color = color;
    ring.width = width;
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
    for (const r of this.rings) r.active = false;
    this.alive = 0;
  }

  update(dt: number): void {
    const g = PHYSICS.gravity;
    let alive = 0;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life || p.y < -2) {
        p.active = false;
        p.sprite = null;
        continue;
      }
      alive++;
      p.vy -= g * p.gravity * dt;
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.bounce > 0 && p.vy < 0 && p.y < p.size * 0.3) {
        p.y = p.size * 0.3;
        p.vy = -p.vy * p.bounce;
        p.vx *= 0.65;
        p.vrot *= 0.5;
        if (p.vy < 0.6) {
          p.vy = 0;
          p.bounce = 0;
          p.gravity = 0;
          p.vx = 0;
          p.vrot = 0;
        }
      }
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      if (r.age >= r.life) r.active = false;
    }
    this.alive = alive;
  }

  draw(renderer: WorldRenderer, ctx: CanvasRenderingContext2D, camera: Camera, dpr: number): void {
    let additive = false;
    for (const p of this.pool) {
      if (!p.active || !p.sprite) continue;
      const t = p.age / p.life;
      const size = p.size + (p.sizeEnd - p.size) * t;
      // Off-screen particles are simulated but not drawn.
      if (!camera.sees(p.x, p.y, size)) continue;
      const fade = t <= p.fadeFrom ? 1 : 1 - (t - p.fadeFrom) / (1 - p.fadeFrom);
      const alpha = p.alpha * fade;
      if (alpha <= 0.01) continue;
      if (p.additive !== additive) {
        additive = p.additive;
        ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      }
      renderer.drawSpriteSized(p.sprite, p.x, p.y, p.rot, size, p.designSize, alpha);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const r of this.rings) {
      if (!r.active) continue;
      const t = r.age / r.life;
      const eased = 1 - (1 - t) * (1 - t);
      const radius = (r.r0 + (r.r1 - r.r0) * eased) * camera.zoom;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, r.width * camera.zoom * (1 - t * 0.7));
      ctx.beginPath();
      ctx.arc(camera.toScreenX(r.x), camera.toScreenY(r.y), radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
