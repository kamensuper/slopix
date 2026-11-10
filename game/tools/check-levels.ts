/**
 * Level validation: every campaign level must (1) stand perfectly still before it is hit and
 * (2) be winnable with its own birds. The solver is a greedy search over aim angles, launch
 * powers and ability timings using the real simulation, replaying earlier shots deterministically.
 *
 *   npx tsx tools/check-levels.ts            all levels
 *   npx tsx tools/check-levels.ts 0 9        levels by global index range (inclusive)
 */
import type { BirdType, LevelDef } from '../src/core/types';
import { LEVELS } from '../src/levels/campaign';
import { solveAim } from '../src/sim/aim';
import { GameSim } from '../src/sim/GameSim';
import { pullFromAim } from '../src/sim/slingshot';

type Action = { tick: number; kind: 'launch'; x: number; y: number } | { tick: number; kind: 'ability' };

const POWERS = [1, 0.86, 0.72];
const MAX_TARGETS = 6;
const SWEEP_DEG = [-8, -2, 4, 10, 16, 22, 28, 34, 40, 46, 52, 58, 64, 70];
const phaseOf = (sim: GameSim): string => sim.phase;

function step(sim: GameSim): void {
  sim.step();
  sim.events.length = 0;
}

function replay(level: LevelDef, actions: Action[]): GameSim {
  const sim = new GameSim(level);
  sim.events.length = 0;
  for (const a of actions) {
    while (sim.tick < a.tick) step(sim);
    if (a.kind === 'launch') sim.launch(a.x, a.y);
    else sim.activateAbility();
  }
  while (phaseOf(sim) === 'flying') step(sim);
  return sim;
}

function wantsAbility(type: BirdType, sim: GameSim, tx: number, ty: number): boolean {
  const bird = sim.activeBird;
  if (!bird || !bird.alive || !sim.canUseAbility()) return false;
  switch (type) {
    case 'chuck':
      return bird.x >= sim.anchor.x + (tx - sim.anchor.x) * 0.45;
    case 'blues':
      return bird.x >= tx - 4;
    case 'matilda':
      return bird.x >= tx - 0.4;
    case 'bomb':
      return bird.impacted || Math.hypot(bird.x - tx, bird.y - ty) < 1;
    default:
      return false;
  }
}

interface Trial {
  actions: Action[];
  pigs: number;
  score: number;
  won: boolean;
}

function tryShot(level: LevelDef, prefix: Action[], angle: number, power: number, tx: number, ty: number): Trial | null {
  const sim = replay(level, prefix);
  if (sim.phase !== 'aiming') return null;
  const type = sim.queue[0] as BirdType;
  const pull = pullFromAim(angle, power, { x: 0, y: 0 });
  const actions = [...prefix, { tick: sim.tick, kind: 'launch', x: pull.x, y: pull.y } as Action];
  if (!sim.launch(pull.x, pull.y)) return null;
  while (phaseOf(sim) === 'flying') {
    if (wantsAbility(type, sim, tx, ty)) {
      actions.push({ tick: sim.tick, kind: 'ability' });
      sim.activateAbility();
    }
    step(sim);
  }
  // Let a win play out to get the final score.
  while (sim.pigsAlive === 0 && phaseOf(sim) !== 'won') step(sim);
  return { actions, pigs: sim.pigsDefeated, score: sim.score, won: phaseOf(sim) === 'won' };
}

function checkStable(level: LevelDef): string[] {
  const sim = new GameSim(level);
  sim.events.length = 0;
  const problems: string[] = [];
  for (let i = 0; i < 60 * 6; i++) {
    sim.step();
    for (const e of sim.events) {
      if (e.type === 'blockDamaged' || e.type === 'blockDestroyed' || e.type === 'pigDamaged' || e.type === 'pigDefeated') problems.push(`${e.type} at t=${(sim.tick / 60).toFixed(2)}`);
    }
    sim.events.length = 0;
  }
  return problems.slice(0, 3);
}

function solve(level: LevelDef): { won: boolean; score: number; birdsUsed: number; pigsLeft: number; left: string } {
  let prefix: Action[] = [];

  for (let shot = 0; shot < level.birds.length; shot++) {
    const sim = replay(level, prefix);
    if (sim.phase !== 'aiming') break;
    const targets = sim.pigs
      .filter((p) => p.alive)
      .sort((a, b) => a.x - b.x)
      .slice(0, MAX_TARGETS)
      .flatMap((p) => [{ x: p.x, y: p.y }, { x: p.x - 1.4, y: p.y + 0.6 }]);
    const candidates: { angle: number; power: number; x: number; y: number }[] = [];
    for (const t of targets) {
      for (const power of POWERS) {
        const aim = solveAim(sim.anchor, t.x, t.y, power);
        for (const angle of [aim.low, aim.high]) if (angle !== null && angle > -0.4 && angle < 1.5) candidates.push({ angle, power, x: t.x, y: t.y });
      }
    }
    // Plain sweep as a fallback; abilities fire relative to the nearest pig.
    const nearest = targets[0];
    if (nearest) for (const power of POWERS) for (const deg of SWEEP_DEG) candidates.push({ angle: (deg * Math.PI) / 180, power, x: nearest.x, y: nearest.y });
    const rank = (t: Trial): number => (t.won ? 1e9 : 0) + t.pigs * 1e6 + t.score;
    let round: Trial | null = null;
    for (const c of candidates) {
      const trial = tryShot(level, prefix, c.angle, c.power, c.x, c.y);
      if (trial && (!round || rank(trial) > rank(round))) round = trial;
      if (round?.won) break;
    }
    if (!round) break;

    prefix = round.actions;
    if (round.won) break;
  }
  const final = replay(level, prefix);
  while (final.pigsAlive === 0 && phaseOf(final) !== 'won') step(final);
  return { won: phaseOf(final) === 'won', score: final.score, birdsUsed: final.birdsUsed, pigsLeft: final.pigsAlive, left: final.pigs.filter((p) => p.alive).map((p) => `${p.variant}@${p.x.toFixed(1)},${p.y.toFixed(1)} hp${Math.round(p.hp)}/${p.armor.toFixed(0)}`).join(' ') };
}

const [from, to] = [Number(process.argv[2] ?? 0), Number(process.argv[3] ?? LEVELS.length - 1)];
let failures = 0;
for (let i = from; i <= to && i < LEVELS.length; i++) {
  const level = LEVELS[i]!;
  const start = Date.now();
  const unstable = checkStable(level);
  const result = solve(level);
  const ok = unstable.length === 0 && result.won;
  if (!ok) failures++;
  const stars = result.won ? `score ${result.score} (2* ${level.stars.two}, 3* ${level.stars.three})` : `pigs left ${result.pigsLeft} [${result.left}]`;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${level.id.padEnd(5)} ${level.name.padEnd(20)} stable=${unstable.length === 0 ? 'yes' : unstable.join('; ')} solved=${result.won} birds=${result.birdsUsed}/${level.birds.length} ${stars} ${((Date.now() - start) / 1000).toFixed(0)}s`,
  );
}
process.exit(failures > 0 ? 1 : 0);
