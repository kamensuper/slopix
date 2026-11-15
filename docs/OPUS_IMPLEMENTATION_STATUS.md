# Slopix implementation status

Branch: `slopix-opus-revival` (from `slopix-2-wowzer` @ `67068f1`, SlopDE 3 included).
Audit references (B-xx) are from BUG_REGISTER.md of the 2026-11-15 audit.

Status words: **verified** = a build or test actually ran and passed; **unverified** = written and reviewed, not yet built or run; **blocked**; **not started**.

## Environment
- The agent's shell (Hyper desktop app under Wine/Bottles) has git but no C compiler, make, Python or QEMU. It cannot build or boot Slopix.
- All compilation and testing therefore happens in GitHub Actions (`.github/workflows/ci.yml`). Nothing below is verified until that workflow has run on this branch.

## CI results (GitHub Actions, run on this branch)

| Commit | What | Build | libc host | SlopDE host | runtime | sdk check | QEMU boot |
|--------|------|-------|-----------|-------------|---------|-----------|-----------|
| `02f4e87` | baseline SlopDE 3 + CI only | pass | pass | pass | pass | pass | pass |
| `e804245` | libc half of a split commit | **fail** (expected: args.c not yet in the libc Makefile) | pass | pass | pass | pass | pass |
| `b548d94` | all libc + kernel fixes and tests | pass | pass | pass | pass | pass | pass |
| `31f9447` | + SlopDE pointer protocol + docs | pass | pass | pass | pass | pass | pass |

Pass/fail comes from the step exit codes reported by GitHub; the uploaded log artifacts were not read. The QEMU boot test proves the kernel reaches INTERACTIVE_DESKTOP_READY with no disk; it does not exercise the mouse, so B-03 is **built and boots, behaviour unverified**. The libc items are **verified** by the host test that ran in CI.

## Done in session 1

| Item | Change | Files |
|------|--------|-------|
| CI | Workflow: toolchain from the Dockerfile, `make`, libc host test, SlopDE host tests, runtime test, `make -C sdk check`, headless QEMU boot that passes only on the guest's `INTERACTIVE_DESKTOP_READY` serial marker, log upload | `.github/workflows/ci.yml`, `tests/ci_boot.py` |
| B-03 (P1) | Full pointer protocol: SlopDE forwards move/press/release with the real button mask to the focused app; pointer capture while a button is held (release always delivered, clamped to the surface); held buttons without capture report 0; kernel coalesces consecutive mouse moves so press/release never fall out of the 64-slot queue | `src/desktop.c`, `src/user/gui.c`, `src/user/gui.h` |
| B-01 (P1) | malloc: exact/near fit hands out the whole block (no unsigned underflow); stricter `free` (alignment, bounds, double free inside merged blocks); heap grows on demand in 8-page SX_MAP chunks up to 64 MiB (was fixed 32 KiB) | `sdk/libc/src/stdlib.c` |
| B-02 (P1) | qsort replaced with insertion sort (n<=16) / heap sort: O(n log n), no recursion, no pivot pointer | `sdk/libc/src/stdlib.c` |
| B-04, B-15 (P1/P2) | `open(O_CREAT)` truncates only with `O_TRUNC`; new `O_EXCL`; `fopen` modes decided by letter (`w`/`w+` create+truncate, `a`/`a+` open-or-create keep contents, `r+` open), `b` and `+` anywhere; append seeks to the real size instead of 0x7fffffff. Kernel `SX_CREATE` gains mode 2 = open or create, keep contents (modes 0/1 unchanged, so `FILES.ELF` keeps "create new"). Kernel keeps the cached size in step with writes | `sdk/libc/src/stdio.c`, `sdk/libc/include/stdio.h`, `src/user/process.c` |
| B-16 | `FOPEN_MAX` 4 -> 8 (5 user streams; kernel allows 4 fds) | `sdk/libc/include/stdio.h` |
| B-14 | `exit()` flushes all streams; crt0 calls `exit(main(...))` | `sdk/libc/src/stdlib.c`, `sdk/libc/src/crt0.c` |
| B-05 | argv: new `__libc_build_argv` (quotes, empty args, bounded); crt0 reads the kernel's command-line text from rsi; kernel starts rsp 256 bytes lower so that text is no longer overwritten by the first stack frames; numeric payload printed correctly | `sdk/libc/src/args.c`, `sdk/libc/src/crt0.c`, `src/user/process.c`, Makefiles |
| B-06 | Console quota 512 B/s -> 16 KiB/s; libc sleeps and retries on EAGAIN (up to ~2 s) instead of dropping output | `src/user/process.c`, `sdk/libc/src/stdio.c` |
| Tests | libc host test: exact-fit corruption, double free, heap growth past 32 KiB, 100 KB single allocation, absurd sizes, qsort (300 random rounds incl. duplicates/sorted/reversed, 3-byte elements), append/O_APPEND/O_EXCL/O_TRUNC/`w+`/`a` on missing file, two streams, argv parsing. Fake kernel now enforces the 8-page SX_MAP cap and SX_CREATE mode 2 | `tests/libc_host_test.c` |

## Not started (next, in order)
1. Read CI results and fix whatever the first real build reports.
2. B-12 close event + grace period; RESIZE event (port from PR #3, not merge).
3. B-07 protected system files + trusted bit; B-08 priority cap; B-09 futex keyed by pid.
4. B-11 paged READDIR; rename/rmdir/truncate syscalls; real file handles (B-31).
5. SX_WAIT + exit status; RTC wall clock.
6. Text editor, dialogs, Alt+Tab/Alt+F4, wheel.

## Known risks in this round
- ABI: `SX_CREATE` mode 2 is new; old binaries are unaffected. The initial user `rsp` moved from USER_STACK-8 to USER_STACK-264 (same 16-byte alignment class).
- Pointer protocol changes what apps receive: apps now get moves and releases. `sdk/terminal.c` acts on any event with button 1 down; with capture it will now see repeated button-1 moves during a drag (it previously saw one press). Check terminal click behaviour in the first boot.
