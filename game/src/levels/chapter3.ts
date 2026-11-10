// DEVELOPMENT SAMPLES - replaced by the ten hand-built Snowlands levels.
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';

function frozenKeep(): LevelDef {
  const b = new LevelBuilder('3-1', 'Frozen Keep', 'snowlands', ['bomb', 'chuck', 'matilda', 'red']);
  b.size(50, 30);
  const base = b.ledge(34, 0, 12, 2);
  for (const x of [30, 33, 35, 38]) b.rect('stone', x, base, 0.5, 3);
  b.plank('stone', 31.5, base + 3, 3.6, 0.5);
  b.plank('stone', 36.5, base + 3, 3.6, 0.5);
  b.pig('helmet', 31.5, base);
  b.pig('king', 36.5, base);
  b.post('glass', 33, base + 3.5, 2);
  b.post('glass', 35, base + 3.5, 2);
  b.plank('wood', 34, base + 5.5, 3);
  b.pig('small', 34, base + 3.5);
  b.tri('wood', 34, base + 5.75, 2, 1);
  return b.stars(50000, 70000).build();
}

export const CHAPTER_3: LevelDef[] = [frozenKeep()];
