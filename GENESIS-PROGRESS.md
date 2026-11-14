# Slopix 1.0 Genesis — source checkpoint 01 (development, NOT release)

This is source code for an unfinished experimental 1.0 build. **There is no
verified bootable Genesis ISO in this archive.** Tests below ran on the host,
not inside a real QEMU guest. Keep Slopix 0.9 Light untouched as the stable build.

## Actual changes in this development checkpoint

- Ring-3 user VM grew from 2 MiB to 8 MiB virtual address window. ELF file
  loader size grew from 64 KiB to 1 MiB and user page budget to 1400 pages.
  Host VM tests confirm the actual 129 KiB 3D renderer ELF maps successfully
  and its pages are fully reclaimed on repeated destruction.
- Experimental Ring-3 GUI syscalls `GUI_OPEN`, `GUI_PRESENT`, `GUI_POLL`.
  The original 3D renderer is compiled into `DEMO.ELF` with the real meshes,
  and SlopDE launches this independent executable from the FAT32 disk.
  The demo close action kills the owning process and reclaims its VM/surface.
  This architecture passed host ownership tests but is not guest-verified.
- The **legacy Ring-0 Cube fallback is disabled in this Genesis desktop**.
  Without `DEMO.ELF` on disk, the window displays an installation notice;
  it no longer silently runs the old renderer.
- Flat `.slop` v1 package format, `slop install/verify/info/list/remove`,
  CRC32 and ELF validation, safe bounded names, 8.3 FAT filenames `.SLP`.
  Packages contain **one ELF only**, no signatures, dependencies, icons,
  remote repository, or installer GUI. The package install/remove test mounts
  and edits an in-memory copy of a genuine Slopix FAT32 volume.
- FAT32 streaming appends **no longer recopy the entire prior file** per
  chunk. O(1) cached free space, rotating cluster allocation and hot per-file
  chain tail eliminate three quadratic bottlenecks on long streams.
  Non-EOF edits retain the existing copy-on-write replacement method.
- A real FAT32 driver test with a sparse 5 GiB host disk extends an existing
  near-4 GiB file to the exact maximum size of 4,294,967,295 bytes, checks
  the ending data, refuses overflow and remounts without losing the result.
  A second test writes 1600 variable-sized chunks and checks every byte.
  **No whole-file 4 GiB copy or guest integration has been verified.**
- Ring-3 ABI now has `CREATE` (16) and `FWRITE` (17) with validated pointers,
  bounded 4096-byte writes and per-process file handles. `STORE.ELF`, a real
  freestanding userspace writer, creates and reads back a 320 KiB file.
  It builds, but has not been run in QEMU in this environment.
- Two distinct Genesis FAT32 disks may be generated: one with DEMO.ELF
  installed; one with only installable packages. They are new files and
  **never replace** `storage/slopix-data.img`.

## Host verification performed

```
make -C sdk
make genesis-host-test
make genesis-fat-stream-test
make genesis-disk-test
python3 tests/storage_host_test.py
make build/desktop.o build/process.o build/fat32.o
```

All commands above passed in the developer's environment. Source files are
compiled with GCC `-Werror`; several tests additionally use ASan/UBSan.
`make` for the full kernel/ISO **did not finish** because this environment
has no `rustc`, GRUB ISO creation tools or QEMU runtime. Neither the graphical
Ring-3 flow nor persistent userspace writes have been guest-proven yet.

## Build the OS on Fedora

Install GCC, make, binutils, Python 3, Rust with `x86_64-unknown-none` target,
GRUB BIOS tools, xorriso, mtools and QEMU. In the unpacked project directory:

```
make -j4
```

This Makefile's default target produces `build/slopix.iso` and the SDK.
Do **not** run `make iso`; that target does not exist.

This checkpoint archive already includes a dedicated `genesis-test.img` FAT32
disk; if present, skip `make genesis-disk`. To generate a new one after moving
or deleting the disposable test disk (never the original data disk), run:

```
make genesis-disk
SLOPIX_DISK=storage/genesis-test.img make run
```

The launcher passes that disk to QEMU. The normal `make run` without
SLOPIX_DISK instead uses the original Slopix data image — do not use that
for Genesis testing.

Test Ring-3 3D Demo: click its SlopDE icon, change models with 1..4,
close it and inspect `ps` and serial `PROCESS_EXIT`. Reopen it for a fresh
session. Without DEMO.ELF, the desktop displays an installation notice.

Test packages and Ring-3 filesystem writes from Terminal:

```
slop verify STORE.SLP
slop install STORE.SLP
run STORE.ELF
ls
cat GENESIS.TXT
slop remove STORE
```

`STORE.ELF` writes a binary-ish repeating text payload of 327,680 bytes;
legacy `cat` may display only a limited prefix. Do not treat host tests as
proof of this guest workflow until it has actually run inside QEMU.

To exercise package-first installation, use the bundled `genesis-packages.img`
or run `make genesis-packages-disk` after moving that disposable image. Boot
with `SLOPIX_DISK=storage/genesis-packages.img`.
From Terminal use `slop install DEMO.SLP` and then click the 3D Demo icon.

## Important limitations and remaining release blockers

- DOOM, Terminal, FileSlop, Slopettings and SlopFind still run in Ring 0.
  This checkpoint is **not** full Ring-3 migration.
- The Ring-3 compositor can present only **one** user surface at a time;
  its only SlopDE binding currently is the dedicated 3D Demo window.
- No networking, TCP, HTTP, TLS, SlopBrowse web loading or IRC was added.
- FAT32 is still 8.3-only and non-journaled. The streaming append path may
  leave a dirty volume after sudden interruption or failed disk writes;
  repair using host fsck before proceeding. Do not use irreplaceable data.
- The exact 4 GiB-1 file-size bound has been tested on a sparse HOST block
  device; end-to-end guest copying/downloads of such files remain untested.
- The installer is a prototype and CRC32 is **not** a signature. Only install
  packages from sources you trust.
- First-boot setup/login remains experimental. Password authentication is not
  full-disk encryption or hardened security.
- No QEMU boot, app screenshots or ISO validation are claimed for this checkpoint.

Progress should continue from the verified source, beginning with a real QEMU
boot, demo lifecycle tests and userspace write tests. Then migrate DOOM and
remaining GUI applications and expand the compositor, followed by networking.
