# Flock Fury - art direction

Everything is drawn procedurally with the Canvas 2D API. No image files, no copied sprites:
every character and prop is an original design in the *spirit* of classic slingshot games.

## Look

- Bright Saturday-morning cartoon. Bold, instantly readable silhouettes.
- **Gameplay objects** (birds, pigs, blocks, slingshot, terrain pieces) have a thick dark outline in
  the shared ink colour `#2b1a12` (see `src/core/palette.ts`), slightly uneven for a hand-drawn feel.
- **Backgrounds have no dark outlines**: flat painterly shapes with soft gradients, cooler and paler
  with distance (atmospheric perspective), so the playfield always reads first.
- Soft cel shading: a base colour, one darker shade on the lower-right, one lighter tone on the
  upper-left, a subtle gradient across the form and a small crisp specular highlight.
- Key light comes from the **top-left**.
- Rounded corners, slightly wobbly lines. Nothing should look like a plain CSS rectangle or a perfect
  geometric primitive: handcrafted, chunky, a little imperfect.
- Faces carry the charm: large eyes with thick lids, expressive brows, squash and stretch.

## Line weights (relative to the design spaces in `src/render/art/types.ts`)

| Element | Outline |
| --- | --- |
| Characters (radius 100 units) | 7 - 8 units, inner details 4 - 5 |
| Blocks / props / terrain (100 units per metre) | 5 - 6 units, inner details 2 - 3 |
| Particles | 0 - 3 units |

Art is frequently shown small: a bird can be only 28 px across on screen. Favour few, large,
high-contrast features over fine detail, and check artwork at small sizes.

## Palette

| Thing | Colours |
| --- | --- |
| Ink (outlines) | `#2b1a12` |
| Red | body `#e23b2e`, shade `#a81f22`, belly `#f2d9b6`, beak `#f7b125` |
| Chuck | body `#f8cf1c`, shade `#d9960b`, belly `#fff3c2`, beak `#f08a1c` |
| Bomb | body `#34343d`, shade `#17171c`, patch `#8e8e9c`, fuse tip `#ffb629` |
| The Blues | body `#58b7ee`, shade `#2b7fc4`, belly `#e8f7ff`, beak `#f7b125` |
| Matilda | body `#f5f0e6`, shade `#cfc5b3`, cheeks `#f6b7a6`, beak `#f7b125` |
| Pigs | body `#8fd14f`, shade `#5fae2e`, light `#c3ee8b`, snout `#a6e36a`, nostrils `#2f6b1b` |
| Wood | `#d9a05b`, shade `#a8682f`, light `#f2c98a` |
| Glass | `#aee3f5` at roughly 55 % opacity, glints `#ffffff`, edge `#6fb9d8` |
| Stone | `#9aa0a6`, shade `#6c727a`, light `#c9ced3` |
| TNT | crate `#c0392b`, shade `#8c2318`, stencil `#f2e2b0` |
| Grasslands | sky `#58c0f5` to `#c9f0ff`, hills `#7fcf4a` `#57b33a` `#3f9a3a`, far mountains `#8fb6d9` |
| Desert | sky `#ffb85c` to `#ffe9c4`, dunes `#e8b76a` `#d99a4e`, mesas `#c2703f` `#a2552f` |
| Snowlands | sky `#9fc8ee` to `#e6f4ff`, mountains `#b9d3ea`, pines `#2f6f6a`, snow `#f4fbff`, snow shade `#b8d9f2` |
| UI primary | orange `#ffb629` to `#ff8a1f`; confirm green `#7ed957` to `#3fae2a`; neutral blue `#4fc3f7` to `#1e88e5`; danger red `#ff6b5e` to `#d63a2e` |
| UI panels | cream `#fff3d6`, wood-brown border `#4a2c17` |

## Typography

- Display (titles, buttons, numbers): **Lilita One** (`var(--font-display)`).
- Body: **Fredoka** (`var(--font-body)`).
- Both are bundled with the game (SIL Open Font License) and loaded before the first frame.
