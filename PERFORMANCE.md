# Slopix 0.5 measured performance

Actual final ISO SHA256: `e44a9323498021b42db14e9930b30c900abe5b69ebe8415352c6e1028e2c9b13`

Environment: QEMU 8.2.2 (Ubuntu 1:8.2.2+ds-0ubuntu1.18), PC BIOS, TCG,
qemu64 CPU, 256 MiB, standard VGA, no NIC, headless 1280x800 framebuffer.
Default ACPI and HPET on for these measurements. Software rendering throughout.
The host is shared; these are observations, not a hardware/vsync guarantee.

## Separate sustained runs

| Condition | Duration | Host-observed FPS | Guest one-second FPS range | QEMU CPU, % of one core |
|---|---:|---:|---:|---:|
| Idle desktop / Terminal | 15.0 s | — | — | 7.89% |
| Cube / Terminal open | 60.0 s | 58.218 | 45.8–60.6 | 59.49% |
| Freedoom / Terminal behind | 20.0 s | 34.453 | 34.3–34.4 | 53.57% |

The cube run includes periodic Terminal commands and spans HPET low-word wrap.
Mean measured 3D render+compose+upload work: 9.044 ms.
FPS measures elapsed presented-frame intervals, not the inverse of work time.

DOOM is intentionally scheduled at at most 35 updates/second, not 60. Its
scene is 320x200, displayed at 640x400 in the default window. Cube/model viewport
is 512x324 by default and capped at 640x400 when maximized. The desktop is
1280x800; these are not full-resolution 1280x800 triangle-rendering figures.
DOOM's Work label measures engine update/conversion, excluding desktop compose
and upload. The 3D Work label excludes DOOM engine updates.

## All three applications

The gameplay/lifecycle test leaves Terminal, a rotating teapot, and Freedoom
open, including overlapping animated windows. During its 20-second sustained
portion, host-observed game throughput was **29.560 FPS**;
guest one-second game samples were **28.6–31.1 FPS**.
Terminal commands remained usable. No claim of simultaneous 60 FPS for every
app is made. Engine updates, mesh rasterization, overlapping surface composition
and cooperative frame pacing share one CPU thread; there is no GPU driver.

The separate model checks recorded the following short-run samples. They are
short correctness/performance observations, not sustained guarantees:

| Model | Guest one-second FPS samples | Mean render work |
|---|---|---:|
| Cube | 59.6, 60.3 | 4.077 ms |
| Teapot | 59.9, 59.9 | 3.847 ms |
| Circle | 58.4, 59.9 | 1.558 ms |
| Torus | 59.9, 55.7 | 3.495 ms |

## Bottlenecks and verification

Initial scaled blitting divided once per output pixel. It now precomputes the
horizontal mapping, expands one source row and copies repeated rows in bulk.
The freestanding runtime also copied/filled one byte per iteration; bounded C
word operations now serve the engine and Rust/core, with exact-end/unaligned/
overlap sanitizer tests. The native framebuffer path uses a bulk frame copy.
Blocking game-tick waiting and melt transitions were removed from the app loop.
These changes address actual costs; early runs used different scenes/host load,
so they are not presented as a controlled speedup percentage.

Host throughput uses monotonic arrival times of cumulative guest frame counters.
Process CPU is the live QEMU child's POSIX CPU clock, excluding setup/boot.
Input timing in `doom-performance.json` and `performance.json` includes the
QMP driver's fixed key delay (normally 16 ms), so it is not bare IRQ latency.
No graphical frontend scanout, vsync, physical monitor refresh or real hardware
was measured. Headless QEMU can still differ from a visible frontend.

Raw data: build/stability.json, build/doom-only-performance.json,
build/doom-performance.json, build/models-performance.json and corresponding
serial logs. Earlier Moonrise 0.4 measurements are retained as historical data
in docs/history; this shared-host run does not establish a controlled CPU
regression/improvement against that previous environment.
