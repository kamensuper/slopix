# Slopix 0.85 test results

Final ISO SHA-256: `2da0c78e3623fe442a47e4508068cbfbaddf6e64dff622633a2f6393df92be2e`.

All 23 regression groups passed on this exact ISO. The first group contains
multiple independent host targets; it is not counted as 23 individual assertions.

| Check | Result | Seconds |
|---|---|---:|
| `memory-test renderer-test graphics-resize-test runtime-test doom-compat-test audio-test doom-sound-test preferences-test perf-test` | PASS | 2.04 |
| `tests/icon_test.py` | PASS | 0.10 |
| `tests/telemetry.py` | PASS | 0.02 |
| `tests/smoke.py` | PASS | 4.57 |
| `tests/clock_test.py` | PASS | 10.17 |
| `tests/memory_guest_test.py` | PASS | 8.32 |
| `tests/input_regression_test.py` | PASS | 7.31 |
| `tests/window_test.py` | PASS | 13.06 |
| `tests/terminal_test.py` | PASS | 32.61 |
| `tests/cube_test.py` | PASS | 32.58 |
| `tests/models_dock_test.py` | PASS | 22.80 |
| `tests/doom_test.py` | PASS | 65.30 |
| `tests/audio_guest_test.py` | PASS | 35.69 |
| `tests/doom_audio_test.py` | PASS | 43.32 |
| `tests/display_test.py` | PASS | 28.39 |
| `tests/display_fallback_test.py` | PASS | 4.30 |
| `tests/storage_host_test.py` | PASS | 1.33 |
| `tests/storage_interop_test.py` | PASS | 0.45 |
| `tests/storage_safety_guest_test.py` | PASS | 15.64 |
| `tests/storage_guest_test.py` | PASS | 59.67 |
| `tests/reboot_test.py` | PASS | 3.74 |
| `tests/utilities_guest_test.py` | PASS | 45.22 |
| `tests/preferences_storage_test.py` | PASS | 19.74 |

## What executed where

Host tests include the Rust/C physical-memory boundary, bounded allocator, C
rasterizer/clipping, runtime, Doom compatibility, mixer, preferences and telemetry.
Preferences and telemetry tests use AddressSanitizer/UndefinedBehaviorSanitizer.
These do not constitute execution inside the guest.

Guest tests cold-boot real QEMU processes and deliver emulated PS/2 input. They
exercise Terminal editing/history/long input, app lifecycle, dragging, maximizing,
resolution switching, gameplay, simultaneous apps, digital sound and WAV capture,
PMM exhaustion checks, ATA/FAT32 writes and cold-process persistence. New tests
cover launcher case-insensitive search, GUI settings, corner resize, Alt+Tab,
Alt+F4, Super, 800 through 1920 modes, custom wallpaper and corrupt configuration.

The configuration policy test passed missing/degraded/full-volume cases and
injected block-device write errors, with exact disk-byte preservation assertions
on rejected saves and a live Terminal afterward. QEMU refuses a physically
read-only IDE attachment before boot; the initial harness attempt failed there.
The harness was corrected to inject `write_aio` errors through blkdebug. The
passed prefix was retained only after checking the identical ISO hash; the
corrected final group ran again. No kernel source changed and no assertion was
removed. Initial/resume console logs retain this history.

The cold settings test additionally ran independent `fsck.fat -vn` successfully
and checked that an unrelated user file survived default recovery. It does not
prove arbitrary power-loss atomicity. FAT32 internals were not changed.

## Presentation and hardware limits

Graphical GTK QEMU could not initialize in this environment, even after installing
GUI/Xvfb packages. All automated guest runs used QMP and framebuffer screendumps.
The SlopFind/Slopettings screenshots were visually inspected. Real interactive
host presentation, human input latency and physical speaker output are unverified.
See GRAPHICAL-TEST.md. WAV tests and guest zero-underrun counters are separate
from a physical listening test.

The kernel remains cooperative Ring 0. Long synchronous operations and arbitrary
application faults can still affect the whole system. The inherited intermittent
ATA-offline issue is not claimed fixed; config failure is reported without retries
every frame. Image loading and saving avoid active audio playback.

The supplied clean storage/slopix-data.img also passed host fsck.fat -vn
(4 files, 10/128992 clusters).

See PERFORMANCE-0.85.md for the sequential matrix and sustained-run results.
Raw gate results and per-check logs are in build/release085-*.
