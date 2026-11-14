# Genesis readiness

Let There Be Light is an incremental 0.9 build, not the completion of the entire
modernization brief. Its strongest foundations are protected ELF64 execution,
validated streamed file access, a tested kernel heap, cooperative audio service,
safe session reset, persistent desktop configuration and a modular desktop/VFS.

**Checkpoint 07 (see `GENESIS-CHECKPOINT07.md`) closed two of the largest gaps:**

- A real userspace C library now exists in `sdk/libc/` (string, stdlib with a
  working allocator, buffered `FILE` I/O with `fseek`/`ftell`, formatted output,
  `errno`, `unistd`, plus `sched_param`/`futex`/`clock_gettime`). It is
  statically linked, freestanding, and host-testable against a fake kernel.
- The scheduler is no longer a single fixed round-robin quantum. Processes carry
  a policy (`SCHED_OTHER/FIFO/RR/DEADLINE`), a priority (1..32), a virtual
  runtime, and optional deadline parameters. Quantum scales with priority, EDF
  runs earliest-deadline-first, and deadline misses are counted and reported.

That leaves the userspace *window/event/surface API* as the main architectural
gap: GUI apps still drive the desktop through a narrow `SX_GUI_*` syscall pair
rather than a validated surface model. Legacy GUI apps also still share kernel
execution and fault exposure.

**Checkpoint 08 (see `GENESIS-CHECKPOINT08.md`) made the machine faster:**
the kernel's bulk copies and fills are SSE2 (`src/sse.S`, 64-byte blocks), the
present path no longer scans 256 000 pixels through `native_color()` on an RGB
framebuffer (`slopix_mask_copy`), `user_vm_copy` stopped copying one byte per
iteration, and libc `memcpy`/`memset`/`memmove` are SSE2. Native measurement
(`make cp08-membench`) shows 2.0–2.4× for 1–4 KiB copies and fills, 1.3–1.7×
for larger blocks. A cross-process xmm5/xmm6 marker test now proves the
`fxsave`/`fxrstor` switch keeps each process's SSE state intact while the
kernel itself uses XMM. No ABI changed; CP07 binaries and tests still pass.

Storage still needs growable directories, VFAT names, cross-directory moves,
a more capable editor and a deliberate crash-recovery policy. Current tests
establish supported operations and failure handling, not journaling or crash
atomicity. Networking, DPI scaling and ACPI shutdown remain unimplemented.

The libc is deliberately minimal: no threads, no `signal.h`, `setjmp`, wide
characters, `qsort`/`bsearch` or math. The scheduler is uniprocessor; "priority"
orders one CPU, not several.

Do not market this as a secure daily-driver OS. QEMU tests, exact artifact hashes
and measured timings are in TEST-RESULTS-0.9.md/PERFORMANCE-0.9.md. Physical
hardware, display latency, speakers and host IME behavior require local testing.

## Verification status of this checkpoint

| Suite | Status |
| --- | --- |
| `make -j4` (kernel, ISO, sdk, `BENCH.ELF`) | PASS |
| `make cp08-host-test` (libc, ELF loader, runtime mem*, ABI, packaging) | PASS |
| `make cp08-membench` (native SSE2 vs CP07) | PASS (speedups printed) |
| `make genesis-cp08-guest-test` (QEMU) | PASS |
| `make genesis-cp07-guest-test` (QEMU, CP07 regression on the CP08 kernel) | PASS |
| `-fsanitize=*` host tests | cannot run here: no ASan/UBSan runtime installed (`runtime-test-plain` covers the same cases with guard pages) |
| `tests/userspace_guest_test.py`, CP05/CP06 guest scripts | stale since CP06 (login gate + Ring-3 terminal), replaced by the CP07/CP08 tests |
