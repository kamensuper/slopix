# Slopix 0.85

- Measured simulation, rendering, composition, upload, audio, main-loop work,
  HLT elapsed and input queue delay. Added bounded submitted-frame percentiles.
- Reduced redundant background/lower-window composition and DOOM client damage;
  retained the 35 Hz deadline phase under ordinary lateness.
- Added explicit 800x600, consistent work-area bounds, Dock-accessible maximize,
  corner resizing and modifier-safe Alt+Tab / Alt+F4 / Super shortcuts.
- Added SlopFind and Slopettings, original PNG icons, appearance/display/audio
  controls, bounded P6 wallpapers and validated/debounced FAT preferences.
- Added SlopFetch, SlopMon, history, RTC date, about and audioinfo; retained all
  existing commands and added colored prompts/errors.
- Existing filesystem/ATA and physical allocator internals were preserved.

See ROOT-CAUSE-0.85.md, PERFORMANCE-0.85.md and TEST-RESULTS-0.85.md for measured
results and limits. Graphical host presentation and speaker playback remain
unverified in this environment. Older entries below are historical.

---

# Slopix 0.8 — display resizing QoL

- Modular QEMU PCI standard-VGA runtime display backend and full VRAM reservation.
- Native guest modes through F12, menu-bar resolution label and `display` command.
- Re-layout Dock/menu/window anchors without globally scaling UI pixels.
- Preferred normal geometry survives shrink/expand; maximized windows track display.
- Reinitialize stride, dirty regions, cursor and caches; keep app/session state.
- Service audio during wallpaper rebuild; preserve 0.75 sound sample leases.
- Add real scanout/pixel/layout/audio guest tests and host stride/guard tests.
- No host-window automatic resize protocol, new Settings/FileSlop app, FAT32
  changes, Go runtime, or UI theme overhaul is included.

# Slopix 0.75 — DOOM sound hitch reduction

- DOOM SFX now borrow their immutable cached WAD sample until playback ends,
  avoiding a synchronous per-effect copy into a second 128 KiB voice buffer.
- SB16 DMA mixer slices reduced from 2048 to 512 samples (about 23 ms per half
  at 22.05 kHz), shortening the longest foreground refill operation and queued
  audio horizon.
- Borrowed-sample release is deferred to the main thread and covered for natural
  completion and explicit stop; ordinary WAV/tone APIs retain safe copy semantics.
- Added a shared-lump lease regression: overlapping effects cannot unpin a
  cached WAD sound while another channel is still reading it.
- Host audio, DOOM compatibility, Rust memory, renderer, framebuffer and runtime
  tests pass. Built the ISO and exercised actual QEMU audio/gameplay; see
  `TEST-RESULTS-0.75.txt` for validation and remaining limits.

# Slopix 0.7 — first sound

- Modular SlopAudio PCM API and SB16 auto-init DMA/IRQ5 backend.
- Bounded RIFF parser, PCM format conversion/resampling, volume, test tone,
  original embedded WAV chime, stop/restart and actual fault counters.
- Eight copied digital-effect voices with saturated mixing; Freedoom SFX
  module. Music synthesis remains absent.
- Terminal audio commands and QEMU audio launcher; no sound card still boots.
- Host sanitizer tests, actual WAV captures, gameplay sound tests, and retained
  existing desktop/application regression tests.
- Source/ISO version 0.7.0; prior 0.6 release preserved separately.
- FAT32 investigation deferred to 1.0 Genesis. Storage source/image preserved,
  experimental disk detached by default; no ATA repair claimed.
- Genesis direction: full Haiku-inspired UI overhaul with HVIF icons mainly.

No new filesystem, native sound-card coverage, ring 3, process isolation,
music synthesis or general heap is introduced.
