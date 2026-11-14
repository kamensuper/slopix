# Let There Be Light additions

Streaming FAT32 ranges and nested8.3 folders; strict dot-record validation;
copy/rename and FileSlop folder actions; PMM-backed kernel heap and dynamic
clipboard; DOOM fresh-session close/reopen; streamed Ring-3 file handles with
seek/spawn, exec arguments and READ.ELF; Aero/Haiku chrome, Azure tide wallpaper,
original66-raster icon pipeline and five appearance choices.

See RELEASE-LIGHT.md for implementation boundaries and final evidence.

## Preserved Pre-Genesis changes

# Slopix 0.9 — Pre-Genesis changes

- Preserve the 0.85 kernel lineage, application commands and FAT32 backend.
- Diagnose graphical-QEMU DMA underruns; add bounded refill capacity and safe
  audio checkpoints during engine loading and memory self-tests.
- Add protected ELF64 userspace with private page tables, TSS entry stacks,
  int80, timer slices, NX/W^X, fault isolation and deterministic cleanup.
- Add standalone SDK/example, process/file syscalls and real scheduler reports.
- Introduce SlopDE 2 tab chrome, vector icons, panel, pinboard, context menu,
  keyboard navigation, tiling and independent persistent desktop preferences.
- Add FileSlop root file operations, confirmed removal and internal clipboard.
- Introduce typed desktop/VFS boundaries and central application metadata.
- Improve light Terminal contrast, user-output identification and page-fault data.
- Build ISOs from fresh staging, track header dependencies, and support clean
  builds without inherited objects. Earlier release directories remain intact.

Limits are explicit in README.md; Ring-0 applications are not isolated, directory
operations remain unsupported and physical audio/hardware are not validated.

Additional design-guidance polish: persisted Classic/Dock/Minimal panel geometry,
dark-aware panels, RTC clock and mute access, file/program glyphs, FileSlop list
and icon views, file context actions, appearance starting presets and a blue
window focus edge. Older desktop records migrate with checksum validation.
SDL replaces implicit frontend selection in the launcher after a live refresh
probe distinguished working SDL presentation from stale GTK under virtual X.
