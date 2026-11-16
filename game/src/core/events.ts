/**
 * Events emitted by the simulation. The simulation itself never touches the DOM, audio or
 * rendering; the presentation layer drains these every tick and reacts (particles, sounds,
 * floating score text, camera shake ...).
 */
import type { AbilityKind } from './config';
import type { BirdType, BlockMaterial, BlockShape, FoeVariant } from './types';

/** What a collision surface is made of. */
export type SurfaceKind = BlockMaterial | 'foe' | 'bird' | 'ground';

/** ember = Ember's blast, quake = Brawn's ground slam, nova = the burst that ends a gravity well. */
export type ExplosionSource = 'ember' | 'tnt' | 'sapper' | 'quake' | 'nova';
export type ScoreReason = 'damage' | 'block' | 'foe' | 'bird' | 'clear';
export type ExpireReason = 'rest' | 'timeout' | 'bounds' | 'exploded' | 'resolved';

export type SimEvent =
  | { type: 'birdReady'; bird: BirdType; remaining: number }
  | { type: 'birdLaunched'; id: number; bird: BirdType; x: number; y: number; vx: number; vy: number; power: number }
  | { type: 'birdImpact'; id: number; bird: BirdType; x: number; y: number; speed: number; first: boolean; other: SurfaceKind }
  | { type: 'birdExpired'; id: number; bird: BirdType; x: number; y: number; reason: ExpireReason }
  | { type: 'ability'; ability: AbilityKind; id: number; bird: BirdType; x: number; y: number; vx: number; vy: number }
  | { type: 'explosion'; source: ExplosionSource; x: number; y: number; radius: number }
  /** Generic collision, for impact sounds and dust. `energy` is the damage energy of the hit. */
  | { type: 'impact'; x: number; y: number; nx: number; ny: number; speed: number; energy: number; a: SurfaceKind; b: SurfaceKind }
  | { type: 'blockDamaged'; id: number; material: BlockMaterial; x: number; y: number; damage: number; stage: number; stageChanged: boolean }
  | {
      type: 'blockDestroyed';
      id: number;
      material: BlockMaterial;
      shape: BlockShape;
      x: number;
      y: number;
      w: number;
      h: number;
      angle: number;
      vx: number;
      vy: number;
    }
  /** `armored` = the hit was soaked up by a helmet / armour that is still holding. */
  | { type: 'foeDamaged'; id: number; variant: FoeVariant; x: number; y: number; damage: number; hpFraction: number; armored: boolean }
  | { type: 'armorBroken'; id: number; variant: FoeVariant; x: number; y: number; vx: number; vy: number }
  | { type: 'foeDefeated'; id: number; variant: FoeVariant; x: number; y: number; vx: number; vy: number; remaining: number }
  | { type: 'score'; points: number; x: number; y: number; reason: ScoreReason }
  /** `cut` = a bird flew through the rope. */
  | { type: 'jointBroken'; kind: 'rope' | 'pin'; x: number; y: number; cut: boolean }
  /** Rime's frost burst. `count` = pieces and foes that froze. */
  | { type: 'freeze'; x: number; y: number; radius: number; count: number }
  /** Jolt's lightning. `arcs` holds x0, y0, x1, y1 for every jump of the current. */
  | { type: 'shock'; x: number; y: number; arcs: number[]; hits: number }
  /** Nova's gravity well opens (`active`) or closes. */
  | { type: 'gravityWell'; x: number; y: number; radius: number; active: boolean }
  /** A crystal shattered and rang out. */
  | { type: 'resonance'; x: number; y: number; radius: number }
  /** A bird sprang off rubber or a bouncy surface. */
  | { type: 'bounce'; x: number; y: number; speed: number }
  | { type: 'balloonPopped'; id: number; x: number; y: number }
  | { type: 'iceCrack'; x: number; y: number }
  | { type: 'shotResolved'; foesLeft: number; birdsLeft: number }
  | { type: 'levelWon'; baseScore: number; clearBonus: number; unusedBirds: number; birdBonus: number; score: number }
  | { type: 'levelLost'; score: number; foesLeft: number };

export type SimEventType = SimEvent['type'];
export type SimEventOf<T extends SimEventType> = Extract<SimEvent, { type: T }>;
