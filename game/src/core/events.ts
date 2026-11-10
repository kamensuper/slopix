/**
 * Events emitted by the simulation. The simulation itself never touches the DOM, audio or
 * rendering; the presentation layer drains these every tick and reacts (particles, sounds,
 * floating score text, camera shake ...).
 */
import type { AbilityKind } from './config';
import type { BirdType, BlockMaterial, BlockShape, PigVariant } from './types';

/** What a collision surface is made of. */
export type SurfaceKind = BlockMaterial | 'pig' | 'bird' | 'ground';

export type ExplosionSource = 'bomb' | 'egg' | 'tnt';
export type ScoreReason = 'damage' | 'block' | 'pig' | 'bird' | 'clear';
export type ExpireReason = 'rest' | 'timeout' | 'bounds' | 'exploded' | 'resolved';

export type SimEvent =
  | { type: 'birdReady'; bird: BirdType; remaining: number }
  | { type: 'birdLaunched'; id: number; bird: BirdType; x: number; y: number; vx: number; vy: number; power: number }
  | { type: 'birdImpact'; id: number; bird: BirdType | 'egg'; x: number; y: number; speed: number; first: boolean; other: SurfaceKind }
  | { type: 'birdExpired'; id: number; bird: BirdType | 'egg'; x: number; y: number; reason: ExpireReason }
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
  | { type: 'pigDamaged'; id: number; variant: PigVariant; x: number; y: number; damage: number; hpFraction: number; armored: boolean }
  | { type: 'armorBroken'; id: number; variant: PigVariant; x: number; y: number; vx: number; vy: number }
  | { type: 'pigDefeated'; id: number; variant: PigVariant; x: number; y: number; vx: number; vy: number; remaining: number }
  | { type: 'score'; points: number; x: number; y: number; reason: ScoreReason }
  | { type: 'jointBroken'; kind: 'rope' | 'pin'; x: number; y: number }
  | { type: 'shotResolved'; pigsLeft: number; birdsLeft: number }
  | { type: 'levelWon'; baseScore: number; clearBonus: number; unusedBirds: number; birdBonus: number; score: number }
  | { type: 'levelLost'; score: number; pigsLeft: number };

export type SimEventType = SimEvent['type'];
export type SimEventOf<T extends SimEventType> = Extract<SimEvent, { type: T }>;
