/**
 * ART CONTRACT - shared by the renderer and every art module in this folder.
 *
 * All artwork in this game is drawn procedurally with the Canvas 2D API (no image files).
 * Art modules export pure "paint" functions; the renderer decides where, how big and how
 * often they are drawn (many of them are cached into sprites).
 *
 * Canvas conventions for every paint function:
 *   - x to the right, y DOWN (normal canvas space),
 *   - the caller has already translated / rotated / scaled the context,
 *   - the function must leave the context state as it found it (wrap work in save()/restore()),
 *   - no allocations of canvases per call unless cached inside the module.
 */
import type { BirdType, BlockMaterial, BlockShape, PigVariant, ThemeId } from '../../core/types';

/** Blocks, terrain, props and decor are painted in a design space of 100 units per metre. */
export const ART_UNITS_PER_METER = 100;
/** Characters are painted so that their collision circle has this radius, centred on the origin. */
export const CHARACTER_RADIUS = 100;
/** Character artwork (crests, tails, crowns ...) must stay within this distance of the origin. */
export const CHARACTER_EXTENT = 170;

// ---------------------------------------------------------------- characters

export type BirdState =
  /** Waiting in the queue or sitting in the pouch. */
  | 'idle'
  /** Being pulled back: bracing, focused on the target. */
  | 'aiming'
  /** In the air before the first impact: determined, beak open. */
  | 'flying'
  /** Special ability active (boosting, about to explode ...). */
  | 'ability'
  /** The moment of impact: eyes squeezed shut. */
  | 'hit'
  /** After the impact, rolling around: dizzy. */
  | 'dazed';

export interface BirdPose {
  /** Seconds, monotonically increasing. Drive continuous secondary motion with it (feather sway, fuse sparks). */
  time: number;
  state: BirdState;
  /** Eyelid closure, 0 = open .. 1 = closed. The caller drives blinking. */
  blink: number;
  /** While `aiming`: how far the sling is pulled, 0..1. */
  pull?: number;
  /** Pupil direction in the bird's local space (x = forward / right, y = down), each in -1..1. */
  lookX?: number;
  lookY?: number;
  /** The special ability has been used (Matilda: deflated after laying her egg; Chuck: wind-swept). */
  abilityUsed?: boolean;
  /** Bomb only: fuse progress, 0 = cold .. 1 = about to blow (the body heats up and pulses). */
  fuse?: number;
  /** White hit-flash overlay strength 0..1, drawn over the whole silhouette. */
  flash?: number;
}

export type PigExpression =
  /** Calm, slightly smug. */
  | 'idle'
  /** Sees a bird coming: wide eyes. */
  | 'worried'
  /** A bird is about to hit / something right next to it broke: eyes popping, mouth agape. */
  | 'surprised'
  /** Just got hit: wincing. */
  | 'hurt'
  /** Shortly after a hit: spiral eyes, stars circling the head. */
  | 'stunned'
  /** A shot missed / the player lost: laughing, eyes closed. */
  | 'laugh'
  /** Defeat pose used for the short pop animation: dizzy, tongue out. */
  | 'defeated';

export interface PigPose {
  time: number;
  expression: PigExpression;
  /** Eyelid closure, 0 = open .. 1 = closed. */
  blink: number;
  /** Accumulated damage: 0 pristine, 1 bruised (black eye, scuffs), 2 badly beaten (bandage, swollen eye). */
  damage: 0 | 1 | 2;
  /** Helmet / armour is still attached (ignored by variants that have none). */
  armorOn: boolean;
  /** Armour condition: 0 pristine .. 2 heavily dented and cracked. */
  armorDamage?: 0 | 1 | 2;
  /** Pupil direction, each in -1..1 (x right, y down). */
  lookX?: number;
  lookY?: number;
  /** White hit-flash overlay strength 0..1. */
  flash?: number;
  /** Strength of the current expression 0..1 (default 1): lets worry build up gradually. */
  intensity?: number;
}

/** Pieces that fly off a pig; painted centred on the origin at the same scale as the pig that wore them. */
export type PigAccessory = 'helmet' | 'armor' | 'crown';

// ---------------------------------------------------------------- blocks, props, particles

export interface BlockSpec {
  shape: BlockShape;
  material: BlockMaterial;
  /** Bounding box in design units (100 per metre). For circles w = h = diameter. */
  w: number;
  h: number;
  /** Wedge only: mirrored horizontally. */
  flip?: boolean;
}

/** 0 = pristine, 1 = first cracks, 2 = heavily cracked, 3 = about to fall apart. */
export type DamageStage = 0 | 1 | 2 | 3;

export type ParticleKind =
  /** Long thin wooden splinter. */
  | 'splinter'
  /** Chunky wood chip. */
  | 'woodchip'
  /** Translucent glass shard with a bright edge. */
  | 'shard'
  /** Angular stone chunk. */
  | 'rock'
  /** Soft round puff; tinted with `color` (ground dust, snow, sand). */
  | 'dust'
  /** Dark billowing smoke puff. */
  | 'smoke'
  /** Bright hot spark / streak. */
  | 'spark'
  /** Cartoon impact star. */
  | 'star'
  /** Feather; tinted with `color`. */
  | 'feather'
  /** Glowing ember / fire blob for explosions. */
  | 'fire'
  /** Bent steel fragment, bolt or nut. */
  | 'metal'
  /** Four-point sparkle (glass and metal glints); meant for additive blending. */
  | 'glint'
  /** Soft radial impact flash with faint rays; meant for additive blending. */
  | 'flash';

/** Every particle kind offers this many visual variants (0 .. PARTICLE_VARIANTS - 1). */
export const PARTICLE_VARIANTS = 4;
/** Particle sprites are painted inside a box of +-PARTICLE_HALF design units around the origin. */
export const PARTICLE_HALF = 32;

// ---------------------------------------------------------------- environment

/** Camera description handed to the screen-space environment painters. */
export interface EnvView {
  /** Canvas size in CSS pixels (the context is already scaled for the device pixel ratio). */
  width: number;
  height: number;
  /** Camera centre in world metres. */
  camX: number;
  camY: number;
  /** CSS pixels per world metre. */
  zoom: number;
  /** Seconds, monotonically increasing (cloud drift, weather, sway). */
  time: number;
  /** Screen y (CSS px) of the ground surface (world y = 0) for this camera. */
  groundY: number;
  /** Level width in metres; the playfield spans world x in [0, worldWidth]. */
  worldWidth: number;
  /** Accessibility: no wind sway or ambient particles (cloud drift stays). */
  reducedMotion?: boolean;
  /** Varies the backdrop composition per level (sun / waterfall placement, layer phase). Defaults to a hash of worldWidth. */
  seed?: number;
}
/*
 * World -> screen for an EnvView:
 *   screenX = (worldX - camX) * zoom + width / 2
 *   screenY = groundY - worldY * zoom
 */

export interface TerrainSpec {
  shape: 'rect' | 'poly';
  /** Bounding box in design units (100 per metre), centred on the origin. */
  w: number;
  h: number;
  /** poly only: convex outline in design units relative to the bounding-box centre, y DOWN. */
  points?: [number, number][];
}

export interface DecorInfo {
  theme: ThemeId;
  /** Bounding box in metres. The painter draws inside x in [-w/2, w/2], y in [-h, 0] (origin = bottom centre), 100 units per metre. */
  w: number;
  h: number;
  /** Light sources: an additive glow of radius r (metres) centred at (x, y) metres from the base (y up), painted by paintDecorGlow. */
  glow?: { x: number; y: number; r: number };
}

// ---------------------------------------------------------------- module signatures (for reference)

export interface CharacterArt {
  /** Bird facing right, collision circle of radius CHARACTER_RADIUS centred on the origin. */
  paintBird(ctx: CanvasRenderingContext2D, type: BirdType, pose: BirdPose): void;
  /** Matilda's egg projectile; collision circle of radius CHARACTER_RADIUS. */
  paintEgg(ctx: CanvasRenderingContext2D, time: number): void;
  paintPig(ctx: CanvasRenderingContext2D, variant: PigVariant, pose: PigPose): void;
  paintPigAccessory(ctx: CanvasRenderingContext2D, kind: PigAccessory): void;
}

export interface BlockArt {
  /** Unrotated block centred on the origin. `seed` varies grain / crack layout between pieces. */
  paintBlock(ctx: CanvasRenderingContext2D, spec: BlockSpec, stage: DamageStage, seed: number): void;
}

export interface PropArt {
  /** Far fork arm + trunk of the slingshot (drawn BEHIND the loaded bird). Origin = base centre on the ground, 100 units per metre. */
  paintSlingshotBack(ctx: CanvasRenderingContext2D): void;
  /** Near fork arm (drawn IN FRONT of the loaded bird). Same space as the back part. */
  paintSlingshotFront(ctx: CanvasRenderingContext2D): void;
  paintParticle(ctx: CanvasRenderingContext2D, kind: ParticleKind, variant: number, color?: string): void;
}

export interface EnvironmentArt {
  /** Screen space. Fills the whole canvas: sky, sun, clouds and every parallax layer behind the playfield. */
  paintSky(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView): void;
  /** Screen space. The ground from view.groundY down to the bottom of the canvas, anchored to world x. */
  paintGround(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView): void;
  /** Screen space. Foreground parallax details and ambient weather, drawn over the playfield. */
  paintForeground(ctx: CanvasRenderingContext2D, theme: ThemeId, view: EnvView): void;
  /** Design space (100 units per metre), centred on the origin. A static platform / hill piece. */
  paintTerrain(ctx: CanvasRenderingContext2D, theme: ThemeId, spec: TerrainSpec, seed: number): void;
  /** Design space, origin = bottom centre. Non-colliding scenery. */
  paintDecor(ctx: CanvasRenderingContext2D, kind: string, seed: number): void;
}
