// DEVELOPMENT SAMPLES - replaced by the ten hand-built Desert levels.
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';

function abilityRange(): LevelDef {
  const b = new LevelBuilder('2-1', 'Proving Grounds', 'desert', ['chuck', 'blues', 'bomb', 'matilda', 'red']);
  b.size(52, 26).hint('Tap while a bird is flying to use its power.');
  // Wooden shed for Chuck.
  b.post('wood', 20, 0, 2);
  b.post('wood', 21.5, 0, 2);
  b.post('wood', 23, 0, 2);
  b.plank('wood', 21.5, 2, 3.6);
  b.pig('small', 20.75, 0);
  b.pig('small', 22.25, 0);
  // Glass cage for the Blues.
  for (let i = 0; i < 4; i++) b.post('glass', 27 + i * 0.9, 0, 2.5);
  b.plank('glass', 28.35, 2.5, 3.4);
  b.pig('medium', 31, 0);
  // Stone bunker for Bomb.
  const ledge = b.ledge(38, 0, 7, 1.5);
  b.rect('stone', 36, ledge, 1, 2);
  b.rect('stone', 40, ledge, 1, 2);
  b.plank('stone', 38, ledge + 2, 5, 0.5);
  b.pig('armored', 38, ledge);
  b.tnt(42.5, 0);
  b.pig('large', 45, 0);
  return b.stars(60000, 85000).build();
}

export const CHAPTER_2: LevelDef[] = [abilityRange()];
