/** Chapter 1: Grasslands. Aiming, wooden collapses, then glass and stone. Red birds only. */
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';
import { hut, tower, wall } from './kit';

const T = 'grasslands';

/** 1-1: one hut, one pig. A direct hit through the posts works; so does a lob onto the roof. */
function firstFlight(): LevelDef {
  const b = new LevelBuilder('1-1', 'First Flight', T, ['red', 'red', 'red']);
  b.size(44, 22).hint('Drag the bird back, aim and let go!');
  hut(b, 25.5, 0, { w: 3.2, pig: 'small', roof: 'wood' });
  return b.stars(9000, 16000).build();
}

/** 1-2: two huts at different distances teach range control. */
function twoHuts(): LevelDef {
  const b = new LevelBuilder('1-2', 'Neighbours', T, ['red', 'red', 'red']);
  b.size(46, 22).hint('Pull further back to fly further.');
  hut(b, 21, 0, { pig: 'small' });
  hut(b, 31, 0, { w: 3, pig: 'medium', roof: 'wood' });
  return b.stars(16000, 24000).build();
}

/** 1-3: a pig on a grassy hill behind a short fence: lob it, or knock the fence onto it. */
function hilltop(): LevelDef {
  const b = new LevelBuilder('1-3', 'King of the Hill', T, ['red', 'red', 'red']);
  b.size(46, 24).hint('Aim high to lob a bird over the fence.');
  b.poly(29, 0, [[-5, 0], [5, 0], [2.5, 3], [-2.5, 3]]);
  b.post('wood', 26.8, 3, 1.4);
  b.post('wood', 27.6, 3, 1.4);
  b.plank('wood', 27.2, 4.4, 1.4);
  b.pig('small', 29.3, 3);
  b.pig('small', 20, 0);
  return b.stars(14000, 22000).build();
}

/** 1-4: two-storey wooden tower. Taking out a lower post brings the top floor down. */
function timberTower(): LevelDef {
  const b = new LevelBuilder('1-4', 'Timber Tower', T, ['red', 'red', 'red']);
  b.size(46, 24).hint('Knock out the supports and let gravity do the rest.');
  tower(b, 28, 0, [{ w: 3, pig: 'small' }, { w: 3, pig: 'small' }], 'wood');
  return b.stars(16000, 24000).build();
}

/** 1-5: tall wooden dominoes topple into the pigs' shelter. */
function dominoes(): LevelDef {
  const b = new LevelBuilder('1-5', 'Dominoes', T, ['red', 'red', 'red']);
  b.size(48, 24).hint('Topple the first domino!');
  for (let i = 0; i < 5; i++) b.post('wood', 22 + i * 1.6, 0, 3, 0.35);
  hut(b, 32.5, 0, { w: 3, pig: 'medium' });
  b.pig('small', 35.5, 0);
  return b.stars(20000, 30000).build();
}

/** 1-6: two-room fort with roofs; the shared middle post is the weak point. */
function woodenFort(): LevelDef {
  const b = new LevelBuilder('1-6', 'Wooden Fort', T, ['red', 'red', 'red', 'red']);
  b.size(48, 24);
  b.post('wood', 25, 0, 2.2);
  b.post('wood', 28, 0, 2.2);
  b.post('wood', 31, 0, 2.2);
  b.pig('small', 26.5, 0);
  b.pig('medium', 29.5, 0);
  const top = b.plank('wood', 28, 2.2, 6.4);
  b.tri('wood', 26.5, top, 2.2, 1);
  b.tri('wood', 29.5, top, 2.2, 1);
  b.rect('wood', 28, top, 0.5, 0.5);
  return b.stars(22000, 32000).build();
}

/** 1-7: glass enters. A three-floor house with a fragile middle storey and a stone cap. */
function glassHouse(): LevelDef {
  const b = new LevelBuilder('1-7', 'Glass House', T, ['red', 'red', 'red', 'red']);
  b.size(46, 24).hint('Glass shatters easily. Stone does not.');
  tower(b, 27.5, 0, [{ w: 3.2, pig: 'small' }, { w: 3.2, mat: 'glass', pig: 'small' }, { w: 3.2, top: 'stone', pig: 'medium' }], 'wood');
  b.ball('stone', 33, 0, 1);
  b.pig('small', 35, 0);
  return b.stars(26000, 38000).build();
}

/** 1-8: heavy stone blocks perched on thin wooden stilts above the pigs. */
function stoneCap(): LevelDef {
  const b = new LevelBuilder('1-8', 'Heavy Hat', T, ['red', 'red', 'red']);
  b.size(48, 24).hint('Kick out the stilts and the stone does the crushing.');
  for (const x of [25, 30]) {
    b.post('wood', x - 1, 0, 2.4, 0.22);
    b.post('wood', x + 1, 0, 2.4, 0.22);
    const top = b.plank('wood', x, 2.4, 2.4);
    b.rect('stone', x - 0.5, top, 0.9, 0.9);
    b.rect('stone', x + 0.5, top, 0.9, 0.9);
    b.pig('small', x, 0);
  }
  return b.stars(16000, 26000).build();
}

/** 1-9: twin towers joined by a bridge plank; one tower falling drags on the other. */
function twinTowers(): LevelDef {
  const b = new LevelBuilder('1-9', 'Twin Towers', T, ['red', 'red', 'red', 'red']);
  b.size(50, 26);
  const left = tower(b, 25, 0, [{ w: 2.6, pig: 'small' }, { w: 2.6, mat: 'glass', pig: 'small' }]);
  const right = tower(b, 31, 0, [{ w: 2.6, pig: 'medium' }, { w: 2.6, mat: 'glass', pig: 'small' }]);
  b.plank('wood', 28, Math.max(left, right), 6.6);
  b.rect('stone', 28, Math.max(left, right) + 0.25, 0.8, 0.8);
  return b.stars(32000, 46000).build();
}

/** 1-10: the Grasslands citadel on a raised plinth, with a helmet pig in the keep. */
function citadel(): LevelDef {
  const b = new LevelBuilder('1-10', 'Grassland Citadel', T, ['red', 'red', 'red', 'red', 'red']);
  b.size(52, 26).hint('Helmets soak up hits. Hit them hard.');
  const base = b.ledge(32, 0, 9, 1);
  wall(b, 26.4, 0, 1, 2, 'wood');
  hut(b, 29.5, base, { w: 2.6, mat: 'glass', top: 'wood', pig: 'small' });
  tower(b, 32.8, base, [{ w: 3, mat: 'stone', top: 'wood', pig: 'helmet', thick: 0.4 }, { w: 3, pig: 'small' }], 'wood');
  hut(b, 36.2, base, { w: 2.6, pig: 'medium', roof: 'glass' });
  return b.stars(36000, 52000).build();
}

export const CHAPTER_1: LevelDef[] = [firstFlight(), twoHuts(), hilltop(), timberTower(), dominoes(), woodenFort(), glassHouse(), stoneCap(), twinTowers(), citadel()];
