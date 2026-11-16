/** Frostfall Peaks, the levels built around ice and frost: sliding stones, spreading cracks and Rime's cold snap. */
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';
import { hut } from './kit';

const T = 'snowlands';

/** A stone on a sheet of ice: one push and it slides the whole shelf and drops on the hamlet below. */
function curlingStones(): LevelDef {
  const b = new LevelBuilder('curling', 'Curling Stones', T, ['pip', 'pip', 'zip']);
  b.size(50, 26).hint('Nothing stops on ice. Give the stone a push.');
  b.decor('pine_snow', 17).decor('lantern', 41).decor('snow_rock', 44.5).decor('ice_crystal', 12, { front: true });
  const shelf = b.ledge(26, 0, 10, 3.2, 'ice');
  b.rect('stone', 23, shelf, 1.1, 1.1);
  b.rect('ice', 27.5, shelf, 0.4, 1.6);
  b.rect('stone', 29.6, shelf, 1, 1);
  // The hamlet at the foot of the shelf.
  hut(b, 32.6, 0, { w: 2.4, h: 1.8, mat: 'ice', top: 'wood', foe: 'medium' });
  hut(b, 35.6, 0, { w: 2.2, h: 1.6, mat: 'wood', foe: 'small', roof: 'ice' });
  return b.stars(16000, 25000).build();
}

/** A gallery of ice: break one pane and the crack runs into the next. */
function thinIce(): LevelDef {
  const b = new LevelBuilder('thin-ice', 'Thin Ice', T, ['sprig', 'sprig', 'pip']);
  b.size(50, 26).hint('Ice cracks spread from piece to piece. The Sprigs love it.');
  b.decor('pine_snow', 20).decor('frozen_bush', 40).decor('lantern', 23.5).decor('snow_rock', 43).decor('ice_crystal', 12, { front: true });
  for (const x of [26, 29, 32, 35]) b.rect('ice', x, 0, 0.5, 3);
  for (const x of [27.5, 30.5, 33.5]) b.plank('ice', x, 3, 2.9, 0.35);
  b.foe('small', 27.5, 3.35);
  b.foe('medium', 30.5, 3.35);
  b.foe('small', 33.5, 3.35);
  b.foe('helmet', 30.5, 0);
  // A second storey of thin panes over the middle.
  b.rect('ice', 29.4, 3.35, 0.3, 1.8);
  b.rect('ice', 31.6, 3.35, 0.3, 1.8);
  b.plank('ice', 30.5, 5.15, 2.8, 0.3);
  return b.stars(20000, 31000).build();
}

/** Rime's first outing: armour that shrugs off Pip turns brittle once it is frozen. */
function coldSnap(): LevelDef {
  const b = new LevelBuilder('cold-snap', 'Cold Snap', T, ['rime', 'pip', 'pip', 'zip']);
  b.size(50, 26).hint('Rime: frost makes everything nearby brittle. Freeze first, then hit.');
  b.decor('pine_snow', 19).decor('snowman', 22).decor('lantern', 37.5).decor('pine_snow', 42, { scale: 0.9 }).decor('ice_crystal', 12, { front: true });
  hut(b, 27, 0, { w: 2.6, h: 2, mat: 'glass', top: 'wood', foe: 'armored', thick: 0.3 });
  hut(b, 30.4, 0, { w: 2.6, h: 2, mat: 'glass', top: 'wood', foe: 'medium', thick: 0.3 });
  b.plank('stone', 28.7, 2.25, 6.2, 0.4);
  hut(b, 28.7, 2.65, { w: 2.4, h: 1.6, mat: 'glass', foe: 'small', roof: 'wood' });
  return b.stars(22000, 34000).build();
}

/** A stone slab on metal legs over two plated foes: freeze the legs and they shatter under Brawn. */
function deepFreeze(): LevelDef {
  const b = new LevelBuilder('deep-freeze', 'Deep Freeze', T, ['rime', 'brawn', 'pip', 'ember']);
  b.size(52, 26).hint('Frozen metal breaks like glass. Then let the roof do the work.');
  b.decor('pine_snow', 21, { scale: 1.1 }).decor('frozen_bush', 24).decor('snow_rock', 39).decor('lantern', 42).decor('ice_crystal', 12, { front: true });
  b.rect('metal', 27, 0, 0.35, 2.4);
  b.rect('metal', 33, 0, 0.35, 2.4);
  b.foe('armored', 29, 0);
  b.foe('armored', 31, 0);
  const slab = b.plank('stone', 30, 2.4, 7, 0.7);
  b.rect('stone', 28.2, slab, 1, 1);
  b.rect('stone', 31.8, slab, 1, 1);
  b.foe('small', 30, slab);
  hut(b, 36.4, 0, { w: 2.2, h: 1.6, mat: 'ice', top: 'wood', foe: 'small' });
  return b.stars(24000, 37000).build();
}

export const FROST_NEW = { curlingStones: curlingStones(), thinIce: thinIce(), coldSnap: coldSnap(), deepFreeze: deepFreeze() };
