# Preference format and recovery

`struct preferences` in `src/preferences.h` is a fixed 68-byte x86 little-endian
version-1 record. Twelve uint32 values contain magic 0x504f4c53, version, bytes,
generation, wallpaper, placement, RGB accent, light flag, volume, Dock magnify,
and display width/height. A 16-byte NUL-terminated root filename follows, then
an FNV-1a uint32 checksum of every prior byte. No raw pointers are serialized.
All enumerations, dimensions, path termination, record size and checksum are
validated before applying a record. Known bounds are 800..1920 width (multiple
of eight), 600..1080 height, volume0..100 and documented enum ranges.

A successful save writes generation+1 to its parity slot using fat_write,
reads it back and verifies it. The old slot is retained. At UINT32_MAX, saving
fails with an explicit generation exhaustion error rather than wrapping.
Malformed/missing slots do not prevent boot. If a saved image cannot be read or
decoded, the original background is selected. Every image byte stays in static
bounded storage. There is no dynamic allocation for configuration or images.

The FAT COW implementation can preserve the original file on allocation
exhaustion. It orders writes and flushes; a directory-sector publication is
not a transaction. Two application records help recover damaged settings but
cannot repair FAT metadata or promise power-loss atomicity. No filesystem
internals were modified for 0.85.

A save is debounced and postponed while any audio playback is active, avoiding
synchronous ATA work on the real-time DMA refill path. No file is written each
frame or slider change. Failure clears the pending write; another explicit
save/change retries. The UI reports session-only or the concrete storage error.
