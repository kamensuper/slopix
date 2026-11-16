/**
 * World 5, the Ironworks: conveyor belts, turning machinery, rubber that throws birds back,
 * ironwood only Brawn splits, and the Burrowers' heavy troops: shieldbearers and sappers.
 */
import type { LevelDef } from '../core/types';
import { LevelBuilder } from './builder';
import { hut, tower, wall } from './kit';

const T = 'ironworks';

/** 5-1: a boulder parked on a running belt behind a glass chock. Break the chock, the belt does the rest. */
function assemblyLine(): LevelDef {
  const b = new LevelBuilder('5-1', 'Assembly Line', T, ['pip', 'pip', 'zip']);
  b.size(50, 26).hint('The belt carries whatever lies on it. Something is holding the boulder back.');
  b.decor('pipes', 19).decor('lamp_post', 23).decor('barrel', 41).decor('cog_pile', 44).decor('warning_sign', 12, { front: true });
  const belt = b.ledge(28, 0, 8, 3, 'conveyor', 3);
  b.ball('stone', 26, belt, 1.3);
  b.rect('glass', 27, belt, 0.3, 0.9);
  hut(b, 33.8, 0, { w: 2.4, h: 1.8, mat: 'glass', top: 'wood', foe: 'medium' });
  b.foe('small', 36.4, 0);
  return b.stars(16000, 25000).build();
}

/** 5-2: ironwood. Pip bounces off it; Brawn drops through the roof. */
function ironwoodGate(): LevelDef {
  const b = new LevelBuilder('5-2', 'Ironwood Gate', T, ['pip', 'brawn', 'brawn']);
  b.size(50, 26).hint('Banded ironwood is three times as tough as wood. Brawn splits it.');
  b.decor('furnace', 20).decor('barrel', 24).decor('pipes', 40).decor('lamp_post', 43.5).decor('warning_sign', 12, { front: true });
  b.rect('ironwood', 26, 0, 0.5, 3);
  hut(b, 29, 0, { w: 3, h: 2, mat: 'ironwood', top: 'ironwood', foe: 'medium', thick: 0.35 });
  hut(b, 33, 0, { w: 3, h: 2, mat: 'ironwood', top: 'ironwood', foe: 'helmet', thick: 0.35 });
  return b.stars(18000, 27000).build();
}

/** 5-3: a rubber wall in front and a bouncy pad on the floor: the way in is off the pad and over the top. */
function rubberRoom(): LevelDef {
  const b = new LevelBuilder('5-3', 'Rubber Room', T, ['pip', 'pip', 'sprig']);
  b.size(50, 26).hint('Rubber throws birds back unharmed. Go over it, or bounce in.');
  b.decor('cog_pile', 19).decor('lamp_post', 39).decor('barrel', 41.5).decor('pipes', 45).decor('warning_sign', 12, { front: true });
  b.rect('rubber', 26, 0, 0.6, 3.4);
  b.ledge(21.5, 0, 4, 0.4, 'bouncy');
  hut(b, 29.2, 0, { w: 2.6, h: 1.8, mat: 'glass', top: 'wood', foe: 'medium' });
  hut(b, 32.6, 0, { w: 2.4, h: 1.6, foe: 'small', roof: 'wood' });
  return b.stars(16000, 25000).build();
}

/** 5-4: shieldbearers facing the sling. A rubber wall behind them sends a bird into their backs. */
function shieldWall(): LevelDef {
  const b = new LevelBuilder('5-4', 'Shield Wall', T, ['zip', 'pip', 'brawn']);
  b.size(50, 26).hint('Shields stop everything from the front. Think about the back, or the top.');
  b.decor('pipes', 20).decor('furnace', 42).decor('barrel', 38).decor('lamp_post', 23).decor('warning_sign', 12, { front: true });
  b.foe('shield', 27, 0);
  b.foe('shield', 29.4, 0);
  b.rect('rubber', 32.4, 0, 0.7, 3.6);
  // A stone hung on a rope right over the second shield.
  b.ledge(29.4, 7, 3, 0.6);
  b.hang('stone', 'rect', 29.4, 4.6, 1.3, 1.3, 7);
  return b.stars(15000, 23000).build();
}

/** 5-5: sappers carry powder kegs. They stand a little too close to each other, and to the wall. */
function powderMonkeys(): LevelDef {
  const b = new LevelBuilder('5-5', 'Powder Monkeys', T, ['pip', 'zip', 'pip']);
  b.size(52, 26).hint('A sapper explodes when it goes down. Mind who is standing next to it.');
  b.decor('barrel', 20).decor('barrel', 21.2).decor('pipes', 44).decor('lamp_post', 24).decor('warning_sign', 12, { front: true });
  b.foe('sapper', 27, 0);
  wall(b, 28.2, 0, 1, 3, 'stone');
  hut(b, 31, 0, { w: 2.8, h: 2, mat: 'ironwood', top: 'ironwood', foe: 'sapper', thick: 0.35 });
  b.foe('helmet', 33.6, 0);
  hut(b, 36.2, 0, { w: 2.4, h: 1.8, mat: 'stone', top: 'wood', foe: 'sapper', thick: 0.4 });
  b.foe('medium', 38.4, 0);
  return b.stars(27000, 41000).build();
}

/** 5-6: a turning arm sweeps the approach. Time the shot, or use the arm: it flings whatever it catches. */
function gearworks(): LevelDef {
  const b = new LevelBuilder('5-6', 'Gearworks', T, ['pip', 'zip', 'pip', 'ember']);
  b.size(52, 28).hint('The arm never stops. Shoot past it, or let it do the hitting.');
  b.decor('cog_pile', 20).decor('pipes', 44).decor('lamp_post', 47).decor('barrel', 36.5).decor('warning_sign', 12, { front: true });
  b.ledge(26, 0, 1, 4.6);
  b.block('metal', 'rect', 26, 5.2, 6.4, 0.4);
  b.motor(b.last, 26, 5.2, -70);
  tower(b, 32.5, 0, [{ w: 2.6, mat: 'wood', foe: 'medium' }, { w: 2.6, mat: 'glass', top: 'wood', foe: 'small' }], 'wood');
  hut(b, 36.4, 0, { w: 2.4, h: 1.8, foe: 'helmet' });
  return b.stars(22000, 34000).build();
}

/** 5-7: a slab of ironwood and metal slung on two ropes over the guard room. */
function thePress(): LevelDef {
  const b = new LevelBuilder('5-7', 'The Press', T, ['zip', 'zip', 'pip']);
  b.size(52, 28).hint('Two ropes hold the press up.');
  b.decor('furnace', 20).decor('pipes', 41).decor('lamp_post', 24).decor('cog_pile', 45).decor('warning_sign', 12, { front: true });
  b.ledge(30, 8.4, 9, 0.7);
  b.block('metal', 'rect', 30, 4.6, 6.4, 0.9);
  const press = b.last;
  b.rope(press, 27.4, 5, null, 27.4, 8.4);
  b.rope(press, 32.6, 5, null, 32.6, 8.4);
  b.foe('armored', 28.2, 0);
  b.foe('shield', 30, 0);
  b.foe('armored', 31.8, 0);
  b.rect('ironwood', 26.4, 0, 0.4, 2.6);
  b.rect('ironwood', 33.6, 0, 0.4, 2.6);
  return b.stars(24000, 37000).build();
}

/** 5-8: a metal strongroom with a rubber door. Frost makes both of them breakable. */
function coldForge(): LevelDef {
  const b = new LevelBuilder('5-8', 'Cold Forge', T, ['rime', 'pip', 'brawn', 'pip']);
  b.size(52, 26).hint('Rubber stops bouncing when it is frozen, and frozen metal breaks.');
  b.decor('furnace', 42).decor('barrel', 21).decor('pipes', 45.5).decor('lamp_post', 23.5).decor('warning_sign', 12, { front: true });
  b.rect('rubber', 27, 0, 0.6, 2.6);
  b.rect('metal', 33, 0, 0.4, 2.6);
  b.plank('metal', 30, 2.6, 6.8, 0.35);
  b.foe('medium', 29, 0);
  b.foe('armored', 31.2, 0);
  hut(b, 36, 0, { w: 2.2, h: 1.6, mat: 'glass', top: 'wood', foe: 'small' });
  return b.stars(21000, 32000).build();
}

/** 5-9: two belts running towards a pit. Whatever lands on them ends up in it, including the crate. */
function scrapBelt(): LevelDef {
  const b = new LevelBuilder('5-9', 'Scrap Belt', T, ['pip', 'sprig', 'ember']);
  b.size(54, 26).hint('Both belts feed the pit. So does everything you knock onto them.');
  b.decor('pipes', 20).decor('cog_pile', 46).decor('lamp_post', 23).decor('barrel', 49).decor('warning_sign', 12, { front: true });
  const left = b.ledge(27.5, 0, 5, 2.4, 'conveyor', 2.5);
  const right = b.ledge(36.5, 0, 5, 2.4, 'conveyor', -2.5);
  // The pit between the belts, with its garrison.
  b.foe('medium', 31, 0);
  b.foe('helmet', 33, 0);
  b.plank('glass', 32, 2.4, 4.4, 0.3);
  // Crates held back from the belts' edges by glass chocks.
  b.tnt(28.4, left);
  b.rect('glass', 29.4, left, 0.3, 0.8);
  b.ball('stone', 35.9, right, 1.1);
  b.rect('glass', 34.9, right, 0.3, 0.8);
  b.foe('small', 37.8, right);
  return b.stars(22000, 34000).build();
}

/** 5-10: a metal gantry links the whole yard, plated foes at every post and crates wired into it. */
function liveWire(): LevelDef {
  const b = new LevelBuilder('5-10', 'Live Wire', T, ['jolt', 'brawn', 'pip']);
  b.size(54, 28).hint('Follow the metal with your eye before you fire.');
  b.decor('lamp_post', 21).decor('furnace', 46).decor('pipes', 23.5).decor('barrel', 43.5).decor('warning_sign', 12, { front: true });
  for (const x of [26, 30, 34, 38]) b.rect('metal', x, 0, 0.35, 3);
  b.plank('metal', 28, 3, 4.35, 0.3);
  b.plank('metal', 32, 3, 4.35, 0.3);
  b.plank('metal', 36, 3, 4.35, 0.3);
  b.foe('armored', 26.8, 0);
  b.foe('shield', 30.73, 0);
  b.foe('armored', 34.8, 0);
  b.tnt(38.6, 0);
  hut(b, 40.6, 0, { w: 2.2, h: 1.8, mat: 'ironwood', top: 'ironwood', foe: 'medium', thick: 0.3 });
  b.foe('small', 32, 3.3);
  return b.stars(30000, 45000).build();
}

/** 5-11: the powder works. Crates, sappers and one long fuse of them through an ironwood fort. */
function blastFurnace(): LevelDef {
  const b = new LevelBuilder('5-11', 'Blast Furnace', T, ['ember', 'zip', 'brawn', 'pip']);
  b.size(56, 28).hint('Start it at the right end and it finishes itself.');
  b.decor('furnace', 20).decor('furnace', 48).decor('pipes', 23).decor('barrel', 45).decor('warning_sign', 12, { front: true });
  b.tnt(26.4, 0);
  hut(b, 29, 0, { w: 2.8, h: 2, mat: 'ironwood', top: 'ironwood', foe: 'sapper', thick: 0.35 });
  b.tnt(31.4, 0);
  b.tnt(31.4, 0.8);
  hut(b, 33.8, 0, { w: 2.8, h: 2, mat: 'ironwood', top: 'ironwood', foe: 'armored', thick: 0.35 });
  b.plank('stone', 31.4, 2.25, 8, 0.4);
  hut(b, 31.4, 2.65, { w: 2.6, h: 1.8, mat: 'wood', top: 'wood', foe: 'sapper', roof: 'ironwood' });
  b.tnt(36.2, 0);
  hut(b, 38.6, 0, { w: 2.4, h: 1.8, mat: 'stone', top: 'ironwood', foe: 'helmet', thick: 0.4 });
  return b.stars(36000, 54000).build();
}

/** 5-12: the Foundry. Belt, press, turning arm, rubber and shields in one works, with the Foreman on top. */
function theFoundry(): LevelDef {
  const b = new LevelBuilder('5-12', 'The Foundry', T, ['zip', 'jolt', 'ember', 'brawn', 'rime', 'pip', 'ember']);
  b.size(66, 32).hint('Every machine here can be turned on its owners.');
  b.decor('furnace', 20).decor('pipes', 23.5).decor('lamp_post', 58).decor('cog_pile', 55).decor('barrel', 60.5).decor('warning_sign', 12, { front: true });
  // The front gate: shieldbearers under a hanging press.
  b.ledge(28, 7.6, 5, 0.7);
  b.block('metal', 'rect', 28, 4.4, 3.6, 0.8);
  const press = b.last;
  b.rope(press, 26.6, 4.8, null, 26.6, 7.6);
  b.rope(press, 29.4, 4.8, null, 29.4, 7.6);
  b.foe('shield', 27.2, 0);
  b.foe('shield', 28.9, 0);
  // The belt hall: a crate on a belt behind a chock, feeding the works.
  const belt = b.ledge(33.5, 0, 5, 2.6, 'conveyor', 3);
  b.tnt(32.4, belt);
  b.rect('glass', 33.4, belt, 0.3, 0.8);
  // The works: metal frame with the plated guard, ironwood upper floor with the Foreman.
  b.rect('metal', 37.2, 0, 0.4, 2.8);
  b.rect('metal', 42.8, 0, 0.4, 2.8);
  b.foe('armored', 38.02, 0);
  b.foe('sapper', 40, 0);
  b.foe('armored', 41.98, 0);
  const floor = b.plank('metal', 40, 2.8, 6.4, 0.35);
  hut(b, 40, floor, { w: 3.4, h: 2.4, mat: 'ironwood', top: 'ironwood', foe: 'king', thick: 0.35, roof: 'ironwood' });
  // The yard behind: a rubber fence and the last pickets.
  b.rect('rubber', 46, 0, 0.6, 3);
  hut(b, 48.6, 0, { w: 2.4, h: 1.8, mat: 'stone', top: 'wood', foe: 'helmet', thick: 0.4 });
  b.foe('medium', 51, 0);
  return b.stars(60000, 90000).build();
}

export const IRON: LevelDef[] = [
  assemblyLine(),
  ironwoodGate(),
  rubberRoom(),
  shieldWall(),
  powderMonkeys(),
  gearworks(),
  thePress(),
  coldForge(),
  scrapBelt(),
  liveWire(),
  blastFurnace(),
  theFoundry(),
];
