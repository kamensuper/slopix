# Slopix Genesis checkpoint 03 — Ring-3 GUI ownership + browser interaction

Development source checkpoint, **not Slopix 1.0 final**. The original 0.9
release and original persistent disk image are unchanged.

## Implemented in this source

- Multi-process Ring-3 GUI surfaces and per-PID keyboard/mouse event queues.
- Mouse click forwarding from SlopDE's client-area coordinates to its Ring-3
  browser and other graphical applications. The user can click the address bar,
  enter a **local FAT32 .HTM filename**, use Back/Forward, and click hyperlinks.
- SlopDE authorizes GUI surface creation for **desktop-owned** PIDs. A stray
  `run DEMO.ELF` cannot open a framebuffer and render headlessly.
- Closing a window explicitly kills its Ring-3 process. Minimizing suspends
  the process; restoring resumes it. Process termination releases GUI pixels,
  events and VM mappings. The new demo responds to visibility events too.
- `.slop` v2 bundle install, verify, list, launch, remove (from checkpoint 02),
  with FAT32 transaction staging and integrity checks.
- `slop install BROWSE.slop` is accepted as an alias for the on-disk
  `BROWSE.SLP` name. The underlying FAT32 driver **still uses 8.3 filenames**;
  true `.slop` names and VFAT long filenames are not supported yet.
- All prior experimental FAT32 streaming and 4 GiB−1 byte boundary work.

## Test results (host-side, this checkpoint)

- `make genesis-host-test` — pass
- `make genesis-browser-test` — pass
- `make genesis-browser-interaction-test` — pass (uses the actual Ring-3
  browser input handlers and fixture HTML pages, not a reimplementation)
- `make genesis-apps-elf-test` — pass
- `make genesis-fat-stream-test` — pass (including 4,294,967,295 bytes)
- `make build/desktop.o build/user_gui.o build/process.o build/slop_package.o`
  — compile with `-Wall -Wextra -Werror`.
- `make -j4` — **blocked at `rustc` not installed** in this build environment.
  Therefore **no complete ISO or QEMU guest boot was verified here**.

## How to test on Fedora

Extract the archive into a path with no parentheses, e.g. `~/Downloads/slopix-genesis-cp03`.

```sh
sudo dnf install gcc binutils make rust cargo grub2-tools-extra xorriso mtools qemu-system-x86 python3
rustup target add x86_64-unknown-none  # if using rustup-managed Rust
make -j4
SLOPIX_DISK=storage/genesis-final-browser.img make run
```

If `make` cannot locate the Rust target, use a nightly/installed toolchain
containing `x86_64-unknown-none`. Different Fedora releases can name toolchain
packages differently. Do not overwrite the old `slopix-data.img` disk.

The browser disk already contains `DEMO.ELF`, `BROWSE.ELF`, `START.HTM`, and
`ABOUT.HTM`. The other disk is for testing the package installer:

```sh
SLOPIX_DISK=storage/genesis-final-packages.img make run
```

Then use Slopix Terminal:

```text
slop verify BROWSE.SLP
slop install BROWSE.slop
slop launch BROWSE
slop install HELLOGUI.SLP
slop launch HELLOGUI
slop list
ps
```

Note: generic installed-app slot currently allows one app window at a time;
close it before launching the next one.

### Manual QEMU acceptance checklist

1. Open SlopBrowse; click the address field; type `ABOUT.HTM` and press Enter.
2. Click Back, Forward, and the on-page hyperlinks.
3. Open 3D Demo, then run `ps`; note the Demo PID and `slices=` counter.
4. **Click the X**, not minimize. Run `ps` again and confirm PID is `exited`.
5. Wait several seconds. The dead PID's `slices=` must remain unchanged and
   there must be no fresh `CUBE_STATS` from the dead process.
6. Open the Demo again. Verify a **new PID**, fresh stats and live rendering.
7. Minimize it. Confirm its `paused=1` and constant `slices=`; restore and
   confirm `paused=0` and rendering resumes.
8. Close BROWSE or HELLOGUI, then relaunch to verify fresh PID and GUI state.
9. DOOM currently uses the legacy kernel-integrated path. **This checkpoint
   does not implement a genuine Ring-3 DOOM restart.** Do not mistake its
   existing new-game logic for process reload.

### Open Genesis release blockers

- Actual guest QEMU verification and GUI visual acceptance remain pending.
- DOOM and legacy Terminal/FileSlop/SlopFind/Slopettings still need real
  Ring-3 migrations.
- SlopBrowse supports **local HTML only**, not live internet navigation;
  native NIC/TCP/HTTP, HTTPS/TLS, CSS and JavaScript are not implemented.
- VFAT long filenames, richer package dependencies, remote repositories,
  full multi-window generic launcher and broader hardening remain pending.
- Host FAT32 boundary test is **not** a full 4 GiB GUI copy test in QEMU.

Never advertise this checkpoint as a verified 1.0 release.
