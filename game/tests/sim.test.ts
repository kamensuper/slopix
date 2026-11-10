import { describe, expect, it } from 'vitest';
import { PHYSICS, SLING } from '../src/core/config';
import { launchVelocity, predictTrajectory, pullFromAim } from '../src/sim/slingshot';
import { Harness, makeLevel } from './helpers';

describe('slingshot', () => {
  it('launches opposite to the pull, with speed proportional to the pull distance', () => {
    const v = launchVelocity(-1.5, -0.5, { x: 0, y: 0 });
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeGreaterThan(0);
    // Exactly anti-parallel to the pull.
    expect(v.x * -0.5 - v.y * -1.5).toBeCloseTo(0, 9);
    const half = launchVelocity(-SLING.maxPull / 2, 0, { x: 0, y: 0 });
    const full = launchVelocity(-SLING.maxPull, 0, { x: 0, y: 0 });
    expect(Math.hypot(half.x, half.y)).toBeCloseTo(SLING.maxSpeed / 2, 9);
    expect(Math.hypot(full.x, full.y)).toBeCloseTo(SLING.maxSpeed, 9);
    // Pulling further than the limit does not add speed.
    const over = launchVelocity(-SLING.maxPull * 3, 0, { x: 0, y: 0 });
    expect(Math.hypot(over.x, over.y)).toBeCloseTo(SLING.maxSpeed, 9);
  });

  it('launches the physical bird in the direction opposite to the drag', () => {
    const h = new Harness(makeLevel(['red'], () => {}));
    expect(h.sim.launch(-1.6, -0.9)).toBe(true);
    const bird = h.sim.activeBird!;
    expect(bird.vx).toBeGreaterThan(0);
    expect(bird.vy).toBeGreaterThan(0);
    h.step(10);
    expect(bird.x).toBeGreaterThan(h.sim.anchor.x - 1.6);
    expect(h.events('birdLaunched')).toHaveLength(1);
  });

  it('cancels a pull below the minimum threshold', () => {
    const h = new Harness(makeLevel(['red'], () => {}));
    expect(h.sim.launch(-SLING.minPull * 0.5, 0)).toBe(false);
    expect(h.sim.phase).toBe('aiming');
    expect(h.sim.queue).toHaveLength(1);
  });

  it('predicts the trajectory the physics engine actually produces', () => {
    const h = new Harness(makeLevel(['red'], () => {}));
    const pull = pullFromAim((40 * Math.PI) / 180, 0.9, { x: 0, y: 0 });
    const v = launchVelocity(pull.x, pull.y, { x: 0, y: 0 });
    const predicted = new Float32Array(400);
    const count = predictTrajectory(h.sim.anchor.x + pull.x, h.sim.anchor.y + pull.y, v.x, v.y, predicted, 200, PHYSICS.substeps, 0.6);
    expect(count).toBeGreaterThan(60);
    h.sim.launch(pull.x, pull.y);
    const bird = h.sim.activeBird!;
    let worst = 0;
    for (let i = 1; i < count - 1; i++) {
      h.step();
      worst = Math.max(worst, Math.hypot(bird.x - predicted[i * 2]!, bird.y - predicted[i * 2 + 1]!));
    }
    expect(bird.impacted).toBe(false);
    expect(worst).toBeLessThan(0.02);
  });
});

describe('structures', () => {
  const tower = () =>
    makeLevel(['red', 'red'], (b) => {
      // Three storeys of posts and lintels with a pig on each floor and a stone cap.
      let top = 0;
      for (let floor = 0; floor < 3; floor++) {
        b.post(floor === 1 ? 'glass' : 'wood', 23, top, 2);
        b.post(floor === 1 ? 'glass' : 'wood', 26, top, 2);
        b.pig('small', 24.5, top);
        top = b.plank(floor === 2 ? 'stone' : 'wood', 24.5, top + 2, 3.5);
      }
      b.tri('wood', 24.5, top, 2, 1);
      b.ball('stone', 30, 0, 1);
    });

  it('stand perfectly still before anything hits them', () => {
    const h = new Harness(tower());
    const start = h.sim.blocks.map((e) => ({ x: e.x, y: e.y, angle: e.angle }));
    h.seconds(6);
    h.sim.blocks.forEach((e, i) => {
      expect(Math.hypot(e.x - start[i]!.x, e.y - start[i]!.y)).toBeLessThan(0.01);
      expect(Math.abs(e.angle - start[i]!.angle)).toBeLessThan(0.01);
      expect(e.hp).toBe(e.maxHp);
      expect(e.body.isAwake()).toBe(false);
    });
    expect(h.sim.pigs.every((p) => p.hp === p.maxHp)).toBe(true);
    expect(h.sim.score).toBe(0);
    expect(h.events('impact')).toHaveLength(0);
  });

  it('collapse when a support is destroyed', () => {
    const h = new Harness(tower());
    h.seconds(1);
    const post = h.sim.blocks[0]!;
    const lintel = h.sim.blocks[2]!;
    const before = lintel.y;
    h.sim.applyDamage(post, 1e6, post.x, post.y);
    h.seconds(3);
    expect(post.alive).toBe(false);
    expect(h.events('blockDestroyed').length).toBeGreaterThanOrEqual(1);
    // The lintel lost one of its two supports and came down with everything above it.
    expect(before - lintel.y).toBeGreaterThan(0.5);
  });

  it('let a heavy stone crush glass it lands on', () => {
    const h = new Harness(
      makeLevel(['red'], (b) => {
        b.plank('glass', 25, 0, 2);
        b.block('stone', 'rect', 25, 4.5, 1, 1);
      }),
    );
    const glass = h.sim.blocks[0]!;
    h.seconds(3);
    expect(glass.alive).toBe(false);
    expect(h.sim.blocks.some((e) => e.material === 'stone' && e.alive)).toBe(true);
  });

  it('hurt a pig when debris falls on it', () => {
    const h = new Harness(
      makeLevel(['red'], (b) => {
        b.pig('medium', 25, 0);
        b.block('stone', 'rect', 25, 6, 1, 1);
      }),
    );
    const pig = h.sim.pigs[0]!;
    h.seconds(3);
    expect(pig.hp).toBeLessThan(pig.maxHp);
    expect(h.events('pigDamaged').length + h.events('pigDefeated').length).toBeGreaterThan(0);
  });
});
