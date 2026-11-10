/**
 * WorldRenderer: draws level content (environment, terrain, blocks, characters, slingshot) for a
 * camera. It is shared by gameplay, the title backdrop and the level editor, so all of them look
 * identical. Procedural artwork is cached as sprites; characters are painted live because their
 * faces animate.
 */
import { RENDER } from '../core/config';
import { DEG } from '../core/math';
import type { BirdType, BlockMaterial, BlockShape, DecorDef, PigVariant, TerrainDef, ThemeId } from '../core/types';
import type { ProjectileType } from '../sim/entities';
import { paintBird, paintEgg } from './art/birds';
import { paintBlock } from './art/blocks';
import { DECOR, paintDecor, paintDecorGlow, paintForeground, paintGround, paintSky, paintTerrain } from './art/environment';
import { paintPig, paintPigAccessory } from './art/pigs';
import { paintParticle, paintSlingshotBack, paintSlingshotFront } from './art/props';
import {
  ART_UNITS_PER_METER,
  CHARACTER_EXTENT,
  CHARACTER_RADIUS,
  PARTICLE_HALF,
  PARTICLE_VARIANTS,
  type BirdPose,
  type DamageStage,
  type EnvView,
  type ParticleKind,
  type PigAccessory,
  type PigPose,
  type TerrainSpec,
} from './art/types';
import type { Camera } from './Camera';
import { SpriteCache, type Sprite } from './SpriteCache';

/** Sprite resolution in pixels per design unit. */
const SPRITE_SCALE = RENDER.spritePxPerMeter / ART_UNITS_PER_METER;
/** Outlines may spill a few units over the nominal shape. */
const SPILL = 4;
/** Terrain artwork (grass blades, snow lumps) may rise this far above its collision shape. */
const TERRAIN_SPILL = 16;
/** Number of look variations kept per block type. */
const SEED_VARIANTS = 4;
const SLING_BOUNDS = { left: -90, top: -345, width: 180, height: 365 };
const PARTICLE_SCALE = 1.5;

export interface BlockLook {
  shape: BlockShape;
  material: BlockMaterial;
  w: number;
  h: number;
  flip: boolean;
  seed: number;
}

export class WorldRenderer {
  readonly sprites = new SpriteCache();
  private ctx!: CanvasRenderingContext2D;
  private cam!: Camera;
  private dpr = 1;
  private readonly env: EnvView = { width: 1, height: 1, camX: 0, camY: 0, zoom: 30, time: 0, groundY: 0, worldWidth: 44 };
  /** Accessibility: freezes wind sway and ambient particles in the environment. */
  reducedMotion = false;

  /**
   * Call first every frame. `envSeed` varies the backdrop composition per level (defaults to a
   * hash of the level width).
   */
  begin(ctx: CanvasRenderingContext2D, camera: Camera, dpr: number, time: number, worldWidth: number, envSeed?: number): void {
    this.ctx = ctx;
    this.cam = camera;
    this.dpr = dpr;
    const env = this.env;
    env.width = camera.viewW;
    env.height = camera.viewH;
    env.camX = camera.renderX;
    env.camY = camera.renderY;
    env.zoom = camera.zoom;
    env.time = time;
    env.groundY = camera.groundY;
    env.worldWidth = worldWidth;
    env.reducedMotion = this.reducedMotion;
    env.seed = envSeed;
    this.screenSpace();
  }

  end(): void {
    this.screenSpace();
    this.sprites.endFrame();
  }

  /** Resets the transform to CSS-pixel screen space. */
  screenSpace(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ environment

  /** Sky, clouds and parallax scenery (the backdrop is cached; nearer layers are flat vector fills). */
  drawSky(theme: ThemeId): void {
    this.screenSpace();
    paintSky(this.ctx, theme, this.env);
    this.screenSpace();
  }

  drawGround(theme: ThemeId): void {
    this.screenSpace();
    paintGround(this.ctx, theme, this.env);
  }

  drawForeground(theme: ThemeId): void {
    this.screenSpace();
    paintForeground(this.ctx, theme, this.env);
  }

  drawTerrain(theme: ThemeId, piece: TerrainDef, index: number): void {
    let spec: TerrainSpec;
    let cx = 0;
    let cy = 0;
    if (piece.shape === 'poly' && piece.points && piece.points.length >= 3) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [x, y] of piece.points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      cx = (minX + maxX) / 2;
      cy = (minY + maxY) / 2;
      spec = {
        shape: 'poly',
        w: (maxX - minX) * ART_UNITS_PER_METER,
        h: (maxY - minY) * ART_UNITS_PER_METER,
        points: piece.points.map(([x, y]) => [(x - cx) * ART_UNITS_PER_METER, -(y - cy) * ART_UNITS_PER_METER] as [number, number]),
      };
    } else {
      spec = { shape: 'rect', w: (piece.w ?? 1) * ART_UNITS_PER_METER, h: (piece.h ?? 1) * ART_UNITS_PER_METER };
    }
    const key = `terrain|${theme}|${index}|${spec.w.toFixed(0)}|${spec.h.toFixed(0)}|${piece.shape}|${piece.points?.length ?? 0}`;
    // Grass blades / snow lumps may poke a little above the collision silhouette.
    const pad = TERRAIN_SPILL;
    const sprite = this.sprites.get(key, -spec.w / 2 - pad, -spec.h / 2 - pad, spec.w + pad * 2, spec.h + pad * 2, SPRITE_SCALE, (c) =>
      paintTerrain(c, theme, spec, index + 1),
    );
    const angle = (piece.angle ?? 0) * DEG;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.blit(sprite, piece.x + cx * cos - cy * sin, piece.y + cx * sin + cy * cos, angle, 1, 1);
  }

  drawDecor(decor: DecorDef, index: number): void {
    const info = DECOR[decor.kind];
    if (!info) return;
    const scale = decor.scale ?? 1;
    const y = decor.y ?? 0;
    if (!this.cam.sees(decor.x, y + (info.h * scale) / 2, (Math.max(info.w, info.h) * scale) / 2 + 0.5)) return;
    const w = info.w * ART_UNITS_PER_METER;
    const h = info.h * ART_UNITS_PER_METER;
    const seed = index % SEED_VARIANTS;
    const sprite = this.sprites.get(`decor|${decor.kind}|${seed}`, -w / 2 - SPILL, -h - SPILL, w + SPILL * 2, h + SPILL * 2, SPRITE_SCALE, (c) =>
      paintDecor(c, decor.kind, seed + 1),
    );
    this.blit(sprite, decor.x, y, 0, decor.flip ? -scale : scale, scale);
    // Lights (lanterns) get a separately cached, gently flickering additive glow.
    if (info.glow) {
      const r = info.glow.r * ART_UNITS_PER_METER;
      const glow = this.sprites.get(`decorglow|${decor.kind}`, -r, -r, r * 2, r * 2, SPRITE_SCALE * 0.5, (c) => paintDecorGlow(c, decor.kind));
      const t = this.env.time;
      const flicker = this.reducedMotion ? 0.85 : 0.8 + 0.12 * Math.sin(t * 7.3 + index) + 0.08 * Math.sin(t * 13.1 + index * 2);
      const ctx = this.ctx;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flicker;
      this.blit(glow, decor.x + info.glow.x * scale, y + info.glow.y * scale, 0, scale, scale);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ blocks

  blockSprite(look: BlockLook, stage: DamageStage): Sprite {
    const w = look.w * ART_UNITS_PER_METER;
    const h = look.h * ART_UNITS_PER_METER;
    const variant = look.seed % SEED_VARIANTS;
    const key = `block|${look.shape}|${look.material}|${w.toFixed(0)}|${h.toFixed(0)}|${look.flip ? 1 : 0}|${stage}|${variant}`;
    return this.sprites.get(key, -w / 2 - SPILL, -h / 2 - SPILL, w + SPILL * 2, h + SPILL * 2, SPRITE_SCALE, (c) =>
      paintBlock(c, { shape: look.shape, material: look.material, w, h, flip: look.flip }, stage, variant + 1),
    );
  }

  /** `flash` 0..1 brightens the piece (hit flash); `alpha` fades it. */
  drawBlock(look: BlockLook, stage: DamageStage, x: number, y: number, angle: number, flash = 0, alpha = 1): void {
    if (!this.cam.sees(x, y, Math.hypot(look.w, look.h) / 2 + 0.1)) return;
    const sprite = this.blockSprite(look, stage);
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    this.blit(sprite, x, y, angle, 1, 1);
    if (flash > 0.02) {
      // Drawing the sprite additively over itself brightens exactly its own pixels.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, flash) * 0.75 * alpha;
      ctx.drawImage(sprite.canvas, -sprite.ox, -sprite.oy);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ characters

  drawBird(type: ProjectileType, x: number, y: number, angle: number, radius: number, pose: BirdPose, scaleX = 1, scaleY = 1, alpha = 1): void {
    if (!this.cam.sees(x, y, radius * 2)) return;
    this.characterSpace(x, y, angle, radius, scaleX, scaleY);
    this.ctx.globalAlpha = alpha;
    if (type === 'egg') paintEgg(this.ctx, pose.time);
    else paintBird(this.ctx, type as BirdType, pose);
    this.ctx.globalAlpha = 1;
  }

  drawPig(variant: PigVariant, x: number, y: number, angle: number, radius: number, pose: PigPose, scaleX = 1, scaleY = 1, alpha = 1): void {
    if (!this.cam.sees(x, y, radius * 2)) return;
    this.characterSpace(x, y, angle, radius, scaleX, scaleY);
    this.ctx.globalAlpha = alpha;
    paintPig(this.ctx, variant, pose);
    this.ctx.globalAlpha = 1;
  }

  /** Detached helmet / armour / crown as a sprite (it tumbles away as debris). */
  accessorySprite(kind: PigAccessory): Sprite {
    const extent = CHARACTER_EXTENT + 10;
    return this.sprites.get(`accessory|${kind}`, -extent, -extent, extent * 2, extent * 2, 0.6, (c) => paintPigAccessory(c, kind));
  }

  /** Sets the transform so that painting happens in the 100-unit character space. */
  private characterSpace(x: number, y: number, angle: number, radius: number, scaleX: number, scaleY: number): void {
    const cam = this.cam;
    const k = (radius * cam.zoom * this.dpr) / CHARACTER_RADIUS;
    const cos = Math.cos(angle);
    const sin = -Math.sin(angle);
    this.ctx.setTransform(cos * k * scaleX, sin * k * scaleX, -sin * k * scaleY, cos * k * scaleY, cam.toScreenX(x) * this.dpr, cam.toScreenY(y) * this.dpr);
  }

  // ------------------------------------------------------------------ slingshot + particles

  drawSlingshotBack(x: number, y: number): void {
    const b = SLING_BOUNDS;
    this.blit(this.sprites.get('sling|back', b.left, b.top, b.width, b.height, SPRITE_SCALE, paintSlingshotBack), x, y, 0, 1, 1);
  }

  drawSlingshotFront(x: number, y: number): void {
    const b = SLING_BOUNDS;
    this.blit(this.sprites.get('sling|front', b.left, b.top, b.width, b.height, SPRITE_SCALE, paintSlingshotFront), x, y, 0, 1, 1);
  }

  particleSprite(kind: ParticleKind, variant: number, color?: string): Sprite {
    const v = ((variant % PARTICLE_VARIANTS) + PARTICLE_VARIANTS) % PARTICLE_VARIANTS;
    const size = PARTICLE_HALF * 2;
    return this.sprites.get(`particle|${kind}|${v}|${color ?? ''}`, -PARTICLE_HALF, -PARTICLE_HALF, size, size, PARTICLE_SCALE, (c) =>
      paintParticle(c, kind, v, color),
    );
  }

  /**
   * Draws a sprite so that its design-space box of `designSize` units spans `worldSize` metres,
   * centred on a world position. Used for particles and other effect sprites.
   */
  drawSpriteSized(sprite: Sprite, x: number, y: number, angle: number, worldSize: number, designSize: number, alpha: number): void {
    const cam = this.cam;
    const k = (worldSize * cam.zoom * this.dpr) / (designSize * sprite.scale);
    const cos = Math.cos(angle) * k;
    const sin = -Math.sin(angle) * k;
    const ctx = this.ctx;
    ctx.setTransform(cos, sin, -sin, cos, cam.toScreenX(x) * this.dpr, cam.toScreenY(y) * this.dpr);
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite.canvas, -sprite.ox, -sprite.oy);
  }

  /** Draws a sprite painted at 100 units per metre at a world position (y up, counter-clockwise angle). */
  private blit(sprite: Sprite, x: number, y: number, angle: number, scaleX: number, scaleY: number): void {
    const cam = this.cam;
    const k = (cam.zoom * this.dpr) / (sprite.scale * ART_UNITS_PER_METER);
    const cos = Math.cos(angle) * k;
    const sin = -Math.sin(angle) * k;
    this.ctx.setTransform(cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, cam.toScreenX(x) * this.dpr, cam.toScreenY(y) * this.dpr);
    this.ctx.drawImage(sprite.canvas, -sprite.ox, -sprite.oy);
  }

  /** Paints the sprites every level needs up front so the first shot does not stutter. */
  warmUp(kinds: readonly ParticleKind[]): void {
    for (const kind of kinds) {
      for (let v = 0; v < PARTICLE_VARIANTS; v++) this.particleSprite(kind, v);
    }
    const b = SLING_BOUNDS;
    this.sprites.get('sling|back', b.left, b.top, b.width, b.height, SPRITE_SCALE, paintSlingshotBack);
    this.sprites.get('sling|front', b.left, b.top, b.width, b.height, SPRITE_SCALE, paintSlingshotFront);
  }
}
