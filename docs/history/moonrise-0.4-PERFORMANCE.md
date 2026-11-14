# Moonrise 0.4 measured performance

Target: QEMU 8.2.2 PC BIOS, qemu64 CPU, TCG software emulation, 256 MiB RAM,
standard VGA, no NIC, 1280 x 800 desktop, headless `-display none`.
The same environment ran the preserved 0.3 and new 0.4 releases sequentially.

| Version | Guest sample FPS range | Mean sample FPS | Host-clock FPS | Idle CPU | Animated CPU |
| --- | --- | --- | --- | --- | --- |
| 0.3 | 59.8–60.0 | 59.96 | 58.73 | 5.06% | 39.71% |
| 0.4 | 58.8–60.4 | 59.92 | 59.98 | 5.06% | 37.77% |

0.4's mean frame interval was 16.672 ms.
CPU is percent of one host core, sampled from the live QEMU process's POSIX
CPU clock (clock_getcpuclockid/clock_gettime); boot/setup is excluded. Idle was
15 seconds per release, baseline animation 15 seconds, and 0.4 animation 60 seconds
with periodic successful Terminal commands. There were 59 completed 0.4 reporting
intervals. Small CPU differences should be treated as host variation, not a
claimed optimization gain. There was no material sustained performance loss.

The normal viewport is 512 x 324; maximized rendering is capped at 640 x 400.
This is not 1280 x 800 triangle rasterization: the full desktop is that size,
while only damaged viewport/HUD regions are normally composited/uploaded.
Both windows were open during the sustained run.

## Reliable clock and cross-check

0.3 used delivered PIT IRQ counts as its clock. The fresh baseline showed a
difference between that reported rate and host-clock frame throughput. A short
0.4 PIT-only test also observed about 58 host FPS while its IRQ-count counter
reported about 60. Counting interrupts can miss elapsed time when virtual IRQ
notifications coalesce; the small nominal divisor correction alone was insufficient.

0.4 now uses a capability-checked 64-bit free-running HPET counter on QEMU PC,
with coherent high/low/high MMIO reads. It measures elapsed time independently
of IRQ delivery. The PIT still wakes the event loop near 1000 Hz; HPET legacy
routing and comparator IRQs are disabled. The known PC MMIO address is reserved
and mapped uncached. This is platform-specific capability probing, not an ACPI
parser or general hardware support. The 60-second run spans the counter's normal
low-word rollover. HPET-disabled cold boot and commands also passed using the
explicitly reported PIT fallback.

The final short window/input regression cross-check measured 60.05 host FPS.
It included one transient 57.0 FPS reporting interval before returning near 60;
that dip is retained in the raw evidence, not filtered away. The long-run
host result above is the stronger throughput measurement. No minimum 60 FPS
per individual frame or guarantee on other hosts is claimed.

FPS counts fresh cube frames submitted to the guest framebuffer, not repeated
static redraws or host vsync. Stage costs come from the selected kernel clock;
HPET gives microsecond-scale samples, while the fallback has roughly 1 ms tick
granularity and can undercount under delayed IRQs. The fallback converts the
nominal 1193/1193182 PIT ratio correctly, but that does not prevent coalescing.
Host GUI refresh and physical monitor output were not measured. Uploads are
not vsync-synchronized and may tear. Shared-host load can change results.

## Responsiveness and architecture

Return-key to observed command output in the final animated regression was
17.30–17.81 ms across 12 commands. This includes
the test driver's fixed 16 ms post-injection delay, QMP and sampling overhead;
it is an observed upper bound, not an input-latency precision claim.

The dirty-region/native-row-copy compositor, cached Terminal, fixed graphics
buffers and C renderer from 0.3 remain. Rust is not in the animation hot path.
PNG decode/downsampling is offline; small runtime assets use clipped alpha
blending. Idle still has approximately 1000 PIT wakeups/second; tickless idle
was not added. The main loop sleeps with hlt rather than busy-waiting for frames.
Fully hidden Demo windows pause; reopening/restoring resumes time-based motion.

Explicit memtest intentionally occupies the main loop while allocating/touching
all free pages and may briefly pause animation/input processing. IRQ capture
remains enabled. Those diagnostics are excluded from normal animation figures;
separate tests verify both applications remain usable afterward.

## Reproduction and evidence

```sh
make test
python3 tests/stability_test.py --idle 15 --animation 60
# Optional preserved sibling baseline:
python3 tests/stability_test.py --baseline ../moonrise --idle 15 --animation 60
```

See build/stability.json, stability-run.log, stability-*.log, cube-test.log,
performance.json and full-test.log. Tests parse only newline-terminated serial
records; incomplete reads wait for the next chunk and malformed complete records
still fail. Host sanitizers check renderer depth/time/clipping and graphics
alpha/pitch/dirty-write invariants. Leak checking alone is disabled because the
container cannot support it; address/undefined-behavior checks remain enabled.
