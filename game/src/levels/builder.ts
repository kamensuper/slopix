/**
 * Fluent helper for hand-authoring levels.
 *
 * Most pieces are placed by their BOTTOM CENTRE and return the y of their top, which makes stacking
 * read naturally:
 *
 *   let top = b.post('wood', 20, 0, 2);      // vertical beam standing on the ground
 *   b.post('wood', 22, 0, 2);
 *   top = b.plank('wood', 21, top, 2.5);     // lintel resting on both posts
 *   b.foe('small', 21, 0);                   // foe sheltering underneath
 */
import { FOES } from '../core/config';
import type {
  BirdType,
  BlockDef,
  BlockMaterial,
  BlockShape,
  DecorDef,
  JointDef,
  LevelDef,
  LevelEnv,
  TerrainSurface,
  FoeDef,
  FoeVariant,
  TerrainDef,
  ThemeId,
} from '../core/types';
import { normalizeLevel } from './schema';

export class LevelBuilder {
  private readonly blocks: BlockDef[] = [];
  private readonly foes: FoeDef[] = [];
  private readonly terrain: TerrainDef[] = [];
  private readonly decorItems: DecorDef[] = [];
  private readonly jointList: JointDef[] = [];
  private width = 44;
  private height = 24;
  private slingX = 6;
  private slingY = 0;
  private starTwo = 0;
  private starThree = 0;
  private hintText = '';
  private envDef: LevelEnv = {};

  constructor(
    readonly id: string,
    readonly name: string,
    readonly theme: ThemeId,
    readonly birds: BirdType[],
  ) {}

  /** Playable extent in metres (default 44 x 24). */
  size(width: number, height: number): this {
    this.width = width;
    this.height = height;
    return this;
  }

  /** Slingshot base position (default x = 6 on the ground). */
  sling(x: number, y = 0): this {
    this.slingX = x;
    this.slingY = y;
    return this;
  }

  /** Steady wind: acceleration on flying birds in m/s^2, positive blows to the right. */
  wind(acceleration: number): this {
    this.envDef.wind = acceleration;
    return this;
  }

  /** Gravity multiplier (1 = normal). */
  gravity(scale: number): this {
    this.envDef.gravity = scale;
    return this;
  }

  hint(text: string): this {
    this.hintText = text;
    return this;
  }

  stars(two: number, three: number): this {
    this.starTwo = two;
    this.starThree = three;
    return this;
  }

  /** Any block, placed by the CENTRE of its bounding box. `angle` in degrees, counter-clockwise. */
  block(material: BlockMaterial, shape: BlockShape, x: number, y: number, w: number, h: number, angle = 0, flip = false): this {
    const def: BlockDef = { shape, material, x, y, w, h: shape === 'circle' ? w : h };
    if (angle !== 0) def.angle = angle;
    if (flip) def.flip = true;
    this.blocks.push(def);
    return this;
  }

  /** Box with its bottom centre at (cx, bottom). Returns the y of its top. */
  rect(material: BlockMaterial, cx: number, bottom: number, w: number, h: number): number {
    this.block(material, 'rect', cx, bottom + h / 2, w, h);
    return bottom + h;
  }

  /** Vertical beam. Returns the y of its top. */
  post(material: BlockMaterial, cx: number, bottom: number, height: number, thickness = 0.25): number {
    return this.rect(material, cx, bottom, thickness, height);
  }

  /** Horizontal beam. Returns the y of its top. */
  plank(material: BlockMaterial, cx: number, bottom: number, length: number, thickness = 0.25): number {
    return this.rect(material, cx, bottom, length, thickness);
  }

  /** Roof piece: isosceles triangle, base down. Returns the y of its apex. */
  tri(material: BlockMaterial, cx: number, bottom: number, w: number, h: number): number {
    this.block(material, 'tri', cx, bottom + h / 2, w, h);
    return bottom + h;
  }

  /** Right triangle with the vertical side on the left (on the right when `flip`). Returns the y of its top. */
  wedge(material: BlockMaterial, cx: number, bottom: number, w: number, h: number, flip = false): number {
    this.block(material, 'wedge', cx, bottom + h / 2, w, h, 0, flip);
    return bottom + h;
  }

  /** Ball resting at (cx, bottom). Returns the y of its top. */
  ball(material: BlockMaterial, cx: number, bottom: number, diameter: number): number {
    this.block(material, 'circle', cx, bottom + diameter / 2, diameter, diameter);
    return bottom + diameter;
  }

  /** Explosive crate. Returns the y of its top. */
  tnt(cx: number, bottom: number, size = 0.8): number {
    return this.rect('tnt', cx, bottom, size, size);
  }

  /** Foe resting at (cx, bottom). Returns the y of its top. */
  foe(variant: FoeVariant, cx: number, bottom: number): number {
    const radius = FOES[variant].radius;
    this.foes.push({ variant, x: cx, y: bottom + radius });
    return bottom + radius * 2;
  }

  /** Balloonist hovering with its centre at (cx, cy); `patrol` metres of sideways drift make it a moving target. */
  balloon(cx: number, cy: number, patrol = 0): this {
    const def: FoeDef = { variant: 'floater', x: cx, y: cy };
    if (patrol !== 0) def.patrol = patrol;
    this.foes.push(def);
    return this;
  }

  /** Static, indestructible platform with its bottom centre at (cx, bottom). Returns the y of its top. */
  ledge(cx: number, bottom: number, w: number, h: number, surface?: TerrainSurface, speed?: number): number {
    const piece: TerrainDef = { shape: 'rect', x: cx, y: bottom + h / 2, w, h };
    if (surface) piece.surface = surface;
    if (surface === 'conveyor') piece.speed = speed ?? 2;
    this.terrain.push(piece);
    return bottom + h;
  }

  /** Static slab centred at (cx, cy), tilted by `angle` degrees (ramps, slides). */
  ramp(cx: number, cy: number, w: number, h: number, angle: number, surface?: TerrainSurface): this {
    const piece: TerrainDef = { shape: 'rect', x: cx, y: cy, w, h, angle };
    if (surface) piece.surface = surface;
    this.terrain.push(piece);
    return this;
  }

  /** Static convex terrain polygon: counter-clockwise points relative to (x, y). */
  poly(x: number, y: number, points: [number, number][]): this {
    this.terrain.push({ shape: 'poly', x, y, points });
    return this;
  }

  /** Index of the most recently added block (for joints). */
  get last(): number {
    return this.blocks.length - 1;
  }

  /**
   * Rope from block `a` at (ax, ay) to block `b` at (bx, by), or to a fixed hook when `b` is null.
   * Its length is the distance between the anchors.
   */
  rope(a: number, ax: number, ay: number, b: number | null, bx: number, by: number, strength?: number): this {
    const joint: JointDef = { kind: 'rope', a, ax, ay, bx, by };
    if (b !== null) joint.b = b;
    if (strength !== undefined) joint.strength = strength;
    this.jointList.push(joint);
    return this;
  }

  /** Hinge between block `a` and block `b` (or the world when `b` is null) at (x, y). */
  pin(a: number, x: number, y: number, b: number | null = null, strength?: number): this {
    const joint: JointDef = { kind: 'pin', a, ax: x, ay: y };
    if (b !== null) joint.b = b;
    if (strength !== undefined) joint.strength = strength;
    this.jointList.push(joint);
    return this;
  }

  /** Driven hinge: block `a` turns about (x, y) at `degPerSecond` (counter-clockwise positive). */
  motor(a: number, x: number, y: number, degPerSecond: number): this {
    this.jointList.push({ kind: 'pin', a, ax: x, ay: y, motor: degPerSecond });
    return this;
  }

  /** Block hanging from a fixed hook straight above its centre. Returns the block index. */
  hang(material: BlockMaterial, shape: BlockShape, cx: number, cy: number, w: number, h: number, hookY: number, strength?: number): number {
    this.block(material, shape, cx, cy, w, h);
    const index = this.last;
    const top = cy + (shape === 'circle' ? w : h) / 2;
    this.rope(index, cx, top - 0.05, null, cx, hookY, strength);
    return index;
  }

  /** Non-colliding scenery standing on the ground (or at height `y`). */
  decor(kind: string, x: number, options: { y?: number; scale?: number; flip?: boolean; front?: boolean } = {}): this {
    const item: DecorDef = { kind, x };
    if (options.y) item.y = options.y;
    if (options.scale && options.scale !== 1) item.scale = options.scale;
    if (options.flip) item.flip = true;
    if (options.front) item.layer = 'front';
    this.decorItems.push(item);
    return this;
  }

  build(): LevelDef {
    return normalizeLevel({
      id: this.id,
      name: this.name,
      theme: this.theme,
      birds: this.birds,
      world: { width: this.width, height: this.height },
      slingshot: { x: this.slingX, y: this.slingY },
      blocks: this.blocks,
      foes: this.foes,
      terrain: this.terrain,
      decor: this.decorItems,
      joints: this.jointList,
      env: this.envDef,
      stars: { two: this.starTwo, three: this.starThree },
      hint: this.hintText,
    });
  }
}
