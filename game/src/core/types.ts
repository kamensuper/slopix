/**
 * Shared, serialisable game types. Everything here is plain data so levels can be
 * exported / imported as JSON and the simulation can run without a DOM.
 *
 * World space: metres, x to the right, y UP, the ground surface is y = 0.
 */

export type BirdType = 'red' | 'chuck' | 'bomb' | 'blues' | 'matilda';
export const BIRD_TYPES: readonly BirdType[] = ['red', 'chuck', 'bomb', 'blues', 'matilda'];

export type PigVariant = 'small' | 'medium' | 'large' | 'helmet' | 'armored' | 'king';
export const PIG_VARIANTS: readonly PigVariant[] = ['small', 'medium', 'large', 'helmet', 'armored', 'king'];

/** The three primary construction materials. */
export type MaterialId = 'wood' | 'glass' | 'stone';
/** Everything a block can be made of (TNT is a special explosive crate). */
export type BlockMaterial = MaterialId | 'tnt';
export const BLOCK_MATERIALS: readonly BlockMaterial[] = ['wood', 'glass', 'stone', 'tnt'];

/**
 * rect   - box of w x h (planks, beams, squares, slabs)
 * tri    - isosceles triangle, base w at the bottom, apex centred at the top (roof piece)
 * wedge  - right triangle, right angle at the bottom-left corner (bottom-right when `flip`)
 * circle - ball of diameter w (h is ignored and normalised to w)
 */
export type BlockShape = 'rect' | 'tri' | 'wedge' | 'circle';
export const BLOCK_SHAPES: readonly BlockShape[] = ['rect', 'tri', 'wedge', 'circle'];

export type ThemeId = 'grasslands' | 'desert' | 'snowlands';
export const THEME_IDS: readonly ThemeId[] = ['grasslands', 'desert', 'snowlands'];

export interface BlockDef {
  shape: BlockShape;
  material: BlockMaterial;
  /** Centre of the shape's bounding box, metres. */
  x: number;
  y: number;
  /** Bounding-box size before rotation, metres. */
  w: number;
  h: number;
  /** Counter-clockwise rotation in degrees. */
  angle?: number;
  /** Mirror horizontally (only meaningful for `wedge`). */
  flip?: boolean;
}

export interface PigDef {
  variant: PigVariant;
  /** Centre of the pig, metres. */
  x: number;
  y: number;
}

/** Static, indestructible scenery that takes part in collisions (ledges, hills, ramps). */
export interface TerrainDef {
  shape: 'rect' | 'poly';
  /** Centre of the piece (rect) or origin the points are relative to (poly). */
  x: number;
  y: number;
  /** rect only */
  w?: number;
  h?: number;
  /** poly only: convex, counter-clockwise, at most 8 points, relative to (x, y). */
  points?: [number, number][];
  /** Counter-clockwise rotation in degrees. */
  angle?: number;
}

/** Purely visual scenery (no physics). */
export interface DecorDef {
  kind: string;
  x: number;
  /** Height of the base above the ground, defaults to 0. */
  y?: number;
  scale?: number;
  flip?: boolean;
  /** Drawn behind (default) or in front of the playfield. */
  layer?: 'back' | 'front';
}

export interface StarThresholds {
  /** Score needed for two stars. One star is awarded for any completed level. */
  two: number;
  /** Score needed for three stars. */
  three: number;
}

export interface LevelDef {
  id: string;
  name: string;
  theme: ThemeId;
  /** Birds in launch order. */
  birds: BirdType[];
  /** Playable extent: x in [0, width], y in [0, height]. */
  world: { width: number; height: number };
  /** Base of the slingshot (where it meets the ground / platform). */
  slingshot: { x: number; y: number };
  blocks: BlockDef[];
  pigs: PigDef[];
  terrain: TerrainDef[];
  decor?: DecorDef[];
  stars: StarThresholds;
  /** One-line hint shown when the level starts. */
  hint?: string;
}

// ---------------------------------------------------------------- campaign

export interface LevelMeta {
  /** Stable id, e.g. "1-4". */
  id: string;
  /** Global index 0..N-1 across the whole campaign. */
  index: number;
  /** 1-based number inside its chapter. */
  number: number;
  /** Index of the owning chapter. */
  chapter: number;
  name: string;
  /** Birds available, for previews. */
  birds: BirdType[];
}

export interface ChapterMeta {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  theme: ThemeId;
  levels: LevelMeta[];
}

export interface CampaignMeta {
  chapters: ChapterMeta[];
  /** All levels in campaign order (flattened chapters). */
  levels: LevelMeta[];
}

// ---------------------------------------------------------------- settings / results

export interface GameSettings {
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  sfxVolume: number;
  muted: boolean;
}

export interface LevelResult {
  won: boolean;
  levelIndex: number;
  levelId: string;
  levelName: string;
  /** Final score including every bonus. */
  score: number;
  /** Points earned from damage, destruction and defeated pigs. */
  baseScore: number;
  /** Bonus for clearing the level. */
  clearBonus: number;
  unusedBirds: number;
  /** Total bonus for unused birds. */
  birdBonus: number;
  stars: 0 | 1 | 2 | 3;
  starThresholds: StarThresholds;
  previousBest: number;
  /** Best score after this attempt. */
  best: number;
  isNewBest: boolean;
  pigsDefeated: number;
  pigsTotal: number;
  birdsUsed: number;
  /** A following level exists in the campaign. */
  hasNext: boolean;
  /** ... and it is unlocked (always true after a win). */
  nextUnlocked: boolean;
}

/** Read-only view of campaign progress used by menus. */
export interface ProgressReader {
  isLevelUnlocked(levelIndex: number): boolean;
  isChapterUnlocked(chapterIndex: number): boolean;
  getStars(levelIndex: number): number;
  getBest(levelIndex: number): number;
  totalStars(): number;
  maxStars(): number;
  chapterStars(chapterIndex: number): number;
  /** Index of the first unlocked level that has not been completed yet (or the last level). */
  nextLevelIndex(): number;
}
