# Let There Be Light — remaining limits

- This release is a tested incremental foundation, not completion of every item
  in the large modernization brief. See RELEASE-LIGHT.md for exact classification.
- Legacy GUI apps and DOOM remain privileged kernel code; only loaded ELF64
  programs have private protected address spaces. No userspace GUI/audio API,
  IPC service, normal shell, SMP, AVX state, dynamic linker or POSIX environment.
- Eight processes, 96 private pages per process, static ELF images <=64 KiB,
  four file handles per process, 4096 bytes per read, 127-byte syscall paths.
- Heap main-thread use only, 16-byte alignment, up to2048 spans, max16MiB per
  allocation. Large spans require contiguous physical pages and can fail under
  fragmentation. A stale pointer reused after a new allocation is an ownership
  violation that no raw-pointer allocator can reliably distinguish.
- FAT32 supports512-byte sectors, bounded volume geometry, 8.3 path components,
  depth16 and paths<=255 bytes. LFN-containing volumes are read-only. Existing
  directory chains do not grow; new folders have one cluster of entry slots.
  Rename/move is same-directory; copy is files only and refuses overwrite.
- Range writes copy the whole resulting file to a private chain and require
  enough free space for it. They are bounded-memory, not fast in-place writes.
  No journal, crash-atomic write guarantee or power-failure recovery is claimed.
  Historical intermittent ATA-offline failures remain unresolved.
- FileSlop lists128 entries, previews64KiB/4096 lines, and new-file editing is
  1023 bytes with append/backspace. No full existing-file editor. Closing an
  unsaved dialog is blocked; explicit Esc discards it. Terminal cat preview is
  bounded; the streaming API and READ.ELF can read the entire large file.
- Clipboard is dynamic, filtered ASCII text; no host bridge or Unicode shaping.
- UI remains100% native pixels. No configurable DPI scaling, movable title tabs,
  arbitrary widgets, native HVIF rendering or imported Haiku artwork.
- DOOM uses a retained bounded engine arena and the normal new-game reset path;
  close ends simulation/SFX, not engine-code unloading. No music, persistence
  for saves or multiplayer. Four DMA blocks trade latency for deadline margin.
- Whole-file copy/range replacement is synchronous. Audio safe points continue,
  but desktop input/presentation can wait for the operation to finish. The new
  READ.ELF streaming path yields between chunks.
- Cooperative Ring-0 drivers can still delay input/presentation; display-mode
  regeneration is synchronous. Good mean FPS is not a no-stutter guarantee.
- SDL is the tested frontend. GTK's stale-refresh discrepancy also reproduces
  on unchanged0.85 and is not attributed to this build without evidence.
- No networking, browser, installer or general hardware support. QEMU TCG/BIOS/
  PS2/stdVGA/SB16 is the tested platform. Physical display latency, speaker
  quality and the user's host accent-popup cause remain unverified.
