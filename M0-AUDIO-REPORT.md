# M0: audio deadline investigation

This is a measured milestone report, not a completed 0.9 release claim.
The preserved 0.85 ISO passed all 23 inherited regression groups before changes.
Its source/ISO in slopix-0.85 was not modified.

## Reproduction and causality

Instrumentation-only baseline: build/m0-audio-before.iso, SHA-256
34098d376b03a2fc9d2543382c9c1895c3448c858411cfebe06e3686ec83970b.
QEMU 8.2.2, PC/TCG/qemu64/256 MiB/std VGA/SB16 22050 Hz mono U8.
GTK ran on Xvfb and routed through an actual PulseAudio 16.1 server's null sink.
The PulseAudio monitor captured 1,024,248 signed 16-bit mono samples, peak 11,723.
This establishes backend routing and real GTK execution, not physical speakers
or human end-to-end display latency. Xvfb and clients must share a tool session
(network namespace); earlier separate-session attempts could not connect.

The silent-backend diagnostic (50,000-us timer setting) did not reproduce an
underrun. GTK/PulseAudio did: one underrun, maximum three pending blocks and a
56,377-us audio service gap. Main input processing reached 54,949 us. The mouse
handler synchronously initializes DOOM, which monopolizes the foreground path
while an existing tone is playing. Ring capacity was two 512-byte blocks,
23.22 ms each. A completed-block backlog >1 explicitly stopped playback.

A four-block ring alone was insufficient: the next GTK run encountered a
116,656-us input handler and 120,599-us service gap, five completions pending
and one underrun. This failed intermediate result is retained in
build/ring4-only-pa-10000.json/log and m0-ring4-only-gtk.log. We did not increase
the ring repeatedly to conceal missing service. Sound startup was 584 us in
that run; the long interval was outside the mixer startup.

## Targeted fixes

- src/audio/audio.h, src/audio/audio.c and src/audio/sb16.c: four 512-byte DMA
  blocks; ordered bounded refill of up to three completed blocks. A full-ring
  miss still increments the underrun counter and stops playback. The 92.9 ms
  queue trades extra audible parameter latency for foreground jitter tolerance.
  Mixing remains main-thread owned, and source leases keep their existing ABI.
- vendor/doomgeneric/w_wad.c W_ReadLump/W_CacheLumpNum entry: optional Slopix
  audio checkpoint at stable asset-cache boundaries. It refills audio and
  retires leases; it cannot enter the engine or allocate zone memory. Releasing
  an ended lease only retags cached memory through W_ReleaseLumpNum.
- src/doom/app.c: checkpoint service around cold initialization and in the
  existing nonblocking sleep callback. No game-simulation waiting is added.
- src/audio/audio.c audio_diagnostics and Terminal audio info: real count/mean/
  maximum service gap, maximum pending completions and startup timing.
- src/perf.c: bounded submitted-frame p95 in addition to p99/worst/1% low.

## Intermediate graphical result (not accepted)

The first checkpoint implementation: zero underruns, maximum one pending block, worst service gap
19,280 us, worst sound startup 633 us. Tone, gameplay, five open apps and repeated
1920x1080 / 800x600 / 1280x800 transitions completed. PulseAudio monitor capture
and GTK screenshots were retained. Raw stage/frame timing follows.

| Build / phase | Frame FPS | p95 ms | p99 ms | Worst ms |
|---|---:|---:|---:|---:|
| before / doom | 35.0 | 34.75 | 38.01 | 39.50 |
| before / all_apps | 34.8 | 34.84 | 38.58 | 68.98 |
| after / doom | 27.1 | 66.44 | 98.67 | 104.85 |
| after / all_apps | 25.8 | 66.27 | 101.89 | 115.65 |

Frame windows retain up to 256 submission gaps and include control/focus
transitions around observations. They are not physical scanout intervals. Stage
timers measure elapsed guest spans with nesting; QEMU/IRQ/host descheduling can
contribute. The counter cannot alone separate CPU instructions from host delay.
The measured evidence establishes a refill-budget violation and synchronous
startup dependency; it does not prove the user's every sound-triggered stall has
the identical cause. Renderer, composition and backend scheduling remain measured.

The first callback read HPET on every cache lookup, including hot renderer
lookups. Measured FPS fell to 26..27, so this implementation was rejected despite
zero underruns. Its records are retained as unthrottled-checkpoint-pa-10000.*.
The callback now checks only the volatile completion count first, reading the
clock and servicing only when an actual block is pending. Verification is running.
M1 remains gated on both performance and audio results.

## Accepted M0 result

The cheap completion-counter checkpoint restored ~35 FPS. A subsequent strict
GTK/PulseAudio test ran two 30-second firing phases (ammo refreshed using the
engine built-in idkfa cheat), tones, five apps and all five requested display
modes. Zero underruns/device faults were reported. Worst service gap 36,733 us;
startup maximum 605 us. Pulse monitor: 2,234,908 samples, peak 16,007.

| Phase | Submitted FPS | p95 ms | p99 ms | Worst ms |
|---|---:|---:|---:|---:|
| doom | 35.0 | 34.71 | 37.66 | 42.23 |
| all_apps | 34.9 | 35.84 | 41.11 | 44.15 |
| mode_changes | 32.9 | 38.44 | 43.13 | 330.95 |

Resolution regeneration remains synchronous and produced a 331 ms submitted-
frame gap during mode changes. Ordinary gameplay stayed near 35 Hz but transition
spikes remain; this is not a universal stutter-free claim.

Existing host PCM/parser/lease tests and both guest audio regression suites
passed. The DMA test now verifies four blocks, placement below 16 MiB, 64 KiB
boundary safety and exact mute bytes. M0 gate accepted; M1 may begin.

## Integration follow-up: allocator diagnostics

Running memtest during a tone exposed a 357,601 us service gap, 15 pending DMA
blocks and one underrun. The raw serial record is m3-memtest-underrun-before.log.
Main-thread background checkpoints now run every 64 completed allocations/frees,
outside the Rust allocator lock. The exhaustive allocator test and zero-underrun
assertion are both retained.
