# Rust and memory in Slopix 0.6

The existing freestanding Rust page allocator and C ABI are unchanged.
See `docs/history/moonrise-0.4-RUST-AND-MEMORY.md` for its invariants and
`DOOM-PORT.md` for the separate game arena. All new static buffers/data are
reserved through the retained kernel span before physical allocation begins.

The 0.6 FAT table cache (1 MiB), ownership bitmap, bounded root cache and file
buffer are static BSS and remain reserved as part of the kernel span. They do
not bypass the Rust physical page bookkeeping or introduce a general heap.
