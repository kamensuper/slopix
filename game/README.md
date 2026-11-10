# Flock Fury

An original slingshot physics game in the spirit of the classic bird-flinging games.
HTML5 Canvas + TypeScript, [Planck.js](https://piqnt.com/planck.js/) rigid-body physics, built with Vite.
No backend; progress is saved in `localStorage`.

## Run

```bash
cd game
npm ci
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into game/dist
npm run preview    # serve the production build
```

## Checks

```bash
npm test               # simulation unit tests (vitest)
npm run levels:check   # every level: stands still at rest + solver finds a win with its own birds
npm run e2e            # headless Chrome: real mouse + touch play-through (needs Chrome, CHROME_PATH to override)
```

## Controls

- Drag the bird in the slingshot back and release; the dotted line is the predicted path.
- Tap / click anywhere while a bird flies to use its power.
- Drag the background, scroll or pinch to look around; the HUD button toggles a full-level overview.
- Keyboard: arrows aim, Space launches / uses powers, R restarts, O overview, Esc pauses.

## What is in this build

- Fixed-timestep simulation (60 Hz, 2 sub-steps) with sleeping, collision filtering and bullet
  projectiles, kept separate from rendering (`src/sim`). Rendering interpolates between ticks.
- Wood, glass, stone and TNT with their own density, friction, durability and damage thresholds. Damage
  is impulse/velocity based with per-pair cooldowns, so resting contacts do no damage.
- Five birds: Red, Chuck (boost), Bomb (tap or fuse explosion), the Blues (split into three),
  Matilda (egg drop + upward kick). Six pig types: small, medium, large, helmet, armoured, king.
- 30 hand-built levels across Grasslands, Desert and Snowlands (`src/levels`). Every level is checked
  by `levels:check`: it must not move before it is hit and must be winnable with its own birds.
  Star thresholds were set from the solver's winning scores (two stars ≈ 60 %, three ≈ 90 %).
- Scoring with floating numbers, unused-bird bonus, per-level three-star rating, best scores and unlocks.
- Menus: title, chapters, levels (locked/unlocked + stars), pause, results, settings (music / effects
  volume, mute, reset progress), how-to-play, credits.
- Procedural Web Audio effects and per-chapter music loops (start after the first user gesture).
- Particles, screen shake, hit flashes, slow motion on big collapses, camera intro / follow / return.
- Responsive canvas with a capped device-pixel ratio, touch input, no page scrolling while playing.

## Architecture

| Path | Role |
| --- | --- |
| `src/app/Game.ts` | Application: canvas, frame loop, scenes, UI actions, results, save |
| `src/scenes/play/PlayScene.ts` | Gameplay scene: fixed-step loop, input, camera modes, drawing |
| `src/scenes/play/SlingView.ts`, `ActorViews.ts`, `Feedback.ts` | Slingshot, character animation, game-feel effects |
| `src/sim/*` | Deterministic simulation: `GameSim`, birds/abilities, damage, explosions, scoring |
| `src/render/*` | Camera, world renderer + sprite cache, particles, floating text, procedural art |
| `src/levels/*` | Level schema, builder, structure kit, the three chapters |
| `src/ui/*`, `src/styles/*` | DOM menus / HUD / overlays |
| `src/audio/AudioManager.ts` | Procedural Web Audio |
| `src/save/SaveManager.ts` | localStorage progress and settings |
| `tools/` | Level checker, screenshot and e2e tools |

## Known limitations (this build is deliberately "barely finished")

- **No level editor.** The editor module was never built.
- **Placeholder-grade art for pigs, blocks, props and backgrounds.** The birds are fully drawn, but pigs,
  blocks, the slingshot, terrain and skies use simple procedural stand-ins (`src/render/art/pigs.ts`,
  `blocks.ts`, `props.ts`, `environment.ts`). There are no parallax layers, decor or weather yet.
- Audio is functional but simple synth sounds and loops.
- Level solvability is proven by an automated greedy solver, not by hand play-testing every level.
  A few levels got an extra bird and helmet/armoured pig armour was lowered to make that pass.
- Performance was not profiled on real phones.
