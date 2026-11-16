/**
 * World 4, the Stormbound Isles: wind that bends every flight, islands that hang in the air,
 * balloonists out of reach of any collapse, and Jolt, whose lightning runs through metal.
 */
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';
import { hut, tower } from './kit';

const T = 'storm';

/** 4-1: a steady headwind. The preview shows the bent path; the lesson is to trust it. */
function headwind(): LevelDef {
  const b = new LevelBuilder('4-1', 'Headwind', T, ['pip', 'pip', 'pip']);
  b.size(50, 26).wind(-3).hint('The wind pushes birds back. The dotted line already knows.');
  b.decor('wind_tree', 19).decor('windsock', 23).decor('basalt', 38).decor('sea_grass', 42).decor('sea_grass', 12, { front: true });
  hut(b, 27.5, 0, { w: 2.6, foe: 'medium', roof: 'wood' });
  tower(b, 32.5, 0, [{ w: 2.6, mat: 'glass', top: 'wood', foe: 'small' }, { w: 2.6, foe: 'small' }], 'wood');
  return b.stars(17000, 26000).build();
}

/** 4-2: a far island that only a tailwind reaches. */
function tailwind(): LevelDef {
  const b = new LevelBuilder('4-2', 'Tailwind Express', T, ['pip', 'zip', 'pip']);
  b.size(72, 30).wind(4).hint('A tailwind carries a bird far past its usual reach.');
  b.decor('windsock', 20).decor('wind_tree', 30).decor('beacon', 66).decor('basalt', 46).decor('sea_grass', 12, { front: true });
  const isle = b.ledge(58, 0, 9, 2);
  hut(b, 56.2, isle, { w: 2.6, foe: 'medium', roof: 'wood' });
  hut(b, 59.8, isle, { w: 2.4, mat: 'glass', top: 'wood', foe: 'small' });
  b.foe('small', 51.4, 0);
  return b.stars(17000, 26000).build();
}

/** 4-3: the first balloonists. They hang clear of everything; only a hit brings them down. */
function upInTheAir(): LevelDef {
  const b = new LevelBuilder('4-3', 'Up in the Air', T, ['pip', 'pip', 'sprig', 'pip']);
  b.size(52, 28).hint('Balloonists float out of reach of a collapse. Any hit pops the balloon.');
  b.decor('wind_tree', 44).decor('lightning_rod', 21).decor('basalt', 47).decor('sea_grass', 31).decor('sea_grass', 12, { front: true });
  b.balloon(25, 6.5).balloon(30, 9.5).balloon(35, 6);
  hut(b, 40, 0, { w: 2.6, foe: 'medium', roof: 'wood' });
  return b.stars(22000, 34000).build();
}

/** 4-4: Jolt. A metal table with a foe on top and a foe leaning on its leg: one bolt reaches both. */
function stormSwallow(): LevelDef {
  const b = new LevelBuilder('4-4', 'Storm Swallow', T, ['jolt', 'pip', 'pip']);
  b.size(50, 26).hint('Jolt: tap near metal. The bolt runs through every piece that touches.');
  b.decor('lightning_rod', 22).decor('wind_tree', 42).decor('basalt', 19).decor('sea_grass', 39.5).decor('sea_grass', 12, { front: true });
  b.rect('metal', 26, 0, 0.4, 2.2);
  b.rect('metal', 32, 0, 0.4, 2.2);
  const top = b.plank('metal', 29, 2.2, 6.8, 0.3);
  b.foe('helmet', 30.6, top);
  b.foe('medium', 26.76, 0);
  b.foe('small', 29, 0);
  hut(b, 36, 0, { w: 2.2, h: 1.6, mat: 'glass', top: 'wood', foe: 'small' });
  return b.stars(21000, 32000).build();
}

/** 4-5: stone bunkers no bird can open, but the foes inside wear metal, and lightning finds metal. */
function lightningRod(): LevelDef {
  const b = new LevelBuilder('4-5', 'Lightning Rod', T, ['jolt', 'jolt', 'pip']);
  b.size(52, 26).hint('Armour draws the bolt from a long way off.');
  b.decor('lightning_rod', 31.6).decor('wind_tree', 46).decor('windsock', 21).decor('sea_grass', 43).decor('sea_grass', 12, { front: true });
  hut(b, 27, 0, { w: 3.2, h: 2.2, mat: 'stone', top: 'stone', foe: 'armored', thick: 0.5 });
  hut(b, 36, 0, { w: 3.2, h: 2.2, mat: 'stone', top: 'stone', foe: 'helmet', thick: 0.5 });
  hut(b, 40.6, 0, { w: 2.2, h: 1.6, mat: 'glass', top: 'wood', foe: 'small' });
  return b.stars(20000, 30000).build();
}

/** 4-6: shelves of rock in the sky and a stone hung under one of them, right above a guard post. */
function skyShelf(): LevelDef {
  const b = new LevelBuilder('4-6', 'Sky Shelf', T, ['pip', 'zip', 'pip', 'pip']);
  b.size(54, 30).hint('A bird that flies through a rope cuts it.');
  b.decor('wind_tree', 44).decor('basalt', 21).decor('beacon', 48).decor('sea_grass', 39).decor('sea_grass', 12, { front: true });
  const low = b.ledge(26, 4, 5, 0.8);
  hut(b, 26, low, { w: 2.6, foe: 'medium', roof: 'wood' });
  const high = b.ledge(35, 8, 6, 0.8);
  hut(b, 36, high, { w: 2.4, h: 1.6, mat: 'glass', top: 'wood', foe: 'small' });
  // The stone hangs from the high shelf over a ground post.
  b.hang('stone', 'rect', 34, 5.4, 1.5, 1.5, 8);
  hut(b, 34, 0, { w: 2.8, h: 2, mat: 'glass', top: 'wood', foe: 'medium' });
  b.foe('small', 37.5, 0);
  return b.stars(24000, 37000).build();
}

/** 4-7: balloons that drift back and forth: moving targets over a ground post. */
function kiteStrings(): LevelDef {
  const b = new LevelBuilder('4-7', 'Kite Strings', T, ['sprig', 'pip', 'pip', 'zip']);
  b.size(54, 30).hint('Some balloons drift. Lead the target, or fan out.');
  b.decor('windsock', 20).decor('wind_tree', 47).decor('lightning_rod', 43).decor('sea_grass', 24).decor('sea_grass', 12, { front: true });
  b.balloon(27, 7, 3).balloon(34, 9.5, 4).balloon(30, 12.5, 2);
  hut(b, 39.5, 0, { w: 2.6, foe: 'medium', roof: 'wood' });
  return b.stars(22000, 34000).build();
}

/** 4-8: a rope bridge between two sky islands in a crosswind, with a long drop underneath. */
function crosswindBridge(): LevelDef {
  const b = new LevelBuilder('4-8', 'Crosswind Bridge', T, ['zip', 'pip', 'ember']);
  b.size(56, 30).wind(-2.5).hint('Cut a rope and the whole deck goes.');
  b.decor('wind_tree', 21).decor('beacon', 47).decor('basalt', 33).decor('sea_grass', 29).decor('sea_grass', 12, { front: true });
  const h = b.ledge(26, 4.2, 3, 0.8);
  b.ledge(40, 4.2, 3, 0.8);
  const y = h - 1;
  b.block('wood', 'rect', 33, y, 7.6, 0.3);
  const deck = b.last;
  b.rope(deck, 29.3, y, null, 27.4, h, 400);
  b.rope(deck, 36.7, y, null, 38.6, h, 400);
  b.foe('small', 30.6, y + 0.15);
  b.foe('medium', 33, y + 0.15);
  b.foe('small', 35.4, y + 0.15);
  hut(b, 40.2, h, { w: 2, h: 1.4, foe: 'medium' });
  return b.stars(24000, 37000).build();
}

/** 4-9: three stone bunkers under one continuous metal rail. One bolt, every bunker. */
function conductor(): LevelDef {
  const b = new LevelBuilder('4-9', 'Conductor', T, ['jolt', 'pip', 'pip']);
  b.size(54, 26).hint('The rail joins all three. Blast crates do not like current either.');
  b.decor('lightning_rod', 21.5).decor('windsock', 45).decor('wind_tree', 48).decor('sea_grass', 43).decor('sea_grass', 12, { front: true });
  for (const c of [26, 31, 36]) {
    b.rect('stone', c - 1.6, 0, 0.5, 2.2);
    b.rect('stone', c + 1.6, 0, 0.5, 2.2);
    b.foe('helmet', c - 0.2, 0);
    b.rect('metal', c + 0.5, 0, 0.3, 2.2);
    b.plank('metal', c, 2.2, 5, 0.3);
  }
  b.tnt(38.1, 2.5);
  hut(b, 40.6, 0, { w: 2.2, h: 1.6, foe: 'small', roof: 'wood' });
  return b.stars(27000, 41000).build();
}

/** 4-10: crystals hung over an open-topped glass pen. Crystal cannot take current; when it breaks, it sings. */
function chandelier(): LevelDef {
  const b = new LevelBuilder('4-10', 'Chandelier', T, ['jolt', 'sprig', 'pip']);
  b.size(52, 30).hint('A shattered crystal sends out a pulse that hurts every foe near it.');
  b.decor('wind_tree', 20).decor('basalt', 40).decor('beacon', 44).decor('sea_grass', 37).decor('sea_grass', 12, { front: true });
  b.ledge(31, 9, 7, 0.8);
  for (const x of [29.4, 31, 32.6]) b.hang('crystal', 'rect', x, 2.4, 0.7, 1, 9);
  b.rect('glass', 28, 0, 0.3, 3);
  b.rect('glass', 34, 0, 0.3, 3);
  b.foe('small', 29.4, 0);
  b.foe('medium', 31, 0);
  b.foe('small', 32.6, 0);
  hut(b, 37, 0, { w: 2.2, h: 1.6, foe: 'small' });
  return b.stars(24000, 37000).build();
}

/** 4-11: everything the isles have taught, in a tailwind: a metal stand, drifting balloons and a glass loft. */
function eyeOfTheStorm(): LevelDef {
  const b = new LevelBuilder('4-11', 'Eye of the Storm', T, ['jolt', 'sprig', 'zip', 'pip']);
  b.size(58, 30).wind(2).hint('Read the wind first.');
  b.decor('windsock', 21).decor('lightning_rod', 45).decor('wind_tree', 50).decor('basalt', 24).decor('sea_grass', 12, { front: true });
  b.rect('metal', 30, 0, 0.4, 2.4);
  b.rect('metal', 35, 0, 0.4, 2.4);
  const deck = b.plank('metal', 32.5, 2.4, 6, 0.3);
  b.foe('armored', 32.5, deck);
  b.foe('medium', 30.76, 0);
  b.foe('small', 33, 0);
  hut(b, 39.5, 0, { w: 2.6, mat: 'glass', top: 'wood', foe: 'small', roof: 'glass' });
  b.balloon(27, 8, 2.5).balloon(37, 9, 3);
  return b.stars(30000, 45000).build();
}

/** 4-12: Thunderhead Keep, a fortress on a sky island with a metal frame, a cage slung beneath it and balloon pickets. */
function thunderheadKeep(): LevelDef {
  const b = new LevelBuilder('4-12', 'Thunderhead Keep', T, ['jolt', 'zip', 'ember', 'sprig', 'brawn', 'pip']);
  b.size(64, 34).wind(-2).hint('The keep is framed in metal. The cage hangs by two ropes.');
  b.decor('wind_tree', 20).decor('beacon', 55).decor('basalt', 26).decor('lightning_rod', 51).decor('windsock', 58).decor('sea_grass', 12, { front: true });
  const isle = b.ledge(37, 5, 15, 1);
  // Gatehouse of wood on the near edge.
  hut(b, 31.4, isle, { w: 2.4, h: 1.8, foe: 'medium', roof: 'wood' });
  // The keep: metal legs and floor, an Ironclad at its foot, the Bruiser in a glass loft on top.
  b.rect('metal', 35, isle, 0.4, 2.6);
  b.rect('metal', 39, isle, 0.4, 2.6);
  b.foe('armored', 35.82, isle);
  b.foe('small', 37.6, isle);
  const floor = b.plank('metal', 37, isle + 2.6, 5, 0.35);
  hut(b, 37, floor, { w: 3, h: 2.2, mat: 'glass', top: 'wood', foe: 'large', roof: 'wood' });
  // Powder store behind it.
  b.tnt(40.6, isle);
  hut(b, 42.8, isle, { w: 2.2, h: 1.6, mat: 'wood', top: 'stone', foe: 'medium', thick: 0.3 });
  // A cage slung under the island.
  b.block('wood', 'rect', 37, 2.2, 4, 0.3);
  const cage = b.last;
  b.rope(cage, 35.2, 2.3, null, 35.2, 5, 500);
  b.rope(cage, 38.8, 2.3, null, 38.8, 5, 500);
  b.foe('small', 36.2, 2.35);
  b.foe('small', 37.8, 2.35);
  b.balloon(28, 9.5, 2).balloon(43.4, 9.4);
  return b.stars(52000, 78000).build();
}

export const STORM: LevelDef[] = [
  headwind(),
  tailwind(),
  upInTheAir(),
  stormSwallow(),
  lightningRod(),
  skyShelf(),
  kiteStrings(),
  crosswindBridge(),
  conductor(),
  chandelier(),
  eyeOfTheStorm(),
  thunderheadKeep(),
];
