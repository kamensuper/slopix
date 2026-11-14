# Genesis Checkpoint 08 — SSE2 (everything faster)

Checkpoint 07 gave users a real C library and a real scheduler. Checkpoint 08
uses the SSE2 vector unit the CPU has had all along: the bulk memory paths in
the kernel and in libc now move 16 bytes per instruction instead of 8, the
framebuffer present path no longer runs a scalar loop over every pixel, and a
new benchmark proves both the speed and that per-process SSE state survives
preemption.

Nothing in the ABI changed. `SX_*` numbers, `struct sched_param`, `FD_BASE` and
the GUI surface protocol are untouched, so CP07 binaries keep running (verified:
`make genesis-cp07-guest-test` still passes against the CP08 kernel).

---

## 1. What actually changed

| Area | Before (CP07) | After (CP08) |
| --- | --- | --- |
| Kernel `memcpy`/`memset`/`memmove` | 8-byte word loop | 64-byte unrolled SSE2 (`movdqu`), 16-byte blocks, 8/4/2/1 tails |
| `user_vm_copy` (every syscall buffer + every frame) | **one byte per iteration** | chunked `memcpy` → SSE2 |
| `SX_GUI_PRESENT` staging | 1 MB copied one byte at a time | 1 MB at 64 bytes per block |
| `gui_present` (user pixels → native surface) | 256 000 × `native_color()` (shift/shift/or per pixel) | `slopix_mask_copy`: 8 pixels per SSE2 iteration, scalar path only for non-RGB framebuffers |
| `blit`/`words` (surface → framebuffer) | 8-byte word copy | `memcpy` → SSE2 |
| `zero_page` (every page allocation) | 512 × 8-byte stores | `memset` → SSE2 |
| libc `memcpy`/`memset`/`memmove` | word loop + byte loop | SSE2 intrinsics, 64-byte unrolled |
| FPU/SSE context switch | already existed (`fxsave`/`fxrstor` per process) | **now proven** by a cross-process marker test |

## 2. Correction to the CP08 plan: FPU/SSE switching already existed

The initial plan assumed per-process FPU state had to be added. It did not. It
has been in place since the Ring-3 work:

- `src/entry.S` sets `CR0.MP`, clears `EM`/`TS`, and sets
  `CR4.OSFXSR | CR4.OSXMMEXCPT`, so SSE is legal in ring 3.
- `src/user/user.S` reserves a 512-byte, 16-byte-aligned `kernel_fp` area and
  runs `fxsave`/`fxrstor` on **every** user entry/exit:

  ```asm
  user_leave:  fxsave (%rax)          # save the process's XMM/x87/MXCSR
               fxrstor kernel_fp(%rip) # restore the kernel's (empty) state
  user_enter:  fxsave kernel_fp(%rip) # park the kernel's state
               fxrstor (%rdx)         # load this process's state
  ```

So CP08 is not "add SSE", it is "**use** SSE everywhere it pays, and prove the
switching is still correct once the kernel itself starts touching XMM".

That last point matters: the moment the kernel uses SSE, a bug in the save path
would silently corrupt application vector registers. CP08 therefore ships a test
that would catch it (§6).

## 3. Kernel primitives — `src/sse.S` + `src/runtime.c`

The kernel is compiled with `-mgeneral-regs-only` on purpose (no accidental
float in ring 0, no XMM live across a call). GCC rejects XMM clobbers in inline
asm under that flag, so the bulk loops live in a small assembly file:

```
slopix_memcpy_sse(dst, src, count)     count >= 64
slopix_memset_sse(dst, value, count)   count >= 64
slopix_memmove_sse(dst, src, count)    count >= 64, dst > src (backwards)
slopix_mask_copy(dst, src, pixels)     dst[i] = src[i] & 0x00ffffff
```

`src/runtime.c` keeps the C word loop for small sizes and calls into the
assembly above for 64 bytes or more, so short copies pay no call overhead.

Two properties are deliberate:

1. **No access crosses `[base, base+count)`.** Only whole 16-byte blocks are
   loaded/stored; the leftover 0..15 bytes use 8/4/2/1-byte accesses. The tests
   place buffers against unmapped guard pages to prove it (§6).
2. **Nesting is safe.** Each routine saves and restores the XMM registers it
   uses (`xmm0..3` for copy, `xmm0` for fill, `xmm0..2` for the masked copy). A
   timer IRQ can land in the middle of a 64-byte block and run a different
   copy; without the save/restore the interrupted copy would store the IRQ
   handler's XMM values into its destination. The prologue/epilogue make the
   kernel's use of XMM invisible to itself.

`memcmp` stays scalar — it is not on any hot path here.

## 4. The present path

Presenting one 640×400 frame used to cost three full scalar passes:

1. `SX_GUI_PRESENT`: user pixels → kernel staging buffer (`user_vm_copy`,
   byte at a time).
2. `gui_present`: staging → the process surface, converting every pixel through
   `native_color()` (a shift/mask/or chain) even when the framebuffer already
   uses `0x00RRGGBB`.
3. `gui_draw` → `blit` → `words`: surface → the actual framebuffer, 8 bytes at
   a time.

Now:

- (1) is `memcpy` (SSE2, 64 bytes per iteration) — the same 1 MB moves ~8–16×
  fewer machine instructions.
- (2) is `slopix_mask_copy` in the common RGB32 case (8 pixels per iteration),
  and keeps the exact scalar `native_color` loop for BGR framebuffers. The
  `& 0xffffff` mask is preserved in SIMD (`pand` with `0x00ffffff`) so the
  result is bit-identical to before.
- (3) is `memcpy`.

`graphics_standard()` was added so `gui_present` can ask the graphics layer
whether the native word order already matches `0x00RRGGBB`.

This is the change with the largest user-visible effect, because a 640×400
window redraw now touches 1 MB three times instead of 256 000 scalar pixels
three times.

## 5. libc — `sdk/libc/src/string.c`

The libc is *not* compiled `-mgeneral-regs-only`, so it uses `<emmintrin.h>`
intrinsics (`_mm_loadu_si128` / `_mm_storeu_si128` / `_mm_set1_epi8`). Same shape
as the kernel: 64-byte unrolled blocks, 16-byte blocks, then 8/4/1-byte tails.

No save/restore is needed in ring 3: an interrupt there is a trip into the
kernel, which `fxsave`s the process's whole SSE state before any kernel C runs,
and `fxrstor`s it on return. A preemption in the middle of a libc 64-byte block
therefore resumes with the in-flight XMM registers exactly as they were.

## 6. Proof: per-process SSE state survives preemption

`BENCH.ELF` (new, `sdk/bench.c`) runs two processes that fight over XMM:

- The parent loads a 16-byte marker into **xmm5**, executes `int $0x80`
  (`SX_SLEEP`) and reads xmm5 back — **all inside one `asm` block**, so the
  compiler cannot touch the register in between. It repeats this 40 times
  (200 ms of sleeping).
- Meanwhile its child (`run BENCH.ELF 1`) does the same with **xmm6**, and
  between its own sleeps it loads a *different* 16-byte pattern into **all 16
  XMM registers** and copies 256 KB with the SIMD libc.

If the kernel shared one FPU area, skipped `fxsave`, or restored the wrong
process's state, the parent would read the child's bytes (or the child would
read the parent's) and print `BAD`. Guest log from the passing run:

```
[user 3] BENCH fpu ok
[user 4] BENCH worker ok
```

A shared FPU area fails this test deterministically; that is the whole point of
using two different markers held across a blocking syscall.

## 7. Measured

### 7.1 Native A/B benchmark (the real receipt)

TCG is an interpreter: it is 10–20× slower than the host CPU and its throughput
moves with host load, so guest MB/s numbers cannot settle a "is it faster"
question. `make cp08-membench` therefore runs **the shipped `memcpy`/`memset`
source** against the **CP07 algorithms**, natively, with `-O2 -fno-builtin` (the
same flags the libc is built with, so GCC makes the same decisions it made
then). One run on this machine (`gcc 16.2`, x86-64, 64-byte-aligned buffers,
best of 5):

```
      64 B  copy    13.3 ->    17.3 GB/s   1.30x   fill    10.5 ->     9.7 GB/s   0.92x
    1024 B  copy    24.3 ->    58.6 GB/s   2.41x   fill    26.9 ->    54.5 GB/s   2.03x
    4096 B  copy    28.5 ->    60.3 GB/s   2.12x   fill    27.0 ->    60.0 GB/s   2.22x
   65536 B  copy    23.2 ->    35.9 GB/s   1.55x   fill    26.6 ->    45.8 GB/s   1.72x
  262144 B  copy    20.8 ->    26.3 GB/s   1.26x   fill    25.2 ->    42.7 GB/s   1.70x
 1048576 B  copy    19.3 ->    24.4 GB/s   1.26x   fill    23.5 ->    37.3 GB/s   1.59x
PASS: SSE2 copy/fill bytes are identical; speedups shown above
```

Reading it:

- **1 KiB – 4 KiB: 2.0–2.4×** — the sizes that dominate real code (strings,
  packets, syscall buffers, glyph rows, 8.3 directory entries).
- **64 KiB: 1.5–1.7×** — still compute-bound.
- **≥256 KiB: 1.26–1.70×** — approaching memory bandwidth, which is why the win
  narrows. Fills age better than copies because they issue no loads.
- **64 B: copy 1.30×, fill ~1×** — at exactly one 64-byte block the SSE2 setup
  (`movd`+`pshufd` for the fill pattern) costs about what the word loop saves.
  Below 64 bytes the C word/byte path runs instead, so no size regresses.

The kernel primitives use the same instruction shape as the libc ones, so the
same ratios apply to `user_vm_copy`, `words`, `zero_page` and the present path —
except where the *shape* of the loop changed as well (see below).

### 7.2 Algorithmic wins that are bigger than the vector width

Two call sites did not merely widen; they changed complexity:

- `user_vm_copy`: `for (i…) { if (to_user) d[i]=b[i]; else b[i]=d[i]; }` → one
  `memcpy` per 4 KiB page chunk. That is ~1 byte/iteration → 64 bytes/iteration,
  **≈64× fewer iterations** (plus no per-byte branch), and it is the function
  every syscall buffer and every presented frame goes through.
- `gui_present`: 256 000 iterations of `native_color()` (3 shifts, 2 ands, 2 ors
  = ~7 ops per pixel) → 32 000 iterations of load/pand/store (3 ops per 4
  pixels), i.e. **~8× fewer instructions per pixel and 8 pixels per iteration**
  (two 16-byte vectors, load → `pand` → store).

### 7.3 Guest end-to-end

`make genesis-cp08-guest-test` boots, logs in, and runs `BENCH.ELF` inside the
real desktop. Representative run on this machine (QEMU TCG, `qemu64`, host under
normal desktop load — treat these as "it works and is in the right range", not
as a hardware benchmark):

```
[user 3] BENCH start
[user 3] BENCH memcpy 1k=736 MB/s
[user 3] BENCH memcpy 64k=1677 MB/s
[user 3] BENCH memcpy 256k=840 MB/s
[user 3] BENCH memset 256k=3300 MB/s
[user 3] BENCH roundtrip=1206 us
[user 3] BENCH fpu ok
[user 4] BENCH worker ok
[user 3] BENCH: ok
```

Repeated boots here land anywhere between ~700 and ~1700 MB/s for `memcpy`,
because TCG throughput follows whatever the host CPU is doing (the same binary
measured 2016 MB/s and 718 MB/s on different runs). The test writes the full log
to `build/genesis-cp08-guest.log` for comparison.

The acceptance test deliberately asserts only that measurements exist and are
non-zero: TCG throughput on a loaded host swings by 3× between boots, so a
threshold would be a flaky test, not a regression test.

`BENCH roundtrip` is worth reading carefully: because every user slice ends at
its syscall and the kernel then runs one main-loop iteration (desktop service,
input poll, compositor) before returning, this number is **one syscall plus one
desktop iteration**, not a bare trap. ~1.2 ms on TCG means the desktop service
loop, not `int $0x80`, is what an app waits for — that is the CP09/CP10
conversation, and it is now measured instead of guessed.

## 8. Tests

New:

- `make cp08-host-test` — libc host test (now with a `mem*` torture matrix:
  every length 0..1100 × 16 unaligned offsets × 31 overlap shifts, plus
  `mmap` guard pages on both sides up to 8 KiB), the CP07/CP05 ABI checks and
  the package tests.
- `make runtime-test-plain` — the kernel `mem*` test without sanitizers. It
  covers every length 0..8192 at both alignments against guard pages, all
  overlap directions, and `slopix_mask_copy` against the scalar definition
  (values, unaligned starts, no write outside `[dst, dst+n)`). The ASan variant
  (`make runtime-test`) still exists but cannot run in this container (no
  ASan/UBSan runtime — pre-existing).
- `make cp08-membench` — the native A/B benchmark above.
- `make genesis-cp08-guest-test` — the QEMU acceptance test: login, CP07
  regression (`LIBCDEMO.ELF`), `BENCH.ELF` throughput, syscall round trip,
  and the xmm5/xmm6 cross-process markers.
- `make genesis-cp07-guest-test` (re-run) — still passes on the CP08 kernel.
- `make genesis-cp08-disks` — buildable FAT32 image
  (`storage/genesis-cp08-ring3-ready.img`) with `BENCH.ELF` as a 13th root
  entry.

Note on that 13th entry: the FAT32 root here is a chain of eight clusters, but
`tools/build_genesis_disk.py` used to write only the first 512-byte sector, so
disk seeding silently capped out at 12 files. It now writes the whole root
cluster chain. Verified two ways: `mdir` lists all 13 entries, and
`tests/genesis_package_fat_test.c` (which links the **real** kernel FAT32/VFS
code) resolves `HELLO.SLP`, the entry that lives past the first sector.

## 9. Files changed

```
Makefile                              +sse.o, runtime-test-plain, cp08 targets
src/sse.S                             new: SSE2 bulk primitives
src/runtime.c                         dispatch to sse.S for >= 64 bytes
src/kernel.h                          prototypes for the primitives + graphics_standard
src/user/vm.c                         user_vm_copy -> memcpy, zero_page -> memset
src/user/gui.c                        gui_present -> SIMD masked copy on RGB32
src/graphics.c                        words() -> memcpy, graphics_standard()
sdk/libc/src/string.c                 SSE2 memcpy/memmove/memset
sdk/bench.c, sdk/Makefile             new BENCH.ELF
tools/membench.c                      native A/B benchmark
tools/build_genesis_cp08_disk.py      new disk layout (13 entries)
tools/build_genesis_disk.py           seed writes the full root cluster chain
tests/runtime_test.c                  guard pages, mask copy, plain build
tests/libc_host_test.c                mem* torture matrix, guard pages
tests/genesis_cp08_guest_test.py      QEMU acceptance test
```

## 10. Deliberate non-goals

- **AVX / AVX2 / AVX-512.** They need `XSAVE`/`XCR0` and a 8 KB context area per
  process; `user.S` only does FXSAVE (512 bytes). Using AVX without `XSAVE`
  loses the upper halves across context switches. Not before that work.
- **SSE3+ (e.g. `pshufb`)** — `qemu64` does not guarantee SSSE3, and SSE2 is the
  x86-64 baseline. Everything here runs on the documented CPU.
- **Rewriting the compositor** (damage rectangles, dirty tiles, SIMD alpha
  blending) — the present path is now memory-bound, not instruction-bound; the
  next win is doing *less work*, which is CP09/CP10 territory.
- **DMA / VirtIO / GUI/audio work** — out of scope for this checkpoint as agreed.

## 11. Build and run

```sh
make -j4                        # kernel + ISO + sdk BENCH.ELF
make cp08-host-test             # host correctness (no QEMU)
make cp08-membench              # native SSE2 vs CP07 measurement
make genesis-cp08-disks         # storage/genesis-cp08-ring3-ready.img
make genesis-cp08-guest-test    # full QEMU acceptance test
SLOPIX_DISK=storage/genesis-cp08-ring3-ready.img sh run.sh
```

In the desktop terminal: `run BENCH.ELF` (benchmark + FPU state proof) or
`run LIBCDEMO.ELF` (CP07 regression). `BENCH.ELF 1` is the worker mode used by
the parent; it is not meant to be started by hand.
