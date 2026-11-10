/** Chapter 3: Snowlands. Reinforced stone, armoured pigs and large combined fortresses. */
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';
import { hut, tower, wall } from './kit';

const T = 'snowlands';

/** 3-1: an ice palace of glass with helmet pigs; the Blues shred it. */
function icePalace(): LevelDef {
  const b = new LevelBuilder('3-1', 'Ice Palace', T, ['blues', 'blues', 'red', 'red']);
  b.size(50, 26);
  tower(b, 26, 0, [{ w: 2.6, mat: 'glass', pig: 'helmet' }, { w: 2.6, mat: 'glass', pig: 'small' }], 'glass');
  tower(b, 30, 0, [{ w: 2.6, mat: 'glass', pig: 'medium' }], 'glass');
  return b.stars(22000, 33000).build();
}

/** 3-2: a thick stone wall shields two helmet pigs. Go over it, or blow it open. */
function stoneWall(): LevelDef {
  const b = new LevelBuilder('3-2', 'The Wall', T, ['bomb', 'matilda', 'red']);
  b.size(50, 26).hint('Too thick to break? Go over it.');
  wall(b, 24, 0, 2, 4, 'stone');
  hut(b, 29, 0, { w: 2.6, pig: 'helmet' });
  b.pig('helmet', 32, 0);
  return b.stars(23000, 35000).build();
}

/** 3-3: an armoured pig in a stone strongroom with a TNT stash beside it. */
function strongroom(): LevelDef {
  const b = new LevelBuilder('3-3', 'Strongroom', T, ['bomb', 'bomb', 'chuck']);
  b.size(50, 26);
  b.rect('stone', 26.5, 0, 0.6, 2.2);
  b.rect('stone', 30.5, 0, 0.6, 2.2);
  b.pig('armored', 28.5, 0);
  b.plank('stone', 28.5, 2.2, 4.8, 0.5);
  b.tnt(31.6, 0);
  hut(b, 34, 0, { w: 2.4, pig: 'small' });
  return b.stars(20000, 30000).build();
}

/** 3-4: a stone keep on a snowy plinth with a king pig on the ground floor. */
function frozenKeep(): LevelDef {
  const b = new LevelBuilder('3-4', 'Frozen Keep', T, ['bomb', 'chuck', 'matilda', 'red', 'bomb']);
  b.size(50, 30);
  const base = b.ledge(34, 0, 12, 2);
  for (const x of [30, 33, 35, 38]) b.rect('stone', x, base, 0.5, 3);
  b.plank('stone', 34, base + 3, 8.6, 0.5);
  b.pig('helmet', 31.5, base);
  b.pig('king', 36.5, base);
  b.post('glass', 33, base + 3.5, 2);
  b.post('glass', 35, base + 3.5, 2);
  b.plank('wood', 34, base + 5.5, 3);
  b.pig('small', 34, base + 3.5);
  b.tri('wood', 34, base + 5.75, 2, 1);
  return b.stars(19000, 29000).build();
}

/** 3-5: pigs perched on stacked cliff ledges. A tall level that needs high lobs. */
function cliffside(): LevelDef {
  const b = new LevelBuilder('3-5', 'Cliffside', T, ['matilda', 'chuck', 'red', 'blues']);
  b.size(52, 32);
  const low = b.ledge(26, 0, 4, 3);
  const mid = b.ledge(31, 0, 4, 6);
  const high = b.ledge(36, 0, 4, 9);
  hut(b, 26, low, { w: 2.2, pig: 'small' });
  hut(b, 31, mid, { w: 2.2, mat: 'glass', top: 'wood', pig: 'medium' });
  hut(b, 36, high, { w: 2.2, pig: 'small', roof: 'wood' });
  return b.stars(21000, 32000).build();
}

/** 3-6: stone boulders held on a high shelf by glass. Shatter the glass and the avalanche follows. */
function avalanche(): LevelDef {
  const b = new LevelBuilder('3-6', 'Avalanche', T, ['blues', 'red', 'chuck', 'red']);
  b.size(52, 28).hint('Start an avalanche.');
  const shelf = b.ledge(27, 0, 4, 5);
  b.ball('stone', 26.4, shelf, 1.2);
  b.ball('stone', 27.7, shelf, 1);
  b.rect('glass', 28.6, shelf, 0.3, 0.7);
  hut(b, 31, 0, { w: 2.4, mat: 'glass', top: 'wood', pig: 'helmet' });
  hut(b, 34, 0, { w: 2.4, pig: 'small' });
  return b.stars(11000, 17000).build();
}

/** 3-7: a plank bridge between two ice ledges; pigs on and under it. */
function bridge(): LevelDef {
  const b = new LevelBuilder('3-7', 'Frozen Bridge', T, ['chuck', 'bomb', 'blues', 'red']);
  b.size(56, 28);
  const h = b.ledge(26, 0, 2, 3);
  b.ledge(36, 0, 2, 3);
  b.post('wood', 29, 0, 3);
  b.post('wood', 33, 0, 3);
  b.plank('wood', 31, h, 10.4);
  b.pig('small', 28, h + 0.25);
  b.pig('medium', 31, h + 0.25);
  b.pig('small', 34, h + 0.25);
  b.pig('large', 31, 0);
  b.tnt(36, h);
  return b.stars(30000, 45000).build();
}

/** 3-8: twin keeps of stone and glass with TNT between them. */
function twinKeeps(): LevelDef {
  const b = new LevelBuilder('3-8', 'Twin Keeps', T, ['bomb', 'matilda', 'chuck', 'blues']);
  b.size(56, 28);
  tower(b, 27, 0, [{ w: 2.8, mat: 'stone', top: 'stone', pig: 'helmet', thick: 0.4 }, { w: 2.8, mat: 'glass', pig: 'small' }], 'wood');
  b.tnt(30, 0);
  b.tnt(30, 0.8);
  tower(b, 33, 0, [{ w: 2.8, mat: 'stone', top: 'stone', pig: 'armored', thick: 0.4 }, { w: 2.8, mat: 'glass', pig: 'small' }], 'wood');
  return b.stars(37000, 56000).build();
}

/** 3-9: three structures in a row, each a different material, getting tougher further back. */
function gauntlet(): LevelDef {
  const b = new LevelBuilder('3-9', 'The Gauntlet', T, ['chuck', 'blues', 'bomb', 'matilda', 'red', 'red']);
  b.size(60, 28);
  tower(b, 23, 0, [{ w: 2.6, pig: 'small' }, { w: 2.6, pig: 'small' }], 'wood');
  tower(b, 29, 0, [{ w: 2.6, mat: 'glass', pig: 'medium' }, { w: 2.6, mat: 'glass', pig: 'small' }], 'glass');
  const base = b.ledge(37, 0, 6, 1.5);
  hut(b, 37, base, { w: 3, mat: 'stone', top: 'stone', pig: 'armored', thick: 0.45 });
  b.tnt(34.6, base);
  return b.stars(39000, 59000).build();
}

/** 3-10: the King Pig's castle. Everything at once. */
function kingsCastle(): LevelDef {
  const b = new LevelBuilder('3-10', "King's Castle", T, ['chuck', 'blues', 'bomb', 'matilda', 'bomb', 'red', 'bomb']);
  b.size(64, 32).hint('Topple the King!');
  tower(b, 25, 0, [{ w: 2.6, pig: 'small' }, { w: 2.6, mat: 'glass', pig: 'small' }], 'wood');
  const base = b.ledge(35, 0, 10, 1.5);
  b.rect('stone', 31, base, 0.6, 2.6);
  b.rect('stone', 35, base, 0.6, 2.6);
  b.rect('stone', 39, base, 0.6, 2.6);
  b.pig('helmet', 33, base);
  b.pig('king', 37, base);
  const floor = b.plank('stone', 35, base + 2.6, 8.8, 0.5);
  hut(b, 33, floor, { w: 2.6, mat: 'glass', top: 'wood', pig: 'small' });
  hut(b, 37, floor, { w: 2.6, mat: 'glass', top: 'wood', pig: 'medium', roof: 'wood' });
  b.tnt(41.5, 0);
  tower(b, 45, 0, [{ w: 2.6, mat: 'wood', top: 'wood', pig: 'armored', thick: 0.3 }], 'wood');
  return b.stars(42000, 63000).build();
}

export const CHAPTER_3: LevelDef[] = [icePalace(), stoneWall(), strongroom(), frozenKeep(), cliffside(), avalanche(), bridge(), twinKeeps(), gauntlet(), kingsCastle()];
