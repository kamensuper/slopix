/**
 * Level solver: plays a level with the real simulation to prove it can be won with its own birds.
 * A greedy search, one shot at a time, over aim angles, launch powers and ability timings; earlier
 * shots are replayed deterministically. It is a proof of solvability, not a model of a good player.
 */
import { BIRDS } from '../src/core/config';
import type { BirdType, LevelDef } from '../src/core/types';
import { solveAim } from '../src/sim/aim';
import { GameSim } from '../src/sim/GameSim';
import { pullFromAim } from '../src/sim/slingshot';

export type Action = { tick: number; kind: 'launch'; x: number; y: number } | { tick: number; kind: 'ability' };

export interface SolveResult {
  won: boolean;
  score: number;
  birdsUsed: number;
  foesLeft: number;
  /** Surviving foes, for the failure report. */
  left: string;
  actions: Action[];
  trials: number;
}

const POWERS = [1, 0.86, 0.72];
const MAX_TARGETS = 7;
const SWEEP_DEG = [-8, -2, 4, 10, 16, 22, 28, 34, 40, 46, 52, 58, 64, 70];
const phaseOf = (sim: GameSim): string => sim.phase;

function step(sim: GameSim): void {
  sim.step();
  sim.events.length = 0;
}

export function replay(level: LevelDef, actions: Action[]): GameSim {
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

/** Number of ability timings worth trying for a bird. */
function timings(type: BirdType): number {
  return BIRDS[type].ability === 'none' || type === 'ember' ? 1 : 2;
}

/** Whether the solver taps now. `mode` picks between an early and a late (or no) tap. */
function wantsAbility(type: BirdType, sim: GameSim, tx: number, ty: number, mode: number): boolean {
  const bird = sim.activeBird;
  if (!bird || !bird.alive || !sim.canUseAbility()) return false;
  const d = Math.hypot(bird.x - tx, bird.y - ty);
  switch (type) {
    case 'zip':
      return mode === 0 && bird.x >= sim.anchor.x + (tx - sim.anchor.x) * 0.45;
    case 'sprig':
      return bird.x >= tx - (mode === 0 ? 4 : 7);
    case 'brawn':
      return mode === 0 && bird.x >= tx - 0.4;
    case 'ember':
      return bird.impacted || d < 1;
    case 'rime':
      // Otherwise the frost goes off on the first touch.
      return mode === 0 && d < 2.4;
    case 'jolt':
      return d < (mode === 0 ? 2.6 : 4.4);
    case 'nova':
      return d < (mode === 0 ? 2.2 : 4);
    default:
      return false;
  }
}

interface Trial {
  actions: Action[];
  foes: number;
  score: number;
  won: boolean;
}

function tryShot(level: LevelDef, prefix: Action[], angle: number, power: number, tx: number, ty: number, mode: number): Trial | null {
  const sim = replay(level, prefix);
  if (sim.phase !== 'aiming') return null;
  const type = sim.queue[0] as BirdType;
  const pull = pullFromAim(angle, power, { x: 0, y: 0 });
  const actions = [...prefix, { tick: sim.tick, kind: 'launch', x: pull.x, y: pull.y } as Action];
  if (!sim.launch(pull.x, pull.y)) return null;
  while (phaseOf(sim) === 'flying') {
    if (wantsAbility(type, sim, tx, ty, mode)) {
      actions.push({ tick: sim.tick, kind: 'ability' });
      sim.activateAbility();
    }
    step(sim);
  }
  // Let a win play out to get the final score.
  while (sim.foesAlive === 0 && phaseOf(sim) !== 'won') step(sim);
  return { actions, foes: sim.foesDefeated, score: sim.score, won: phaseOf(sim) === 'won' };
}

/** A level must stand perfectly still until it is hit. Returns the first problems found. */
export function checkStable(level: LevelDef, seconds = 6): string[] {
  const sim = new GameSim(level);
  sim.events.length = 0;
  const problems: string[] = [];
  const start = new Map<number, { x: number; y: number; angle: number }>();
  for (const e of [...sim.blocks, ...sim.foes]) start.set(e.id, { x: e.x, y: e.y, angle: e.angle });
  for (let i = 0; i < 60 * seconds; i++) {
    sim.step();
    for (const e of sim.events) {
      if (e.type === 'blockDamaged' || e.type === 'blockDestroyed' || e.type === 'foeDamaged' || e.type === 'foeDefeated' || e.type === 'jointBroken' || e.type === 'balloonPopped')
        problems.push(`${e.type} at t=${(sim.tick / 60).toFixed(2)}`);
    }
    sim.events.length = 0;
  }
  // Nothing may drift before it is hit. Machinery (motors, conveyors, patrols) and hanging loads may move.
  const moving = new Set<number>();
  for (const j of sim.joints) {
    moving.add(j.a.id);
    if (j.b) moving.add(j.b.id);
  }
  const hasBelt = (level.terrain ?? []).some((t) => t.surface === 'conveyor');
  for (const e of [...sim.blocks, ...sim.foes]) {
    const s = start.get(e.id);
    if (!s) continue;
    if (e.kind === 'foe' && e.patrol !== 0) continue;
    const limit = moving.has(e.id) || hasBelt ? 1.2 : 0.3;
    const d = Math.hypot(e.x - s.x, e.y - s.y);
    if (d > limit) problems.push(`${e.kind} ${e.id} drifted ${d.toFixed(2)}m`);
  }
  return problems.slice(0, 3);
}

/** Aim points for the next shot: foes first, then the things a designer hangs a puzzle on. */
function targetsOf(sim: GameSim): { x: number; y: number }[] {
  const foes = sim.foes
    .filter((p) => p.alive)
    .sort((a, b) => a.x - b.x)
    .slice(0, MAX_TARGETS)
    .flatMap((p) => [
      { x: p.x, y: p.y },
      { x: p.x - 1.4, y: p.y + 0.6 },
    ]);
  const extras: { x: number; y: number }[] = [];
  for (const j of sim.joints) {
    if (!j.alive || j.kind !== 'rope') continue;
    const a = j.joint.getAnchorA();
    const b = j.joint.getAnchorB();
    extras.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  for (const block of sim.blocks) {
    if (block.alive && (block.material === 'tnt' || block.material === 'crystal')) extras.push({ x: block.x, y: block.y });
  }
  return [...foes, ...extras.slice(0, 6)];
}

export function solve(level: LevelDef, budget = 1400): SolveResult {
  let prefix: Action[] = [];
  let trials = 0;

  for (let shot = 0; shot < level.birds.length; shot++) {
    const sim = replay(level, prefix);
    if (sim.phase !== 'aiming') break;
    const type = sim.queue[0] as BirdType;
    const launchScale = BIRDS[type].launch;
    const targets = targetsOf(sim);
    const candidates: { angle: number; power: number; x: number; y: number }[] = [];
    for (const t of targets) {
      for (const power of POWERS) {
        const aim = solveAim(sim.anchor, t.x, t.y, power, launchScale, sim.gravityScale);
        for (const angle of [aim.low, aim.high]) if (angle !== null && angle > -0.4 && angle < 1.5) candidates.push({ angle, power, x: t.x, y: t.y });
      }
    }
    // Plain sweep as a fallback (and the only thing that finds shots in wind); abilities fire relative to the nearest foe.
    const nearest = targets[0];
    if (nearest) for (const power of POWERS) for (const deg of SWEEP_DEG) candidates.push({ angle: (deg * Math.PI) / 180, power, x: nearest.x, y: nearest.y });
    const rank = (t: Trial): number => (t.won ? 1e9 : 0) + t.foes * 1e6 + t.score;
    let round: Trial | null = null;
    search: for (let mode = 0; mode < timings(type); mode++) {
      for (const c of candidates) {
        if (trials >= budget) break search;
        const trial = tryShot(level, prefix, c.angle, c.power, c.x, c.y, mode);
        trials++;
        if (trial && (!round || rank(trial) > rank(round))) round = trial;
        if (round?.won) break search;
      }
    }
    if (!round) break;
    prefix = round.actions;
    if (round.won) break;
  }
  const final = replay(level, prefix);
  while (final.foesAlive === 0 && phaseOf(final) !== 'won') step(final);
  return {
    won: phaseOf(final) === 'won',
    score: final.score,
    birdsUsed: final.birdsUsed,
    foesLeft: final.foesAlive,
    left: final.foes
      .filter((p) => p.alive)
      .map((p) => `${p.variant}@${p.x.toFixed(1)},${p.y.toFixed(1)} hp${Math.round(p.hp)}/${p.armor.toFixed(0)}`)
      .join(' '),
    actions: prefix,
    trials,
  };
}
