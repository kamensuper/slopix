/** Runtime entities of the simulation: plain data records attached to physics bodies. */
import type { Body, Joint } from 'planck';
import type { BirdType, BlockMaterial, BlockShape, PigVariant } from '../core/types';
import type { Point } from './geometry';

/** Everything that flies: the five birds plus Matilda's egg. */
export type ProjectileType = BirdType | 'egg';

interface BodyEntity {
  readonly id: number;
  body: Body;
  /** False once destroyed; the body is removed from the world right after the current physics step. */
  alive: boolean;
  /** Transform after the latest tick ... */
  x: number;
  y: number;
  angle: number;
  /** ... and after the tick before it, for render interpolation. */
  px: number;
  py: number;
  pangle: number;
  vx: number;
  vy: number;
  /** Inverse mass and inverse rotational inertia about the centre of mass (0 = immovable). */
  invMass: number;
  invInertia: number;
  /** Radius of a circle around the centre of mass that contains the whole shape. */
  boundRadius: number;
  /** Tick of the most recent damaging hit (drives hit flashes); -1 if never hit. */
  hitTick: number;
}

export interface BlockEntity extends BodyEntity {
  readonly kind: 'block';
  shape: BlockShape;
  material: BlockMaterial;
  w: number;
  h: number;
  flip: boolean;
  /** Local-space outline, null for circles. */
  outline: Point[] | null;
  hp: number;
  maxHp: number;
  /** Visible damage stage 0..3. */
  stage: 0 | 1 | 2 | 3;
  /** Varies the look of otherwise identical pieces. */
  seed: number;
  /** Fractional score not yet paid out for damage. */
  scoreBank: number;
}

export interface PigEntity extends BodyEntity {
  readonly kind: 'pig';
  variant: PigVariant;
  radius: number;
  hp: number;
  maxHp: number;
  /** Remaining helmet / armour hit points (0 once broken or for unarmoured pigs). */
  armor: number;
  maxArmor: number;
  scoreBank: number;
}

export interface BirdEntity extends BodyEntity {
  readonly kind: 'bird';
  type: ProjectileType;
  radius: number;
  launchTick: number;
  /** Has touched something solid since launch. */
  impacted: boolean;
  impactTick: number;
  abilityUsed: boolean;
  abilityTick: number;
  /** Consecutive ticks spent (almost) motionless after the first impact. */
  restTicks: number;
  /** Bomb: tick at which the lit fuse runs out, -1 while unlit. */
  fuseEndTick: number;
  /** Egg: set by the contact listener, the egg explodes right after the physics step. */
  detonate: boolean;
  /** Extra projectile created by an ability (split clone, egg) rather than launched from the sling. */
  spawned: boolean;
}

export interface TerrainEntity {
  readonly id: number;
  readonly kind: 'terrain';
  body: Body;
  alive: true;
  invMass: 0;
  invInertia: 0;
  boundRadius: 0;
}

export type DynamicEntity = BlockEntity | PigEntity | BirdEntity;
export type Entity = DynamicEntity | TerrainEntity;

export interface JointEntity {
  kind: 'rope' | 'pin';
  joint: Joint;
  /** Reaction force (N) above which the joint snaps; Infinity = unbreakable. */
  strength: number;
  alive: boolean;
  a: BlockEntity;
  /** null = fixed to the world. */
  b: BlockEntity | null;
}
