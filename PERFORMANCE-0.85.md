# Slopix 0.85 measured performance

QEMU 8.2.2, PC, TCG, qemu64, 256 MiB, std VGA, BIOS, no network.
Sound cases use SB16 with a WAV backend, not physical speakers. Runs were
sequential with no concurrent test guests. Same Freedoom initial gameplay scene.
Each steady phase is six seconds, followed by an input check and telemetry read.
This short sample is not a stress-test guarantee.

## Definitions and limits

FPS below is the kernel's framebuffer-submission interval ring, up to 256
intervals. It is not host refresh or physical presentation. The 1% low is the
inverse of the mean of the slowest max(1,n/100) intervals. Worst and p99 retain
window/focus transitions around the phase; they are not isolated steady-state
percentiles. Raw JSON includes guest update-FPS readings and nested stage timing.
Deliberately hidden/covered app time resets the sampling epoch.

Stage timers measure elapsed guest-clock spans. Nested spans overlap; their
sum is not CPU utilization. HLT elapsed is intentional waiting/host scheduling,
not CPU work. QEMU process CPU is measured separately as percent of one core.
Input is Enter-to-serial-result including a mandatory 16 ms driver delay.

`alone`: no sound device and Terminal closed. `audio`: SB16 and held fire key,
Terminal closed. `terminal`: SB16 plus Terminal. `combined`: SB16, Terminal
and rotating cube. `maximized`: SB16 plus maximized DOOM. Other phases retain
their native game state. Control commands run between samples.

## Final 0.85 matrix

| Resolution | Workload | FPS | 1% low FPS | Worst ms | p99 ms | QEMU CPU % | Enter ms | Underruns |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 800×600 | alone | 34.9 | 26.1 | 42.70 | 32.35 | 22.6 | 17.17 | 0 |
| 800×600 | audio | 35.0 | 31.7 | 31.85 | 30.67 | 21.9 | 17.25 | 0 |
| 800×600 | terminal | 34.9 | 28.9 | 35.03 | 32.32 | 22.3 | 17.40 | 0 |
| 800×600 | combined | 34.9 | 27.4 | 38.59 | 33.33 | 45.9 | 20.01 | 0 |
| 800×600 | maximized | 34.9 | 21.9 | 51.91 | 37.92 | 24.4 | 17.58 | 0 |
| 1024×600 | alone | 34.9 | 29.5 | 34.90 | 31.57 | 22.3 | 17.54 | 0 |
| 1024×600 | audio | 34.9 | 30.7 | 33.32 | 31.56 | 23.4 | 17.45 | 0 |
| 1024×600 | terminal | 35.0 | 28.6 | 35.23 | 31.98 | 23.2 | 17.93 | 0 |
| 1024×600 | combined | 34.9 | 23.6 | 44.95 | 35.24 | 47.7 | 17.82 | 0 |
| 1024×600 | maximized | 35.0 | 26.7 | 40.09 | 33.62 | 22.9 | 17.40 | 0 |
| 1280×800 | alone | 34.9 | 28.1 | 35.99 | 31.98 | 26.7 | 17.34 | 0 |
| 1280×800 | audio | 35.0 | 21.6 | 46.85 | 34.65 | 27.9 | 17.75 | 0 |
| 1280×800 | terminal | 34.9 | 29.8 | 33.78 | 32.53 | 26.8 | 17.35 | 0 |
| 1280×800 | combined | 35.0 | 23.9 | 44.40 | 35.23 | 49.6 | 17.44 | 0 |
| 1280×800 | maximized | 35.0 | 28.0 | 35.70 | 34.11 | 28.7 | 18.00 | 0 |
| 1600×900 | alone | 34.9 | 27.9 | 37.33 | 32.34 | 26.2 | 17.28 | 0 |
| 1600×900 | audio | 35.0 | 30.2 | 33.17 | 31.48 | 28.0 | 17.43 | 0 |
| 1600×900 | terminal | 34.9 | 28.6 | 35.55 | 32.29 | 25.6 | 18.06 | 0 |
| 1600×900 | combined | 35.0 | 23.2 | 49.92 | 33.43 | 49.2 | 17.55 | 0 |
| 1600×900 | maximized | 35.0 | 22.7 | 48.60 | 36.99 | 37.2 | 17.35 | 0 |
| 1920×1080 | alone | 34.9 | 28.6 | 35.62 | 33.16 | 26.0 | 17.57 | 0 |
| 1920×1080 | audio | 34.9 | 27.9 | 37.57 | 33.01 | 27.8 | 17.70 | 0 |
| 1920×1080 | terminal | 35.0 | 26.2 | 40.49 | 33.19 | 26.1 | 17.52 | 0 |
| 1920×1080 | combined | 35.0 | 20.7 | 49.31 | 36.72 | 56.0 | 17.61 | 0 |
| 1920×1080 | maximized | 35.0 | 28.2 | 36.09 | 33.14 | 44.2 | 17.45 | 0 |

## Matched 0.8-derived comparison

The baseline is preserved 0.8 code with timing instrumentation only, built before
M0 fixes and new applications. It is not byte-identical to the shipped 0.8 ISO;
the original release is preserved separately. 800×600 was not supported there.
The same resolution/workload driver uses each version's real Dock geometry.

| Resolution | Workload | Before FPS | After FPS | Before / after 1% low | Before / after worst ms | Before / after CPU % |
|---|---|---:|---:|---:|---:|---:|
| 1024×600 | alone | 34.3 | 34.9 | 28.6 / 29.5 | 35.39 / 34.90 | 26.1 / 22.3 |
| 1024×600 | audio | 34.3 | 34.9 | 27.0 / 30.7 | 37.94 / 33.32 | 31.2 / 23.4 |
| 1024×600 | terminal | 34.2 | 35.0 | 27.0 / 28.6 | 37.94 / 35.23 | 31.3 / 23.2 |
| 1024×600 | combined | 30.2 | 34.9 | 25.8 / 23.6 | 38.93 / 44.95 | 61.3 / 47.7 |
| 1024×600 | maximized | 34.2 | 35.0 | 24.8 / 26.7 | 42.09 / 40.09 | 39.2 / 22.9 |
| 1280×800 | alone | 34.2 | 34.9 | 20.2 / 28.1 | 56.28 / 35.99 | 30.6 / 26.7 |
| 1280×800 | audio | 34.3 | 35.0 | 28.9 / 21.6 | 34.55 / 46.85 | 32.6 / 27.9 |
| 1280×800 | terminal | 34.0 | 34.9 | 20.6 / 29.8 | 55.40 / 33.78 | 35.9 / 26.8 |
| 1280×800 | combined | 30.2 | 35.0 | 21.0 / 23.9 | 49.02 / 44.40 | 72.7 / 49.6 |
| 1280×800 | maximized | 34.2 | 35.0 | 22.4 / 28.0 | 50.40 / 35.70 | 56.7 / 28.7 |
| 1600×900 | alone | 34.3 | 34.9 | 27.6 / 27.9 | 37.07 / 37.33 | 30.1 / 26.2 |
| 1600×900 | audio | 34.3 | 35.0 | 26.5 / 30.2 | 38.64 / 33.17 | 34.6 / 28.0 |
| 1600×900 | terminal | 34.3 | 34.9 | 28.6 / 28.6 | 35.00 / 35.55 | 29.2 / 25.6 |
| 1600×900 | combined | 30.1 | 35.0 | 21.2 / 23.2 | 50.16 / 49.92 | 67.3 / 49.2 |
| 1600×900 | maximized | 34.3 | 35.0 | 24.4 / 22.7 | 43.26 / 48.60 | 62.5 / 37.2 |
| 1920×1080 | alone | 34.4 | 34.9 | 29.9 / 28.6 | 33.65 / 35.62 | 32.3 / 26.0 |
| 1920×1080 | audio | 34.4 | 34.9 | 27.1 / 27.9 | 38.33 / 37.57 | 30.8 / 27.8 |
| 1920×1080 | terminal | 34.4 | 35.0 | 30.7 / 26.2 | 32.59 / 40.49 | 28.2 / 26.1 |
| 1920×1080 | combined | 30.1 | 35.0 | 20.1 / 20.7 | 55.40 / 49.31 | 64.1 / 56.0 |
| 1920×1080 | maximized | 34.3 | 35.0 | 24.3 / 28.2 | 43.14 / 36.09 | 74.5 / 44.2 |

## Preserved 0.75 reference

The unmodified 0.75 ISO has no submission-ring telemetry, so no invented
1% lows or stage breakdown are supplied. A separate 1280×800 reference run:

| Phase | Guest update FPS range | QEMU CPU % |
|---|---:|---:|
| quiet | 34.3–34.4 | 30.3 |
| firing | 34.3–34.4 | 31.9 |
| combined | 29.8–30.0 | 65.9 |

This is a default-resolution reference, not a five-resolution 0.75 matrix.

## Sustained and idle run

- idle: 15.02 s, QEMU CPU 5.46% of one core.
- animated: 60.09 s, QEMU CPU 33.23% of one core, host-observed cube throughput 59.90 FPS.

Periodic Terminal commands and final idle input passed, with no reported panic
or input-ring overflow. The cube figure is not a DOOM benchmark.

## Interpretation

See ROOT-CAUSE-0.85.md for measured M0 composition/pacing evidence. DOOM targets
its existing roughly 35-Hz path, not 60 FPS. Retaining near-target averages does
not eliminate transition spikes, and not every percentile is guaranteed to
improve in a short sample. The fixed scene does not bound all maps or combat.
Host GUI/audio-server delays are outside these headless/WAV measurements.
Graphical interaction remains unverified; see GRAPHICAL-TEST.md.

Raw evidence: build/matrix-085.json, matrix-08.json and per-resolution logs;
build/baseline075.json/log; build/stability*.json/log; M0 before/after records.
