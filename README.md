# Slopix — an experimental x86-64 OS
**An AI-generated OS. Human-directed chaos.**

Slopix is an experimental x86-64 hobby operating system written in Assembly, C, and Rust. Its code is generated with AI, with a human directing the design, features, and development.

It boots into **SlopDE**, a software-rendered desktop with movable windows, a working Terminal, a 3D demo, and playable Freedoom.

Formerly known as **Moonrise**.

This is a proof of concept and a learning project. Expect bugs, missing features, and questionable engineering decisions. Run it in QEMU.

## What's working

- GRUB / Multiboot2 boot into a 64-bit kernel
- Framebuffer desktop with a menu bar and Dock
- Dock icon magnification on hover
- Keyboard and mouse input
- Overlapping windows with dragging, focus, close, hide, and maximize/restore
- Terminal with command history, editing, and scrolling
- Custom C software 3D renderer with perspective, depth handling, and shading
- Rotating cube, teapot, circle, and torus
- Live, timer-measured FPS and frame-time counters
- DoomGeneric running Freedoom Phase 1
- Freestanding Rust component for physical memory bookkeeping
- PNG artwork converted into embedded assets during development

Terminal, 3D Demo, and DOOM can run together.

## Run in QEMU

Requirements:

- `qemu-system-x86_64`
- A Slopix ISO, either from a release or built from source

If your release archive includes `build/slopix.iso`, open a terminal in the project directory and run:

```sh
sh run.sh
```

Or launch it manually:

```sh
qemu-system-x86_64 \
  -machine pc \
  -accel tcg \
  -cpu qemu64 \
  -m 256 \
  -vga std \
  -nic none \
  -cdrom build/slopix.iso \
  -boot d \
  -serial stdio \
  -no-reboot \
  -no-shutdown
```

If you downloaded only the ISO, replace `build/slopix.iso` with its path.

The tested configuration uses BIOS boot, 256 MiB RAM, standard VGA, and QEMU software CPU emulation. Broad physical hardware support is not currently a goal.

## Desktop controls

| Action | Control |
|---|---|
| Open or focus an application | Click its Dock icon |
| Focus a window | Click it |
| Move a window | Drag its title bar |
| Close a window | Red button |
| Hide a window | Yellow button |
| Maximize or restore | Green button or `F11` |

Closing and reopening Terminal preserves its contents. Closing or hiding DOOM pauses the current game; reopening resumes it.

## Terminal

Available commands:

| Command | Purpose |
|---|---|
| `help` | List commands |
| `clear` | Clear the Terminal |
| `echo <text>` | Print text |
| `uname` | Show system information |
| `version` | Show the OS version |
| `uptime` | Show elapsed uptime |
| `meminfo` | Show memory statistics |
| `memtest` | Exercise the physical page allocator |
| `reboot` | Restart the system |

Editing shortcuts:

- Left/right arrows, Home, and End: move the cursor
- Up/down arrows: browse command history
- Backspace and Delete: edit input
- Page Up/Page Down: scroll output
- `Ctrl+L`: clear the Terminal
- `Ctrl+U`: erase the input line

## 3D Demo

Focus the window and select a model using the keyboard or clickable footer:

| Key | Model |
|---|---|
| `1` | Multicolored cube |
| `2` | Teapot |
| `3` | Filled circle |
| `4` | Torus |

Rendering uses Slopix's own C software rasterizer. Rotation is based on elapsed kernel time, rather than frame count.

The circle is a flat disc, so it becomes thin when viewed edge-on.

## DOOM / Freedoom

Open DOOM from the Dock, then select **New Game**, an episode, and a difficulty.

| Control | Action |
|---|---|
| `W` / `S` | Move forward / backward |
| `A` / `D` | Strafe left / right |
| Left/right arrows | Turn |
| `Ctrl` | Fire |
| `Space` | Use doors and switches |
| `Shift` | Run |
| `Alt` | Strafe modifier |
| `Tab` | Automap |
| Number keys | Select weapons |
| `Esc` | Menu |
| `Enter` | Confirm menu selection |

Slopix includes DoomGeneric and Freedoom Phase 1 assets. No commercial DOOM game data is included.

The current port is keyboard-only and has no audio, multiplayer, or persistent saves. It runs inside the kernel, without process isolation.

## Build from source

Reference environment: **Ubuntu 24.04 x86-64**.

Install dependencies:

```sh
sudo apt-get update
sudo apt-get install -y \
  build-essential grub-common grub-pc-bin xorriso \
  qemu-system-x86 qemu-system-gui \
  python3 python3-pil curl ca-certificates
```

Install the pinned Rust toolchain and freestanding target:

```sh
curl --proto '=https' --tlsv1.2 -fsSL \
  https://sh.rustup.rs -o /tmp/slopix-rustup.sh

sh /tmp/slopix-rustup.sh \
  -y --profile minimal \
  --default-toolchain 1.85.1 \
  --target x86_64-unknown-none

. "$HOME/.cargo/env"
```

From the project root:

```sh
make
sh run.sh
```

The generated ISO is:

```text
build/slopix.iso
```

DoomGeneric source and Freedoom data are bundled, so the build does not need to download them.

## Tests

Run host-side tests and automated QEMU regression tests:

```sh
make test
```

Run the longer idle and animation check:

```sh
python3 tests/stability_test.py --idle 15 --animation 60
```

Host-side tests cover memory bookkeeping, the C/Rust interface, rendering, clipping, runtime memory operations, assets, and the DOOM compatibility layer.

QEMU tests cover boot, Terminal input, windows, application interaction, animation, and memory allocation.

See [TEST-RESULTS.txt](TEST-RESULTS.txt) for recorded results.

## Performance

Recorded Slopix 0.5 results under QEMU TCG at a 1280×800 desktop:

| Workload | Measured throughput |
|---|---:|
| Cube animation over 60 seconds | 58.2 FPS average |
| DOOM alone over 20 seconds | 34.5 FPS average |
| DOOM with Terminal and 3D Demo open | 29.6 FPS average |

The current DOOM integration caps engine updates at 35 per second.

These are measurements from one shared-host test environment, not guaranteed performance. Results depend on the host, window sizes, and active applications.

See [PERFORMANCE.md](PERFORMANCE.md) for timing details and limitations.

## Project layout

| Path | Contents |
|---|---|
| `src/` | Kernel, desktop, input, Terminal, and rendering |
| `src/doom/` | DOOM platform adapters and compatibility layer |
| `rust/` | Freestanding Rust memory bookkeeping |
| `assets/` | Artwork and Freedoom game data |
| `vendor/doomgeneric/` | Bundled engine source |
| `tools/` | Asset and mesh generation tools |
| `tests/` | Host and QEMU tests |
| `boot/` | GRUB configuration |

PNG assets are processed offline into embedded pixel data. The kernel does not contain a PNG decoder.

## Current limitations

- No filesystem or persistent user data
- No networking or USB support
- No userspace processes or ring 3 isolation
- No general-purpose kernel heap
- Applications share the kernel's address space
- Application faults can crash the entire OS
- First DOOM launch temporarily pauses desktop composition
- Real hardware compatibility is largely untested

Slopix is not ready for daily use. Its purpose is to explore how far a human-directed, AI-generated hobby OS can go.

## Roadmap

Current direction, subject to change:

- Improve desktop consistency and quality of life
- Fix stability and input issues before expanding scope
- Improve rendering performance and application scheduling
- Develop the DOOM port further
- Eventually introduce isolated userspace applications

There are no fixed release dates.

## License and credits

Slopix is licensed under **GNU GPLv3**. See [LICENSE](LICENSE) for the repository's license terms.

Bundled third-party components retain their own copyright notices and licenses, including DoomGeneric, Freedoom assets, and GRUB.

See [THIRD-PARTY.md](THIRD-PARTY.md) for attribution and component details.
