# Slopix 1.0 Genesis — Checkpoint 08 (development source)

**Start here:** [GENESIS-CHECKPOINT08.md](GENESIS-CHECKPOINT08.md) covers this
checkpoint (SSE2 across the kernel and libc, a faster present path, and proof
that per-process SSE state survives preemption). Earlier work:
[GENESIS-CHECKPOINT07.md](GENESIS-CHECKPOINT07.md) (userspace libc + real
scheduler), [GENESIS-CHECKPOINT04.md](GENESIS-CHECKPOINT04.md) (networking
instructions, exact test disks, limitations and verification status).
This is not the completed Slopix 1.0 release. Below is the older Slopix 0.9
baseline documentation, retained to preserve historical build and design
context; its instructions may not refer to this Genesis checkpoint.

## Run this checkpoint

```sh
sh run.sh        # launch the existing build/slopix.iso
make run         # rebuild first, then launch
```

`run.sh` attaches the newest `storage/genesis-*ring3-ready.img` unless you name
one explicitly:

```sh
SLOPIX_DISK=storage/genesis-cp08-ring3-ready.img sh run.sh
sh run.sh --no-disk                 # no storage at all
SLOPIX_DISPLAY=gtk sh run.sh        # GTK instead of SDL
SLOPIX_AUDIO_BACKEND=none sh run.sh # silent
SLOPIX_NET=1 sh run.sh              # emulated RTL8139
```

If `make -j4` prints only `make -C sdk` / "Nothing to be done", the tree is
already built — that is success, not an error. `sh run.sh` needs
`build/slopix.iso`, which `make` produces.

First boot shows the account wizard. Press Enter to begin, type a user name,
Enter, type a password, Enter, type it again, Enter. After
`AUTH_ACCOUNT_SAVED`, log in by typing the password and pressing Enter. At the
`slopix>` prompt:

```
ls                  # files on the FAT32 disk
run BENCH.ELF       # CP08 SSE2 throughput + FPU/SSE context test
run LIBCDEMO.ELF    # CP07 libc/scheduler regression
```

---

# Slopix 0.9 — Let There Be Light

An original x86-64 hobby operating system in C, Assembly and freestanding Rust.
Slopix continues Moonrise; this release keeps the existing kernel and applications
while introducing protected userspace and SlopDE 2. It is a human-directed,
AI-built proof of concept, tested primarily in QEMU.

## Run

Extract the complete archive, enter `slopix-0.9-light`, and run:

```sh
sh run.sh
```

Requires `qemu-system-x86_64` with its SDL graphical frontend and PulseAudio support.
The launcher uses BIOS, standard VGA, PS/2 input, TCG, 256 MiB RAM and SB16.
The launcher defaults to SDL. `SLOPIX_DISPLAY=gtk sh run.sh` explicitly selects
GTK, whose refresh behavior under this test environment is documented in
`GTK-REFRESH-REPORT.md`.
It attaches `storage/slopix-data.img` for persistence when that file exists;
otherwise it falls back to the newest `storage/genesis-*ring3-ready.img`. It
never formats an image.
For silent emulation use `SLOPIX_AUDIO_BACKEND=none sh run.sh`; to boot without
storage use `sh run.sh --no-disk`. The ISO is `build/slopix.iso`.

Back up an existing data image while its VM is stopped before reusing it. Replace
the supplied image with your copy or adjust the launcher's `-drive` path. Never
attach the same writable image to two VMs or run host tools against a live image.
FAT32 supports nested 8.3 paths and streaming multi-megabyte files. No installer is provided.

See [RELEASE-LIGHT.md](RELEASE-LIGHT.md) for the new implementation, audit and
Genesis readiness status. This incremental build adds streamed FAT32 access and
folders, a PMM-backed kernel heap, dynamic clipboard, fresh DOOM sessions, an
original Aero + Haiku visual refresh and a multi-size RGBA icon pipeline.

## What changed

- SlopDE 2: compact window tabs, original scalable icons, a task panel, draggable
  desktop shortcuts, context menu, panel placement/auto-hide and window tiling. Classic/Dock/Minimal presets, clock and mute access are included.
- Real Ring-3 programs: disk-loaded static ELF64, separate address spaces,
  supervisor-only kernel memory, RX/RW-NX mappings, guarded stacks, timer slices,
  validated syscalls and resource reclamation after exit, faults or `kill`.
- FileSlop: folder navigation, text viewing, safe file creation, confirmed deletion,
  refresh, disk status, list/icon views, context actions, internal clipboard and explicit ELF launching.
- Audio deadline fixes: a bounded four-block DMA ring and main-thread safe points
  during expensive engine initialization and allocator diagnostics.
- Internal desktop and filesystem interfaces, application metadata registry,
  process diagnostics and a standalone application SDK.

Terminal, 3D Demo, DOOM/Freedoom, SlopFind, Slopettings, SlopFetch and SlopMon remain.
Legacy graphical applications still run in Ring 0. They have not become isolated
userspace processes. See [ARCHITECTURE-0.9.md](ARCHITECTURE-0.9.md).

## Controls

| Area | Controls |
|---|---|
| Windows | Drag the tab; bottom-right corner resizes; X closes, underline minimizes, square maximizes/restores |
| Shortcuts | Alt+Tab switches, Alt+F4 closes, F11 maximizes/restores, Alt+Left/Right tiles non-DOOM windows |
| Panel | Click to open/focus an app; Settings → Desktop configures placement and auto-hide |
| Pinboard | Drag shortcuts; double-click opens; arrows select and Enter opens; right-click background for menu |
| Display | `display WIDTH HEIGHT`, F12 cycles modes; sizes remain native pixels |
| Terminal | Arrows edit/history; Home/End, Delete/Backspace, PgUp/PgDn; Ctrl+L clears, Ctrl+U erases |
| Clipboard | Ctrl+C copies current Terminal input or FileSlop text; Ctrl+V pastes bounded text without executing it |
| 3D Demo | 1 cube, 2 teapot, 3 circle, 4 torus; footer also selects |
| DOOM | Esc menu, Enter select, WASD move/strafe, arrows turn, Ctrl fire, Space use, Shift run, Tab map |
| FileSlop | Arrows/Home/End select, Enter views, Delete requests confirmation, F5 refreshes, Esc returns/cancels |

Terminal commands include `help`, `clear`, `echo`, `uname`, `version`, `uptime`,
`meminfo`, `memtest`, `reboot`, `ls`, `cat`, `write`, `append`, `rm`, `sync`,
`diskinfo`, `audio`, `display`, `slopfetch`, `slopmon`, `date`, `history`, `about`,
`audioinfo`, `settings`, `slopfind`, `files`, `run`, `ps`, `kill` and `sysinfo`.

FileSlop: Enter opens folders, Backspace goes up, M creates a folder, N creates
a file, R renames, C copies. Terminal adds `pwd`, `cd`, `mkdir`, `rmdir`, `stat`,
`cp`, `mv`, `heapinfo`, `heaptest`. Use `exec READ.ELF /PATH/FILE` for a real
Ring-3 streaming byte-count/fingerprint utility.

## Build and develop

Ubuntu 24.04 x86-64 dependencies:

```sh
sudo apt-get update
sudo apt-get install -y build-essential grub-common grub-pc-bin xorriso \
  qemu-system-x86 qemu-system-gui python3 python3-pil python3-numpy \
  dosfstools mtools curl ca-certificates
curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o /tmp/slopix-rustup.sh
sh /tmp/slopix-rustup.sh -y --profile minimal --default-toolchain 1.85.1 \
  --target x86_64-unknown-none
. "$HOME/.cargo/env"
make -j2
```

The build embeds the supplied pinned DoomGeneric source and Freedoom data; it
does not download a game engine. Rust links freestanding `core`, never host `std`.
`make RUSTC=/absolute/path/to/rustc` supports an explicitly installed toolchain.
`Dockerfile` supplies the build dependencies. Fresh source builds are checked by
`python3 tools/clean_build_check.py`; candidate outputs go under
`build/clean-candidate`, leaving the current ISO untouched.

Build a standalone application with `make -C sdk`, then run `run HELLO.ELF` in the
guest. The supplied data image contains that example. `run HELLO.ELF 1` deliberately
faults; `ps` records its exit while the desktop continues. See
[sdk/README.md](sdk/README.md) for all test modes, ABI, limits and debugging.

## Run the regression suites

```sh
python3 tests/release_09.py
python3 tests/performance_09.py
python3 tests/stability_test.py --idle 15 --animation 60
```

Run one QEMU suite at a time. Tests use disposable disk images. The release gate
checks an unchanged existing ISO; build first when testing your modifications.
For automated graphical/audio testing also install `xvfb pulseaudio
pulseaudio-utils`, then run:

```sh
PROBE_LABEL=final09 PROBE_SECONDS=30 EXPECT_UNDERRUNS=0 sh tests/graphical_audio.sh
TEST_DISPLAY=sdl GRAPHICAL_TEST=tests/gtk_refresh_test.py sh tests/graphical_audio.sh
```

This starts SDL on a virtual X server and captures a PulseAudio null-sink monitor;
it does not perform a physical speaker or human latency test.

## Validation and boundaries

See `TEST-RESULTS-0.9.md`, `PERFORMANCE-0.9.md`, `M0-AUDIO-REPORT.md` and the
included `build/release09-results.json` for the final build's measured evidence.
Earlier release reports are historical and identify their own builds.

No networking, general POSIX environment, USB support, host clipboard, userspace
GUI/audio API, SMP, AVX process state or dynamic linking.
DOOM has digital effects, not music or multiplayer. FileSlop supports nested folders and same-folder rename/copy; long filenames
remain unsupported. Clipboard storage is dynamic; the FileSlop editor is 1023 bytes. Text view is bounded to
64 KiB and 4096 lines; truncation is visible and never modifies the file.

Kernel code remains cooperative. Mode changes and some diagnostics can visibly
pause animation; user slices cannot make Ring-0 drivers preemptible. Real hardware,
physical speaker output and physical display latency are unverified. FAT32 retains
its existing safety policy and known intermittent ATA-offline limitation; this
release does not claim to fix or journal the filesystem.

The design brief, concept artwork and eight-page implementation specification are
in `design/`. Concept images are illustrative; advanced file/window/widget
features are explicitly separated from implemented 0.9 behavior.

## Licensing

First-party source and original artwork retain their MIT notices. The combined
DoomGeneric-containing kernel is distributed under GPL-3.0-or-later; upstream
GPL-2.0-or-later notices remain intact. Freedoom data has its separate BSD license.
GRUB, font and Rust component notices and corresponding supplied sources are
listed in [THIRD-PARTY.md](THIRD-PARTY.md). See `LICENSE`, `COPYING` and `LICENSE-FIRST-PARTY-MIT`.
