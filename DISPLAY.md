# Slopix 0.85 — more desktop, same pixels

Increasing the guest resolution adds usable space. Normal windows, text,
cursor and idle Dock icons keep their pixel dimensions. The wallpaper fills
the new screen, the Dock stays bottom-centered, and the menu bar spans the
width. Right/bottom-anchored windows move with those edges. Shrinking clamps
windows into the usable area; expanding restores their preferred normal
geometry. Maximized windows fill the new work area, and restore returns to
normal geometry. Terminal history, cube state and DOOM sessions survive.

## Controls

- F12 or click the resolution label in the menu bar: next preset.
- `display`: current dimensions, availability and controls.
- `display next`: next preset.
- `display 1600 900`: select dimensions explicitly.
- F11 still maximizes/restores the focused application.

Presets: 800x600 / 1024x600, 1024x768, 1280x720, 1280x800, 1440x900, 1600x900,
1920x1080. Explicit modes allow widths 800..1920 in multiples of 8 and
heights 600..1080, bounded by existing static graphics buffers. Modes are not
saved across reboot while persistence remains deferred to Genesis.

## Host window versus guest resolution

This release changes the guest's actual framebuffer dimensions. It does not
stretch a screenshot. Dragging the host QEMU window alone does NOT request a
guest mode with this driver; automatic host-window resize integration is not
implemented. Use the guest controls above. Disable QEMU's host-side zoom-to-fit
when judging native pixel sizes. Host scaling is separate from Slopix layout.

## Backend and safety

The modular C backend supports QEMU's PCI standard VGA on PC bus 0
(`-vga std`, PCI 1234:1111) through the Bochs DISPI registers. It validates that
BAR0 matches GRUB's framebuffer, that memory decoding is enabled, that DISPI
is recognized, and that video RAM can hold the maximum supported mode. It
never relocates or sizes a PCI BAR by writing to it. The full validated VRAM
aperture is reserved before the Rust PMM is sealed and marked uncached in the
existing identity map. Other devices retain the boot framebuffer and report
that runtime mode switching is unavailable.

Mode writes are checked by readback. Rejected configurations restore the
previous controller configuration. Only after successful readback are width,
height, pitch, software buffers, cursor, damage tracking and desktop layout
updated. A mode switch requires a full redraw; ordinary animation and input
retain dirty-region rendering. Wallpaper generation services audio between
short groups of rows; the compositor also services it between app/render tasks,
preserving the main-thread mixer contract. This is not
a GPU acceleration driver or a claim of general physical hardware support.

Protocol reference: https://www.qemu.org/docs/master/specs/standard-vga.html

## Verification

`tests/display_test.py` checks QEMU screendump dimensions, exact pixel equality
of title controls and a Dock icon across growth, fixed normal window sizes,
edge anchors, maximize/restore, repeated small/large transitions, invalid-mode
rejection, custom geometry, menu/F12/Terminal controls, allocator exhaustion,
and switching while DOOM/cube/audio and Terminal coexist. The host graphics
resize test checks stride/padding/guard integrity and stale damage/cursor reset
under ASan/UBSan. See `TEST-RESULTS-0.8.txt` for the final build's actual results.

0.85: all maximized windows reserve the same bottom Dock work area used by normal
window fitting. 800x600 is explicitly supported through Settings or display;
F12 retains its established seven-preset cycle. Corner resizing updates cached
surface dimensions and preferred normal bounds. Icons/font metrics are unchanged.
