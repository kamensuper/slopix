# Rust and memory in Slopix 0.5

The existing freestanding Rust page allocator and C ABI are unchanged.
See `docs/history/moonrise-0.4-RUST-AND-MEMORY.md` for its invariants and
`DOOM-PORT.md` for the separate game arena. All new static buffers/data are
reserved through the retained kernel span before physical allocation begins.
