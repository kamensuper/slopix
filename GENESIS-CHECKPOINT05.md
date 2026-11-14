# Slopix 1.0 Genesis — Checkpoint 05: Ring-3 desktop migration

**DEVELOPMENT SOURCE CHECKPOINT, not a boot-verified release.**

Checkpoint 05 is based on Genesis CP04. It preserves CP04's experimental RTL8139/TCP/HTTP stack, CP03 Ring-3 browser/cube process lifecycle, CP02 packages, persistent FAT32, and the prior kernel audio backend. The older CP04 and 0.9 release archives are unaffected.

## Actual source changes

All eight SlopDE application slots now have Ring-3 ELF routes when booted from `genesis-cp05-ring3-ready.img`:

| Window | Ring-3 ELF | What moved / remaining functional caveats |
|---|---|---|
| Terminal | `TERM.ELF` | Owns its UI, command state and keyboard input. Supports core file, process, package, and application commands. Older Ring-0 debug shell commands are not all ported. |
| 3D Demo | `DEMO.ELF` | CP03 process-owned software renderer retained. |
| DOOM | `DOOM.ELF` | Complete DoomGeneric engine linked into separate ET_EXEC ELF. Its WAD is read from real FAT32 `FREEDOM.WAD`. New user-owned window pixels, raw scancodes and SFX/PCM syscalls. Its guest gameplay is **NOT yet verified**. The old Ring-0 engine is still compiled **only as a compatibility fallback if the required user files cannot be launched**. |
| SlopFind | `FIND.ELF` | Independent search/launcher with mouse+keyboard. Not feature-identical to legacy finder. |
| Slopettings | `SET.ELF` | Independent preferences UI with supported get/set/save syscalls. Some legacy controls remain unported. |
| FileSlop | `FILES.ELF` | Independent FAT32 browsing, create/remove/mkdir and text preview using bounded VFS syscalls. Not feature-identical to all legacy file tools. |
| SlopBrowse | `BROWSE.ELF` | Existing Ring-3 HTML browser and experimental HTTP integration kept. |
| Installed GUI app | `HELLOGUI.ELF` etc. | CP02/03 SDK-owned GUI processes and `.slop` packages retained. |

This is not a plan or a screenshot. All listed ELF executables are in the archive, each has an `_start` entrypoint, and the host ELF loader maps/unmaps each as separate user pages.

### Kernel services (intentionally Ring 0)

The scheduler, page tables, hardware network/storage/audio drivers, compositor and permission/bounds-checking syscall implementations stay in the kernel. Ring-3 does **not** mean migrating the kernel or interrupt handlers into an untrusted process.

Added syscall services: `READDIR`, `REMOVE`, `MKDIR`, `DESKTOP_OPEN`, `PREF_GET/SET/SAVE`, `PACKAGE`, `PROCINFO`, `CONSOLE_POLL`, `STAT`, `PCM_START/STOP/VOLUME/PLAYING`. User buffers are copied through VM range validation; no raw device pointers or kernel memory mappings are exported. PCM voice ownership is tied to PID and cleaned on exit. Ring-3 Doom input uses process-owned GUI events. Max GUI surfaces: 8; process slots: 12. User address space now supports up to ~80 MiB virtual (Doom arena is 48 MiB); physical pages are reclaimed on process exit.

### Important distinction: compiled vs working

* Passed: DoomGeneric source and new utility apps compiled into freestanding Ring-3 ELFs, built with the linked C compiler toolchain. The linked Doom binary has only two static ELF load segments, contains **no embedded WAD**, and is well under the kernel's 1 MiB ELF-loader cap.
* Passed: host ELF load/reclaim three times for all eight independent executables, including Doom; ownership and GUI lifecycle tests; host networking/browser/package regressions; FAT32 image WAD/DOOM checksum validation.
* Passed: kernel C sources touched by this checkpoint compile with `-Werror`; `make -k` reported no C build failures.
* Not tested: guest startup and Doom frame rate, audio, keyboard, exit/reopen and storage persistence on *real QEMU*. Host memory mapping tests do **not** execute Doom under a CPU privilege boundary.
* Not implemented: HTTPS/TLS, DHCP; CP04 HTTP network still lacks live guest verification. Existing Ring-0 legacy DOOM fallback remains part of the kernel until the new one is guest-proven and can replace it fully. The legacy Terminal/Find/Settings/FileSlop helper code also remains in the kernel for compatibility, even though the new desktop windows use ELFs.
* Not a complete final 1.0 release. No ISO was generated in this development environment because `rustc`, GRUB and QEMU are unavailable.

## Fedora build / guest acceptance

Extract the complete archive to a short path without parentheses. Fedora host requires `gcc`, `binutils`, `make`, `python3`, Rust with `x86_64-unknown-none`, GRUB BIOS ISO tools, `xorriso`, `mtools`, and QEMU x86_64.

```sh
make -j4
SLOPIX_DISK=storage/genesis-cp05-ring3-ready.img make run
```

The supplied ready image contains `TERM.ELF`, `FIND.ELF`, `SET.ELF`, `FILES.ELF`, `DEMO.ELF`, `DOOM.ELF`, `BROWSE.ELF`, HTML pages, sample package, and `FREEDOM.WAD` (28,795,076 bytes).

In the guest:

1. Finish setup/login. Confirm the Terminal reports `TERM_RING3_LAUNCHED` in QEMU's serial output.
2. Open and close FileSlop, Find, Settings, Cube, Browser. Check for `PROCESS_EXIT pid=...` and `GENESIS_CLOSE` in the serial log.
3. Open DOOM. Check for `DOOM_RING3_LAUNCHED`, followed by `DOOM_RING3_BOOT` and `DOOM_RING3_READY`. Play with arrow keys, Ctrl, Space, Esc, then Alt+F4; reopen and verify a distinct PID and no continuation of the prior game's session.
4. If DOOM logs `DOOM_RING3_ERROR` or a process fault, **report that DOOM guest migration failed**. Do not treat the presence of a `.ELF` as proof of a running game. Capture the serial log and screenshot for repair.
5. Confirm audio output, process termination on close, pause on minimize, and no rendering after close. Verify FAT32 package install/remove and HTTP against CP04's network demo separately.

For an automated guest attempt, after creating `build/slopix.iso`:

```sh
make genesis-cp05-guest-test
```

QEMU test copies the ready image to a temporary path before boot. A failure provides serial output/screenshot. It has **not been run by the author**.

To test `.slop` bundles, boot instead with `SLOPIX_DISK=storage/genesis-cp05-ring3-bundles.img`. `BROWSE.SLP` and `HELLOGUI.SLP` are available there for installation, while DOOM and the system desktop ELFs remain preinstalled.

### Host tests

```sh
make genesis-cp05-host-test
make genesis-cp05-disk-test
make genesis-cp04-net-test
make genesis-browser-interaction-test
```

`make genesis-cp05-disks` is **create-only** and refuses to overwrite any image already present. The full source ZIP includes the two new 64 MiB test images (highly compressible); do not use or overwrite `storage/slopix-data.img` or older release disks.

## Limitations and safety

- FAT32 is 8.3; `FREEDOM.WAD` is the real Freedoom IWAD under a DOS-compatible filename. Avoid editing or deleting it.
- Kernel Ring-0 fallback Doom remains as a conservative recovery route. As a result, **the shipped kernel binary is not yet pure Ring-3-app-only** even though the ready image is configured to start its Doom engine as a userspace ELF.
- New GUI programs intentionally implement the main workflows rather than cloning every legacy kernel debug/tool menu. State and feature parity require guest validation.
- The larger Doom userspace VM and 48 MiB bounded heap significantly increase RAM demand; QEMU in `run.sh` uses 256 MiB. CPU performance and memory pressure are unbenchmarked.
- This hobby OS is experimental and not a secure general-purpose OS: missing comprehensive syscall hardening, full POSIX semantics, HTTPS, journaled storage, etc.

**Checkpoint 05 is a genuine source-level attempt at moving the full SlopDE app roster to Ring 3, with a separately linked Doom engine, not an honestly verifiable claim that everything already works in QEMU.**
