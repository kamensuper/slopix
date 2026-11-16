/**
 * The featured campaign: ten hand-composed levels across three worlds. Each one is built around a
 * single physical idea (a weak support, a swinging load, a counterweight, a chain reaction ...)
 * that the player can read from the composition, with room for other approaches.
 */
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';
import { hut } from './kit';

// ---------------------------------------------------------------- World 1: The Sunlit Wildlands

/** 1-1: A treehouse on tall stilts. Hit the foe directly, or kick out a stilt and let it fall. */
function treehouse(): LevelDef {
  const b = new LevelBuilder('1-1', 'Treehouse Tumble', 'grasslands', ['pip', 'pip', 'pip']);
  b.size(44, 22).hint('Drag the bird back, aim and let go!');
  b.decor('tree_oak', 27, { scale: 1.1 });
  b.decor('bush', 19).decor('flowers', 22).decor('grass_tuft', 31).decor('mushroom', 33.5);
  b.decor('fence', 36).decor('flowers', 13).decor('grass_tuft', 10, { front: true });
  b.post('wood', 24.6, 0, 3, 0.3);
  b.post('wood', 28.4, 0, 3, 0.3);
  const deck = b.plank('wood', 26.5, 3, 4.6, 0.3);
  hut(b, 26.5, deck, { w: 2.4, h: 1.6, foe: 'medium', roof: 'wood' });
  b.foe('small', 26.5, 0);
  return b.stars(17000, 26000).build();
}

/** 1-2: A foe on a swing hanging from a wooden frame. Snap the ropes or topple the frame. */
function swingSet(): LevelDef {
  const b = new LevelBuilder('1-2', 'Swing Set', 'grasslands', ['pip', 'zip', 'pip']);
  b.size(46, 22).hint('Zip: tap while flying to dash!');
  b.decor('tree_birch', 22).decor('tree_oak', 38, { scale: 0.9 }).decor('rock_mossy', 34.5);
  b.decor('flowers', 25).decor('grass_tuft', 30).decor('bush', 41).decor('grass_tuft', 12, { front: true });
  // Frame: two tall posts and a crossbar.
  b.post('wood', 25, 0, 5, 0.35);
  b.post('wood', 31, 0, 5, 0.35);
  b.plank('wood', 28, 5, 6.8, 0.35);
  const bar = b.last;
  // The swing seat hangs from the crossbar.
  b.block('wood', 'rect', 28, 2.0, 2.2, 0.25);
  const seat = b.last;
  b.foe('medium', 28, 2.125);
  b.rope(seat, 27.0, 2.1, bar, 27.0, 4.82, 60);
  b.rope(seat, 29.0, 2.1, bar, 29.0, 4.82, 60);
  // A little shed beside the frame.
  hut(b, 34.6, 0, { w: 2, h: 1.4, foe: 'small', roof: 'wood' });
  return b.stars(16000, 25000).build();
}

/** 1-3: A glass greenhouse on a hill, with a boulder waiting behind a glass chock at the top. */
function greenhouseHill(): LevelDef {
  const b = new LevelBuilder('1-3', 'Boulder Hill', 'grasslands', ['sprig', 'pip', 'sprig']);
  b.size(50, 24).hint('The Sprigs: tap to split into three. Glass hates them.');
  b.decor('tree_oak', 40, { scale: 0.85 }).decor('bush', 22).decor('flowers', 34).decor('rock_mossy', 44);
  b.decor('grass_tuft', 26).decor('mushroom', 37.5).decor('grass_tuft', 14, { front: true });
  b.poly(30, 0, [[-6, 0], [6, 0], [3.5, 3.2], [-3.5, 3.2]]);
  const top = 3.2;
  // Greenhouse on the hill.
  hut(b, 28.2, top, { w: 2.6, h: 1.8, mat: 'glass', top: 'glass', foe: 'small', roof: 'glass' });
  // Boulder resting against a glass chock, rolls down the right slope onto the shed when freed.
  b.ball('stone', 31.9, top, 1.2);
  b.rect('glass', 32.9, top, 0.3, 0.7);
  hut(b, 38.6, 0, { w: 2.6, h: 2, foe: 'medium' });
  return b.stars(16000, 24000).build();
}

// ---------------------------------------------------------------- World 2: The Golden Badlands

/** 2-1: A monumental stone gate with TNT at the foot of its columns. Blow it and the lintel falls. */
function sandstoneGate(): LevelDef {
  const b = new LevelBuilder('2-1', 'The Sandstone Gate', 'desert', ['ember', 'zip', 'pip']);
  b.size(52, 26).hint('Ember: tap to burst, or wait for the fuse. The crates do the rest.');
  b.decor('ruin_column', 20, { scale: 0.9 }).decor('palm', 41).decor('cactus', 17).decor('rock_sandstone', 45);
  b.decor('dune_grass', 24).decor('bones', 37).decor('dune_grass', 11, { front: true });
  b.rect('stone', 26, 0, 0.9, 4);
  b.rect('stone', 32, 0, 0.9, 4);
  b.plank('stone', 29, 4, 7.2, 0.7);
  b.tri('stone', 29, 4.7, 3, 1.2);
  b.tnt(27.1, 0);
  b.tnt(30.9, 0);
  // Foes guarding the gate inside a light wooden shelter.
  hut(b, 29, 0, { w: 2.2, h: 1.6, foe: 'helmet' });
  b.foe('small', 34.5, 0);
  return b.stars(22000, 33000).build();
}

/** 2-2: A seesaw on a rock: free the stone counterweight and the far end catapults its foe. */
function counterweight(): LevelDef {
  const b = new LevelBuilder('2-2', 'Counterweight', 'desert', ['pip', 'sprig', 'zip']);
  b.size(52, 24).hint('Find the weak point and let the weight do the work.');
  b.decor('rock_sandstone', 21).decor('cactus', 40).decor('ruin_column', 44, { scale: 0.7 }).decor('dune_grass', 33);
  b.decor('bones', 25).decor('dune_grass', 12, { front: true });
  const pivot = b.ledge(30, 0, 1.2, 2);
  // Seesaw beam pinned to the rock.
  b.block('wood', 'rect', 30, pivot + 0.15, 8, 0.3);
  const beam = b.last;
  b.pin(beam, 30, pivot + 0.15);
  // Left end: heavy stone counterweight held up by a glass prop.
  b.rect('glass', 26.6, 0, 0.3, pivot);
  b.rect('stone', 26.6, pivot + 0.3, 1.1, 1.1);
  // Right end: wooden prop and a foe standing on the beam, under a stone overhang.
  b.post('wood', 33.4, 0, pivot, 0.3);
  b.foe('medium', 33.2, pivot + 0.3);
  b.ledge(36, 4.6, 3, 0.6);
  b.foe('small', 36.5, 5.2);
  b.foe('small', 37.5, 0);
  return b.stars(20000, 30000).build();
}

/** 2-3: Ancient ruins stepping up a cliff, linked by a fuse line of TNT crates. */
function ruins(): LevelDef {
  const b = new LevelBuilder('2-3', 'Ruins of Ashkar', 'desert', ['brawn', 'ember', 'sprig', 'zip']);
  b.size(58, 28).hint('Brawn: tap above a target to slam straight down.');
  b.decor('ruin_arch', 44, { scale: 0.9 }).decor('palm', 21).decor('cactus', 50).decor('ruin_column', 24, { scale: 0.8 });
  b.decor('rock_sandstone', 53).decor('dune_grass', 30).decor('dune_grass', 12, { front: true });
  const step1 = b.ledge(30, 0, 5, 1.6);
  const step2 = b.ledge(36, 0, 5, 3.4);
  const step3 = b.ledge(42, 0, 5, 5.2);
  hut(b, 30, step1, { w: 2.6, h: 1.8, mat: 'stone', top: 'wood', foe: 'small', thick: 0.4 });
  b.tnt(32.2, step1);
  hut(b, 36, step2, { w: 2.6, h: 1.8, mat: 'glass', top: 'stone', foe: 'helmet' });
  b.tnt(38.2, step2);
  hut(b, 42, step3, { w: 2.8, h: 2, mat: 'wood', top: 'stone', foe: 'medium', roof: 'stone' });
  b.foe('small', 44, step3);
  return b.stars(30000, 45000).build();
}

// ---------------------------------------------------------------- World 3: The Frostbound Heights

/** 3-1: A metal-roofed shelter on wooden legs: the steel is tough, the legs are not. */
function ironRoof(): LevelDef {
  const b = new LevelBuilder('3-1', 'Iron Roof', 'snowlands', ['zip', 'pip', 'ember']);
  b.size(50, 26).hint('Metal shrugs off hits. What is holding it up?');
  b.decor('pine_snow', 21).decor('pine_snow', 40, { scale: 0.85 }).decor('lantern', 25).decor('snow_rock', 36.5);
  b.decor('frozen_bush', 43).decor('snowman', 17).decor('ice_crystal', 12, { front: true });
  b.post('wood', 26, 0, 2.6, 0.3);
  b.post('wood', 29, 0, 2.6, 0.3);
  b.post('wood', 32, 0, 2.6, 0.3);
  b.foe('small', 27.5, 0);
  b.foe('helmet', 30.5, 0);
  const roof = b.plank('metal', 29, 2.6, 7, 0.4);
  b.rect('metal', 27.2, roof, 0.9, 0.9);
  b.rect('metal', 30.8, roof, 0.9, 0.9);
  return b.stars(18000, 27000).build();
}

/** 3-2: Boulders on a high ice shelf above a hamlet, held back by glass. */
function avalanche(): LevelDef {
  const b = new LevelBuilder('3-2', 'Avalanche', 'snowlands', ['sprig', 'pip', 'zip']);
  b.size(52, 28).hint('Start an avalanche.');
  b.decor('pine_snow', 22, { scale: 1.1 }).decor('ice_crystal', 26.5).decor('lantern', 36).decor('pine_snow', 45);
  b.decor('frozen_bush', 40).decor('snow_rock', 48).decor('ice_crystal', 13, { front: true });
  const shelf = b.ledge(27, 0, 4, 5);
  b.ball('stone', 26.4, shelf, 1.2);
  b.ball('stone', 27.7, shelf, 1);
  b.rect('glass', 28.6, shelf, 0.3, 0.7);
  hut(b, 31.2, 0, { w: 2.4, mat: 'glass', top: 'wood', foe: 'helmet' });
  hut(b, 34.4, 0, { w: 2.4, foe: 'small', roof: 'wood' });
  return b.stars(11000, 17000).build();
}

/** 3-3: A rope bridge between two ice cliffs, its deck loaded with foes over the frozen lake. */
function iceBridge(): LevelDef {
  const b = new LevelBuilder('3-3', 'The Ice Bridge', 'snowlands', ['zip', 'sprig', 'pip', 'brawn']);
  b.size(56, 28).hint('Ropes snap under a heavy blow.');
  b.decor('pine_snow', 23).decor('pine_snow', 42).decor('lantern', 27.3, { y: 4 }).decor('lantern', 38.7, { y: 4 });
  b.decor('snow_rock', 47).decor('frozen_bush', 20).decor('ice_crystal', 12, { front: true });
  const h = b.ledge(26, 0, 3, 4);
  b.ledge(40, 0, 3, 4);
  // One long deck plank slung between the cliff tops.
  const y = 3.0;
  b.block('wood', 'rect', 33, y, 7.6, 0.3);
  const deck = b.last;
  b.rope(deck, 29.3, y, null, 27.4, h, 400);
  b.rope(deck, 36.7, y, null, 38.6, h, 400);
  b.foe('small', 30.5, y + 0.15);
  b.foe('medium', 33, y + 0.15);
  b.foe('small', 35.5, y + 0.15);
  // A guard on each cliff.
  hut(b, 26, h, { w: 2, h: 1.4, mat: 'glass', top: 'wood', foe: 'small' });
  hut(b, 40.2, h, { w: 2, h: 1.4, foe: 'helmet' });
  return b.stars(30000, 45000).build();
}

/** 3-4: The Baron's mountain keep: metal, stone, glass and TNT, with the Baron on top. */
function kingsPeak(): LevelDef {
  const b = new LevelBuilder('3-4', "Baron's Peak", 'snowlands', ['zip', 'sprig', 'ember', 'jolt', 'brawn', 'ember']);
  b.size(64, 32).hint('Jolt: tap near metal. The current reaches whoever touches it.');
  b.decor('pine_snow', 22).decor('pine_snow', 54, { scale: 0.9 }).decor('lantern', 30).decor('lantern', 44);
  b.decor('ice_crystal', 49).decor('snowman', 18).decor('frozen_bush', 58).decor('ice_crystal', 12, { front: true });
  // Outer watchtower of wood and glass.
  hut(b, 26, 0, { w: 2.6, foe: 'small' });
  hut(b, 26, 2.25, { w: 2.6, mat: 'glass', foe: 'small', roof: 'wood' });
  // The keep on a rock plinth.
  const base = b.ledge(37, 0, 10, 1.5);
  b.rect('stone', 33, base, 0.6, 2.6);
  b.rect('metal', 37, base, 0.5, 2.6);
  b.rect('stone', 41, base, 0.6, 2.6);
  b.foe('helmet', 35, base);
  b.foe('armored', 37.88, base);
  const floor = b.plank('stone', 37, base + 2.6, 8.8, 0.5);
  hut(b, 35, floor, { w: 2.6, mat: 'glass', top: 'wood', foe: 'small' });
  hut(b, 39, floor, { w: 2.6, mat: 'wood', top: 'wood', foe: 'king', h: 2.2, roof: 'wood' });
  b.tnt(43.5, 0);
  b.tnt(43.5, 0.8);
  // Rear bastion.
  hut(b, 48, 0, { w: 2.6, mat: 'wood', top: 'metal', foe: 'medium', thick: 0.3 });
  return b.stars(42000, 63000).build();
}

export interface FeaturedChapter {
  id: string;
  title: string;
  subtitle: string;
  levels: LevelDef[];
}

export const FEATURED: FeaturedChapter[] = [
  { id: '1', title: 'The Sunlit Wildlands', subtitle: 'Wobbly treehouses and rolling boulders', levels: [treehouse(), swingSet(), greenhouseHill()] },
  { id: '2', title: 'The Golden Badlands', subtitle: 'Ancient stone, TNT and clever weights', levels: [sandstoneGate(), counterweight(), ruins()] },
  { id: '3', title: 'The Frostbound Heights', subtitle: 'Iron, ice and the King on his peak', levels: [ironRoof(), avalanche(), iceBridge(), kingsPeak()] },
];
