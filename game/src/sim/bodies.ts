/** Physics body factory: turns level data into Planck bodies with the right shapes, mass and collision filters. */
import { CircleShape, PolygonShape, type Body, type World } from 'planck';
import { BIRD_GROUP, BIRDS, CATEGORY, DAMAGE, MATERIALS, PHYSICS, FOE_PHYSICS, FOES, TERRAIN, WORLD } from '../core/config';
import { DEG } from '../core/math';
import type { BlockDef, LevelDef, FoeDef } from '../core/types';
import type { BirdEntity, BlockEntity, FoeEntity, ProjectileType, SurfaceTag, TerrainEntity } from './entities';
import { blockArea, blockOutline, insetPolygon, polygonArea, terrainOutline, type Point } from './geometry';

function toVertices(points: Point[]): { x: number; y: number }[] {
  return points.map(([x, y]) => ({ x, y }));
}

function massProps(body: Body): { invMass: number; invInertia: number } {
  const mass = body.getMass();
  if (mass <= 0) return { invMass: 0, invInertia: 0 };
  const lc = body.getLocalCenter();
  const aboutCentre = body.getInertia() - mass * (lc.x * lc.x + lc.y * lc.y);
  return { invMass: 1 / mass, invInertia: aboutCentre > 0 ? 1 / aboutCentre : 0 };
}

/** One static compound body for the ground slab and every terrain piece of the level. */
export function createTerrain(world: World, level: LevelDef, id: number): TerrainEntity {
  const body = world.createBody({ type: 'static', position: { x: 0, y: 0 } });
  const entity: TerrainEntity = { id, kind: 'terrain', body, alive: true, invMass: 0, invInertia: 0, boundRadius: 0 };
  body.setUserData(entity);
  const options = {
    friction: WORLD.groundFriction,
    restitution: WORLD.groundRestitution,
    filterCategoryBits: CATEGORY.terrain,
  };
  const x0 = -WORLD.groundMargin;
  const x1 = level.world.width + WORLD.groundMargin;
  const ground: Point[] = [
    [x0, -WORLD.groundDepth],
    [x1, -WORLD.groundDepth],
    [x1, 0],
    [x0, 0],
  ];
  body.createFixture({ shape: new PolygonShape(toVertices(insetPolygon(ground, PHYSICS.polygonInset))), ...options });
  for (const piece of level.terrain) {
    const shape = new PolygonShape(toVertices(insetPolygon(terrainOutline(piece), PHYSICS.polygonInset)));
    if (!piece.surface) {
      body.createFixture({ shape, ...options });
      continue;
    }
    const tag: SurfaceTag = { surface: piece.surface, speed: piece.surface === 'conveyor' ? (piece.speed ?? 2) : 0 };
    body.createFixture({ shape, ...options, ...TERRAIN[piece.surface], userData: tag });
  }
  return entity;
}

function baseEntity(id: number, body: Body, boundRadius: number) {
  const p = body.getPosition();
  const angle = body.getAngle();
  return {
    id,
    body,
    alive: true,
    x: p.x,
    y: p.y,
    angle,
    px: p.x,
    py: p.y,
    pangle: angle,
    vx: 0,
    vy: 0,
    ...massProps(body),
    boundRadius,
    hitTick: -1,
  };
}

export function blockMaxHp(def: Pick<BlockDef, 'shape' | 'material' | 'w' | 'h'>): number {
  const area = blockArea(def.shape, def.w, def.h);
  return MATERIALS[def.material].hpBase * Math.pow(area / DAMAGE.hpAreaRef, DAMAGE.hpAreaExponent);
}

export function createBlock(world: World, def: BlockDef, id: number): BlockEntity {
  const material = MATERIALS[def.material];
  const isRound = def.shape === 'circle';
  const body = world.createBody({
    type: 'dynamic',
    position: { x: def.x, y: def.y },
    angle: (def.angle ?? 0) * DEG,
    // Round pieces would otherwise roll forever on flat ground.
    angularDamping: isRound ? 0.5 : 0.05,
  });
  const nominalArea = blockArea(def.shape, def.w, def.h);
  const outline = blockOutline(def.shape, def.w, def.h, def.flip);
  const options = {
    friction: material.friction,
    restitution: material.restitution,
    filterCategoryBits: CATEGORY.block,
  };
  if (outline) {
    const inset = insetPolygon(outline, PHYSICS.polygonInset);
    // Keep the nominal mass although the collision polygon is slightly smaller.
    const density = (material.density * nominalArea) / polygonArea(inset);
    body.createFixture({ shape: new PolygonShape(toVertices(inset)), density, ...options });
  } else {
    body.createFixture({ shape: new CircleShape(def.w / 2 + PHYSICS.circleOutset), density: material.density, ...options });
  }
  const maxHp = blockMaxHp(def);
  const entity: BlockEntity = {
    ...baseEntity(id, body, isRound ? def.w / 2 : Math.hypot(def.w, def.h) / 2),
    kind: 'block',
    shape: def.shape,
    material: def.material,
    w: def.w,
    h: isRound ? def.w : def.h,
    flip: def.flip === true,
    outline,
    hp: maxHp,
    maxHp,
    stage: 0,
    seed: Math.imul(id, 2654435761) >>> 0,
    scoreBank: 0,
    frozen: false,
    shockTick: -1,
    motorized: false,
  };
  body.setUserData(entity);
  return entity;
}

export function createFoe(world: World, def: FoeDef, id: number): FoeEntity {
  const config = FOES[def.variant];
  const body = world.createBody({
    type: 'dynamic',
    position: { x: def.x, y: def.y },
    angularDamping: FOE_PHYSICS.angularDamping,
    // A balloonist hangs in the air: its balloon carries the weight until it pops.
    gravityScale: def.variant === 'floater' ? 0 : 1,
    linearDamping: def.variant === 'floater' ? 0.4 : 0,
  });
  body.createFixture({
    shape: new CircleShape(config.radius + PHYSICS.circleOutset),
    density: config.density,
    friction: FOE_PHYSICS.friction,
    restitution: FOE_PHYSICS.restitution,
    filterCategoryBits: CATEGORY.foe,
  });
  const entity: FoeEntity = {
    ...baseEntity(id, body, config.radius),
    kind: 'foe',
    variant: def.variant,
    radius: config.radius,
    hp: config.hp,
    maxHp: config.hp,
    armor: config.armor,
    maxArmor: config.armor,
    scoreBank: 0,
    frozen: false,
    shockTick: -1,
    floating: def.variant === 'floater',
    homeX: def.x,
    homeY: def.y,
    patrol: def.variant === 'floater' ? (def.patrol ?? 0) : 0,
  };
  body.setUserData(entity);
  return entity;
}

export interface ProjectileSpawn {
  type: ProjectileType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tick: number;
  spawned: boolean;
}

export function projectileRadius(type: ProjectileType): number {
  return BIRDS[type].radius;
}

export function createProjectile(world: World, spawn: ProjectileSpawn, id: number): BirdEntity {
  const config = BIRDS[spawn.type];
  const radius = config.radius;
  const body = world.createBody({
    type: 'dynamic',
    position: { x: spawn.x, y: spawn.y },
    angle: Math.atan2(spawn.vy, spawn.vx),
    linearVelocity: { x: spawn.vx, y: spawn.vy },
    // Continuous collision detection: fast projectiles never tunnel through thin planks.
    bullet: true,
  });
  body.createFixture({
    shape: new CircleShape(radius + PHYSICS.circleOutset),
    density: config.density,
    friction: config.friction,
    restitution: config.restitution,
    filterCategoryBits: CATEGORY.bird,
    filterGroupIndex: BIRD_GROUP,
  });
  const entity: BirdEntity = {
    ...baseEntity(id, body, radius),
    vx: spawn.vx,
    vy: spawn.vy,
    kind: 'bird',
    type: spawn.type,
    radius,
    launchTick: spawn.tick,
    impacted: false,
    impactTick: -1,
    impactSpeed: 0,
    abilityUsed: false,
    abilityTick: -1,
    restTicks: 0,
    fuseEndTick: -1,
    spawned: spawn.spawned,
    bounces: 0,
    slamming: false,
    wellEndTick: -1,
    pendingAbility: false,
  };
  body.setUserData(entity);
  return entity;
}

/** Recomputes cached mass data after a fixture's density changed. */
export function refreshMass(entity: BirdEntity | BlockEntity | FoeEntity): void {
  entity.body.resetMassData();
  const props = massProps(entity.body);
  entity.invMass = props.invMass;
  entity.invInertia = props.invInertia;
}
