// DEVELOPMENT SAMPLES - replaced by the ten hand-built Grasslands levels.
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';

function firstFlight(): LevelDef {
  const b = new LevelBuilder('1-1', 'First Flight', 'grasslands', ['red', 'red', 'red']);
  b.size(44, 22).hint('Drag the bird back, aim and let go!');
  b.post('wood', 24, 0, 2);
  b.post('wood', 27, 0, 2);
  const top = b.plank('wood', 25.5, 2, 3.6);
  b.pig('small', 25.5, 0);
  b.tri('wood', 25.5, top, 2, 1);
  return b.stars(18000, 26000).build();
}

function glassHouse(): LevelDef {
  const b = new LevelBuilder('1-2', 'Glass House', 'grasslands', ['red', 'red', 'red', 'red']);
  b.size(46, 24);
  let top = 0;
  for (let floor = 0; floor < 3; floor++) {
    const mat = floor === 1 ? 'glass' : 'wood';
    b.post(mat, 26, top, 2);
    b.post(mat, 29, top, 2);
    b.pig(floor === 2 ? 'medium' : 'small', 27.5, top);
    top = b.plank(floor === 2 ? 'stone' : 'wood', 27.5, top + 2, 3.6);
  }
  b.tri('wood', 27.5, top, 2, 1);
  b.ball('stone', 33, 0, 1);
  b.rect('stone', 35, 0, 1, 1);
  b.pig('helmet', 37, 0);
  return b.stars(30000, 45000).build();
}

export const CHAPTER_1: LevelDef[] = [firstFlight(), glassHouse()];
