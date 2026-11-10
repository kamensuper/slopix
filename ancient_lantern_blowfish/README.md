# Ancient Lantern Blowfish

A boss-sized, hard-edged Roblox pet: a teal-and-gold blowfish from a forgotten
underwater civilization, bristling with crystal spikes and carrying an ancient
lantern on a segmented stalk, with broken gold pillars drifting around it.

![Three-quarter front](renders/three_quarter_front.png)

| Front | Side | Rear |
| --- | --- | --- |
| ![Front](renders/front.png) | ![Side](renders/side.png) | ![Rear](renders/rear.png) |

Extra angles: `renders/three_quarter_rear.png`, `renders/top_down.png`,
`renders/contact_sheet.png`. The grey figure is a 5-stud avatar dummy for scale;
it exists only in the renders, not in the model files.

## Files

| File | Purpose |
| --- | --- |
| `AncientLanternBlowfish.blend` | Blender source (saved from Blender 5.0.1), organized in `ALB_*` collections |
| `AncientLanternBlowfish.fbx` | Roblox Studio import (triangulated, meshes only) |
| `AncientLanternBlowfish.glb` | Quick inspection in any glTF viewer |
| `build_blowfish.py` | Rebuilds the model and all exports from scratch with `bpy` |
| `render_previews.py` | Cycles renders into `renders/` |
| `stats.json` | Per-object vertex / triangle counts and bounds |

Rebuild: `python build_blowfish.py && python render_previews.py` with a Python that
has the `bpy` module (`pip install bpy pillow` on Python 3.11).

## Design summary

- **Body** - custom faceted lattice (not a sphere) in mid teal with a dark crown and a
  pale belly split by a sawtooth line, covered in triangular scale shingles.
- **Spikes** - 44 five-sided turquoise crystal spikes on gold collars in staggered rows;
  one is snapped off.
- **Face** - glowing yellow eyes with slit pupils, heavy lids slanted toward the nose,
  gold brows, and a protruding mouth with two rows of fangs.
- **Lantern** - gold four-post frame, stepped roof with upturned eaves, engraved glowing
  base, large crystal cluster and hanging bead-and-shard pieces, on a seven-knuckle
  stalk with gold collars.
- **Fins, crest and tail** - scalloped membranes with dark spines and gold tips: two side
  fins with gold cuffs, a dorsal crest and a forked tail fan.
- **Ornaments** - studded gold headband with a crystal buckle, stepped crown seating the
  stalk, and a square-spiral glyph on each flank.
- **Relics** - six broken gold pillars, four crystal shards and seven bubbles floating
  around the fish.

## Technical statistics

- 42 mesh objects, one material each; 9,656 triangles and 5,624 vertices in total
  (largest single mesh 1,144 triangles).
- About 15.0 x 13.2 x 10.0 studs including the floating relics (width x length x height);
  1 unit = 1 stud. Change `SCALE` in `build_blowfish.py` for a smaller pet.
- Origin on the ground plane under the body centre; all object transforms are identity.
- Z up, the fish faces -Y in Blender.
- 12 flat-colour materials, no textures. Three are emissive
  (`ALB_Crystal_Glow`, `ALB_Spike_Crystal`, `ALB_Eye_Glow`).
- Flat shading and hard edges throughout; every mesh has a Smart UV Project layer.
- Objects are named `ALB_<Region>_<Material>`; regions are Body, Scales, Spikes, Face,
  Fins, Crest, Tail, Ornaments, Stalk, Lantern and Relics.

Checked by script: no loose vertices, wire edges, zero-area faces or missing materials
in the .blend, and the FBX and GLB re-import into Blender with the same 42 meshes,
9,656 triangles and bounds.

## Roblox Studio import guide

The import below has not been run in Roblox Studio from this environment, so verify
scale and facing in the importer preview.

1. Open **Home > Import 3D** and choose `AncientLanternBlowfish.fbx`.
2. Keep the file as a single **Model**, turn **Anchored** on, and check the preview
   size: about 15 x 10 x 13 studs. If it is 100 times off, change the importer's
   scale unit.
3. Import. Each `ALB_*` object becomes one MeshPart. Colours do not rely on textures,
   so set **Color** and **Material** per MeshPart by the name suffix:

   | Suffix | Color (hex) | Suggested Material |
   | --- | --- | --- |
   | `Teal_Deep` | `#0E5257` | SmoothPlastic |
   | `Teal_Mid` | `#15807C` | SmoothPlastic |
   | `Teal_Light` | `#35B8A8` | SmoothPlastic |
   | `Abyss` | `#072C33` | SmoothPlastic |
   | `Gold` | `#E2A52B` | SmoothPlastic or Metal |
   | `Gold_Dark` | `#9C6A18` | SmoothPlastic or Metal |
   | `Spike_Crystal` | `#2ED6C4` | SmoothPlastic, or Neon for a stronger glow |
   | `Crystal_Glow` | `#3DEBD8` | Neon |
   | `Eye_Glow` | `#FFDF2E` | Neon |
   | `Eye_Black` | `#0A0F10` | SmoothPlastic |
   | `Tooth` | `#F3EEDC` | SmoothPlastic |
   | `Bubble` | `#D8FAF5` | Glass (Transparency about 0.4) |

4. For a pet: set `ALB_Body_Teal_Mid` as the Model's **PrimaryPart**, weld the other
   parts to it, and set **CanCollide** off and **CollisionFidelity** to Box on every part.
5. The `ALB_Relics_*` parts are separate from the body, so they can be parented to their
   own pivot and spun or bobbed; the same goes for `ALB_Lantern_*` and `ALB_Stalk_*`.
6. Optional: add a turquoise **PointLight** to `ALB_Lantern_Crystal_Glow`.

## Preview render notes

Renders use Cycles with a bright studio rig, a shadow-catcher floor and the Standard
view transform. A light bloom is added in post around the turquoise emitters only.
