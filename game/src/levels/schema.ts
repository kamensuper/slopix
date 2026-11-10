/**
 * Level validation and (de)serialisation. Everything that enters the game as level data
 * (campaign files, editor imports) goes through normalizeLevel, so the simulation can trust it.
 */
import {
  BIRD_TYPES,
  BLOCK_MATERIALS,
  BLOCK_SHAPES,
  PIG_VARIANTS,
  THEME_IDS,
  type BirdType,
  type BlockDef,
  type BlockMaterial,
  type BlockShape,
  type DecorDef,
  type JointDef,
  type LevelDef,
  type PigDef,
  type PigVariant,
  type TerrainDef,
  type ThemeId,
} from '../core/types';

export const LEVEL_LIMITS = {
  maxBlocks: 400,
  maxPigs: 40,
  maxBirds: 12,
  maxTerrain: 60,
  maxDecor: 80,
  maxJoints: 60,
  minWidth: 24,
  maxWidth: 120,
  minHeight: 12,
  maxHeight: 60,
  minPieceSize: 0.1,
  maxPieceSize: 14,
  maxPolyPoints: 8,
} as const;

export class LevelFormatError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid level: ${problems.join('; ')}`);
    this.name = 'LevelFormatError';
  }
}

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

class Reader {
  readonly problems: string[] = [];

  num(source: Dict, key: string, where: string, lo: number, hi: number, fallback?: number): number {
    const value = source[key];
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.problems.push(`${where}.${key} must be a number`);
      return fallback ?? lo;
    }
    if (value < lo || value > hi) {
      this.problems.push(`${where}.${key} = ${value} is outside ${lo}..${hi}`);
      return Math.min(hi, Math.max(lo, value));
    }
    return round(value);
  }

  str(source: Dict, key: string, where: string, maxLength: number, fallback?: string): string {
    const value = source[key];
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'string') {
      this.problems.push(`${where}.${key} must be a string`);
      return fallback ?? '';
    }
    return value.slice(0, maxLength);
  }

  oneOf<T extends string>(source: Dict, key: string, where: string, options: readonly T[]): T {
    const value = source[key];
    if (typeof value === 'string' && (options as readonly string[]).includes(value)) return value as T;
    this.problems.push(`${where}.${key} must be one of ${options.join(', ')}`);
    return options[0] as T;
  }

  list(source: Dict, key: string, where: string, max: number, required: boolean): unknown[] {
    const value = source[key];
    if (value === undefined && !required) return [];
    if (!Array.isArray(value)) {
      this.problems.push(`${where}.${key} must be an array`);
      return [];
    }
    if (value.length > max) {
      this.problems.push(`${where}.${key} has ${value.length} entries (limit ${max})`);
      return value.slice(0, max);
    }
    return value;
  }
}

function readBlock(r: Reader, raw: unknown, where: string, bounds: { w: number; h: number }): BlockDef | null {
  if (!isDict(raw)) {
    r.problems.push(`${where} must be an object`);
    return null;
  }
  const shape = r.oneOf<BlockShape>(raw, 'shape', where, BLOCK_SHAPES);
  const material = r.oneOf<BlockMaterial>(raw, 'material', where, BLOCK_MATERIALS);
  const w = r.num(raw, 'w', where, LEVEL_LIMITS.minPieceSize, LEVEL_LIMITS.maxPieceSize);
  const h = shape === 'circle' ? w : r.num(raw, 'h', where, LEVEL_LIMITS.minPieceSize, LEVEL_LIMITS.maxPieceSize);
  const block: BlockDef = {
    shape,
    material,
    x: r.num(raw, 'x', where, -10, bounds.w + 10),
    y: r.num(raw, 'y', where, -1, bounds.h + 10),
    w,
    h,
  };
  const angle = r.num(raw, 'angle', where, -360, 360, 0);
  if (angle !== 0) block.angle = angle;
  if (raw.flip === true && shape === 'wedge') block.flip = true;
  return block;
}

function readPig(r: Reader, raw: unknown, where: string, bounds: { w: number; h: number }): PigDef | null {
  if (!isDict(raw)) {
    r.problems.push(`${where} must be an object`);
    return null;
  }
  return {
    variant: r.oneOf<PigVariant>(raw, 'variant', where, PIG_VARIANTS),
    x: r.num(raw, 'x', where, -10, bounds.w + 10),
    y: r.num(raw, 'y', where, -1, bounds.h + 10),
  };
}

function readTerrain(r: Reader, raw: unknown, where: string, bounds: { w: number; h: number }): TerrainDef | null {
  if (!isDict(raw)) {
    r.problems.push(`${where} must be an object`);
    return null;
  }
  const shape = r.oneOf<'rect' | 'poly'>(raw, 'shape', where, ['rect', 'poly']);
  const terrain: TerrainDef = {
    shape,
    x: r.num(raw, 'x', where, -20, bounds.w + 20),
    y: r.num(raw, 'y', where, -10, bounds.h + 10),
  };
  if (shape === 'rect') {
    terrain.w = r.num(raw, 'w', where, LEVEL_LIMITS.minPieceSize, 60);
    terrain.h = r.num(raw, 'h', where, LEVEL_LIMITS.minPieceSize, 40);
  } else {
    const points = r.list(raw, 'points', where, LEVEL_LIMITS.maxPolyPoints, true);
    const parsed: [number, number][] = [];
    for (const point of points) {
      if (Array.isArray(point) && point.length === 2 && point.every((c) => typeof c === 'number' && Number.isFinite(c))) {
        parsed.push([round(point[0] as number), round(point[1] as number)]);
      } else {
        r.problems.push(`${where}.points must contain [x, y] pairs`);
      }
    }
    if (parsed.length < 3) r.problems.push(`${where}.points needs at least 3 points`);
    else if (!isConvexCcw(parsed)) r.problems.push(`${where}.points must be convex and counter-clockwise`);
    terrain.points = parsed;
  }
  const angle = r.num(raw, 'angle', where, -360, 360, 0);
  if (angle !== 0) terrain.angle = angle;
  return terrain;
}

function isConvexCcw(points: [number, number][]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i] as [number, number];
    const b = points[(i + 1) % n] as [number, number];
    const c = points[(i + 2) % n] as [number, number];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross <= 1e-9) return false;
  }
  return true;
}

function readDecor(r: Reader, raw: unknown, where: string, bounds: { w: number; h: number }): DecorDef | null {
  if (!isDict(raw)) {
    r.problems.push(`${where} must be an object`);
    return null;
  }
  const decor: DecorDef = {
    kind: r.str(raw, 'kind', where, 40),
    x: r.num(raw, 'x', where, -40, bounds.w + 40),
  };
  const y = r.num(raw, 'y', where, -5, bounds.h, 0);
  if (y !== 0) decor.y = y;
  const scale = r.num(raw, 'scale', where, 0.2, 4, 1);
  if (scale !== 1) decor.scale = scale;
  if (raw.flip === true) decor.flip = true;
  if (raw.layer === 'front') decor.layer = 'front';
  return decor;
}

function readJoint(r: Reader, raw: unknown, where: string, blockCount: number): JointDef | null {
  if (!isDict(raw)) {
    r.problems.push(`${where} must be an object`);
    return null;
  }
  const joint: JointDef = {
    kind: r.oneOf<JointDef['kind']>(raw, 'kind', where, ['rope', 'pin']),
    a: Math.round(r.num(raw, 'a', where, 0, Math.max(0, blockCount - 1))),
    ax: r.num(raw, 'ax', where, -40, 200),
    ay: r.num(raw, 'ay', where, -5, 80),
  };
  if (raw.b !== undefined) {
    joint.b = Math.round(r.num(raw, 'b', where, 0, Math.max(0, blockCount - 1)));
    if (joint.b === joint.a) r.problems.push(`${where} must connect two different blocks`);
  }
  if (raw.bx !== undefined || raw.by !== undefined) {
    joint.bx = r.num(raw, 'bx', where, -40, 200);
    joint.by = r.num(raw, 'by', where, -5, 80);
  }
  if (joint.kind === 'rope' && joint.bx === undefined) r.problems.push(`${where} (rope) needs bx/by`);
  if (raw.strength !== undefined) joint.strength = r.num(raw, 'strength', where, 1, 1e6);
  return joint;
}

/** Validates arbitrary data and returns a clean LevelDef. Throws LevelFormatError listing every problem. */
export function normalizeLevel(input: unknown): LevelDef {
  if (!isDict(input)) throw new LevelFormatError(['level must be an object']);
  const r = new Reader();

  const worldRaw = isDict(input.world) ? input.world : {};
  if (!isDict(input.world)) r.problems.push('level.world must be an object');
  const world = {
    width: r.num(worldRaw, 'width', 'world', LEVEL_LIMITS.minWidth, LEVEL_LIMITS.maxWidth),
    height: r.num(worldRaw, 'height', 'world', LEVEL_LIMITS.minHeight, LEVEL_LIMITS.maxHeight),
  };
  const bounds = { w: world.width, h: world.height };

  const slingRaw = isDict(input.slingshot) ? input.slingshot : {};
  if (!isDict(input.slingshot)) r.problems.push('level.slingshot must be an object');
  const slingshot = {
    x: r.num(slingRaw, 'x', 'slingshot', 2, world.width - 6),
    y: r.num(slingRaw, 'y', 'slingshot', 0, world.height - 6, 0),
  };

  const birds: BirdType[] = [];
  for (const [i, bird] of r.list(input, 'birds', 'level', LEVEL_LIMITS.maxBirds, true).entries()) {
    if (typeof bird === 'string' && (BIRD_TYPES as readonly string[]).includes(bird)) birds.push(bird as BirdType);
    else r.problems.push(`birds[${i}] must be one of ${BIRD_TYPES.join(', ')}`);
  }
  if (birds.length === 0) r.problems.push('level needs at least one bird');

  const blocks: BlockDef[] = [];
  for (const [i, raw] of r.list(input, 'blocks', 'level', LEVEL_LIMITS.maxBlocks, false).entries()) {
    const block = readBlock(r, raw, `blocks[${i}]`, bounds);
    if (block) blocks.push(block);
  }
  const pigs: PigDef[] = [];
  for (const [i, raw] of r.list(input, 'pigs', 'level', LEVEL_LIMITS.maxPigs, true).entries()) {
    const pig = readPig(r, raw, `pigs[${i}]`, bounds);
    if (pig) pigs.push(pig);
  }
  if (pigs.length === 0) r.problems.push('level needs at least one pig');

  const terrain: TerrainDef[] = [];
  for (const [i, raw] of r.list(input, 'terrain', 'level', LEVEL_LIMITS.maxTerrain, false).entries()) {
    const piece = readTerrain(r, raw, `terrain[${i}]`, bounds);
    if (piece) terrain.push(piece);
  }
  const decor: DecorDef[] = [];
  for (const [i, raw] of r.list(input, 'decor', 'level', LEVEL_LIMITS.maxDecor, false).entries()) {
    const item = readDecor(r, raw, `decor[${i}]`, bounds);
    if (item) decor.push(item);
  }

  const joints: JointDef[] = [];
  for (const [i, raw] of r.list(input, 'joints', 'level', LEVEL_LIMITS.maxJoints, false).entries()) {
    const joint = readJoint(r, raw, `joints[${i}]`, blocks.length);
    if (joint) joints.push(joint);
  }

  const starsRaw = isDict(input.stars) ? input.stars : {};
  const two = Math.round(r.num(starsRaw, 'two', 'stars', 0, 1e7, 0));
  const three = Math.round(r.num(starsRaw, 'three', 'stars', 0, 1e7, 0));
  if (three < two) r.problems.push('stars.three must not be lower than stars.two');

  const level: LevelDef = {
    id: r.str(input, 'id', 'level', 40, 'custom'),
    name: r.str(input, 'name', 'level', 60, 'Untitled'),
    theme: r.oneOf<ThemeId>(input, 'theme', 'level', THEME_IDS),
    birds,
    world,
    slingshot,
    blocks,
    pigs,
    terrain,
    stars: { two, three },
  };
  if (decor.length > 0) level.decor = decor;
  if (joints.length > 0) level.joints = joints;
  if (typeof input.hint === 'string' && input.hint.length > 0) level.hint = input.hint.slice(0, 160);

  if (r.problems.length > 0) throw new LevelFormatError(r.problems);
  return level;
}

/** Parses level JSON text. Throws LevelFormatError for malformed JSON as well as invalid content. */
export function parseLevel(json: string): LevelDef {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    throw new LevelFormatError([`not valid JSON (${error instanceof Error ? error.message : 'parse error'})`]);
  }
  return normalizeLevel(data);
}

/** Stable, human-readable JSON for exporting a level. */
export function serializeLevel(level: LevelDef): string {
  return JSON.stringify(normalizeLevel(level), null, 2);
}

export function cloneLevel(level: LevelDef): LevelDef {
  return JSON.parse(JSON.stringify(level)) as LevelDef;
}
