# 0.85 safety audit

The 0.8 architecture was inspected before implementation. Static bounded
surfaces and the Rust physical-page allocator remain. No new kernel heap,
process scheduler, userspace or filesystem architecture is introduced.

New preferences: 68-byte validated records, bounded root filenames and checksums,
two recovery slots with verified readback. Recovery is application-level, not
atomic FAT publication. Full/read-only/missing/device-failed storage is surfaced.
Custom PPM input/pixel buffers are each 64 KiB, dimensions and exact byte count
are validated with 64-bit products, and all four background placement modes are
clipped. No runtime PNG decoder or untrusted format string is used.

The app and command search registry is static; query64/path13 buffers reserve
terminators. Search is bounded by the registry size. Applications still share
Ring 0; failure recovery is not security or memory isolation.

Compositor recursion is bounded by five layers. Opaque interiors exclude only
lower layers; corners/shadows still draw. Dirty rectangles and fixed MAX_W/H
buffers remain. Frame timing rings contain 256 intervals each and retain long
active stalls; hiding resets the interval epoch rather than discarding outliers.
Input capture timestamps are stored before publishing each volatile ring entry.
Interrupts only capture/count; application callbacks run on the foreground loop.

No ATA/FAT32 source changes were made. The historical intermittent ATA offline
failure remains a known limitation. Passing regression runs do not establish a
repair for it. Existing licenses, engine patches and bootloader source remain.
