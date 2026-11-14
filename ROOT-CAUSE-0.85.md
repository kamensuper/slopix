# Shared-loop investigation and targeted fixes

## Findings

Ring 0 itself does not create lag; the shared, cooperative execution path does
make long synchronous work visible across all applications. Main input polling,
audio service, desktop updates, game/3D rendering, composition and upload run in
sequence. IRQ handlers collect input and count audio completions, but they do
not preempt the foreground work to run another application. No process scheduler
or isolation was added for this release.

The previous screenshot (23.5 displayed FPS / 13.8 ms work) cannot establish
28.8 ms of expensive composition. Its implied 42.6 ms period also contains
intentional pacing, other foreground work, IRQ/host delays and eventual
presentation. DOOM's work counter surrounds doomgeneric_Tick only; it is not
total frame duration. The old displayed FPS counts update calls. The new
submitted-frame telemetry separately records completion after framebuffer copy.
It still does not measure physical refresh or host GUI presentation latency.

## Measurement before feature work

An instrumentation-only 0.8-derived build was measured, then the same test was
repeated after targeted M0 changes, before new applications were integrated.
Both used QEMU 8.2.2 / PC / TCG / qemu64 / 256 MiB / std VGA / SB16 WAV,
1280x800, same initial Freedoom scene and sequential quiet/firing/combined phases
of seven seconds. Raw records: build/m0-before.json/log and m0-after.json/log.
These are short measurements, not a universal FPS guarantee.

| Observation | Instrumented before | M0 fixes |
|---|---:|---:|
| Quiet DOOM interval FPS | 34.3..34.4 | 34.9..35.0 |
| Firing DOOM interval FPS | 34.3..34.4 | 34.9..35.0 |
| DOOM + cube interval FPS | 29.9..30.0 | 34.9..35.0 |
| QEMU process CPU during combined phase, percent of one core | 69.08 | 48.71 |
| Composition cumulative mean at final combined report, ms | 3.115 | 1.312 |
| Upload + cursor cumulative mean there, ms | 0.671 | 0.564 |
| Audio half-fill cumulative mean there, ms | 0.026 | 0.025 |
| Enter-to-serial-result, including 16 ms driver delay, ms | 17.613 | 17.609 |

The final rolling DOOM windows reported 30.8 vs 34.9 average FPS, worst-subset
1% lows 22.2 vs 28.0 FPS, and worst gaps 45.668 vs 37.337 ms. These windows hold
at most 256 intervals and cross phase/control transitions; they are not clean
phase-isolated percentiles. The cube's corresponding average stayed 60.0 FPS.
Cumulative stage averages also include preceding quiet/firing/setup work.
The final release matrix provides fresh per-workload data separately.

Audio was not the dominant cost in this measured scenario. Renderer work was
about 3.7 ms and composition about 3 ms before the fixes. Audio fill was only
tens of microseconds here. This does not establish performance on the user's
physical audio server, and the worst cold sound-start cost is not inferred
from DMA buffer duration. A 512-sample half represents 23.22 ms of playback,
not 23.22 ms of CPU mixing.

## Demonstrated causes and changes

1. **Redundant composition:** The old compositor restored background and drew
   intersecting lower windows even where a higher opaque window overwrote them.
   Current src/desktop.c compose_layer clips lower-layer work against opaque
   window interiors. Recursion is bounded by five application layers. Corner
   and shadow strips still compose normally; no false opacity is assumed there.
2. **Oversized DOOM damage:** Old desktop_step damaged the entire client on
   every update. At a default 1024x600 layout that was 680x420 = 285600 pixels,
   despite a 320x200 game image. Current src/doom/app.c doom_damage limits damage
   to game pixels and the changing metrics line. Window movement/lifecycle still
   invalidates complete old/new bounds, preserving exposed background/chrome.
3. **Presentation pacing drift:** next_tick formerly became now+period at each
   invocation, accumulating lateness imposed by competing cube frames. It now
   retains its deadline phase for normal lateness and resynchronizes after a
   missed period. Real elapsed virtual game time and the original simulation
   code remain. No unlimited catch-up loop or artificial 60-FPS DOOM claim.
4. **Shared-loop latency:** Synchronous foreground work still delays input queue
   consumption and DMA refill. The fixes reduce work instead of adding a new
   scheduler. Input events now retain their IRQ-capture timestamp for a measured
   queue-delay metric. Audio checkpoints remain; long config/image I/O is deferred
   until audio idle. Custom image loading explicitly requests playback stop.

No per-frame full-screen redraw was found to have been introduced by 0.8.
The existing dirty-region merge rule can expand touching regions into bounding
boxes; it remains bounded. Full-screen redraw is deliberate for mode/background
changes. Width, pitch, clipping and terminal cache dimensions were traced and
exercised across repeated switches; no stale-pitch memory defect was reproduced.

## Locations in final source

- src/kernel.c kernel_main main loop: around line 96; work then HLT.
- src/desktop.c compose_layer / desktop_render / desktop_step: around 183 / 198 / 206.
- src/doom/app.c doom_update deadline around 66; doom_damage around 76.
- vendor/doomgeneric/d_main.c doomgeneric_Tick: separate simulation/render spans.
- src/audio/audio.c fill around 25; start around 41; audio_step around 91.
- src/audio/sb16.c audio_irq: acknowledge/count only; start commands are bounded.
- src/input.c queued_at and input_poll: capture-to-consumption elapsed delay.
- src/arch.c timer_irq around 39: increment and PIC acknowledge; HPET clocksource.
- src/perf.c: bounded stage counters and two 256-interval submission rings.

## Version attribution and limits

0.75 and 0.8 share the DOOM adapter, audio mixer and much of the compositor. Their
previous in-game telemetry medians were both 30.0 FPS under mixed scripted work;
that was not a controlled graphical A/B experiment. Nothing here proves the
problem originated in 0.8 or in mode switching. Preserved release ISO hashes
are listed in TEST-RESULTS-0.85.md.

Stage durations use guest HPET/PIT elapsed time, include interruptions and host
scheduling effects, and are nested. They are not per-stage CPU execution cycles.
The separate QEMU process CPU clock measures all emulator threads/backend work.
HLT elapsed time includes intended sleep, interrupt wake and host scheduling.
Do not add nested stage percentages or label them CPU utilization.

No instrumentation can establish perceived host-window latency from headless
submissions alone. Graphical-backend availability and remaining test limits are
reported separately. The original screenshot's exact host-dependent slowdown
has not been reproduced or declared solved on that host.
