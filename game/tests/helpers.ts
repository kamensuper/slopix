import type { SimEvent, SimEventOf, SimEventType } from '../src/core/events';
import type { BirdType, LevelDef } from '../src/core/types';
import { LevelBuilder } from '../src/levels/builder';
import { solveAim } from '../src/sim/aim';
import { GameSim } from '../src/sim/GameSim';
import { pullFromAim } from '../src/sim/slingshot';

/** Builds a small test level; `design` adds the pieces. A far-away pig is added when none is placed. */
export function makeLevel(birds: BirdType[], design: (b: LevelBuilder) => void, opts: { keepEmpty?: boolean } = {}): LevelDef {
  const b = new LevelBuilder('test', 'Test', 'grasslands', birds);
  let pigs = 0;
  const pig = b.pig.bind(b);
  b.pig = (...args) => {
    pigs++;
    return pig(...args);
  };
  design(b);
  if (pigs === 0 && !opts.keepEmpty) b.pig('king', 42, 0);
  return b.build();
}

/** Simulation wrapper that keeps every event for later inspection. */
export class Harness {
  readonly sim: GameSim;
  readonly log: SimEvent[] = [];

  constructor(readonly level: LevelDef) {
    this.sim = new GameSim(level);
    this.drain();
  }

  private drain(): void {
    this.log.push(...this.sim.events);
    this.sim.events.length = 0;
  }

  step(ticks = 1): this {
    for (let i = 0; i < ticks; i++) {
      this.sim.step();
      this.drain();
    }
    return this;
  }

  seconds(s: number): this {
    return this.step(Math.round(s * 60));
  }

  /** Steps until the predicate holds. Returns false if `maxSeconds` pass first. */
  until(predicate: (sim: GameSim) => boolean, maxSeconds = 30): boolean {
    const limit = Math.round(maxSeconds * 60);
    for (let i = 0; i < limit; i++) {
      if (predicate(this.sim)) return true;
      this.step();
    }
    return predicate(this.sim);
  }

  /** Steps until the current shot is resolved (next bird ready, won or lost). */
  resolve(maxSeconds = 30): boolean {
    return this.until((sim) => sim.phase !== 'flying', maxSeconds);
  }

  events<T extends SimEventType>(type: T): SimEventOf<T>[] {
    return this.log.filter((e): e is SimEventOf<T> => e.type === type);
  }

  /** Launches at an angle (degrees above the horizon) and power 0..1. */
  fire(angleDeg: number, power = 1): boolean {
    const pull = pullFromAim((angleDeg * Math.PI) / 180, power, { x: 0, y: 0 });
    return this.sim.launch(pull.x, pull.y);
  }

  /** Launches the loaded bird so that it flies through (x, y). */
  fireAt(x: number, y: number, power = 1, lob = false): boolean {
    const aim = solveAim(this.sim.anchor, x, y, power);
    const angle = lob ? aim.high : aim.low;
    if (angle === null) throw new Error(`target (${x}, ${y}) is out of range at power ${power}`);
    const pull = pullFromAim(angle, power, { x: 0, y: 0 });
    return this.sim.launch(pull.x, pull.y);
  }
}
