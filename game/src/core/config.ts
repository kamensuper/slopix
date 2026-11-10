/**
 * Every gameplay constant lives here so the game can be tuned from a single place.
 * Units: metres, kilograms, seconds, radians (unless a name says otherwise).
 */
import type { BirdType, BlockMaterial, PigVariant } from './types';

export const GAME_TITLE = 'Flock Fury';
export const GAME_TAGLINE = 'A slingshot physics adventure';
export const GAME_VERSION = '1.0.0';

// ---------------------------------------------------------------- physics

export const PHYSICS = {
  /** Fixed simulation rate in ticks per second. Rendering interpolates between ticks. */
  hz: 60,
  /** World sub-steps per tick; 2 means the solver runs at 120 Hz, which stiffens stacks and stops debris tunnelling. */
  substeps: 2,
  velocityIterations: 8,
  positionIterations: 3,
  /** Gravitational acceleration (downwards), m/s^2. The trajectory preview uses the same value. */
  gravity: 10,
  /**
   * Box2D keeps a thin "skin" between polygons. Shrinking polygons and growing circles by these
   * amounts makes shapes that are authored exactly touching start in solver equilibrium, so
   * structures do not shift when a level loads.
   */
  polygonInset: 0.0075,
  circleOutset: 0.0025,
} as const;

/** Seconds per simulation tick. */
export const TICK = 1 / PHYSICS.hz;
/** Seconds per physics sub-step. */
export const SUBSTEP = TICK / PHYSICS.substeps;

/** Collision categories (collision filtering). */
export const CATEGORY = {
  terrain: 0x0001,
  block: 0x0002,
  pig: 0x0004,
  bird: 0x0008,
} as const;
/** Negative group: projectiles of the flock never collide with each other (split birds, egg vs. Matilda). */
export const BIRD_GROUP = -1;

export const WORLD = {
  /** Thickness of the static ground slab below y = 0. */
  groundDepth: 4,
  /** The ground extends this far beyond [0, level.world.width]. */
  groundMargin: 80,
  /** Projectiles farther than this outside the level are discarded. */
  outOfBoundsMargin: 14,
  groundFriction: 0.85,
  groundRestitution: 0.1,
} as const;

// ---------------------------------------------------------------- slingshot

export const SLING = {
  /** Pouch rest position = launch anchor, relative to the slingshot base. */
  anchor: { x: 0, y: 2.6 },
  /** Tip of the far fork arm (drawn behind the bird), relative to the base. */
  forkBack: { x: 0.36, y: 2.98 },
  /** Tip of the near fork arm (drawn in front of the bird), relative to the base. */
  forkFront: { x: -0.3, y: 2.92 },
  /** Maximum pull distance: dragging is clamped to a circle of this radius around the anchor. */
  maxPull: 2.1,
  /** Releasing with a shorter pull cancels the shot. */
  minPull: 0.35,
  /** Launch speed at full pull; speed scales linearly with pull distance. */
  maxSpeed: 22,
  /** Pointer must be this close to the loaded bird to grab it (world metres). */
  grabRadius: 1.5,
  /** Minimum grab radius in screen pixels, so the bird stays grabbable when zoomed out or on touch screens. */
  grabRadiusPx: 56,
  /** Spacing of the waiting birds on the ground, to the left of the slingshot. */
  queueSpacing: 1.15,
  queueOffset: 1.7,
} as const;

// ---------------------------------------------------------------- birds

export type AbilityKind = 'none' | 'boost' | 'explode' | 'split' | 'egg';

/** Damage multiplier of an attacker against each kind of target. */
export interface PowerTable {
  wood: number;
  glass: number;
  stone: number;
  tnt: number;
  pig: number;
}

export interface BirdConfig {
  name: string;
  /** Radius of the collision circle. */
  radius: number;
  density: number;
  friction: number;
  restitution: number;
  power: PowerTable;
  ability: AbilityKind;
  /** Short description for the tutorial. */
  blurb: string;
  abilityHint: string;
  /** Signature colour (feathers, UI accents). */
  color: string;
}

export const BIRDS: Record<BirdType, BirdConfig> = {
  red: {
    name: 'Red',
    radius: 0.42,
    density: 2.2,
    friction: 0.5,
    restitution: 0.35,
    power: { wood: 1, glass: 1, stone: 1, tnt: 1, pig: 1 },
    ability: 'none',
    blurb: 'Dependable all-rounder. No tricks, just a solid hit.',
    abilityHint: '',
    color: '#e23b2e',
  },
  chuck: {
    name: 'Chuck',
    radius: 0.4,
    density: 2.0,
    friction: 0.45,
    restitution: 0.3,
    power: { wood: 2.6, glass: 1.1, stone: 0.45, tnt: 1, pig: 1 },
    ability: 'boost',
    blurb: 'Tap in flight for a burst of speed. Slices through wood.',
    abilityHint: 'Tap to boost!',
    color: '#f8cf1c',
  },
  bomb: {
    name: 'Bomb',
    radius: 0.52,
    density: 2.6,
    friction: 0.6,
    restitution: 0.18,
    power: { wood: 1.2, glass: 1, stone: 1.7, tnt: 1, pig: 1 },
    ability: 'explode',
    blurb: 'Tap to explode, or wait for the fuse after impact. Cracks stone.',
    abilityHint: 'Tap to explode!',
    color: '#34343d',
  },
  blues: {
    name: 'The Blues',
    radius: 0.25,
    density: 2.2,
    friction: 0.45,
    restitution: 0.35,
    power: { wood: 0.6, glass: 4, stone: 0.4, tnt: 1, pig: 1 },
    ability: 'split',
    blurb: 'Tap in flight to split into three. Shatters glass.',
    abilityHint: 'Tap to split!',
    color: '#58b7ee',
  },
  matilda: {
    name: 'Matilda',
    radius: 0.55,
    density: 1.7,
    friction: 0.5,
    restitution: 0.3,
    power: { wood: 1, glass: 1, stone: 0.8, tnt: 1, pig: 1 },
    ability: 'egg',
    blurb: 'Tap to drop an explosive egg, then rocket upwards.',
    abilityHint: 'Tap to drop an egg!',
    color: '#f5f0e6',
  },
};

export interface ExplosionConfig {
  /** Everything whose surface is closer than this is affected. */
  radius: number;
  /** Damage energy at the centre; falls off towards the radius. */
  energy: number;
  /** Impulse (kg*m/s) per metre of exposed size at the centre. */
  impulse: number;
  power: PowerTable;
}

export const ABILITY = {
  boost: {
    /** Speed is multiplied by this ... */
    speedFactor: 2.0,
    /** ... but ends up at least / at most this fast. */
    minSpeed: 30,
    maxSpeed: 40,
  },
  split: {
    /** Angle between neighbouring clones, degrees. */
    spreadDeg: 11,
    /** Outer clones are this much faster / slower. */
    speedJitter: 0.04,
  },
  egg: {
    radius: 0.27,
    density: 2.4,
    /** Downward speed added to the egg. */
    dropSpeed: 17,
    /** Fraction of Matilda's horizontal speed the egg inherits. */
    inheritX: 0.35,
    /** Velocity change applied to Matilda (up / forward). */
    kickUp: 11,
    kickForward: 5,
    /** Matilda is lighter after laying the egg. */
    densityAfter: 0.9,
  },
  bomb: {
    /** Seconds from the first impact to the automatic explosion. */
    fuse: 2.0,
  },
} as const;

export const EXPLOSIONS: Record<'bomb' | 'egg' | 'tnt', ExplosionConfig> = {
  bomb: { radius: 4.6, energy: 430, impulse: 10, power: { wood: 1, glass: 1.5, stone: 1.7, tnt: 2, pig: 0.75 } },
  egg: { radius: 3.2, energy: 300, impulse: 7, power: { wood: 1.2, glass: 1.5, stone: 0.8, tnt: 2, pig: 0.7 } },
  tnt: { radius: 3.8, energy: 340, impulse: 9, power: { wood: 1.1, glass: 1.5, stone: 1.1, tnt: 2, pig: 0.7 } },
};

/** Delay before a TNT crate caught in another explosion goes off (chain reactions). */
export const TNT_CHAIN_DELAY = 0.09;
/** Blast strength = (1 - distance / radius) ^ EXPLOSION_FALLOFF. */
export const EXPLOSION_FALLOFF = 1.25;
/** No explosion changes a body's speed by more than this (m/s): keeps collapses lively, not absurd. */
export const EXPLOSION_MAX_KICK = 20;
/** Upward bias added to blast directions. */
export const EXPLOSION_LIFT = 0.3;

// ---------------------------------------------------------------- materials

export interface MaterialConfig {
  name: string;
  density: number;
  friction: number;
  restitution: number;
  /** Hit points of a reference piece (area DAMAGE.hpAreaRef). */
  hpBase: number;
  /** Impacts below this energy are ignored entirely. */
  minEnergy: number;
  /** Fraction of its remaining speed an attacker keeps after smashing through a piece. */
  passThrough: number;
  /** Points for destroying a reference piece. */
  destroyScore: number;
}

export const MATERIALS: Record<BlockMaterial, MaterialConfig> = {
  wood: { name: 'Wood', density: 1.0, friction: 0.62, restitution: 0.12, hpBase: 55, minEnergy: 2.5, passThrough: 0.85, destroyScore: 500 },
  glass: { name: 'Glass', density: 0.7, friction: 0.42, restitution: 0.08, hpBase: 22, minEnergy: 1.2, passThrough: 0.92, destroyScore: 400 },
  stone: { name: 'Stone', density: 2.6, friction: 0.72, restitution: 0.05, hpBase: 260, minEnergy: 8, passThrough: 0.6, destroyScore: 800 },
  tnt: { name: 'TNT', density: 0.9, friction: 0.6, restitution: 0.1, hpBase: 14, minEnergy: 3, passThrough: 0.9, destroyScore: 1000 },
};

// ---------------------------------------------------------------- pigs

export interface PigConfig {
  name: string;
  radius: number;
  density: number;
  hp: number;
  /** Extra hit points of the helmet / armour layer that must be broken first (0 = none). */
  armor: number;
  /** Fraction of incoming damage that reaches the armour layer. */
  armorFactor: number;
  /** Impacts below this energy are ignored entirely. */
  minEnergy: number;
  score: number;
}

export const PIGS: Record<PigVariant, PigConfig> = {
  small: { name: 'Piglet', radius: 0.4, density: 1.2, hp: 22, armor: 0, armorFactor: 1, minEnergy: 2, score: 5000 },
  medium: { name: 'Pig', radius: 0.55, density: 1.2, hp: 45, armor: 0, armorFactor: 1, minEnergy: 3, score: 5000 },
  large: { name: 'Big Pig', radius: 0.75, density: 1.2, hp: 100, armor: 0, armorFactor: 1, minEnergy: 5, score: 5000 },
  helmet: { name: 'Helmet Pig', radius: 0.55, density: 1.3, hp: 45, armor: 60, armorFactor: 0.7, minEnergy: 4, score: 6000 },
  armored: { name: 'Armored Pig', radius: 0.62, density: 1.5, hp: 60, armor: 140, armorFactor: 0.5, minEnergy: 8, score: 7500 },
  king: { name: 'King Pig', radius: 0.9, density: 1.3, hp: 260, armor: 0, armorFactor: 1, minEnergy: 8, score: 10000 },
};

export const PIG_PHYSICS = { friction: 0.55, restitution: 0.18, angularDamping: 1.6 } as const;

// ---------------------------------------------------------------- damage

export const DAMAGE = {
  /** Contacts closing slower than this never deal damage: filters resting and sliding contact. */
  minImpactSpeed: 1.2,
  /** Seconds during which the same pair of bodies cannot damage each other again. */
  pairCooldown: 0.15,
  /** No damage while freshly loaded stacks settle. */
  settleTime: 0.5,
  /** Block hit points = hpBase * (area / hpAreaRef) ^ hpAreaExponent. */
  hpAreaRef: 0.5,
  hpAreaExponent: 0.7,
  /** Remaining-health fractions at which the visible damage stage increases (cracks appear). */
  stageThresholds: [0.75, 0.5, 0.25],
  /** Fraction of its speed an attacker keeps after popping a pig. */
  pigPassThrough: 0.7,
  /**
   * How strongly smashing through a piece slows the attacker, relative to pure momentum exchange.
   * Higher values make light pieces cost more speed (birds stop sooner inside a structure).
   */
  passMassBias: 3,
  /** Collisions with at least this much energy are reported as 'impact' events (sounds, dust) even when harmless. */
  impactEventEnergy: 0.8,
} as const;

// ---------------------------------------------------------------- scoring

export const SCORE = {
  /** Share of a piece's destroy score that is paid out gradually while it is being damaged. */
  damageShare: 0.4,
  /** Points for hurting (not defeating) a pig, paid proportionally to the damage dealt. */
  pigDamagePool: 1000,
  clearBonus: 3000,
  unusedBird: 10000,
} as const;

// ---------------------------------------------------------------- shot flow

export const SHOT = {
  /** A projectile slower than this counts as resting. */
  restSpeed: 0.45,
  /** Seconds a projectile has to rest before it is removed with a puff. */
  birdRestTime: 1.4,
  /** Hard limit on how long a projectile lives after its first impact. */
  birdLifeAfterImpact: 7,
  /** The world counts as calm when nothing moves faster than this ... */
  calmSpeed: 0.3,
  /** ... for this long. */
  calmTime: 0.7,
  /** The shot is force-resolved this long after the first impact / after launch. */
  maxAfterImpact: 9,
  maxAfterLaunch: 16,
  /** Pause between the last pig going down and the victory tally. */
  winDelay: 1.6,
  /** Angular damping applied to a bird once it has hit something (stops endless rolling). */
  birdAngularDamping: 1.4,
  birdLinearDamping: 0.05,
} as const;

// ---------------------------------------------------------------- camera / rendering

export const CAMERA = {
  /** Preferred minimum zoom in CSS px per metre before the view switches from "whole level" to tracking. */
  comfortZoom: 21,
  minZoom: 9,
  maxZoom: 64,
  /** Fraction of the view height kept below the ground line. */
  groundBand: 0.16,
  /** Smoothing times in seconds (critically damped). */
  followSmooth: 0.22,
  returnSmooth: 0.55,
  zoomSmooth: 0.4,
} as const;

export const RENDER = {
  /** Upper bound for devicePixelRatio (keeps fill-rate sane on 3x phones). */
  maxDpr: 2,
  /** Resolution of cached sprites in device px per metre. */
  spritePxPerMeter: 96,
  maxParticles: 700,
} as const;
