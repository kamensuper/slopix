# Slopix 0.9 — Let There Be Light

This is an incremental build in `slopix-0.9-light`. The released Pre-Genesis
archive, its source/ISO/data disk, and the Ring-3 checkpoint are preserved.
The previous limitations were checked against current source before changes.

## Implemented changes

- Original Azure tide blue/teal wallpaper; opaque glass-like gradients, subtle
  shadows and readable tab controls. Existing window geometry/hitboxes remain.
- Classic/Aero/Dark/Custom appearance presets plus a reduced-effects Minimal
  choice. Preferences retain the existing compatible dual-record format.
- Original PNG masters and a build-time premultiplied-filtering pipeline generate
  11 icons at 16/24/32/48/64/96 pixels. Embedded data uses straight RGBA at runtime.
  No HVIF assets, native HVIF renderer or proprietary icons are included.
- Streaming FAT32 reads and copy-on-write range writes replace the filesystem's
  64 KiB file-size ceiling. Multi-megabyte files need only sector-sized temporary
  buffers. Partial writes preserve other bytes and zero-fill extension gaps.
- Strict padded dot/dotdot records, link/attribute/size/duplicate validation and
  malformed-entry rejection before directory removal.
- Nested 8.3 paths, directory creation/removal, same-directory rename, file copy,
  and chunked append; mount validation recursively checks ownership and dot links.
  Existing read-only/dirty-volume/failed-I/O safeguards remain.
- FileSlop folder navigation, new folders, copy/rename dialogs, directory deletion
  confirmation and an unsaved-dialog close guard. Large files receive an explicit
  bounded preview; this is not an unlimited document editor.
- PMM-backed 16-byte-aligned kernel heap: allocate/free/calloc/realloc, coalescing,
  bounds/overflow checks, invalid-free detection, statistics and safe exhaustion.
  Completely free spans return their pages to the existing Rust allocator.
- Dynamic internal clipboard preserves its previous content on allocation failure.
- DOOM close stops simulation, clears input/SFX and ends the session. Reopen
  invokes the engine's normal fresh-game path; minimize retains pause/resume.
  The engine arena remains allocated to avoid dangling global engine pointers.
- Ring-3 file handles now stream reads from nested paths; seek and spawn syscalls
  are additive. `exec READ.ELF /PATH/FILE` passes a copied stack-owned argument to
  a real CPL3 utility which streams and fingerprints the file with 4 KiB memory.
  Process exit explicitly clears handles. Existing isolation and limits remain.

## Audit and remaining Genesis work

| Earlier limitation | Status in this build |
|---|---|
| No general kernel heap | Implemented; main-thread-only, contiguous spans can fail under fragmentation |
| Root-only FAT32 | Nested paths implemented; bounded depth and directory capacity remain |
| 64 KiB filesystem file limit | Removed from streaming storage APIs; UI/ELF preview limits remain |
| Long filenames | Unresolved; volumes containing LFN entries retain read-only safety policy |
| DOOM close resumes old game | Fixed through safe new-game reset; engine is not unloaded |
| Static 1023-byte clipboard | Replaced with dynamic owned storage, bounded by heap availability |
| Legacy Ring-0 apps | Still Ring 0; GUI/audio userspace APIs and migration remain Genesis work |
| Eight process slots / 96 pages | Preserved intentionally; no blind capacity increase |
| Small text editor | Partially improved lifecycle; 1023-byte new-file editor remains |
| All file-manager operations | Partial; same-folder rename/copy, nested navigation, limited text preview |
| Native UI scaling | Deferred; 100% native-pixel geometry retained, no framebuffer stretching |
| Safe ACPI shutdown | Deferred; existing reboot preserved and tested |
| Networking | Deferred; no network device/protocol is claimed implemented |
| Accented S popup | Guest has no such UI; repeated PS/2 S input is regression-tested; host cause unverified |
| Silent physical audio | Guest/DMA/backend monitor tested; physical playback needs the local check below |
| GTK refresh discrepancy | Still reproduced on old baseline; SDL remains tested default |
| Mode-change spikes | Still synchronous; actual frame distributions are retained |
| Historical ATA offline failure | Not claimed fixed; cooperative service added, protections retained |

## Local input and audio checks

The guest receives PS/2 make/break codes and implements ASCII typing, not an
accent-selection popup. If a popup appears over the host window, compare SDL and
GTK, keyboard capture and host input-method/accessibility/extension settings.
The automated repeat test does not establish which host component caused it.

On a graphical Linux host run `sh run.sh`, then in Slopix run `audio volume 80`
and `audio test`. On the host inspect `wpctl status`, `pactl list short sinks`
and `pactl list short sink-inputs`; check QEMU's volume and output device in the
host sound controls. `SLOPIX_AUDIO_BACKEND=none` is intentionally silent. A null
sink monitor can establish nonzero PCM routing, not physical audibility.

## Evidence

Final regression and performance records name the exact tested ISO hash in
`TEST-RESULTS-0.9.md`, `PERFORMANCE-0.9.md` and `build/release09-results.json`.
Host sanitizers, real QEMU guest tests and virtual-display/monitor tests are
separate evidence classes. See `KNOWN-LIMITATIONS-0.9.md` for practical bounds.

### Test adjustments

The new held-S test initially sent30 simultaneous QMP make events; both the
preserved release and this ISO received16. The saved baseline comparison is
`build/light-s-burst-baseline.log`. The repeat test now sends all30 makes at
35ms intervals and still asserts exact output; existing rapid-typing tests stay.
Window pixel assertions use the new intentional frame color, retaining drag,
background restoration, maximize, close and reopen checks. Original failed
attempt logs are retained rather than described as passes.

The additional CPL3 boundary test found a seek-past-EOF read mismatch before
packaging. SX_READ now returns zero at/beyond EOF while retaining the seek
offset, without relaxing the FAT range API. The failing log is retained as
build/light-eof-boundary-failure.log; the unchanged test is part of the final gate.
