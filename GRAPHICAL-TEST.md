# Graphical testing in Slopix 0.9

The final 0.9 graphical route uses QEMU SDL on a virtual X display, with an
actual PulseAudio server/null sink and captured monitor PCM. A separate host
pixel test checks animation without QMP screendump forcing display updates.
See `PERFORMANCE-0.9.md`, `build/graphical09.log` and
`GTK-REFRESH-REPORT.md` for measured results and the unresolved GTK discrepancy.
Physical display latency, human interaction feel and speaker quality remain
unverified. The release launcher explicitly selects SDL.

## Historical environment setup failure

The following describes an earlier baseline attempt, before the shared-namespace
graphical test harness was established. It is retained as history, not the final
0.9 test status.

This build environment initially had QEMU display backends `none` and `curses`
only. qemu-system-gui and Xvfb were installed for an actual GTK attempt.
Xvfb could not establish local display sockets. A TCP-only Xvfb attempt also
did not yield a usable X display; Pillow X11 capture failed and launching the
packaged ISO with QEMU `-display gtk` failed with `gtk initialization failed`.
The attempted backend was stopped. Package post-install configuration errors
are retained in build/gui-dependencies.log.

Therefore graphical QEMU presentation and real speakers are **unverified** in
this environment. Guest display dimensions, window pixels, native sizes,
animation, commands and controls are tested through real emulated PS/2 events,
QMP screendumps and WAV capture. Those tests are not called an interactive
physical-display or PulseAudio listening test. Use run.sh on a graphical host
for that final check; report both resolution and QEMU/audio backend when
comparing subjective lag.
