# Slopix 0.5 — snake, shapes, and Freedoom

Slopix is the continuation of Moonrise, not a replacement kernel. SlopDE is its
framebuffer desktop. This release adds the requested Dock magnification,
expanded 3D Demo and a real DoomGeneric/Freedoom app to the existing C/Assembly
and freestanding Rust system. The separately delivered Moonrise 0.4 is intact.

## Run the ready ISO

Extract this archive, enter `slopix-0.5`, then:

```sh
sh run.sh
```

Requires `qemu-system-x86_64`. The script uses QEMU PC, TCG, qemu64, 256 MiB,
standard VGA, BIOS boot, no network and `build/slopix.iso`. Graphics are software
rendered. The supplied ISO was tested in headless QEMU; actual results and
limitations are in `TEST-RESULTS.txt` and `PERFORMANCE.md`.

A manual launch equivalent:

```sh
qemu-system-x86_64 -machine pc -accel tcg -cpu qemu64 -m 256 \
  -vga std -nic none -cdrom build/slopix.iso -boot d \
  -serial stdio -no-reboot -no-shutdown
```

## Controls

- Dock: Terminal, 3D Demo, DOOM. Hover to magnify icons and their neighbors;
  clicking an icon opens or focuses its window. Enlarged click areas follow
  the animated layout. A window covering the Dock blocks interactions below it.
- Windows: drag title bar; red closes; yellow hides; green maximizes/restores.
  F11 toggles maximize for the focused app. All three apps can coexist.
- Terminal: existing help, clear, echo, uname, version, uptime, meminfo, reboot,
  memtest commands. Arrows edit/history, Home/End, Delete/Backspace, PgUp/PgDn,
  Ctrl+L clear and Ctrl+U erase. Terminal contents survive close/reopen.
- 3D Demo: focus it and press 1 Cube, 2 Teapot, 3 Circle, 4 Torus. The footer
  is also clickable. All shapes use the C perspective/depth renderer and
  absolute timer-based rotation. The circle is a filled rotating planar disc;
  it naturally becomes thin when viewed edge-on. Original cube face colors stay.
- DOOM: Esc opens menu; Enter selects; choose New Game, episode and difficulty.
  WASD moves/strafe, left/right arrows turn, Ctrl fires, Space uses doors/switches,
  Shift runs, Alt strafes, Tab opens automap, number keys select weapons.
  F11 belongs to SlopDE. Keyboard-only, silent single player.
- Click another window to change focus. Held game keys are released on focus
  loss. Closing/hiding DOOM pauses and retains its session; reopening resumes.
  Fully covered apps stop animation work. Quit from DOOM returns to the desktop.

## Build from source (Ubuntu 24.04 x86-64)

```sh
sudo apt-get update
sudo apt-get install -y build-essential grub-common grub-pc-bin xorriso \
  qemu-system-x86 qemu-system-gui python3 python3-pil curl ca-certificates
curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o /tmp/slopix-rustup.sh
sh /tmp/slopix-rustup.sh -y --profile minimal --default-toolchain 1.85.1 \
  --target x86_64-unknown-none
. "$HOME/.cargo/env"
make
make test
python3 tests/stability_test.py --idle 15 --animation 60
```

Build needs no engine/game downloads: pinned engine source and Freedoom Phase 1
0.13.0 WAD are included. Python/Pillow generates PNG assets offline; there is
no PNG decoder or host libc in the kernel. Rust links `core`, not host `std`.

Regenerate original artwork or meshes with `python3 tools/build_brand.py`,
`python3 tools/draw_icon_sources.py`, `make icons`, and
`python3 tools/build_meshes.py`. Generated sources and assets are supplied.

## Boundaries

No sound, multiplayer, mouse aiming, saved games/config persistence, filesystem,
networking, ring 3 or general-purpose kernel heap. DOOM has a dedicated bounded
48 MiB arena, with a 32 MiB engine zone inside it. It is not a userspace process;
CPU faults and arbitrary engine memory corruption can still affect the kernel.
This is not general PC hardware support. QEMU BIOS/PS2/std VGA is the tested
platform; QEMU without HPET uses the inherited PIT fallback.

See `DOOM-PORT.md`, `AUDIT.md`, `ICONS.md`, `RUST-AND-MEMORY.md` and
`THIRD-PARTY.md` for architecture, assets and licensing. First-party code keeps
its MIT license in `LICENSE`; the linked DoomGeneric-containing kernel is
redistributed under GPL-2.0-or-later with full corresponding source (`COPYING`).
Freedoom's separate data license and attribution are included with the WAD.
