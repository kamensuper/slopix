# Slopix 0.8 measured checks

QEMU 8.2.2 / TCG / qemu64 / 256 MiB / standard VGA, headless screendumps.
The final release's short default-mode cube check measured
60.028 host-observed FPS at 1280x800. Guest interval samples were
59.9..60.0 FPS. Scripted Enter-to-command-result times during
animation ranged 17.10..17.49 ms, including the driver's key delay.
These are actual observations from a short run, not a universal FPS guarantee.
Raw counters are in `build/performance.json`.

The display test verifies true QEMU scanout dimensions for every preset and a
custom 1360x768 mode. Pixel-for-pixel title-button and idle Dock-icon comparisons
match between 1280x800 and 1600x900. Normal window geometry is retained when
space permits, clamps during shrink and returns to preferred geometry when
expanded. Maximized geometry follows the new work area. Repeated changes and
switching while three apps and sound are active are exercised.

No sustained FPS/CPU benchmark was performed at each resolution, especially
1920x1080. A display mode switch performs a full redraw; ordinary frames retain
dirty-region rendering. QEMU WAV audio capture is tested rather than a physical
speaker/PulseAudio/SDL listening session. Automatic guest resizing from host
window dragging is not implemented. See `DISPLAY.md` and `TEST-RESULTS-0.8.txt`.
