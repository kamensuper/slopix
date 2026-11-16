# Flock Fury — Rebirth audit

Audit of the game as found, before the overhaul. Everything below was read from the source or
measured by running it; nothing is assumed.

## Provenance

| | |
| --- | --- |
| Repository | `kamensuper/slopix` |
| Where the game was found | branch `hoplite/phaistos-ec8fe325`, directory `game/` (no `flock-fury` branch existed) |
| Baseline revision | `ba7b513` "checkpoint: more late stream edits (unverified)" |
| How it relates to Slopix | The branch forks from `4c6dc29` (licence/readme only). It contains **no** OS sources, so the game shares no files with the Slopix kernel, drivers, desktop or SDK. |
| New branch | `flock-fury`, created from `ba7b513`. All work stays inside `game/`. |

The only other trace of the game in the repository is commit `a92e290` ("restore Flock Fury game
tree ...") on the same branch. `main` and the other branches hold the operating system and no game.

## Baseline build (reproducible)

Node 22.23, npm 11.21, `cd game && npm ci`:

| Check | Result at `ba7b513` |
| --- | --- |
| `npx tsc --noEmit` (strict) | clean |
| `npx vitest run` | 11 tests, 1 file, all pass |
| `npm run levels:check` | 10 / 10 levels stable and solvable (35 s for the last one) |
| `npx vite build` | OK, 556 kB JS (161 kB gzip) |
| Legacy 30-level set (not in the campaign) | still stable and solvable with the current physics |
| Headless Chrome play-through | no console errors; screenshots in `docs/rebirth/baseline/` |

## What is there

| Area | Finding |
| --- | --- |
| Runtime | TypeScript 7 (strict), Vite 8, Canvas 2D, DOM/CSS menus, no backend. ~21.7k lines. |
| Physics | Planck.js 1.5. Fixed 60 Hz tick, 2 sub-steps, 8/3 iterations, sleeping on, bullets for projectiles. Rendering interpolates. Good foundation: kept. |
| Entities | Plain records attached to bodies (`sim/entities.ts`): block, pig, bird, terrain. No components. |
| Damage | `DamageSystem`: pre-solve closing speed x effective mass, post-solve impulse for crushing, per-pair cooldown, smash-through. Sound design, kept and extended. |
| Materials | wood, glass, stone, metal, TNT. They differ only in numbers (density, hp, friction); no material has a mechanic of its own. |
| Joints | Rope and pin (hinge) with optional breaking strength. |
| Birds | 5: plain, speed boost, bomb, split in three, egg drop. |
| Enemies | 6 variants that differ only in radius, hit points and armour. They never act. |
| Levels | 10 "featured" levels in 3 worlds are playable. 30 older levels are compiled in but unreachable. |
| Level format | JSON-serialisable `LevelDef` with a strict validator (`levels/schema.ts`). |
| Slingshot | Pull clamp, launch maths and trajectory preview share one module, so the preview is exact. Keyboard aiming exists. |
| Camera | intro / sling / follow / free / overview, critically damped. |
| Progression | Stars and best score per level, linear unlock. Save is `flockfury.save.v1`, tolerant of corrupt data, no migration path, settings mixed in with progress. |
| UI | Title, chapters, levels, HUD, pause, results, settings, how-to, credits. `openEditor` is an empty function. |
| Audio | Procedural Web Audio effects and three music loops. Two volume sliders and mute. |
| Art | Procedural canvas art, cached sprites. Environments and materials are good. |
| Tests | 11 simulation unit tests, a greedy solver for solvability, one browser smoke test. |
| Performance | 700-particle cap, capped DPR and backing store, sprite cache. No high-object-count measurement recorded. |

## The five biggest weaknesses

1. **It is not its own game.** The roster is Red, Chuck, Bomb, The Blues and Matilda against green
   pigs led by a King Pig, drawn to match: a red round bird with heavy brows, a yellow triangle, a
   black bird with a fuse, small blue triplets, a white egg-layer. Names, abilities and silhouettes
   are another studio's characters. This is the first thing to replace, with an original flock and
   an original enemy faction.
2. **There is very little to play.** Ten levels, one mode. Thirty finished levels are shipped but
   unreachable, the level editor was never built, and there is nothing to return to after the last
   level.
3. **The world does not do anything.** Materials are five sets of numbers, enemies are identical
   targets with different hit points, and no level has wind, ice, electricity, bounce or any other
   interaction. Every puzzle is therefore the same puzzle: hit the weak post.
4. **Progression and comfort features are missing.** No achievements, statistics, challenges or
   rewards; no fast-forward, aim assist or quality setting; the save file has no schema migration
   and keeps settings and progress in one blob.
5. **Verification is thin for a physics game.** Eleven unit tests cover the whole simulation. There
   is no determinism test, no per-material or per-ability test, no malformed-save test, and the two
   newest commits are labelled "unverified" by their own author.

Smaller defects found on the way: the frame loop silently drops simulated time when a frame takes
longer than five ticks; `PlayScene` mixes input, camera and joint rendering in one 590-line class;
the desert backdrop contains a statue of a bird that is recognisably someone else's character.

## Decisions for the overhaul

- Keep Planck.js, the fixed-step loop, the damage model, the level schema and the DOM UI. Extend
  them; do not rewrite them.
- Replace every borrowed character with an original one before adding content.
- Give each material and each enemy a rule of its own, and build levels around those rules.
- Every level that ships must pass the automated stability and solvability check.
