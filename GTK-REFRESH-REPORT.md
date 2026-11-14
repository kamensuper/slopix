# Graphical frontend refresh investigation

The default release launcher now selects SDL explicitly. Override with
`SLOPIX_DISPLAY=gtk sh run.sh` to try GTK on your own host. This is a host
frontend choice; no guest graphics path is bypassed or substituted.

## What was actually observed

A pre-polish GTK/PulseAudio stress run produced advancing guest frame counters,
zero audio underruns and nonzero PCM in the host monitor. However, its host-window
capture showed an older clock and ammunition value. That invalidated any claim
that those captures alone proved continuously refreshing GTK presentation.

A dedicated test then compared host X11 pixels across three seconds without any
QMP screendump forcing a device update. The GTK image stayed unchanged while
serial cube counters advanced (for example frames 59 through 234). The same test
failed against the unchanged 0.85 ISO, whose SHA remains
2da0c78e3623fe442a47e4508068cbfbaddf6e64dff622633a2f6393df92be2e.
This does not establish a new 0.9 kernel regression.

QEMU 8.2.2 tracing recorded hundreds of gd_update calls with changing screen
regions during the baseline probe. Thus the emulator was receiving display
updates even though the host GTK window remained stale. The exact GTK/Cairo/
virtual-X painting failure is unresolved; this is not proof of the cause on a
user's physical desktop. Removing duplicate display arguments and trying
GDK_RENDERING=image did not resolve it. Those hypotheses were rejected.

## Supported graphical test route

The same no-forced-refresh test passed using SDL on the virtual X display, with
thousands of changed pixels and nonzero PulseAudio monitor output. SDL is now the
explicit tested frontend. The final graphical/audio stress test uses that path,
keeps the cube visible beside DOOM while firing, and checks zero underruns and
continued application/input operation. Its actual frame distributions and PCM
sample count are in PERFORMANCE-0.9.md and build/graphical09.log.

No guest source change was made to 'fix' GTK on the basis of this discrepancy.
The launcher and test driver now make frontend selection explicit. The failure
logs are retained as final09-refresh-before/after/image/baseline085.log, with
baseline display traces in final09-gtk-baseline085-trace.txt. They are diagnostic
failures, not passed regression results. tests/gtk_refresh_test.py can select
TEST_DISPLAY=gtk or sdl; tests/graphical_audio.sh supplies the shared X/audio
namespace. The test compares actual host-window pixels without forcing refresh.

Physical display latency, human interaction feel and physical speaker quality
remain unverified. M0's GTK/PulseAudio measurements remain valid guest-timing and
host-audio evidence, but must not be interpreted as proof of live GTK presentation.
