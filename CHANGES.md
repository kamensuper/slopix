# Slopix 0.5 changes from Moonrise 0.4

- Rebrand to Slopix / SlopDE; original S-snake PNG emblem and starry hills PNG
  wallpaper derived from the user's sketch, without using its drawn Dock.
- Preserve existing translucent Dock; three recognizable icons, 64–96px eased
  hover magnification, neighboring growth, live animated click bounds,
  bottom alignment, dirty-area restoration and window occlusion checks.
- Extend bounded window registry/stacking/focus from two apps to three.
- Preserve colored cube; add original parametric teapot, two-sided filled
  circle and torus meshes, keyboard/footer selection, existing inverse-depth
  rasterizer, timed rotation and measured FPS/frame/work counters.
- Port DoomGeneric with bundled Freedoom Phase 1 0.13.0: playable silent,
  keyboard-controlled single player; coexistence with Terminal and 3D Demo;
  window lifecycle, focus-loss key release, occlusion pause and quit-to-desktop.
- Add private checked/coalescing 48MiB game arena and read-only memory streams;
  no filesystem, general-purpose heap, sound, network or userspace added.
- Remove per-output-pixel division from scaled native blitting and use the
  native framebuffer memcpy path when no channel conversion is needed.
- Replace freestanding byte-by-byte copies/fills with bounded C word operations;
  cover unaligned addresses, overlapping moves and exact ends under sanitizers.
- Keep terminal commands, editing/history/scrolling and physical allocator.
- Add host boundary tests and real QEMU gameplay/Dock/model regression tests.
