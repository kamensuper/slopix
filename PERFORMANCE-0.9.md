# Slopix 0.9 performance measurements

QEMU TCG, qemu64, PC, 256 MiB, standard VGA, no network; sequential guests.
The matrix uses no display frontend and the silent audio backend for emulated
SB16 workloads. These measurements are framebuffer-submission intervals, not
proof of subjective smoothness or physical presentation latency. Separate SDL/
PulseAudio tests are recorded below and in graphical09.log.

Each matrix phase observes eight seconds. Frame percentiles use the latest
bounded 256-interval kernel ring emitted during that phase (counts are retained
in JSON). They can include phase setup/focus transitions. “1% low” is the inverse
mean of the slowest floor(n/100), minimum one, intervals. FPS is actual timer-
measured submissions. No 60 FPS DOOM target is implied: simulation is ~35 Hz.

| Resolution | Workload | FPS | 1% low | p95 ms | p99 ms | Worst ms | CPU % of one core | Enter ms* |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 800×600 | alone | 34.9 | 28.7 | 30.80 | 32.92 | 36.59 | 26.4 | 17.6 |
| 800×600 | audio | 35.0 | 30.3 | 30.31 | 31.66 | 33.04 | 27.4 | 17.4 |
| 800×600 | terminal | 35.0 | 26.2 | 30.69 | 33.87 | 41.06 | 28.6 | 18.1 |
| 800×600 | cube | 35.0 | 24.2 | 33.08 | 34.51 | 45.35 | 49.8 | 17.7 |
| 800×600 | all_six | 35.0 | 27.6 | 33.44 | 35.01 | 36.45 | 55.4 | 17.4 |
| 1024×600 | alone | 35.0 | 27.4 | 31.32 | 34.20 | 36.48 | 29.3 | 17.5 |
| 1024×600 | audio | 34.9 | 26.6 | 31.53 | 34.79 | 38.16 | 30.6 | 17.9 |
| 1024×600 | terminal | 35.0 | 30.8 | 30.40 | 32.03 | 32.47 | 29.1 | 17.4 |
| 1024×600 | cube | 35.0 | 28.1 | 32.15 | 33.72 | 36.17 | 50.4 | 17.7 |
| 1024×600 | all_six | 35.0 | 24.3 | 32.65 | 36.58 | 43.14 | 54.6 | 18.0 |
| 1280×800 | alone | 34.9 | 29.0 | 30.20 | 31.98 | 36.86 | 27.0 | 17.5 |
| 1280×800 | audio | 35.0 | 25.3 | 30.73 | 32.45 | 40.23 | 28.8 | 17.4 |
| 1280×800 | terminal | 35.0 | 21.7 | 30.90 | 34.45 | 47.02 | 29.2 | 17.5 |
| 1280×800 | cube | 35.0 | 25.9 | 32.84 | 34.20 | 40.50 | 51.8 | 17.7 |
| 1280×800 | all_six | 35.0 | 24.8 | 33.12 | 38.13 | 41.27 | 53.5 | 17.7 |
| 1600×900 | alone | 34.9 | 27.3 | 30.45 | 32.66 | 37.34 | 28.0 | 17.4 |
| 1600×900 | audio | 34.9 | 29.1 | 30.82 | 33.22 | 34.56 | 28.1 | 17.5 |
| 1600×900 | terminal | 35.0 | 28.6 | 30.85 | 32.03 | 37.07 | 29.7 | 17.5 |
| 1600×900 | cube | 35.0 | 23.3 | 33.17 | 34.56 | 50.24 | 47.4 | 17.5 |
| 1600×900 | all_six | 35.1 | 27.0 | 32.80 | 36.36 | 37.24 | 51.4 | 17.4 |
| 1920×1080 | alone | 34.9 | 24.6 | 31.61 | 34.29 | 42.35 | 31.2 | 18.3 |
| 1920×1080 | audio | 35.0 | 29.7 | 30.36 | 32.22 | 33.92 | 28.3 | 17.9 |
| 1920×1080 | terminal | 34.9 | 28.4 | 32.04 | 33.11 | 35.51 | 32.1 | 18.9 |
| 1920×1080 | cube | 35.0 | 26.6 | 33.21 | 35.95 | 37.97 | 49.8 | 17.8 |
| 1920×1080 | all_six | 35.0 | 20.0 | 33.14 | 35.64 | 62.70 | 55.2 | 17.7 |

Largest matrix gap: 62.70 ms at 1920×1080 (all_six). It remains included in the table.

*Enter-to-serial includes the automation driver’s 16 ms key delay and polling;
it is not physical input-to-photon latency. `PERF event_queue` in raw stage
reports measures queued PS/2-byte handling delay inside the kernel. Stage
measurements overlap hierarchically (DOOM contains game/render); do not add all
averages as if independent. CPU comes from the live QEMU process CPU clock.

All 25 phases require zero audio underruns/device faults and working Terminal
input. Audio phases enable SB16. Fire is held during DOOM-focused phases; focus
loss releases it in cube phases, matching normal input routing. “All six” means
all apps open, DOOM brought forward and the cube over it, leaving both visible.

## Baseline and bottleneck

M0-AUDIO-REPORT.md preserves the actual GTK/PulseAudio reproduction: an
instrumented 0.85-era two-block ring stopped after a 56.4 ms service gap. A
four-block ring alone still failed (120.6 ms gap); unconditional cache callbacks
also reduced frame rate. Completion-counter-gated safe points restored ~35 Hz
and zero underruns in the matched accepted run. A memtest stall was separately
reproduced and addressed with bounded main-thread audio service points.

The time between frames includes intentional 35 Hz pacing and shared desktop
work, so the DOOM work label alone is not total frame duration. Resolution
regeneration remains synchronous: the M0 sustained test recorded a 331 ms gap
during mode switches. Do not interpret steady-phase averages as no-transition-
stutter guarantees. Original measured before/after distributions remain in the
M0 report; the redesigned 0.9 desktop is not an otherwise identical baseline.

## Graphical and sustained tests

See build/graphical09.log and build/final09-pa-10000.json/log for the final
SDL/PulseAudio run, actual counter values and frame distributions. The graphical combined phase keeps the cube visibly left of DOOM while firing;
all six applications remain open. SDL ran on
a virtual X display with a real PulseAudio server/null sink and monitor capture.
Nonzero PCM reaching that monitor verifies the host audio path; it does not
verify physical speaker quality. See the recorded idle/sustained CPU JSON for
the independent stability phases.

| SDL/PulseAudio phase | FPS | 1% low | p95 ms | p99 ms | Worst ms |
|---|---:|---:|---:|---:|---:|
| doom / DOOM | 34.5 | 11.4 | 38.51 | 42.16 | 119.27 |
| all_apps / DOOM | 34.9 | 21.9 | 37.50 | 42.55 | 45.62 |
| all_apps / 3D | 59.8 | 31.5 | 26.55 | 29.00 | 34.17 |
| mode_changes / DOOM | 32.0 | 3.3 | 41.17 | 84.35 | 303.00 |
| mode_changes / 3D | 52.3 | 5.2 | 34.57 | 48.14 | 290.59 |

All graphical phases reported zero underruns and zero device faults.
The SDL live-refresh test verifies visible pixel changes without QMP screendump. The combined phase also asserts continuously advancing cube statistics while
DOOM fires. PulseAudio sample count/peak are recorded in graphical09.log.

Steady idle QEMU CPU: 5.41% of one core over 15.0 s.
Sustained cube QEMU CPU: 34.00% over 60.1 s; host-observed frame counter rate 59.95 FPS.

## Synchronous storage operation latency

`append LARGE.BIN guest_tail`: 1122.57 ms Enter-to-command-complete, including driver/poll delay.

`cp LARGE.BIN COPY.BIN`: 869.26 ms Enter-to-command-complete, including driver/poll delay.

These operations continue audio service but do not yield desktop presentation. They are not asynchronous copies.

## Matched Pre-Genesis comparison

Baseline ISO: `aca0854303fc17193dd0047d0508e9821dd0f6f052e152c40236048fecd76e7a`. Same TCG configuration and five workload scripts per resolution, measured at different host times. Host load is not controlled.

| Resolution | Before mean FPS | After mean FPS | Before lowest1% | After lowest1% | Before worst ms | After worst ms |
|---|---:|---:|---:|---:|---:|---:|
| 800x600 | 34.94 | 34.98 | 22.1 | 24.2 | 53.07 | 45.35 |
| 1024x600 | 34.96 | 34.98 | 24.1 | 24.3 | 43.21 | 43.14 |
| 1280x800 | 34.94 | 34.98 | 26.1 | 21.7 | 41.22 | 47.02 |
| 1600x900 | 34.94 | 34.98 | 24.4 | 23.3 | 41.90 | 50.24 |
| 1920x1080 | 34.96 | 34.96 | 24.3 | 20.0 | 46.20 | 62.70 |

Means average the five phase FPS values; lows/worst retain the most adverse sample across those phases. No physical presentation claim follows.
