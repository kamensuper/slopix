# Slopix 0.5 audit and implementation decisions

Starting point: existing Moonrise 0.4, preserved separately. No replacement
kernel. Historical audit and memory design are retained in `docs/history`.

The original static graphics buffers, dirty-region union, clipping, row copies,
IRQ byte queue, HPET/PIT timer and Rust physical-page allocator were retained.
A general heap, filesystem and user process model were absent; none was silently
invented to port DOOM. Instead the game has a private static coalescing arena
and an embedded WAD stream, both described in `DOOM-PORT.md`.

## Problems addressed

- Hardcoded two-app order/focus transitions were extended to a three-entry
  bounded registry. No movable window points into transient or freed storage.
- A magnifying Dock needs the same geometry for rendering and clicks, old/new
  footprint damage, and rejection beneath overlapping windows. Those paths are
  now shared. Hover animation is elapsed-time based and settles to idle.
- Scaled blitting with an integer division for every output pixel was a real
  bottleneck in initial QEMU runs; row expansion now amortizes that work and
  reuses expanded rows for integer scaling.
- DoomGeneric's game-tick waiting and melt transition would block the desktop.
  Both blocking paths are replaced with bounded cooperative updates.
- Terminal handles text, whereas DOOM needs held make/break events. Raw focused
  game input is separate; loss of focus and queue errors release game keys.
- Engine stdio/heap calls cannot link to host libc. Their explicit freestanding
  implementations reject writes, out-of-range access, exhaustion and invalid
  frees. Host sanitizers cover boundaries independently of guest gameplay.
- The first guest launch caught a numeric formatting error in precision-padded
  lump names. Fixed numeric precision and added the exact `STCFN033` regression.
- DOOM's unsupported save actions now show the limitation rather than ending
  the engine because a filesystem operation failed.

## Retained limitations

The original 0..4GiB identity map still uses coarse supervisor RWX 2MiB pages.
There is no process isolation, NX/W^X enforcement, general heap, scheduler,
filesystem, USB/audio/GPU/network driver, SMP or broad real-hardware support.
The private game's metadata checks are not a cure for arbitrary C corruption.
All apps share the kernel's address space and main thread.

`memtest` still intentionally touches/exhausts all free physical pages and can
pause UI composition during that explicit diagnostic. IRQ capture remains on.
Its free-page counts are lower than 0.4 because the game arena, WAD and artwork
are genuinely reserved. This is expected memory use, not a fabricated leak fix.
