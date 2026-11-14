# Slopix Genesis Checkpoint 07 - userspace libc + a real scheduler

**Source checkpoint with host tests and one QEMU acceptance test. Not a 1.0
release.**

CP06 ended with a Ring-3-only desktop, a syscall ABI that apps poked at with
inline assembly, and a scheduler that round-robined every process with one fixed
quantum. CP07 gives the userspace a C library and gives the kernel an actual
scheduling policy, without breaking the CP05/CP06 syscall contract.

## What CP07 adds

### 1. A userspace C library (`sdk/libc/`)

A freestanding libc, statically linked into each program. No dynamic linking, no
`PT_INTERP`, no host dependency:

| Piece | Notes |
| --- | --- |
| `crt0.o` | `_start` -> `__libc_init` -> `main` -> `exit`; sets up `%fs` |
| `libc.a` | `string`, `stdlib`, `stdio`, `errno`, `unistd` |
| `user.ld` | own linker script at `0x100001000`, PT_LOAD only |

Headers: `stdio.h`, `stdlib.h`, `string.h`, `unistd.h`, `errno.h`, `limits.h`,
`syscall.h`.

Implemented surface (about 70 functions):

- **string**: `memcpy/memmove/memset/memcmp/memchr/memccpy`, `strlen`, `strcpy/
  strncpy/stpcpy/stpncpy/strcat/strncat`, `strcmp/strncmp/strcasecmp/
  strncasecmp`, `strchr/strrchr/strstr/strdup/strndup`, `strspn/strcspn`,
  `strtok`.
- **stdlib**: `malloc/free/calloc/realloc` (bump arena with an address-ordered
  free list, 8 pages, coalescing), `atoi`, `strtol`, `strtoul`, `rand/srand`,
  `exit`, `abort`, `getenv` (empty), `system` (explicitly unimplemented).
- **stdio**: a buffered `FILE` layer over the kernel descriptor calls -
  `fopen/fclose/fread/fwrite/fflush/fseek/ftell/fgetc/fputc/fgets/fputs/feof/
  ferror/clearerr/fileno/fdopen`, plus `printf/fprintf/sprintf/snprintf` and the
  `v*` variants. `%d %i %u %x %X %o %c %s %p %%` with `-`, `0`, `+`, space, `#`
  and width/precision.
  - `stdout`/`stderr` are line-buffered console streams; every other file is
    block-buffered through `SX_FWRITE`.
  - `fseek`/`ftell` are real: `SEEK_SET`, `SEEK_CUR` and `SEEK_END` are resolved
    with `SX_STAT` on the path the stream was opened with.
- **unistd**: `open/read/write/lseek/close/mkdir/rmdir/unlink/chdir/getcwd`,
  `getpid/getppid/getuid/getgid`, `sleep/usleep`, `spawn`, `proc_report`,
  `sched_param`, `futex_wait`, `futex_wake`, `clock_gettime`.
- **errno**: per-process `errno`, exposed through `__errno_location()` exactly
  like a normal libc. Every failing wrapper sets it and returns `-1`.

Two deliberate design choices:

- **No `PT_TLS`.** The kernel ELF loader accepts `PT_LOAD` only and rejects
  `PT_TLS`, `PT_DYNAMIC` and `PT_INTERP`. Rather than weaken the loader, the
  linker script folds `.tdata`/`.tbss` into `.data`/`.bss`. Because every process
  owns its address space, an ordinary static *is* per-process storage.
  `SX_TLS_BASE` still exists: `crt0` points `%fs` at the process's `errno` and
  the kernel clears `IA32_FS_BASE` on every exit to the kernel.
- **The libc is host-testable.** Compiled with `-DSLOPIX_HOST`, the three
  syscall entry points dispatch into `slopix_host_syscall()` instead of
  `int $0x80`. `tests/libc_host_test.c` implements a fake kernel (page arena,
  in-memory FAT32, console capture, scheduling wire format) and exercises the
  whole library without QEMU.

#### Descriptor space

File descriptors moved to **10..13** (`SX_FD_BASE 10`, `SX_FD_MAX 4`). `0/1/2`
stay reserved for the console channels. This removes the old ambiguity where a
libc `read()` could not tell "stdin" from "user file #1". Existing apps only
compare `fd < 0` / `fd > 0` or pass the value back, so nothing had to change.

### 2. The CP07 scheduler

`src/user/process.c` now carries real scheduling state per process: `policy`,
`priority`, `vruntime`, `deadline_ns`, `period_ns`, `runtime_ns`,
`next_deadline_ns`, `futex_addr`, `fs_base`.

| Policy | Behaviour |
| --- | --- |
| `SCHED_OTHER` | weighted fair share; picked by lowest `vruntime` |
| `SCHED_FIFO` | runs until it blocks/exits/yields (still preempted by deadlines) |
| `SCHED_RR` | FIFO with the priority-scaled quantum |
| `SCHED_DEADLINE` | earliest `next_deadline_ns` first, always ahead of the others |

- Priorities `1..32`, default `16` (`SX_PRIO_*`).
- Quantum is `QUANTUM_US * 16 / priority`, clamped to `500..10000` us. A
  priority-32 task gets 1000 us, priority 1 gets 10000 us.
- Within `SCHED_OTHER`, the task with the lowest `vruntime` wins; `vruntime`
  advances by `elapsed * 16 / priority`, so a high priority task accumulates
  virtual time more slowly and therefore runs more often.
- Deadline tasks get their next deadline armed on admission and re-armed after
  each period; a missed deadline increments `deadline_misses` instead of being
  hidden.
- `SX_YIELD` advances `vruntime` so a yielding FIFO/RR task cannot monopolise.
- All arithmetic is integer. The kernel is still built with
  `-mgeneral-regs-only`, so no floating point can sneak into the scheduler.

New syscalls:

| # | Name | Purpose |
| --- | --- | --- |
| 34 | `SX_SCHED_PARAM` | set policy/priority/deadline parameters |
| 35 | `SX_FUTEX` | `FUTEX_WAIT` / `FUTEX_WAKE` on a word in the caller's space |
| 36 | `SX_TLS_BASE` | set `IA32_FS_BASE` for the caller |
| 37 | `SX_CLOCK_GET` | `CLOCK_REALTIME` / `CLOCK_MONOTONIC` into a `timespec` |

`proc_report`/`ps` now prints the new state:

```
PROCESS pid=2 state=running pages=54 ... policy=deadline prio=28 vr=76335
SCHED switches=663 preemptions=241 crashes=0 max_slice_us=5306 deadline_misses=0
```

## Bugs found and fixed on the way

These were all latent (or invisible) before CP07 and were hit by the new tests:

- **`SX_PROCINFO` wrote to the wrong address.** It validated the destination in
  `a` but copied to `b`, so every Ring-3 `ps` failed with `-EFAULT`. This is why
  the CP06 Ring-3 terminal could never show process state.
- **`sdk/terminal.c` `run` dropped the mode argument**, so `run HELLO.ELF 5`
  tried to open a file literally named `HELLO.ELF 5`. It now splits the optional
  numeric mode and passes it to `_start`.
- **`SX_OPEN` returned `-EIO` for a missing file** instead of `-ENOENT` (and
  `-EIO` for a directory instead of `-EISDIR`), which made libc `errno`
  meaningless for the most common error.
- **`malloc`/`free` could build a cyclic free list**, hanging the process on the
  next allocation. `free` now rejects foreign and double frees, inserts in
  address order and merges both neighbours.
- **`vfprintf` lost `%X` and never space-padded numbers** (`%5d` printed `42`).
- **ATA: a `FLUSH CACHE` could exceed the fixed 100 ms poll budget** and mark
  the disk dead for the session (`op=flush status=192`). Timeouts are now per
  command class (flush 5 s), and a failed command is retried after a bus reset
  before the disk is declared offline.
- **ABI number drift**: `sdk/slopix.h` used an implicit enum while the libc used
  explicit values, so the libc's four new syscalls landed on the wrong numbers
  and silently returned `-ENOSYS`. Both sides are now explicit and
  `tests/genesis_cp07_abi_test.py` fails the build if they ever disagree.

## Tests

`make cp07-host-test` (no QEMU, no rustc):

- `libc-host-test` - the whole libc against a fake kernel: strings, formatting
  including width/`%X`, allocator churn, `FILE` I/O with `SEEK_END`, `errno`,
  `sched_param` wire format, `clock_gettime`.
- `libc-elf-test` - the real kernel ELF loader must accept `LIBCDEMO.ELF` and
  `TERM.ELF` (PT_LOAD only) and reclaim every page.
- `genesis_cp07_abi_test.py` - kernel header vs libc header: syscall numbers,
  dispatch coverage, fd base, policy ids, no TLS output section.
- `genesis_cp05_abi_test.py`, `slop_package_test.py` - unchanged regressions.

`make genesis-cp07-guest-test` (QEMU, ~2 minutes):

Creates a fresh FAT32 disk, completes the CP06 first-run account wizard, unlocks,
and drives the Ring-3 terminal:

1. `run LIBCDEMO.ELF` -> `LIBCDEMO: ok`, with the program's own output
   (`printf`, `malloc`, `strdup`, `calloc`, buffered `FILE` over FAT32,
   `fseek(SEEK_END)`, `errno`, `clock_gettime`, `futex_wait` timeout).
2. The kernel log proves `SCHED_DEADLINE pid=N period_us=20000 runtime_us=4000`
   was applied, and `proc_report` shows `policy=deadline prio=28`.
3. `run HELLO.ELF 5` (an intentional spinner) -> the next `SCHED` line shows
   `switches` and `preemptions` both increased (94 -> 663 and 0 -> 241 in a
   measured run).
4. Two identical runs map the same number of pages, so exit released the
   address space.

Verified here: 3 consecutive guest runs passed.

### What does not run in this environment

- Every `-fsanitize=address,undefined` host test (`genesis-cp03/04/05/06-host-test`,
  `account-test`, `auth-flow-test`) fails to *load* because this machine has no
  UBSan/ASan runtime (`libubsan.so` is a 39-byte stub). That is an environment
  gap, not a code failure; `cp07-host-test` therefore uses the non-sanitised
  variants.
- `tests/userspace_guest_test.py` and the CP05/CP06 guest scripts are **stale**
  since CP06: they type into the kernel terminal, which no longer receives
  input (SlopDE routes keys only to Ring-3 apps) and which is behind the login
  gate. They could not pass before CP07 either. `genesis_cp07_guest_test.py`
  replaces that approach for the features CP07 touches.

## Build

```
make -j4                 # kernel + ISO + sdk (incl. LIBCDEMO.ELF)
make cp07-host-test      # libc, loader, ABI and package tests
make genesis-cp07-guest-test
```

For a bootable data disk that contains `LIBCDEMO.ELF` (run it from the Ring-3
terminal with `run LIBCDEMO.ELF`):

```
make genesis-cp07-disks  # -> storage/genesis-cp07-ring3-ready.img
```

## Known gaps

- The libc is single-threaded and has no locale, wide chars, `qsort`, `bsearch`,
  `time.h`, `signal.h`, `setjmp` or math.
- `futex_wait` honours a timeout; there is no userspace-visible `FUTEX_WAKE`
  test yet beyond the kernel unit path.
- Deadline admission control is permissive: any task may request a deadline
  policy, and runtime overruns are counted but not throttled.
- SMP does not exist, so "priority" only orders one CPU.
