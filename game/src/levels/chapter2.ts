/** Chapter 2: Desert. The special birds, TNT and multi-stage puzzles. */
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';
import { hut, tower, wall } from './kit';

const T = 'desert';

/** 2-1: Chuck. A long, low wooden barricade that only a boosted bird punches through. */
function speedTrap(): LevelDef {
  const b = new LevelBuilder('2-1', 'Speed Trap', T, ['zip', 'zip', 'zip']);
  b.size(50, 24).hint('Zip: tap while flying to dash!');
  for (let i = 0; i < 4; i++) hut(b, 24 + i * 3, 0, { w: 2.8, foe: i % 2 === 1 ? 'small' : null });
  b.foe('small', 36.5, 0);
  return b.stars(15000, 22000).build();
}

/** 2-2: The Blues. A greenhouse of glass, three foes in three panes. */
function greenhouse(): LevelDef {
  const b = new LevelBuilder('2-2', 'Greenhouse', T, ['sprig', 'sprig', 'sprig']);
  b.size(48, 24).hint('The Blues: tap to split into three!');
  for (let i = 0; i < 3; i++) tower(b, 25 + i * 2.8, 0, [{ w: 2.6, mat: 'glass', foe: 'small' }, { w: 2.6, mat: 'glass' }]);
  return b.stars(22000, 33000).build();
}

/** 2-3: Bomb. A stone bunker with an armoured foe that only an explosion cracks open. */
function bunker(): LevelDef {
  const b = new LevelBuilder('2-3', 'Bunker Buster', T, ['ember', 'ember', 'pip']);
  b.size(48, 24).hint('Bomb: tap to explode, or wait for the fuse.');
  b.rect('stone', 26, 0, 0.6, 2.2);
  b.rect('stone', 30, 0, 0.6, 2.2);
  b.foe('armored', 28, 0);
  b.plank('stone', 28, 2.2, 4.8, 0.5);
  b.foe('small', 32.5, 0);
  return b.stars(18000, 27000).build();
}

/** 2-4: Matilda. Foes in a sunken pit, protected from the side. Drop eggs from above. */
function eggDrop(): LevelDef {
  const b = new LevelBuilder('2-4', 'Bombs Away', T, ['brawn', 'brawn', 'brawn']);
  b.size(50, 26).hint('Brawn: tap above a target to slam straight down.');
  b.ledge(24, 0, 2, 3.5);
  b.ledge(34, 0, 2, 3.5);
  hut(b, 27, 0, { w: 2.4, foe: 'small' });
  hut(b, 31, 0, { w: 2.4, foe: 'medium' });
  return b.stars(23000, 34000).build();
}

/** 2-5: one target per bird type, in launch order. */
function provingGrounds(): LevelDef {
  const b = new LevelBuilder('2-5', 'Proving Grounds', T, ['zip', 'sprig', 'ember', 'brawn', 'pip', 'ember']);
  b.size(52, 26).hint('Each bird has a favourite target.');
  b.post('wood', 20, 0, 2);
  b.post('wood', 21.5, 0, 2);
  b.post('wood', 23, 0, 2);
  b.plank('wood', 21.5, 2, 3.6);
  b.foe('small', 20.75, 0);
  b.foe('small', 22.25, 0);
  for (let i = 0; i < 4; i++) b.post('glass', 27 + i * 0.9, 0, 2.5);
  b.plank('glass', 28.35, 2.5, 3.4);
  b.foe('medium', 31, 0);
  const ledge = b.ledge(38, 0, 7, 1.5);
  b.rect('stone', 36, ledge, 1, 2);
  b.rect('stone', 40, ledge, 1, 2);
  b.plank('wood', 38, ledge + 2, 5, 0.5);
  b.foe('helmet', 38, ledge);
  b.tnt(42.5, 0);
  b.foe('large', 45, 0);
  return b.stars(35000, 53000).build();
}

/** 2-6: TNT stored next to the foes' shelters. One good hit sets off a chain. */
function tntDepot(): LevelDef {
  const b = new LevelBuilder('2-6', 'TNT Depot', T, ['pip', 'zip', 'ember']);
  b.size(50, 24).hint('TNT explodes when hit hard enough.');
  hut(b, 24, 0, { w: 2.8, foe: 'small', roof: 'wood' });
  b.tnt(26.4, 0);
  hut(b, 29, 0, { w: 2.8, mat: 'stone', top: 'wood', foe: 'medium', thick: 0.35 });
  b.tnt(31.4, 0);
  b.tnt(31.4, 0.8);
  hut(b, 34, 0, { w: 2.8, foe: 'helmet' });
  return b.stars(26000, 39000).build();
}

/** 2-7: a fortified mesa. Lob onto it, or bring the overhanging tower down onto the foe below. */
function mesa(): LevelDef {
  const b = new LevelBuilder('2-7', 'The Mesa', T, ['zip', 'brawn', 'pip', 'pip']);
  b.size(54, 28);
  b.poly(31, 0, [[-4, 0], [4, 0], [3.2, 5], [-3.2, 5]]);
  tower(b, 30, 5, [{ w: 2.6, foe: 'small' }, { w: 2.6, mat: 'glass', foe: 'small' }], 'wood');
  hut(b, 33, 5, { w: 2.2, foe: 'medium' });
  b.foe('small', 36.5, 0);
  return b.stars(30000, 46000).build();
}

/** 2-8: a stone boulder sits on a ledge above the foes, held only by a glass chock. */
function boulderRun(): LevelDef {
  const b = new LevelBuilder('2-8', 'Boulder Run', T, ['sprig', 'pip', 'zip', 'pip']);
  b.size(52, 26).hint('Free the boulder!');
  const shelf = b.ledge(27, 0, 4, 4);
  b.ball('stone', 27.8, shelf, 1.4);
  b.rect('glass', 28.8, shelf, 0.35, 0.6);
  hut(b, 31.5, 0, { w: 2.6, mat: 'glass', top: 'wood', foe: 'medium' });
  hut(b, 34.5, 0, { w: 2.6, foe: 'small' });
  b.foe('small', 37, 0);
  return b.stars(14000, 22000).build();
}

/** 2-9: a stepped pyramid of stone and glass with a big foe at its heart. */
function pyramid(): LevelDef {
  const b = new LevelBuilder('2-9', 'Pyramid', T, ['ember', 'sprig', 'brawn', 'zip']);
  b.size(54, 28);
  wall(b, 26, 0, 1, 3, 'stone');
  wall(b, 34.4, 0, 1, 3, 'stone');
  b.rect('glass', 27.6, 0, 0.3, 2.4);
  b.rect('glass', 33.2, 0, 0.3, 2.4);
  b.foe('large', 30.4, 0);
  b.plank('stone', 30.4, 2.4, 6.4, 0.4);
  hut(b, 30.4, 2.8, { w: 3.6, mat: 'glass', top: 'wood', foe: 'small' });
  b.tri('stone', 30.4, 5.05, 2.6, 1.2);
  b.foe('small', 37.5, 0);
  return b.stars(28000, 42000).build();
}

/** 2-10: the sandstorm fortress. Three wings, each weak to a different bird. */
function fortress(): LevelDef {
  const b = new LevelBuilder('2-10', 'Sandstorm Fortress', T, ['zip', 'sprig', 'ember', 'brawn', 'pip']);
  b.size(60, 28).hint('Plan which bird goes where.');
  tower(b, 25, 0, [{ w: 2.8, foe: 'small' }, { w: 2.8, foe: 'small' }], 'wood');
  tower(b, 30.5, 0, [{ w: 2.8, mat: 'glass', foe: 'medium' }, { w: 2.8, mat: 'glass', foe: 'small' }]);
  const base = b.ledge(38, 0, 6, 1);
  hut(b, 38, base, { w: 3, mat: 'stone', top: 'stone', foe: 'helmet', thick: 0.45 });
  b.tnt(35.8, base);
  b.tnt(40.2, base);
  b.foe('large', 43.5, 0);
  return b.stars(37000, 55000).build();
}

export const CHAPTER_2: LevelDef[] = [speedTrap(), greenhouse(), bunker(), eggDrop(), provingGrounds(), tntDepot(), mesa(), boulderRun(), pyramid(), fortress()];
