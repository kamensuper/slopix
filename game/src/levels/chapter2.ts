/** Chapter 2: Desert. The special birds, TNT and multi-stage puzzles. */
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';
import { hut, tower, wall } from './kit';

const T = 'desert';

/** 2-1: Chuck. A long, low wooden barricade that only a boosted bird punches through. */
function speedTrap(): LevelDef {
  const b = new LevelBuilder('2-1', 'Speed Trap', T, ['chuck', 'chuck', 'chuck']);
  b.size(50, 24).hint('Chuck: tap while flying to boost!');
  for (let i = 0; i < 4; i++) hut(b, 24 + i * 3, 0, { w: 2.8, pig: i % 2 === 1 ? 'small' : null });
  b.pig('small', 36.5, 0);
  return b.stars(24000, 36000).build();
}

/** 2-2: The Blues. A greenhouse of glass, three pigs in three panes. */
function greenhouse(): LevelDef {
  const b = new LevelBuilder('2-2', 'Greenhouse', T, ['blues', 'blues', 'blues']);
  b.size(48, 24).hint('The Blues: tap to split into three!');
  for (let i = 0; i < 3; i++) tower(b, 25 + i * 2.8, 0, [{ w: 2.6, mat: 'glass', pig: 'small' }, { w: 2.6, mat: 'glass' }]);
  return b.stars(26000, 38000).build();
}

/** 2-3: Bomb. A stone bunker with an armoured pig that only an explosion cracks open. */
function bunker(): LevelDef {
  const b = new LevelBuilder('2-3', 'Bunker Buster', T, ['bomb', 'bomb', 'red']);
  b.size(48, 24).hint('Bomb: tap to explode, or wait for the fuse.');
  b.rect('stone', 26, 0, 0.6, 2.2);
  b.rect('stone', 30, 0, 0.6, 2.2);
  b.pig('armored', 28, 0);
  b.plank('stone', 28, 2.2, 4.8, 0.5);
  b.pig('small', 32.5, 0);
  return b.stars(16000, 26000).build();
}

/** 2-4: Matilda. Pigs in a sunken pit, protected from the side. Drop eggs from above. */
function eggDrop(): LevelDef {
  const b = new LevelBuilder('2-4', 'Bombs Away', T, ['matilda', 'matilda', 'matilda']);
  b.size(50, 26).hint('Matilda: tap above a target to drop an egg.');
  b.ledge(24, 0, 2, 3.5);
  b.ledge(34, 0, 2, 3.5);
  hut(b, 27, 0, { w: 2.4, pig: 'small' });
  hut(b, 31, 0, { w: 2.4, pig: 'medium' });
  return b.stars(18000, 28000).build();
}

/** 2-5: one target per bird type, in launch order. */
function provingGrounds(): LevelDef {
  const b = new LevelBuilder('2-5', 'Proving Grounds', T, ['chuck', 'blues', 'bomb', 'matilda', 'red']);
  b.size(52, 26).hint('Each bird has a favourite target.');
  b.post('wood', 20, 0, 2);
  b.post('wood', 21.5, 0, 2);
  b.post('wood', 23, 0, 2);
  b.plank('wood', 21.5, 2, 3.6);
  b.pig('small', 20.75, 0);
  b.pig('small', 22.25, 0);
  for (let i = 0; i < 4; i++) b.post('glass', 27 + i * 0.9, 0, 2.5);
  b.plank('glass', 28.35, 2.5, 3.4);
  b.pig('medium', 31, 0);
  const ledge = b.ledge(38, 0, 7, 1.5);
  b.rect('stone', 36, ledge, 1, 2);
  b.rect('stone', 40, ledge, 1, 2);
  b.plank('stone', 38, ledge + 2, 5, 0.5);
  b.pig('armored', 38, ledge);
  b.tnt(42.5, 0);
  b.pig('large', 45, 0);
  return b.stars(50000, 75000).build();
}

/** 2-6: TNT stored next to the pigs' shelters. One good hit sets off a chain. */
function tntDepot(): LevelDef {
  const b = new LevelBuilder('2-6', 'TNT Depot', T, ['red', 'chuck', 'bomb']);
  b.size(50, 24).hint('TNT explodes when hit hard enough.');
  hut(b, 24, 0, { w: 2.8, pig: 'small', roof: 'wood' });
  b.tnt(26.4, 0);
  hut(b, 29, 0, { w: 2.8, mat: 'stone', top: 'wood', pig: 'medium', thick: 0.35 });
  b.tnt(31.4, 0);
  b.tnt(31.4, 0.8);
  hut(b, 34, 0, { w: 2.8, pig: 'helmet' });
  return b.stars(30000, 45000).build();
}

/** 2-7: a fortified mesa. Lob onto it, or bring the overhanging tower down onto the pig below. */
function mesa(): LevelDef {
  const b = new LevelBuilder('2-7', 'The Mesa', T, ['chuck', 'matilda', 'red', 'red']);
  b.size(54, 28);
  b.poly(31, 0, [[-4, 0], [4, 0], [3.2, 5], [-3.2, 5]]);
  tower(b, 30, 5, [{ w: 2.6, pig: 'small' }, { w: 2.6, mat: 'glass', pig: 'small' }], 'wood');
  hut(b, 33, 5, { w: 2.2, pig: 'medium' });
  b.pig('small', 36.5, 0);
  return b.stars(30000, 44000).build();
}

/** 2-8: a stone boulder sits on a ledge above the pigs, held only by a glass chock. */
function boulderRun(): LevelDef {
  const b = new LevelBuilder('2-8', 'Boulder Run', T, ['blues', 'red', 'chuck']);
  b.size(52, 26).hint('Free the boulder!');
  const shelf = b.ledge(27, 0, 4, 4);
  b.ball('stone', 27.8, shelf, 1.4);
  b.rect('glass', 28.8, shelf, 0.35, 0.6);
  hut(b, 31.5, 0, { w: 2.6, mat: 'glass', top: 'wood', pig: 'medium' });
  hut(b, 34.5, 0, { w: 2.6, pig: 'small' });
  b.pig('small', 37, 0);
  return b.stars(26000, 38000).build();
}

/** 2-9: a stepped pyramid of stone and glass with a big pig at its heart. */
function pyramid(): LevelDef {
  const b = new LevelBuilder('2-9', 'Pyramid', T, ['bomb', 'blues', 'matilda', 'chuck']);
  b.size(54, 28);
  wall(b, 26, 0, 1, 3, 'stone');
  wall(b, 34.4, 0, 1, 3, 'stone');
  b.rect('glass', 27.6, 0, 0.3, 2.4);
  b.rect('glass', 33.2, 0, 0.3, 2.4);
  b.pig('large', 30.4, 0);
  b.plank('stone', 30.4, 2.4, 6.4, 0.4);
  hut(b, 30.4, 2.8, { w: 3.6, mat: 'glass', top: 'wood', pig: 'small' });
  b.tri('stone', 30.4, 5.05, 2.6, 1.2);
  b.pig('small', 37.5, 0);
  return b.stars(36000, 52000).build();
}

/** 2-10: the sandstorm fortress. Three wings, each weak to a different bird. */
function fortress(): LevelDef {
  const b = new LevelBuilder('2-10', 'Sandstorm Fortress', T, ['chuck', 'blues', 'bomb', 'matilda', 'red']);
  b.size(60, 28).hint('Plan which bird goes where.');
  tower(b, 25, 0, [{ w: 2.8, pig: 'small' }, { w: 2.8, pig: 'small' }], 'wood');
  tower(b, 30.5, 0, [{ w: 2.8, mat: 'glass', pig: 'medium' }, { w: 2.8, mat: 'glass', pig: 'small' }]);
  const base = b.ledge(38, 0, 6, 1);
  hut(b, 38, base, { w: 3, mat: 'stone', top: 'stone', pig: 'helmet', thick: 0.45 });
  b.tnt(35.8, base);
  b.tnt(40.2, base);
  b.pig('large', 43.5, 0);
  return b.stars(60000, 85000).build();
}

export const CHAPTER_2: LevelDef[] = [speedTrap(), greenhouse(), bunker(), eggDrop(), provingGrounds(), tntDepot(), mesa(), boulderRun(), pyramid(), fortress()];
