/** Chapter 1: Grasslands. Aiming, wooden collapses, then glass and stone. Red birds only. */
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';
import { hut, tower, wall } from './kit';

const T = 'grasslands';

/** 1-1: one hut, one foe. A direct hit through the posts works; so does a lob onto the roof. */
function firstFlight(): LevelDef {
  const b = new LevelBuilder('1-1', 'First Flight', T, ['pip', 'pip', 'pip']);
  b.size(44, 22).hint('Drag the bird back, aim and let go!');
  hut(b, 25.5, 0, { w: 3.2, foe: 'small', roof: 'wood' });
  return b.stars(17000, 26000).build();
}

/** 1-2: two huts at different distances teach range control. */
function twoHuts(): LevelDef {
  const b = new LevelBuilder('1-2', 'Neighbours', T, ['pip', 'pip', 'pip']);
  b.size(46, 22).hint('Pull further back to fly further.');
  hut(b, 21, 0, { foe: 'small' });
  hut(b, 31, 0, { w: 3, foe: 'medium', roof: 'wood' });
  return b.stars(15000, 23000).build();
}

/** 1-3: a foe on a grassy hill behind a short fence: lob it, or knock the fence onto it. */
function hilltop(): LevelDef {
  const b = new LevelBuilder('1-3', 'King of the Hill', T, ['pip', 'pip', 'pip']);
  b.size(46, 24).hint('Aim high to lob a bird over the fence.');
  b.poly(29, 0, [[-5, 0], [5, 0], [2.5, 3], [-2.5, 3]]);
  b.post('wood', 26.8, 3, 1.4);
  b.post('wood', 27.6, 3, 1.4);
  b.plank('wood', 27.2, 4.4, 1.4);
  b.foe('small', 29.3, 3);
  b.foe('small', 20, 0);
  return b.stars(15000, 23000).build();
}

/** 1-4: two-storey wooden tower. Taking out a lower post brings the top floor down. */
function timberTower(): LevelDef {
  const b = new LevelBuilder('1-4', 'Timber Tower', T, ['pip', 'pip', 'pip']);
  b.size(46, 24).hint('Knock out the supports and let gravity do the rest.');
  tower(b, 28, 0, [{ w: 3, foe: 'small' }, { w: 3, foe: 'small' }], 'wood');
  return b.stars(15000, 23000).build();
}

/** 1-5: tall wooden dominoes topple into the foes' shelter. */
function dominoes(): LevelDef {
  const b = new LevelBuilder('1-5', 'Dominoes', T, ['pip', 'pip', 'pip']);
  b.size(48, 24).hint('Topple the first domino!');
  for (let i = 0; i < 5; i++) b.post('wood', 22 + i * 1.6, 0, 3, 0.35);
  hut(b, 32.5, 0, { w: 3, foe: 'medium' });
  b.foe('small', 35.5, 0);
  return b.stars(15000, 23000).build();
}

/** 1-6: two-room fort with roofs; the shared middle post is the weak point. */
function woodenFort(): LevelDef {
  const b = new LevelBuilder('1-6', 'Wooden Fort', T, ['pip', 'pip', 'pip', 'pip']);
  b.size(48, 24);
  b.post('wood', 25, 0, 2.2);
  b.post('wood', 28, 0, 2.2);
  b.post('wood', 31, 0, 2.2);
  b.foe('small', 26.5, 0);
  b.foe('medium', 29.5, 0);
  const top = b.plank('wood', 28, 2.2, 6.4);
  b.tri('wood', 26.5, top, 2.2, 1);
  b.tri('wood', 29.5, top, 2.2, 1);
  b.rect('wood', 28, top, 0.5, 0.5);
  return b.stars(21000, 32000).build();
}

/** 1-7: glass enters. A three-floor house with a fragile middle storey and a stone cap. */
function glassHouse(): LevelDef {
  const b = new LevelBuilder('1-7', 'Glass House', T, ['pip', 'pip', 'pip', 'pip']);
  b.size(46, 24).hint('Glass shatters easily. Stone does not.');
  tower(b, 27.5, 0, [{ w: 3.2, foe: 'small' }, { w: 3.2, mat: 'glass', foe: 'small' }, { w: 3.2, top: 'stone', foe: 'medium' }], 'wood');
  b.ball('stone', 33, 0, 1);
  b.foe('small', 35, 0);
  return b.stars(29000, 44000).build();
}

/** 1-8: heavy stone blocks perched on thin wooden stilts above the foes. */
function stoneCap(): LevelDef {
  const b = new LevelBuilder('1-8', 'Heavy Hat', T, ['pip', 'pip', 'pip']);
  b.size(48, 24).hint('Kick out the stilts and the stone does the crushing.');
  for (const x of [25, 30]) {
    b.post('wood', x - 1, 0, 2.4, 0.22);
    b.post('wood', x + 1, 0, 2.4, 0.22);
    const top = b.plank('wood', x, 2.4, 2.4);
    b.rect('stone', x - 0.5, top, 0.9, 0.9);
    b.rect('stone', x + 0.5, top, 0.9, 0.9);
    b.foe('small', x, 0);
  }
  return b.stars(15000, 23000).build();
}

/** 1-9: twin towers joined by a bridge plank; one tower falling drags on the other. */
function twinTowers(): LevelDef {
  const b = new LevelBuilder('1-9', 'Twin Towers', T, ['pip', 'pip', 'pip', 'pip']);
  b.size(50, 26);
  const left = tower(b, 25, 0, [{ w: 2.6, foe: 'small' }, { w: 2.6, mat: 'glass', foe: 'small' }]);
  const right = tower(b, 31, 0, [{ w: 2.6, foe: 'medium' }, { w: 2.6, mat: 'glass', foe: 'small' }]);
  b.plank('wood', 28, Math.max(left, right), 6.6);
  b.rect('stone', 28, Math.max(left, right) + 0.25, 0.8, 0.8);
  return b.stars(18000, 27000).build();
}

/** 1-10: the Grasslands citadel on a raised plinth, with a helmet foe in the keep. */
function citadel(): LevelDef {
  const b = new LevelBuilder('1-10', 'Grassland Citadel', T, ['pip', 'pip', 'pip', 'pip', 'pip', 'pip']);
  b.size(52, 26).hint('Helmets soak up hits. Hit them hard.');
  const base = b.ledge(32, 0, 9, 1);
  wall(b, 26.4, 0, 1, 2, 'wood');
  hut(b, 29.5, base, { w: 2.6, mat: 'glass', top: 'wood', foe: 'small' });
  tower(b, 32.8, base, [{ w: 3, mat: 'wood', top: 'wood', foe: 'helmet', thick: 0.3 }, { w: 3, foe: 'small' }], 'wood');
  hut(b, 36.2, base, { w: 2.6, foe: 'medium', roof: 'glass' });
  return b.stars(26000, 39000).build();
}

export const CHAPTER_1: LevelDef[] = [firstFlight(), twoHuts(), hilltop(), timberTower(), dominoes(), woodenFort(), glassHouse(), stoneCap(), twinTowers(), citadel()];
