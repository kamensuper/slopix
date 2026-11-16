/**
 * Every gameplay constant lives here so the game can be tuned from a single place.
 * Units: metres, kilograms, seconds, radians (unless a name says otherwise).
 */
import type { BirdType, BlockMaterial, FoeVariant } from './types';

export const GAME_TITLE = 'Flock Fury';
export const GAME_TAGLINE = 'A slingshot physics adventure';
export const GAME_VERSION = '2.0.0';

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
  foe: 0x0004,
  bird: 0x0008,
} as const;
/** Negative group: projectiles of the flock never collide with each other (split birds). */
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

export type AbilityKind = 'none' | 'boost' | 'explode' | 'split' | 'slam' | 'freeze' | 'shock' | 'gravity';

/** Damage multiplier of an attacker against each kind of target. */
export type PowerTable = Record<BlockMaterial | 'foe', number>;

/** A power table that is 1 everywhere except where stated. */
function power(overrides: Partial<PowerTable> = {}): PowerTable {
  return { wood: 1, glass: 1, stone: 1, metal: 1, ice: 1, ironwood: 1, crystal: 1, rubber: 1, tnt: 1, foe: 1, ...overrides };
}

export interface BirdConfig {
  name: string;
  /** Role in the flock, shown in menus. */
  role: string;
  /** Radius of the collision circle. */
  radius: number;
  density: number;
  friction: number;
  restitution: number;
  /** Launch speed relative to SLING.maxSpeed: heavy birds leave the sling slower. */
  launch: number;
  power: PowerTable;
  ability: AbilityKind;
  /** The ability may still be triggered after the first impact. */
  abilityAfterImpact: boolean;
  /** Short description for the roster screen. */
  blurb: string;
  /** What it is good against / bad against, for the roster screen. */
  strong: string;
  weak: string;
  abilityName: string;
  abilityHint: string;
  /** Signature colour (feathers, UI accents). */
  color: string;
}

export const BIRDS: Record<BirdType, BirdConfig> = {
  pip: {
    name: 'Pip',
    role: 'Striker',
    radius: 0.42,
    density: 2.2,
    friction: 0.5,
    restitution: 0.35,
    launch: 1,
    power: power({ metal: 0.5, ironwood: 0.7 }),
    ability: 'none',
    abilityAfterImpact: false,
    blurb: 'A plucky kingfisher. No tricks, just an honest, heavy hit.',
    strong: 'Wood, glass and anything already wobbling',
    weak: 'Metal and ironwood',
    abilityName: 'Steady Aim',
    abilityHint: '',
    color: '#1fa7b8',
  },
  zip: {
    name: 'Zip',
    role: 'Dasher',
    radius: 0.38,
    density: 2.0,
    friction: 0.45,
    restitution: 0.3,
    launch: 1,
    power: power({ wood: 2.6, glass: 1.1, stone: 0.45, metal: 0.3, ironwood: 0.9, ice: 1.4, crystal: 0.7 }),
    ability: 'boost',
    abilityAfterImpact: false,
    blurb: 'A swift with a beak like a chisel. Tap in flight for a burst of speed.',
    strong: 'Wood, ropes and long flat shots',
    weak: 'Stone and metal',
    abilityName: 'Slipstream',
    abilityHint: 'Tap to dash!',
    color: '#d6409f',
  },
  ember: {
    name: 'Ember',
    role: 'Bomber',
    radius: 0.52,
    density: 2.6,
    friction: 0.6,
    restitution: 0.18,
    launch: 0.94,
    power: power({ wood: 1.2, stone: 1.7, metal: 1.3, ironwood: 1.3, rubber: 0.6 }),
    ability: 'explode',
    abilityAfterImpact: true,
    blurb: 'A firefinch that runs hot. Tap to burst, or let it smoulder after landing.',
    strong: 'Stone, crates and tight clusters',
    weak: 'Range, and open ground: the blast is short',
    abilityName: 'Flare-up',
    abilityHint: 'Tap to burst!',
    color: '#f2672a',
  },
  sprig: {
    name: 'The Sprigs',
    role: 'Splitter',
    radius: 0.25,
    density: 2.2,
    friction: 0.45,
    restitution: 0.35,
    launch: 1,
    power: power({ wood: 0.6, glass: 4, stone: 0.4, metal: 0.25, ice: 3, ironwood: 0.4, crystal: 1.6 }),
    ability: 'split',
    abilityAfterImpact: false,
    blurb: 'Three wrens that fly as one. Tap to fan out.',
    strong: 'Glass, ice and spread-out targets',
    weak: 'Anything heavy',
    abilityName: 'Fan Out',
    abilityHint: 'Tap to split!',
    color: '#8fc93a',
  },
  brawn: {
    name: 'Brawn',
    role: 'Crusher',
    radius: 0.6,
    density: 4.2,
    friction: 0.6,
    restitution: 0.08,
    launch: 0.86,
    power: power({ stone: 1.5, metal: 1.4, ironwood: 2.2, glass: 0.9 }),
    ability: 'slam',
    abilityAfterImpact: false,
    blurb: 'A burly owl. Tap to drop like an anvil; the landing shakes the ground.',
    strong: 'Ironwood, roofs and anything underneath',
    weak: 'Range: it leaves the sling slowly',
    abilityName: 'Anvil Drop',
    abilityHint: 'Tap to slam down!',
    color: '#8a6a4a',
  },
  rime: {
    name: 'Rime',
    role: 'Frostwing',
    radius: 0.4,
    density: 1.7,
    friction: 0.4,
    restitution: 0.25,
    launch: 1,
    power: power({ wood: 0.7, stone: 0.5, metal: 0.4, ironwood: 0.5 }),
    ability: 'freeze',
    abilityAfterImpact: true,
    blurb: 'A snow petrel. Its frost burst makes everything nearby brittle and slippery.',
    strong: 'Setting up the next bird; metal and rubber',
    weak: 'Does little damage alone',
    abilityName: 'Cold Snap',
    abilityHint: 'Tap to freeze!',
    color: '#8fd3f4',
  },
  jolt: {
    name: 'Jolt',
    role: 'Voltwing',
    radius: 0.38,
    density: 1.9,
    friction: 0.45,
    restitution: 0.3,
    launch: 1,
    power: power({ wood: 0.8, stone: 0.5, metal: 0.4, ironwood: 0.6 }),
    ability: 'shock',
    abilityAfterImpact: false,
    blurb: 'A storm swallow. Tap near metal: lightning runs through every piece that touches.',
    strong: 'Metal structures, armour, crystal',
    weak: 'Wood and stone do not conduct',
    abilityName: 'Chain Lightning',
    abilityHint: 'Tap near metal!',
    color: '#5b5fe0',
  },
  nova: {
    name: 'Nova',
    role: 'Gravity bird',
    radius: 0.44,
    density: 2.0,
    friction: 0.5,
    restitution: 0.2,
    launch: 1,
    power: power({ metal: 0.5, stone: 0.8 }),
    ability: 'gravity',
    abilityAfterImpact: false,
    blurb: 'A nightjar full of stars. Tap to hang in the air and pull the world towards you.',
    strong: 'Tall, loose structures and hanging loads',
    weak: 'Low, solid bunkers',
    abilityName: 'Star Well',
    abilityHint: 'Tap to open a gravity well!',
    color: '#7d4bd1',
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
  explode: {
    /** Seconds from the first impact to the automatic explosion. */
    fuse: 2.0,
  },
  slam: {
    /** Downward speed after the tap (at least this fast). */
    dropSpeed: 30,
    /** Fraction of horizontal speed kept. */
    keepX: 0.12,
    /** The landing only shakes the ground when the bird arrives at least this fast. */
    quakeSpeed: 12,
  },
  freeze: {
    radius: 3.8,
    /** Frozen pieces and foes take this many times the damage. */
    brittle: 2.6,
    /** Friction of frozen pieces. */
    friction: 0.04,
    /** Restitution of frozen rubber. */
    restitution: 0.05,
  },
  shock: {
    /** Lightning reaches the nearest conductor within this distance of the bird. */
    reach: 5,
    /** Current runs through at most this many touching conductors. */
    maxChain: 40,
    /** Two conductors closer than this count as touching. */
    gap: 0.12,
    /** Damage to a foe touching a live conductor / struck directly. */
    foeDamage: 70,
    /** Foes wearing metal (helmet, plate) take this many times as much. */
    armorFactor: 2.2,
    /** Damage to each metal piece the current runs through. */
    metalDamage: 30,
  },
  gravity: {
    radius: 7,
    /** Seconds the well stays open. */
    duration: 1.5,
    /** Pull at the centre as an acceleration, m/s^2; falls off linearly to the radius. */
    pull: 46,
    /** Bodies near the centre are slowed so they gather instead of slinging through. */
    drag: 2.2,
  },
} as const;

export const EXPLOSIONS: Record<'ember' | 'tnt' | 'sapper' | 'quake' | 'nova', ExplosionConfig> = {
  ember: { radius: 4.6, energy: 430, impulse: 10, power: power({ glass: 1.5, stone: 1.7, metal: 1.2, ice: 2.2, ironwood: 1.3, crystal: 1.5, rubber: 1.2, tnt: 2, foe: 0.75 }) },
  tnt: { radius: 3.8, energy: 340, impulse: 9, power: power({ wood: 1.1, glass: 1.5, stone: 1.1, metal: 0.9, ice: 2.2, ironwood: 1.2, crystal: 1.5, rubber: 1.2, tnt: 2, foe: 0.7 }) },
  sapper: { radius: 3.0, energy: 260, impulse: 7, power: power({ glass: 1.5, metal: 0.8, ice: 2, crystal: 1.4, tnt: 2, foe: 0.7 }) },
  quake: { radius: 3.2, energy: 190, impulse: 6, power: power({ glass: 1.6, stone: 1.3, metal: 0.8, ice: 1.8, ironwood: 1.6, crystal: 1.2, rubber: 0.2, tnt: 2, foe: 0.6 }) },
  nova: { radius: 3.4, energy: 150, impulse: 8, power: power({ glass: 1.5, metal: 0.6, ice: 1.5, crystal: 1.5, rubber: 0.4, tnt: 2, foe: 0.7 }) },
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
  /** The material's rule in one line, for the editor and the field guide. */
  trait: string;
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
  /** Carries Jolt's lightning. */
  conducts: boolean;
  /** Rime's frost has an effect on it. */
  freezes: boolean;
}

export const MATERIALS: Record<BlockMaterial, MaterialConfig> = {
  wood: { name: 'Wood', trait: 'Light and splintery. Zip tears through it.', density: 1.0, friction: 0.62, restitution: 0.12, hpBase: 55, minEnergy: 2.5, passThrough: 0.85, destroyScore: 500, conducts: false, freezes: true },
  glass: { name: 'Glass', trait: 'Fragile. The Sprigs shatter it.', density: 0.7, friction: 0.42, restitution: 0.08, hpBase: 22, minEnergy: 1.2, passThrough: 0.92, destroyScore: 400, conducts: false, freezes: true },
  stone: { name: 'Stone', trait: 'Heavy and stubborn. Needs a blast or a long fall.', density: 2.6, friction: 0.72, restitution: 0.05, hpBase: 260, minEnergy: 8, passThrough: 0.6, destroyScore: 800, conducts: false, freezes: true },
  metal: { name: 'Metal', trait: 'Nearly unbreakable, but it conducts lightning and turns brittle when frozen.', density: 3.4, friction: 0.45, restitution: 0.06, hpBase: 420, minEnergy: 12, passThrough: 0.45, destroyScore: 1200, conducts: true, freezes: true },
  ice: { name: 'Ice', trait: 'Slippery and brittle. Cracks spread from one piece to the next.', density: 0.9, friction: 0.03, restitution: 0.04, hpBase: 34, minEnergy: 1.6, passThrough: 0.9, destroyScore: 450, conducts: false, freezes: false },
  ironwood: { name: 'Ironwood', trait: 'Banded timber: three times as tough as wood. Brawn splits it.', density: 1.3, friction: 0.66, restitution: 0.1, hpBase: 150, minEnergy: 6, passThrough: 0.7, destroyScore: 700, conducts: false, freezes: true },
  crystal: { name: 'Crystal', trait: 'Rings out when it breaks: the pulse hurts foes and sets off other crystals. Conducts.', density: 1.6, friction: 0.4, restitution: 0.1, hpBase: 60, minEnergy: 4, passThrough: 0.8, destroyScore: 900, conducts: true, freezes: false },
  rubber: { name: 'Rubber', trait: 'Bounces everything back and shrugs off impacts. Freeze it or blow it up.', density: 1.1, friction: 0.8, restitution: 0.88, hpBase: 90, minEnergy: 1e9, passThrough: 0.5, destroyScore: 600, conducts: false, freezes: true },
  tnt: { name: 'Blast crate', trait: 'Explodes when broken and sets off its neighbours.', density: 0.9, friction: 0.6, restitution: 0.1, hpBase: 14, minEnergy: 3, passThrough: 0.9, destroyScore: 1000, conducts: false, freezes: false },
};

export const MATERIAL_RULES = {
  /** A shattered ice piece passes this share of its own hit points on to every ice piece touching it. */
  iceCrackShare: 0.6,
  /** Seconds before the crack reaches the neighbour. */
  iceCrackDelay: 0.07,
  /** Pulse of a shattered crystal. */
  resonance: { radius: 3.2, foeDamage: 60, crystalDamage: 200, delay: 0.12 },
  /** A bird may spring off rubber this many times before the bounce counts as its first impact. */
  rubberBounces: 3,
  /** A rope snaps when a bird crosses it at least this fast (m/s). */
  ropeCutSpeed: 5,
} as const;

export const TERRAIN = {
  ice: { friction: 0.02, restitution: 0.05 },
  bouncy: { friction: 0.7, restitution: 0.9 },
  conveyor: { friction: 0.95, restitution: 0.05 },
} as const;

// ---------------------------------------------------------------- foes

export type ArmorKind = 'none' | 'helmet' | 'plate' | 'shield';

export interface FoeConfig {
  name: string;
  /** One line for the field guide. */
  trait: string;
  radius: number;
  density: number;
  hp: number;
  /** Extra hit points of the helmet / plate / shield that must be broken first (0 = none). */
  armor: number;
  armorKind: ArmorKind;
  /** Fraction of incoming damage that reaches the armour layer. */
  armorFactor: number;
  /** Impacts below this energy are ignored entirely. */
  minEnergy: number;
  score: number;
}

export const FOES: Record<FoeVariant, FoeConfig> = {
  small: { name: 'Pup', trait: 'Small and easily knocked over.', radius: 0.4, density: 1.2, hp: 22, armor: 0, armorKind: 'none', armorFactor: 1, minEnergy: 2, score: 5000 },
  medium: { name: 'Digger', trait: 'The rank and file.', radius: 0.55, density: 1.2, hp: 45, armor: 0, armorKind: 'none', armorFactor: 1, minEnergy: 3, score: 5000 },
  large: { name: 'Bruiser', trait: 'Big, heavy and hard to budge.', radius: 0.75, density: 1.5, hp: 100, armor: 0, armorKind: 'none', armorFactor: 1, minEnergy: 5, score: 5000 },
  helmet: { name: 'Hardhat', trait: 'The metal hat soaks up the first hits. Lightning loves it.', radius: 0.55, density: 1.3, hp: 45, armor: 60, armorKind: 'helmet', armorFactor: 0.7, minEnergy: 4, score: 6000 },
  armored: { name: 'Ironclad', trait: 'Plated head to toe. Shock it, freeze it or drop something on it.', radius: 0.62, density: 1.5, hp: 60, armor: 140, armorKind: 'plate', armorFactor: 0.5, minEnergy: 8, score: 7500 },
  king: { name: 'Baron Burrow', trait: 'The boss of the dig. Very tough.', radius: 0.9, density: 1.3, hp: 260, armor: 0, armorKind: 'none', armorFactor: 1, minEnergy: 8, score: 10000 },
  shield: { name: 'Shieldbearer', trait: 'Blocks everything from the front. Hit it from above or behind, or blow it up.', radius: 0.55, density: 1.3, hp: 45, armor: 150, armorKind: 'shield', armorFactor: 1, minEnergy: 3, score: 6500 },
  sapper: { name: 'Sapper', trait: 'Carries a powder keg: it explodes when defeated.', radius: 0.5, density: 1.2, hp: 35, armor: 0, armorKind: 'none', armorFactor: 1, minEnergy: 3, score: 6000 },
  floater: { name: 'Balloonist', trait: 'Hangs under a balloon, out of reach of the collapse. Any hit pops it.', radius: 0.45, density: 1.0, hp: 30, armor: 0, armorKind: 'none', armorFactor: 1, minEnergy: 2, score: 6500 },
};

export const FOE_PHYSICS = { friction: 0.55, restitution: 0.18, angularDamping: 1.6 } as const;

export const FLOATER = {
  /** Spring that holds a balloonist at its post (1/s^2) and its damping (1/s). */
  spring: 22,
  damping: 5,
  /** A balloon pops when the foe is pushed this fast (m/s). */
  popSpeed: 4,
  /** Seconds for one sweep of a patrolling balloon. */
  patrolPeriod: 5,
} as const;

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
  /** Fraction of its speed an attacker keeps after popping a foe. */
  foePassThrough: 0.7,
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
  /** Points for hurting (not defeating) a foe, paid proportionally to the damage dealt. */
  foeDamagePool: 1000,
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
  /** Pause between the last foe going down and the victory tally. */
  winDelay: 1.6,
  /** Angular damping applied to a bird once it has hit something (stops endless rolling). */
  birdAngularDamping: 1.4,
  birdLinearDamping: 0.05,
  /** Fast-forward multiplier while the player holds the button after a shot. */
  fastForward: 3,
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
  /** Upper bound for canvas backing-store pixels (about 1.5x a 1080p screen). */
  maxPixels: 3_000_000,
  /** Resolution of cached sprites in device px per metre. */
  spritePxPerMeter: 96,
  maxParticles: 700,
} as const;
