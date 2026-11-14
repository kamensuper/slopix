# Audit of the preserved Moonrise 0.3 kernel

The original `moonrise/` directory and `moonrise-0.3.zip` remain unchanged.
Work for this release is in a separate `moonrise-0.4/` directory.

## Findings before changes

| Area | Actual 0.3 behavior | Priority and decision |
| --- | --- | --- |
| Allocation | No heap, malloc or physical allocator; all renderer/Terminal/window state is static | Add only a predictable physical-page bookkeeping component; keep existing static graphics buffers |
| Physical map | Boot map entries are summed; no allocation reservations, partial-stride payload/version/overflow not rejected | High: validate the map and reserve retained memory before allowing page allocation |
| Paging | Assembly identity maps 0..4 GiB with 2 MiB pages; page tables and stack are inside kernel BSS | Keep the proven layout; mark framebuffer huge pages uncached and reserve that whole span |
| Protection | All mapped huge pages are supervisor writable/executable; no userspace, NX/W^X or guard pages | Known architectural limit; do not pretend 0.4 adds isolation or a new VM manager |
| Framebuffer | Validated RGB888/32bpp, pitch, dimensions and below-4-GiB range; native-format row upload | Keep it; reject overlap with kernel/boot metadata and extend clipping/alpha tests |
| Buffers | Fixed capacities, clipped primitives, bounded Terminal input/history/output ring | No demonstrated need to replace them with dynamic allocations |
| Windows | Two static indexed structs; no allocated window pointers or lifetime/free paths | No dangling-window-memory bug found; fix Dock hover hit testing when a normal window covers it |
| Input | 4096-event IRQ queue, bounded producer/consumer processing; overflow recovery exists | Retain queue; preserve interrupt flags and reset modifiers on parity/timeout; track both Ctrl keys and Caps press/release |
| Interrupts | GPR-saving aligned stubs, IDT/PIC, main-loop-only rendering | Preserve; document single CPU and absence of a double-fault IST stack |
| Timer | 1193-cycle PIT reload treated as exactly 1 ms; IRQ counting can lag when virtual interrupts coalesce | Confirmed host/counter discrepancy: add capability-checked free-running HPET on the QEMU PC target; retain exact-ratio PIT fallback |
| Idle loop | Uses hlt; still wakes around 1000 times/second and updates uptime once/second | No busy-loop replacement needed; measure actual QEMU CPU use and retain responsive timing |
| Performance | Dirty-region composition, cached Terminal, software depth renderer | Remeasure 0.3 first, then compare 0.4 under the same headless QEMU settings |

## Memory contract for 0.4

Rust owns bounded page eligibility/allocation bitmaps for physical addresses
below 4 GiB. C validates and imports the Multiboot2 map. Unavailable descriptors
win over overlapping usable descriptors. Usable ranges align inward; reservations
align outward. Reservations include low firmware memory, the entire kernel/BSS
(and therefore page tables, stack, buffers and Rust bitmaps), Multiboot information,
boot modules and the framebuffer's cache-attribute huge-page span. Unretained GRUB
scratch is no longer live after handoff; no unsupported UEFI reclaim is attempted.
Memory above the identity-map ceiling remains unavailable to this allocator.

No general heap, new scheduler, filesystem or process isolation is introduced.
Rust bookkeeping does not validate arbitrary C pointers or make C rendering safe
by itself. The Rust/C ABI never passes Rust references, slices or allocator-owned
pointers. Page operations are boot/main-loop-only; IRQs never call them.

## Remaining limits

No SMP, DMA ownership model, page-level permission split, stack guard, IST rescue
stack or recovery from a kernel CPU exception. The PIT fallback can lose elapsed ticks
if interrupts are masked long enough for PIC events to coalesce; normal renderer
and app work leave interrupts enabled and default HPET timing is cross-checked against host wall time. HPET uses the
known QEMU PC address with capability validation, not general ACPI discovery. The fixed static renderer buffers continue to reserve about 26 MiB.
