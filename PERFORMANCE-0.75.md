# 0.75 audio hitch investigation

The synchronous per-effect copy is removed from DOOM's game tick. Cached WAD
lumps are leased until the last voice consumes them. The mixer/DMA half is
512 samples rather than 2048, reducing a half from 92.88 to 23.22 ms and the
two-half buffer from 185.76 to 46.44 ms at 22050 Hz.

The final ISO booted in QEMU 8.2.2/TCG with emulated SB16 and WAV output.
The scripted gameplay/audio/multi-app run produced 26 in-level FPS samples
ranging 29.7..35.3 and interval-average engine tick work of 3.219..4.647 ms.
There were zero reported audio underruns/device faults. Terminal's scripted
command roundtrip during a tone took 301.6 ms, including key-entry delays.
Raw output is in `build/doom-audio-results.json`, `build/audio-results.json`,
and the corresponding audio logs.

These interval counters do not measure the worst frame-time spike at each
sound onset, physical display refresh, or host speaker latency. No matched
before/after performance claim is made. The user's PulseAudio/SDL path still
needs a listening and responsiveness check on their host.

`TEST-RESULTS-0.75.txt` records the checks for this ISO. `PERFORMANCE.md` is
historical 0.7 data and must not be treated as a 0.75 measurement.
