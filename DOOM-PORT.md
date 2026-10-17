# DoomGeneric / Freedoom port

## Origin and redistribution

Engine: https://github.com/ozkl/doomgeneric at the commit recorded in
`vendor/doomgeneric/UPSTREAM.txt`. GPL-2.0-or-later; complete C source and
license included. It derives from id Software's DOOM and Chocolate Doom work;
retain their per-file copyright notices.

Game data: Freedoom 0.13.0 Phase 1, from
https://github.com/freedoom/freedoom/releases/tag/v0.13.0 . The original,
unmodified `freedoom1.wad`, BSD-3-Clause license and credits are in
`assets/freedoom`. No commercial DOOM WAD is included. The engine's historical
Freedoom compatibility warning remains in serial output; first-level gameplay
is tested, not every map or vanilla rendering limit.

## Separate modules

- `src/doom/app.c`: application lifecycle, graphics/input/timer adapters, measured
  statistics, conversion to native framebuffer pixels and guest telemetry.
- `src/doom/libc.c`, `include/`: a small private freestanding compatibility layer;
  a bounded coalescing arena, strings/limited formatting, and read-only WAD
  streams. Not a general libc or POSIX layer. No host libc link or system calls.
- `src/doom/system.c`: engine zone allocation, platform notices, guarded fatal
  error handling and quit-to-desktop behavior. No host shell/process facilities.
- `src/doom/wad.S`: embeds trusted game data as a read-only kernel asset.
- `doom.mk`: engine-only build flags and source list, separate from kernel init.

## Scheduling and input

The main kernel thread calls one engine update at most every 1/35 second and
then returns to the ordinary compositor/input/HLT loop. Doom's simulation still
uses 35 Hz time-based ticks. The app's clock accumulates actual kernel HPET/PIT
elapsed microseconds while visible and freezes while hidden/fully covered.
A long stall is capped to 100 ms of catch-up per iteration to avoid monopolizing
the desktop. This trades simulation time under extreme stalls for responsiveness.
It is not a preemptive scheduler.

Upstream tick waiting is changed to return when no tick is available. The
blocking melt transition is replaced with an immediate frame transition.
`DG_SleepMs` does not spin. Input IRQs capture bytes in the existing queue;
main-thread raw make/break events are routed only to focused DOOM. A separate
bounded engine key queue records edges and synthesizes all releases on focus
loss, input overflow or PS/2 errors. The upstream one-release-per-update drain
is fixed to consume the available queue. Terminal's text/editing routing remains.

The scene is 320x200, palette converted by the original C engine, then displayed
with integer scaling/letterboxing. Scaled blitting expands each source row once
and copies repeated destination rows in bulk; no division per output pixel.
Graphics clipping and window stacking are shared with Terminal/3D Demo.
The freestanding runtime uses bounded unaligned C word copies/fills rather than
byte-by-byte operations; exact lengths and overlaps have host sanitizer tests.

## Memory and error behavior

The 48 MiB arena lives in the kernel BSS and is reserved by the existing Rust
physical-page bookkeeping, along with the embedded WAD and all kernel buffers.
Allocations are 16-byte aligned, bounded, split/coalesced, and checked for
exhaustion. Free/realloc validate the supplied address against live blocks.
DOOM's zone allocator owns 32 MiB within that arena; other engine allocations
use the remainder. Opening allocates once. First launch initializes the engine synchronously;
input IRQs remain buffered, but composition pauses during that startup work.
Hide/close pause and retain the same
session; reopen does not allocate a second engine. This memory is intentionally
reserved even before the first launch. There is still no general kernel heap.

The WAD stream accepts only its fixed basename in read mode. All reads/seeks
are bounded; multiplication overflow is rejected; unknown files and all writes
fail. Save/load menu actions explicitly report the absent writable filesystem.
Formatting covers the engine paths used here, including precision-padded lump
names such as `STCFN033`; it is not a complete standard library implementation.

Fatal engine error/quit paths return via guarded GCC builtin setjmp/longjmp to
the app wrapper. The error is logged and shown in its window; it is not kernel
panic handling or memory isolation. The engine does not currently restart after
a fatal error. Closing and reopening an ordinary running game resumes it.

## Floating point

Engine configuration conversions use scalar floating point. x86 bootstrap
explicitly initializes x87 and enables SSE. The kernel/IRQ C code remains
`-mgeneral-regs-only`. There is one main execution thread and no context switch,
so IRQ handlers do not clobber engine FP state. Adding preemptive threads or
userspace requires FP state save/restore; this implementation does not claim it.

## Future ring 3 adaptation

Video surfaces, key edges, clock, arena, data stream and lifecycle have explicit
adapter functions. These can later be backed by process memory and syscalls.
The current engine is kernel-integrated, not already sandboxed or ABI-stable.
