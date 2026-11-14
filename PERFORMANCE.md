# Slopix 0.7 measured audio performance

idle: 15.00 s wall, 4.67% of one host core (QEMU process CPU).
animated_quiet: 20.04 s wall, 36.41% of one host core (QEMU process CPU).
  Host-observed cube: 59.986 FPS; guest samples 59.8..60.1 FPS.
  Mean renderer work: 3.004 ms; compose 1.818 ms; upload 0.539 ms.
animated_audio: 60.05 s wall, 39.36% of one host core (QEMU process CPU).
  Host-observed cube: 59.965 FPS; guest samples 58.8..60.2 FPS.
  Mean renderer work: 3.070 ms; compose 1.881 ms; upload 0.555 ms.

Simultaneous-app gameplay regression: 30.006 host-observed game FPS (35 Hz engine cap; separate from cube).
No fixed FPS guarantee; headless counters do not measure display refresh or perceived latency.
Process CPU includes emulation, graphics and WAV backend work; not guest-only CPU utilization.


Raw data: build/audio-performance.json, audio-results.json, doom-audio-results.json.
Tests and caveats: TEST-RESULTS.txt. Earlier 0.6 results are historical under docs/history/slopix-0.6.
