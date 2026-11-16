/**
 * The rules added in the rebirth: every bird's ability, every material's own behaviour, the new foes
 * and the level-wide physics. Each test builds the smallest level that shows the rule.
 */
import { describe, expect, it } from 'vitest';
import { ABILITY, BIRDS, FOES, MATERIALS, PHYSICS } from '../src/core/config';
import { BIRD_TYPES, BLOCK_MATERIALS, FOE_VARIANTS } from '../src/core/types';
import { launchVelocity, predictTrajectory, pullFromAim } from '../src/sim/slingshot';
import { Harness, makeLevel } from './helpers';

const firstOf = <T>(list: readonly T[]): T => list[0] as T;

describe('roster', () => {
  it('gives every bird a config and a distinct role', () => {
    const roles = new Set(BIRD_TYPES.map((type) => BIRDS[type].role));
    expect(roles.size).toBe(BIRD_TYPES.length);
    for (const type of BIRD_TYPES) {
      expect(BIRDS[type].radius).toBeGreaterThan(0.2);
      expect(BIRDS[type].blurb.length).toBeGreaterThan(10);
    }
  });

  it('keeps later birds from being strictly better: each one is weaker than Pip somewhere', () => {
    for (const type of BIRD_TYPES) {
      if (type === 'pip') continue;
      const mine = BIRDS[type];
      const weaker = BLOCK_MATERIALS.some((m) => mine.power[m] < BIRDS.pip.power[m]) || mine.launch < BIRDS.pip.launch || mine.radius * mine.radius * mine.density < 0.42 * 0.42 * 2.2;
      expect(weaker, `${type} has a weakness`).toBe(true);
    }
  });

  it('covers every material and foe with a config', () => {
    for (const m of BLOCK_MATERIALS) expect(MATERIALS[m].hpBase).toBeGreaterThan(0);
    for (const v of FOE_VARIANTS) expect(FOES[v].hp).toBeGreaterThan(0);
  });
});

describe('abilities', () => {
  it('Zip dashes: the tap at least doubles a slow flight', () => {
    const h = new Harness(makeLevel(['zip'], () => {}));
    h.fire(45, 0.6);
    h.step(20);
    const before = Math.hypot(h.sim.activeBird!.vx, h.sim.activeBird!.vy);
    expect(h.sim.activateAbility()).toBe(true);
    h.step(1);
    const after = Math.hypot(h.sim.activeBird!.vx, h.sim.activeBird!.vy);
    expect(after).toBeGreaterThanOrEqual(ABILITY.boost.minSpeed - 1);
    expect(after).toBeGreaterThan(before * 1.9);
    expect(h.sim.activateAbility()).toBe(false);
  });

  it('The Sprigs split into three', () => {
    const h = new Harness(makeLevel(['sprig'], () => {}));
    h.fire(45, 0.8);
    h.step(15);
    h.sim.activateAbility();
    expect(h.sim.birds.filter((b) => b.alive)).toHaveLength(3);
  });

  it('Ember explodes on tap and wrecks a stone hut from inside', () => {
    const h = new Harness(
      makeLevel(['ember'], (b) => {
        b.rect('stone', 20, 0, 0.5, 2);
        b.rect('stone', 23, 0, 0.5, 2);
        b.foe('small', 21.5, 0);
      }),
    );
    h.fireAt(20, 1.2, 1);
    h.until((sim) => sim.activeBird !== null && sim.activeBird.impacted, 6);
    expect(h.sim.activateAbility()).toBe(true);
    h.seconds(1);
    expect(h.events('explosion').some((e) => e.source === 'ember')).toBe(true);
    expect(h.sim.foesAlive).toBe(0);
  });

  it('Ember goes off by itself when the fuse runs out', () => {
    const h = new Harness(makeLevel(['ember'], () => {}));
    h.fire(30, 0.5);
    h.until((sim) => sim.activeBird !== null && sim.activeBird.impacted, 6);
    h.seconds(ABILITY.explode.fuse + 0.3);
    expect(h.events('explosion')).toHaveLength(1);
  });

  it('Brawn slams straight down and the landing shakes the ground', () => {
    const h = new Harness(
      makeLevel(['brawn'], (b) => {
        b.foe('small', 20, 0);
        b.foe('small', 21.4, 0);
      }),
    );
    h.fireAt(20.6, 9, 1, false);
    h.until((sim) => sim.activeBird !== null && sim.activeBird.x > 19.6, 6);
    expect(h.sim.activateAbility()).toBe(true);
    h.step(2);
    const bird = h.sim.activeBird!;
    expect(bird.vy).toBeLessThanOrEqual(-ABILITY.slam.dropSpeed + 1);
    expect(Math.abs(bird.vx)).toBeLessThan(4);
    h.seconds(2);
    expect(h.events('explosion').some((e) => e.source === 'quake')).toBe(true);
    expect(h.sim.foesAlive).toBe(0);
  });

  it('Brawn leaves the sling slower than Pip at the same pull', () => {
    const pull = pullFromAim(0.7, 1, { x: 0, y: 0 });
    const pip = launchVelocity(pull.x, pull.y, { x: 0, y: 0 }, BIRDS.pip.launch);
    const brawn = launchVelocity(pull.x, pull.y, { x: 0, y: 0 }, BIRDS.brawn.launch);
    expect(Math.hypot(brawn.x, brawn.y)).toBeLessThan(Math.hypot(pip.x, pip.y));
  });

  it('Rime freezes what is near: the same Pip hit does over twice the damage to frozen metal', () => {
    // A squat metal block that a bird cannot knock over, so both Pips hit the same face.
    const build = (birds: ('rime' | 'pip')[]) => makeLevel(birds, (b) => b.rect('metal', 20, 0, 2, 2));
    const hpOf = (h: Harness): number => h.sim.blocks[0]?.hp ?? 0;

    const plain = new Harness(build(['pip']));
    const plainBefore = hpOf(plain);
    plain.fireAt(19, 1, 1);
    plain.resolve();
    const dealtPlain = plainBefore - hpOf(plain);
    expect(dealtPlain).toBeGreaterThan(0);

    const frost = new Harness(build(['rime', 'pip']));
    frost.fireAt(19, 1, 1);
    frost.resolve();
    expect(frost.events('freeze')).toHaveLength(1);
    expect(firstOf(frost.sim.blocks).frozen).toBe(true);
    const frostBefore = hpOf(frost);
    frost.fireAt(19, 1, 1);
    frost.resolve();
    expect(frostBefore - hpOf(frost)).toBeGreaterThan(dealtPlain * 2);
  });

  it('Rime does not freeze ice, crystal or crates', () => {
    const h = new Harness(
      makeLevel(['rime'], (b) => {
        b.rect('ice', 20, 0, 0.8, 0.8);
        b.rect('crystal', 21, 0, 0.8, 0.8);
        b.rect('wood', 22, 0, 0.8, 0.8);
      }),
    );
    h.fireAt(21, 0.5, 1);
    h.until((sim) => sim.activeBird !== null && sim.activeBird.x > 19, 6);
    h.sim.activateAbility();
    const frozen = h.sim.blocks.filter((b) => b.frozen).map((b) => b.material);
    expect(frozen).toEqual(['wood']);
  });

  it('Jolt sends current through touching metal and shocks the foe standing on it', () => {
    const h = new Harness(
      makeLevel(['jolt'], (b) => {
        // A metal table: two legs and a top, a foe on the top, far from where the bolt lands.
        b.rect('metal', 20, 0, 0.4, 2);
        b.rect('metal', 26, 0, 0.4, 2);
        const top = b.plank('metal', 23, 2, 6.6, 0.3);
        b.foe('helmet', 25.5, top);
      }),
    );
    h.seconds(1);
    h.fireAt(18.5, 2.5, 1);
    h.until((sim) => sim.activeBird !== null && sim.activeBird.x > 17.5, 6);
    expect(h.sim.activateAbility()).toBe(true);
    const shock = firstOf(h.events('shock'));
    expect(shock.hits).toBeGreaterThanOrEqual(3);
    h.seconds(0.5);
    // The helmet does not help against lightning.
    expect(h.sim.foesAlive).toBe(0);
  });

  it('Jolt cannot energise wood', () => {
    const h = new Harness(
      makeLevel(['jolt'], (b) => {
        b.rect('wood', 20, 0, 0.4, 2);
        const top = b.plank('wood', 21.5, 2, 3.4, 0.3);
        b.foe('small', 22.5, top);
      }),
    );
    h.seconds(1);
    h.fireAt(13, 6, 1);
    h.until((sim) => sim.activeBird !== null && sim.activeBird.x > 12, 6);
    h.sim.activateAbility();
    expect(firstOf(h.events('shock')).hits).toBe(0);
    expect(h.sim.foesAlive).toBe(1);
  });

  it('Nova opens a gravity well that drags loose pieces towards it, then bursts', () => {
    const h = new Harness(
      makeLevel(['nova'], (b) => {
        b.rect('wood', 22, 0, 0.6, 0.6);
        b.rect('wood', 24, 0, 0.6, 0.6);
      }),
    );
    h.seconds(1);
    const startX = h.sim.blocks.map((b) => b.x);
    h.fireAt(23, 4, 1);
    h.until((sim) => sim.activeBird !== null && sim.activeBird.x > 22.6, 6);
    expect(h.sim.activateAbility()).toBe(true);
    const cx = h.sim.activeBird!.x;
    h.seconds(ABILITY.gravity.duration * 0.8);
    const [a, b] = h.sim.blocks;
    expect(Math.abs(a!.x - cx)).toBeLessThan(Math.abs(startX[0]! - cx));
    expect(Math.abs(b!.x - cx)).toBeLessThan(Math.abs(startX[1]! - cx));
    expect(a!.y).toBeGreaterThan(0.6);
    h.seconds(1);
    expect(h.events('gravityWell').map((e) => e.active)).toEqual([true, false]);
    expect(h.events('explosion').some((e) => e.source === 'nova')).toBe(true);
  });
});

describe('materials', () => {
  it('ice is slippery: a block slides off a slope that holds wood', () => {
    const slide = (material: 'ice' | 'wood') => {
      const h = new Harness(
        makeLevel(['pip'], (b) => {
          b.ramp(20, 2, 8, 0.4, -14);
          b.block(material, 'rect', 19, 2.85, 1, 0.6, -14);
        }),
      );
      const x0 = firstOf(h.sim.blocks).x;
      h.seconds(3);
      return (h.sim.blocks[0]?.x ?? 99) - x0;
    };
    expect(slide('wood')).toBeLessThan(0.3);
    expect(slide('ice')).toBeGreaterThan(2);
  });

  it('a crack spreads from a shattered ice block into the ice it touches', () => {
    const h = new Harness(
      makeLevel(['pip'], (b) => {
        for (let i = 0; i < 4; i++) b.rect('ice', 20, i * 0.8, 0.8, 0.8);
      }),
    );
    h.seconds(1);
    h.fireAt(20, 1.2, 1);
    h.resolve();
    expect(h.events('iceCrack').length).toBeGreaterThanOrEqual(1);
    expect(h.events('blockDestroyed').length).toBeGreaterThanOrEqual(2);
  });

  it('ironwood survives a hit that splinters plain wood', () => {
    const hit = (material: 'wood' | 'ironwood') => {
      const h = new Harness(makeLevel(['pip'], (b) => b.rect(material, 20, 0, 0.3, 2.4)));
      h.fireAt(20, 1.4, 1);
      h.resolve();
      return h.sim.blocks.length;
    };
    expect(hit('wood')).toBe(0);
    expect(hit('ironwood')).toBe(1);
  });

  it('a shattered crystal pulses: it hurts a nearby foe and sets off the next crystal', () => {
    const h = new Harness(
      makeLevel(['sprig'], (b) => {
        b.rect('crystal', 20, 0, 0.7, 0.7);
        b.rect('crystal', 22, 0, 0.7, 0.7);
        b.foe('small', 23.4, 0);
      }),
    );
    h.seconds(1);
    h.fireAt(20, 0.5, 1);
    h.resolve();
    expect(h.events('resonance').length).toBe(2);
    expect(h.sim.foesAlive).toBe(0);
  });

  it('rubber bounces a bird back without counting as its impact, and takes no impact damage', () => {
    const h = new Harness(makeLevel(['pip'], (b) => b.rect('rubber', 20, 0, 1, 4)));
    h.fireAt(20, 2, 1);
    h.until(() => h.events('bounce').length > 0, 6);
    expect(h.events('bounce')).toHaveLength(1);
    const bird = h.sim.activeBird!;
    expect(bird.impacted).toBe(false);
    h.step(3);
    expect(bird.vx).toBeLessThan(0);
    h.resolve();
    expect(firstOf(h.sim.blocks).hp).toBe(firstOf(h.sim.blocks).maxHp);
  });

  it('frozen rubber stops bouncing and breaks', () => {
    const h = new Harness(makeLevel(['rime', 'pip', 'pip'], (b) => b.rect('rubber', 20, 0, 2, 2)));
    h.fireAt(19, 1, 1);
    h.resolve();
    // Rime itself still bounces once; the frost goes off on that first touch.
    expect(h.events('bounce')).toHaveLength(1);
    expect(firstOf(h.sim.blocks).frozen).toBe(true);
    h.fireAt(19, 1, 1);
    h.resolve();
    expect(h.events('bounce')).toHaveLength(1);
    const block = h.sim.blocks[0];
    expect(block ? block.hp < block.maxHp : true).toBe(true);
  });

  it('a bird cuts a rope it flies through', () => {
    const h = new Harness(
      makeLevel(['pip'], (b) => {
        b.hang('stone', 'rect', 20, 3, 1, 1, 9);
        b.foe('small', 20, 0);
      }),
    );
    h.seconds(1);
    expect(h.sim.joints).toHaveLength(1);
    h.fireAt(20, 6.2, 1);
    h.resolve();
    const cut = h.events('jointBroken');
    expect(cut).toHaveLength(1);
    expect(firstOf(cut).cut).toBe(true);
    // The freed stone drops on the foe underneath.
    expect(h.sim.foesAlive).toBe(0);
  });

  it('explosive crates chain', () => {
    const h = new Harness(
      makeLevel(['pip'], (b) => {
        b.tnt(20, 0);
        b.tnt(22.4, 0);
        b.tnt(24.8, 0);
      }),
    );
    h.fireAt(20, 0.5, 1);
    h.resolve();
    expect(h.events('explosion').filter((e) => e.source === 'tnt')).toHaveLength(3);
  });
});

describe('foes', () => {
  it('a shield stops a frontal hit that would defeat a bare foe', () => {
    const hit = (variant: 'medium' | 'shield') => {
      const h = new Harness(makeLevel(['pip'], (b) => b.foe(variant, 20, 0)));
      h.fireAt(19.5, 0.6, 1);
      h.resolve();
      return h.sim.foesAlive;
    };
    expect(hit('medium')).toBe(0);
    expect(hit('shield')).toBe(1);
  });

  it('a shield does not cover the head: a drop from above gets through', () => {
    const h = new Harness(
      makeLevel(['pip'], (b) => {
        b.foe('shield', 20, 0);
        b.hang('stone', 'rect', 20, 6, 1.4, 1.4, 10);
      }),
    );
    h.seconds(1);
    h.fireAt(20, 8.4, 1);
    h.resolve();
    expect(firstOf(h.events('jointBroken')).cut).toBe(true);
    expect(h.sim.foesAlive).toBe(0);
  });

  it('a sapper explodes when defeated and takes its neighbour with it', () => {
    const h = new Harness(
      makeLevel(['pip'], (b) => {
        b.foe('sapper', 20, 0);
        b.foe('small', 21.2, 0);
      }),
    );
    h.fireAt(19.6, 0.5, 1);
    h.resolve();
    expect(h.events('explosion').some((e) => e.source === 'sapper')).toBe(true);
    expect(h.sim.foesAlive).toBe(0);
  });

  it('a balloonist hangs in the air until something touches it, then falls', () => {
    const h = new Harness(makeLevel(['pip'], (b) => b.balloon(20, 7)));
    h.seconds(3);
    const foe = firstOf(h.sim.foes);
    expect(foe.floating).toBe(true);
    expect(Math.abs(foe.y - 7)).toBeLessThan(0.1);
    h.fireAt(20, 7, 1);
    h.resolve();
    expect(h.events('balloonPopped')).toHaveLength(1);
    expect(h.sim.foesAlive).toBe(0);
  });

  it('a patrolling balloon moves and comes back', () => {
    const h = new Harness(makeLevel(['pip'], (b) => b.balloon(24, 7, 3)));
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 60 * 6; i++) {
      h.step();
      const x = firstOf(h.sim.foes).x;
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    expect(firstOf(h.sim.foes).floating).toBe(true);
    expect(max - min).toBeGreaterThan(4);
    expect(max - min).toBeLessThan(7);
  });

  it('frost bursts a balloon', () => {
    const h = new Harness(makeLevel(['rime'], (b) => b.balloon(20, 6)));
    h.seconds(1);
    h.fireAt(19, 4.5, 1);
    h.until((sim) => sim.activeBird !== null && sim.activeBird.x > 18.4, 6);
    h.sim.activateAbility();
    expect(h.events('balloonPopped')).toHaveLength(1);
  });
});

describe('level physics', () => {
  it('the preview still matches the flight in wind and low gravity', () => {
    const level = makeLevel(['pip'], (b) => b.wind(-2.5).gravity(0.6));
    const h = new Harness(level);
    const pull = pullFromAim((42 * Math.PI) / 180, 0.8, { x: 0, y: 0 });
    const v = launchVelocity(pull.x, pull.y, { x: 0, y: 0 });
    const predicted = new Float32Array(400);
    const count = predictTrajectory(h.sim.anchor.x + pull.x, h.sim.anchor.y + pull.y, v.x, v.y, predicted, 200, PHYSICS.substeps, 0.6, 0.6, -2.5);
    h.sim.launch(pull.x, pull.y);
    const bird = h.sim.activeBird!;
    let worst = 0;
    for (let i = 1; i < count - 1; i++) {
      h.step();
      worst = Math.max(worst, Math.hypot(bird.x - predicted[i * 2]!, bird.y - predicted[i * 2 + 1]!));
    }
    expect(count).toBeGreaterThan(80);
    expect(bird.impacted).toBe(false);
    expect(worst).toBeLessThan(0.03);
  });

  it('a conveyor carries what lies on it', () => {
    const h = new Harness(
      makeLevel(['pip'], (b) => {
        const top = b.ledge(22, 0, 8, 1, 'conveyor', 2);
        b.rect('wood', 20, top, 0.8, 0.8);
      }),
    );
    const x0 = firstOf(h.sim.blocks).x;
    h.seconds(2);
    expect(firstOf(h.sim.blocks).x - x0).toBeGreaterThan(2);
  });

  it('a motor turns its block and does not keep the shot from resolving', () => {
    const h = new Harness(
      makeLevel(['pip'], (b) => {
        b.block('metal', 'rect', 24, 5, 4, 0.4);
        b.motor(b.last, 24, 5, 90);
      }),
    );
    h.seconds(1);
    expect(Math.abs(firstOf(h.sim.blocks).angle)).toBeGreaterThan(1.2);
    h.fire(60, 0.4);
    expect(h.resolve(20)).toBe(true);
  });

  it('a bouncy surface throws a bird back up', () => {
    const h = new Harness(makeLevel(['pip'], (b) => b.ledge(18, 0, 6, 0.5, 'bouncy')));
    h.fireAt(18, 0.6, 0.8, true);
    h.until(() => h.events('bounce').length > 0, 8);
    h.step(4);
    expect(h.sim.activeBird!.vy).toBeGreaterThan(4);
  });

  it('is deterministic: the same inputs give the same world, tick for tick', () => {
    const run = (): string => {
      const h = new Harness(
        makeLevel(['ember', 'zip'], (b) => {
          for (let i = 0; i < 5; i++) {
            b.rect('wood', 20 + i * 1.2, 0, 0.3, 2);
            b.rect('glass', 20 + i * 1.2, 2.25, 0.3, 1.2);
          }
          b.plank('stone', 22.4, 2, 5.6);
          b.tnt(22.4, 0);
          b.foe('medium', 23.6, 0);
        }),
      );
      h.fireAt(21, 1, 1);
      h.until((sim) => sim.activeBird !== null && sim.activeBird.impacted, 6);
      h.sim.activateAbility();
      h.resolve();
      h.fireAt(23, 1, 1);
      h.step(18);
      h.sim.activateAbility();
      h.resolve();
      return JSON.stringify([h.sim.tick, h.sim.score, h.sim.blocks.map((b) => [b.x, b.y, b.angle, b.hp]), h.sim.foes.map((f) => [f.x, f.y, f.hp])]);
    };
    expect(run()).toBe(run());
  });
});

