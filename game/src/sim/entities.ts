/** Runtime entities of the simulation: plain data records attached to physics bodies. */
import type { Body, Joint } from 'planck';
import type { BirdType, BlockMaterial, BlockShape, FoeVariant } from '../core/types';
import type { Point } from './geometry';

/** Everything that flies. */
export type ProjectileType = BirdType;

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
  /** Frozen by Rime: brittle and slippery until it breaks. */
  frozen: boolean;
  /** Tick at which lightning last ran through the piece; -1 if never. */
  shockTick: number;
  /** Turned by a motorised hinge (never counts as "the world is still moving"). */
  motorized: boolean;
}

export interface FoeEntity extends BodyEntity {
  readonly kind: 'foe';
  variant: FoeVariant;
  radius: number;
  hp: number;
  maxHp: number;
  /** Remaining helmet / armour hit points (0 once broken or for unarmoured foes). */
  armor: number;
  maxArmor: number;
  scoreBank: number;
  frozen: boolean;
  shockTick: number;
  /** Balloonists: still hanging under the balloon. */
  floating: boolean;
  /** Balloonists: the post the balloon holds, and how far it drifts sideways. */
  homeX: number;
  homeY: number;
  patrol: number;
}

export interface BirdEntity extends BodyEntity {
  readonly kind: 'bird';
  type: ProjectileType;
  radius: number;
  launchTick: number;
  /** Has touched something solid since launch. */
  impacted: boolean;
  impactTick: number;
  /** Speed at the moment of the first impact. */
  impactSpeed: number;
  abilityUsed: boolean;
  abilityTick: number;
  /** Consecutive ticks spent (almost) motionless after the first impact. */
  restTicks: number;
  /** Ember: tick at which the lit fuse runs out, -1 while unlit. */
  fuseEndTick: number;
  /** Extra projectile created by an ability (split clone) rather than launched from the sling. */
  spawned: boolean;
  /** Times the bird has sprung off rubber without that counting as its impact. */
  bounces: number;
  /** Brawn: diving after the tap; the next impact shakes the ground. */
  slamming: boolean;
  /** Nova: tick at which the open gravity well closes, -1 while closed. */
  wellEndTick: number;
  /** Set by the contact listener: the ability fires right after the physics step (Rime on impact, Brawn's quake). */
  pendingAbility: boolean;
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

/** Attached to terrain fixtures that are not plain ground. */
export interface SurfaceTag {
  surface: 'ice' | 'bouncy' | 'conveyor';
  /** Belt speed in m/s (conveyors only). */
  speed: number;
}

export type DynamicEntity = BlockEntity | FoeEntity | BirdEntity;
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
  /** Driven hinge. */
  motor: boolean;
}
