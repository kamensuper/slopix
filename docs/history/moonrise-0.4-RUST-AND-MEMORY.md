# Rust/C integration and physical-page contract

The project pins Rust 1.85.1 and the built-in `x86_64-unknown-none` target.
`rust/memory.rs` is compiled as a freestanding static library with `no_std`,
`panic=abort`, static relocation and no dynamic allocation. Its target uses the
kernel-compatible soft-float/no-red-zone ABI. The rest of Moonrise remains C and
Assembly. This is not a rewrite of the kernel, paging or graphics.

The exported C ABI is declared in `src/memory.h`. Arguments/results are fixed
width integers, not Rust types or references. Status values: 0 success, -1 invalid
range/address, -2 wrong initialization phase, -3 busy/reentrant call. Allocating
returns a page-aligned physical address, with 0 meaning unavailable/exhausted/busy;
statistics return UINT64_MAX on invalid selector/busy. No ownership crosses as
a C pointer. The C caller must access returned pages only through the existing
below-4-GiB identity map and must free only allocations it owns.

The bounded bitmaps cover up to 1,048,576 physical 4 KiB pages (4 GiB), with
256 KiB of static Rust bookkeeping. Usable intervals align inward, reserved
intervals outward. Overlapping usable intervals are idempotent; C imports all
nonusable intervals afterward so those reservations win. Address arithmetic
rejects overflow. Page zero is never allocatable. Kernel/BSS, page tables, stack,
boot metadata/modules, firmware, the framebuffer huge-page span and the QEMU
PC IOAPIC/HPET MMIO span are reserved.
Memory above 4 GiB is left unavailable, even if the machine has more RAM.

Initialization is reset -> add usable ranges -> reserve retained ranges -> seal.
After seal, reset/range mutation is rejected. Allocation/free use separate
eligibility and allocation bitmaps, so double free and freeing a reserved or
misaligned address fail. Exhaustion returns 0 and preserves statistics.
The allocator uses a rotating first-fit cursor, with bounded scans and a fast
exhaustion check. It does not promise contiguous runs, zero-filled pages or a
heap. Existing static graphics/Terminal buffers are retained.

Two documented unsafe operations are confined to Rust's synchronized static
state and the panic handoff. An atomic nonblocking gate grants one mutable
reference; it never spins if reentered. The C contract restricts these APIs to
boot/main-loop calls, never IRQs. There is no SMP kernel support despite the
state gate. The panic handler calls a C function that logs and halts; it never
returns or unwinds across the language boundary.

`src/runtime.c` supplies freestanding byte-copy/fill/compare primitives that
Rust/core may require. The kernel links neither libc nor host Rust std. Static
link garbage collection discards unused core and unwind metadata. The separate
host C ABI test uses a host no_std build plus libc for its test runner; its
unwind-personality fallback aborts if invoked. That host-only fallback is not
part of the guest kernel.

## Testing distinctions

- `make memory-test`: host Rust unit tests plus an independent C-to-Rust ABI
  executable, including overlap/partial-page boundaries, invalid addresses,
  allocation exhaustion, repetition and phase enforcement
- `python3 tests/memory_guest_test.py`: cold boots the actual ISO and executes
  `memtest` inside Moonrise, allocating every currently free physical page,
  checking per-page canaries, observing exhaustion, freeing all pages and
  checking invalid/double-free rejection and restored statistics
- `meminfo`: reports actual page statistics in the guest

The `memtest` diagnostic intentionally occupies the main loop while touching all
free pages. It can briefly pause animation/input processing; IRQ capture stays
enabled. It is an explicit diagnostic, not an automatic per-frame workload.
It never frees or writes another subsystem's existing allocations. Normal apps
still use static storage. Lack of a general heap remains a known limitation.
