# Slopix 0.9 final regression results

Tested ISO SHA-256: `ca291c31d63a2fb64fbe68fdea51c9c904760c0ac3ba8e7886eba181bb48ddbc`.

33 command groups passed on this unchanged ISO. The host group includes Rust
unit/ABI tests and C ASan/UBSan renderer, framebuffer, runtime, DOOM compatibility,
PCM/SFX, preferences, frame statistics, VM/ELF, internal interfaces and FileSlop/
clipboard tests. Host tests do not establish CPU privilege isolation.

| Check | Result | Seconds |
|---|---|---:|
| ui-icons-test | PASS | 3.47 |
| tests/icon_test.py | PASS | 0.09 |
| tests/telemetry.py | PASS | 0.02 |
| tests/smoke.py | PASS | 4.86 |
| tests/clock_test.py | PASS | 10.69 |
| tests/memory_guest_test.py | PASS | 7.7 |
| tests/input_regression_test.py | PASS | 8.11 |
| tests/window_test.py | PASS | 12.71 |
| tests/terminal_test.py | PASS | 32.41 |
| tests/cube_test.py | PASS | 31.81 |
| tests/models_dock_test.py | PASS | 22.19 |
| tests/doom_test.py | PASS | 63.56 |
| tests/audio_guest_test.py | PASS | 37.19 |
| tests/doom_audio_test.py | PASS | 42.41 |
| tests/display_test.py | PASS | 30.53 |
| tests/display_fallback_test.py | PASS | 4.61 |
| tests/storage_host_test.py | PASS | 2.04 |
| tests/storage_interop_test.py | PASS | 0.67 |
| tests/storage_safety_guest_test.py | PASS | 16.21 |
| tests/storage_guest_test.py | PASS | 59.94 |
| tests/reboot_test.py | PASS | 3.66 |
| tests/utilities_guest_test.py | PASS | 41.77 |
| tests/preferences_storage_test.py | PASS | 20.77 |
| tests/userspace_guest_test.py | PASS | 30.62 |
| tests/shell_guest_test.py | PASS | 33.2 |
| tests/files_guest_test.py | PASS | 32.62 |
| tests/integration09.py | PASS | 72.57 |
| tests/polish_guest_test.py | PASS | 19.65 |
| tests/doom_lifecycle_test.py | PASS | 32.34 |
| tests/storage_stream_guest_test.py | PASS | 21.2 |
| tests/heap_guest_test.py | PASS | 12.56 |
| tests/files_paths_guest_test.py | PASS | 13.59 |
| tests/userspace_stream_api_test.py | PASS | 4.45 |

New storage tests compare fragmented multi-megabyte data after range append,
copy/rename and cold boot, including independent mtools and fsck validation.
The streaming READ.ELF runs at CPL3 with bounded memory; new heap and lifecycle
tests exercise real PMM/SB16 service and repeated fresh DOOM sessions.

The userspace guest test executes real disk-loaded ELF64 code at CPL3, normal
exit, bad pointers, UD/GP/PF/divide faults, kernel-access protection, RX/NX, stack
guard, per-process SSE state, sleep, timer preemption, kill and reclamation.
Free physical-page counts return to baseline; DOOM and audio continue.

The supplied disk and ELF are also tested together. FileSlop tests exercise
real creation, text viewing, cancel/confirmed removal, clipboard in both
directions, cold persistence and independent fsck. Host injection covers its
read-only/full/I/O and capacity limits. The existing storage suites separately
test actual failed writes, full images, degraded volumes and user-file retention.

Desktop coverage includes new tab dragging/hitboxes, resize, focus, minimize,
maximize/restore, close/reopen, panel hover/auto-hide/top placement, pinboard
drag/keyboard launch, context menu, configuration cold recovery and all six apps
across supported resolutions. Older Dock-specific assertions were replaced by
new panel assertions; model/lifecycle/clipping assertions were retained.

See `build/release09-results.json` and its per-group logs for raw results.
See `PERFORMANCE-0.9.md`, graphical09.log and final09-pa-10000.json/log for
performance and graphical audio evidence. Physical speakers, physical monitor
latency and real hardware remain unverified. Earlier release reports are historical.
