# Slopix 0.6 — FAT32 persistent storage

- Preserves Slopix 0.5 in a separate directory/archive.
- Adds a modular legacy ATA PIO block device and bounded original C FAT32 driver.
- Adds diskinfo, ls, cat, write, append, rm and sync to the existing Terminal.
- Supplies a 64 MiB FAT32 image and a host formatter that refuses overwrites.
- Data survives ISO changes and cold VM restarts when the same image is retained.
- Validates geometry and supported root-file ownership; unsupported trees mount
  read-only, malformed media is never formatted automatically.
- Orders replacement writes and flushes; all successful mutations are synced.
- Adds sanitizer boundary, exhaustion/corruption and transaction-failure tests,
  independent dosfstools/mtools interoperability, and real QEMU cold-boot tests.
- Keeps Terminal, all 3D models, Dock and Freedoom behavior. DOOM save/load remains
  disconnected and its message now states that limitation accurately.
- Corrects project-level distribution documentation to GPL-3.0-or-later while
  retaining old MIT grants and all third-party notices/licenses.

Limitations: root 8.3 files only; 64 KiB file operations; bounded fixed root
capacity; no journal, no userspace isolation, no persistent game saves or desktop
state. See STORAGE.md for exact limits and failure behavior.
