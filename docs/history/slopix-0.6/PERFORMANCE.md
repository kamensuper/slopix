# Slopix 0.6 measured performance

Tested ISO SHA256: `8a0113ad12b1feeb652a055f734d8b294295806e960539aa125c02de812ba436`.

QEMU 8.2.2, PC BIOS, qemu64, TCG, 256 MiB, standard VGA, no NIC,
headless 1280x800 desktop, HPET; same shared host. A 64 MiB IDE image is
attached in the comparison. The new kernel uses ATA/FAT32; 0.5 ignores the disk.
No concurrent QEMU benchmark was deliberately run alongside these measurements.
These are observations, not a real hardware or graphical frontend guarantee.

## Sustained animation and comparison

One initial 0.6 run failed the unchanged 40 FPS minimum-interval threshold:
59 complete one-second samples ranged 27.5–60.7 FPS. Its idle phase measured
8.77% of one CPU core over 15 seconds. The Terminal continued responding;
no disk commands were issued during that animation run. The slower interval
coincided with increased renderer/compositor/upload work. It is retained in
`build/stability-failed-attempt.log` and the assertion log, not counted as a pass.
The test was improved to save raw measurements before assertions, without
changing its sample-count or FPS threshold.

A sequential follow-up comparison used 5-second idle and 60-second animation
phases, with periodic Terminal commands and the same disk attached:

| Kernel | Host-observed FPS | Guest one-second FPS range | Mean render+compose+upload ms | Idle CPU / one core | Animated CPU / one core | Existing floor test |
|---|---:|---:|---:|---:|---:|---|
| 0.5-baseline | 57.221 | 5.9–60.3 | 11.034 | 7.11% | 55.84% | FAIL |
| 0.6 | 59.775 | 56.4–60.6 | 7.495 | 6.44% | 51.28% | PASS |

These back-to-back runs help detect an obvious regression but do not isolate
host scheduling, CPU contention, cache layout or emulation effects. The original
slow interval remains unresolved; sustained 60 FPS under all loads is NOT claimed.
The dominant animated work remains software rendering, composition and framebuffer
copying on one execution thread. Disk code has no background polling in steady
state. This release has not changed the 3D rasterizer/compositor to chase a
single transient measurement.

## Storage latency and three applications

Five short file writes with Terminal, torus and actual Freedoom gameplay open
measured **39.76–42.20 ms** from QMP Return to command completion
(mean 40.66 ms). This includes the driver's 16 ms input delay
and QMP/host scheduling; it is not a bare ATA latency measurement. Each operation
syncs before its success response. The checks also read data back, run the real
memory allocator test and exercise Terminal close/reopen/maximize/restore.

Disk commands are synchronous. Large operations or a slow/faulty device can pause
composition while input/timer IRQs stay enabled. ATA waits poll briefly then HLT,
with a 100 ms timer deadline per command and an independent iteration bound.
The filesystem is bounded and has no journal or preemptive I/O scheduler.

## Existing application tests

The short cube correctness/interaction run measured host throughput
60.072 FPS; guest samples were
55.8–60.5 FPS. This is not the
sustained comparison above. Inherited all-three-app 20-second gameplay measured
host game throughput **29.573 FPS**. DOOM remains intentionally
capped at 35 engine updates per second. Its timer-based simulation and measured
counters are retained. DOOM save/load is still disconnected from FAT32.

## Evidence and limits

`build/stability-comparison.json`, corresponding per-phase JSON/serial logs,
`storage-results.json`, `doom-performance.json` and `performance.json` contain the
raw figures. Host FPS uses monotonic arrival times of cumulative guest frame
counters; process CPU uses the live QEMU child POSIX CPU clock. Setup/boot is
excluded. The failed attempt's aggregate host CPU/FPS were not saved and are not
reconstructed from screenshots or guessed.

No vsync, scanout, physical monitor refresh, GPU acceleration or real-hardware
storage performance was tested. Previous 0.5 results remain historical under
`docs/history/slopix-0.5`.
