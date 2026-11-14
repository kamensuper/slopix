# CP06 verification report

## Verified here (host / source, not live guest)

- `make build/desktop.o build/input.o build/net_stack.o build/net_http.o` compiled
  with `-Werror`.
- `make -C sdk BROWSE.ELF DOOM.ELF` compiled/linked freestanding user ELFs.
- `make genesis-cp06-host-test`: HTTP parser and chunked decoder, DOM/browser
  mouse/keyboard/history and relative HTTP link behavior, mock RTL8139 ARP,
  IPv4, DNS, TCP, HTTP GET, redirect, chunked HTTP, keep-alive framing, eight
  independent ELF load/reclaim cycles, GUI ownership and syscall ABI checks.
- `make genesis-cp06-disk-test`: byte-exact SHA-256 comparison for all files
  stored in the fresh CP06 ready and package-first FAT32 images, plus FAT mirror
  agreement.
- `build/genesis-package-fat-test storage/genesis-cp06-ring3-bundles.img`:
  package verify/info/install/list/reinstall-refusal/remove and cold mount.
- Relocatable partial link of all 40 non-Rust kernel object files passes:
  no undefined DOOM symbols; only the normal Rust allocator interface and
  linker-defined `kernel_end` remain unresolved before full link.
- `make -k -j8 build/kernel.elf` compiles all required C source but stops at
  missing `rustc`, not at a C compiler error.

## NOT VERIFIED / NOT IMPLEMENTED

- Bootable ISO was **not** generated here (requires external Rust/GRUB tools).
- `make genesis-cp06-guest-test` was **not run** (QEMU unavailable here).
- No claim that DOOM renders, accepts input, or plays audio inside real QEMU.
- No claim of actual successful guest HTTP page retrieval or browsing.
- HTTPS/TLS/certificate validation is not implemented.
- DHCP, production TCP semantics, general CSS/JS and all legacy app feature
  parity are not implemented.

**Status: CP06 is a source-level Ring-3-only desktop + experimental HTTP
improvement; NOT a finished or QEMU-verified Genesis release.**
