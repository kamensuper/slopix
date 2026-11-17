# Flock Fury - progress log

Short, factual log of the overhaul on branch `flock-fury`. Newest first.

## 2026-11-17

Verified at the start (commit `1572ced`): `tsc --noEmit` clean, 44/44 vitest tests, production build OK,
10/10 campaign levels stable and solvable. Unconnected at that point: 12 Storm, 12 Ironworks and 4 Frost levels.

| Commit | What | Checked |
| --- | --- | --- |
| `de1b0cc` | Ironworks: belt crates now hang from crane ropes (the belt used to carry the chock away), The Press gets a Brawn | `check-levels --set worldIron IRON`: 10/12 pass (was 7/12) |
| `b650e93` | VFX overhaul: cel-shaded fire/smoke/dust, comic bursts, speed lines, snowflakes, zaps, bold shock rings, flight-path dots, scorch marks | tsc, 44 tests, build, headless Chrome run (`tools/fx-shots.mjs`), screenshots reviewed |
| `ed75cec` | Boss intro cutscene, finisher cam with title, combo callouts | tsc, 44 tests, build, `tools/cine-shots.mjs`, screenshots reviewed |
| `06e0376` | Animated wings for all eight birds | tsc, 44 tests, build, roster sheet reviewed |
| (this commit) | Campaign grows from 3 worlds / 10 levels to 5 worlds / 35 levels: Frost levels join world 3, Stormreach Skies and the Ironworks are playable | tsc, 44 tests, build, `npm run levels:check` (35/35 pass), menu screenshots at desktop and phone sizes |

## Known gaps (not done)

- Levels held back because they fail `check-levels` (`HELD_BACK` in `src/levels/campaign.ts`):
  `4-12 Thunderhead Keep` (solver cannot win it), `5-9 Scrap Belt` (a rope snaps at rest), `5-10 Live Wire` (a foe drifts off its perch).
- World 6, the Celestial Ruins: backdrop, terrain and decor are drawn, there are no levels.
- Level editor (`openEditor` is still a no-op), sandbox, challenge mode, optional objectives: not started.
- Save data is still `flockfury.save.v1` without migrations. Level ids are stable save keys, so the new campaign order does not move anyone's progress.
- Physics debug overlay, per-ability tests beyond the existing 44, performance stress scenes: not started.
- Sprites: birds gained wings; foes, blocks and the slingshot are unchanged from `1572ced`.
- Solvability is proven by the greedy solver in `tools/solver.ts`, not by hand play-testing of every level.
- The new effects and cinematics were checked in headless Chrome at 1280x720 only; not profiled on phones.
