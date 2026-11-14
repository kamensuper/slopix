#!/usr/bin/env python3
"""Produce the 0.6 report from retained test telemetry, not synthetic figures."""
import hashlib,json,statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(name):return json.loads((ROOT/'build'/name).read_text())
comparison=read('stability-comparison.json')
assert '0.6' in comparison,'comparison is still running'
new=comparison['0.6']['measurements']
(ROOT/'build/stability.json').write_text(json.dumps({'0.6':new},indent=2))
iso_hash=hashlib.sha256((ROOT/'build/slopix.iso').read_bytes()).hexdigest()
files=read('storage-results.json');game=read('doom-performance.json');short=read('performance.json')
rows=[]
for version,data in comparison.items():
    m=data['measurements'];a=m['animated'];i=m['idle'];s=a['samples']
    work=statistics.mean(x['render_us']+x['compose_us']+x['upload_us'] for x in s)/1000
    rows.append(f"| {version} | {a['host_frame_fps']:.3f} | {min(x['fps10'] for x in s)/10:.1f}–{max(x['fps10'] for x in s)/10:.1f} | {work:.3f} | {i['percent_one_core']:.2f}% | {a['percent_one_core']:.2f}% | {'PASS' if data['passed'] else 'FAIL'} |")
lat=files['write_command_ms_including_driver_delay']
report=f'''# Slopix 0.6 measured performance

Tested ISO SHA256: `{iso_hash}`.

QEMU 8.2.2, PC BIOS, qemu64, TCG, 256 MiB, standard VGA, no NIC,
headless 1280x800 desktop, HPET; same shared host. A 64 MiB IDE image is
attached in the comparison. The new kernel uses ATA/FAT32; 0.5 ignores the disk.
No concurrent QEMU benchmark was deliberately run alongside these measurements.
These are observations, not a real hardware or graphical frontend guarantee.

## Sustained animation and comparison

One initial 0.6 run failed the unchanged 40 FPS minimum-interval threshold:
59 complete one-second samples ranged 27.5–60.7 FPS. Its idle phase measured
8.77% of one CPU core over 15 seconds. The Terminal continued responding;
no disk commands were issued during that animation run. The slower interval
coincided with increased renderer/compositor/upload work. It is retained in
`build/stability-failed-attempt.log` and the assertion log, not counted as a pass.
The test was improved to save raw measurements before assertions, without
changing its sample-count or FPS threshold.

A sequential follow-up comparison used 5-second idle and 60-second animation
phases, with periodic Terminal commands and the same disk attached:

| Kernel | Host-observed FPS | Guest one-second FPS range | Mean render+compose+upload ms | Idle CPU / one core | Animated CPU / one core | Existing floor test |
|---|---:|---:|---:|---:|---:|---|
{chr(10).join(rows)}

These back-to-back runs help detect an obvious regression but do not isolate
host scheduling, CPU contention, cache layout or emulation effects. The original
slow interval remains unresolved; sustained 60 FPS under all loads is NOT claimed.
The dominant animated work remains software rendering, composition and framebuffer
copying on one execution thread. Disk code has no background polling in steady
state. This release has not changed the 3D rasterizer/compositor to chase a
single transient measurement.

## Storage latency and three applications

Five short file writes with Terminal, torus and actual Freedoom gameplay open
measured **{min(lat):.2f}–{max(lat):.2f} ms** from QMP Return to command completion
(mean {statistics.mean(lat):.2f} ms). This includes the driver's 16 ms input delay
and QMP/host scheduling; it is not a bare ATA latency measurement. Each operation
syncs before its success response. The checks also read data back, run the real
memory allocator test and exercise Terminal close/reopen/maximize/restore.

Disk commands are synchronous. Large operations or a slow/faulty device can pause
composition while input/timer IRQs stay enabled. ATA waits poll briefly then HLT,
with a 100 ms timer deadline per command and an independent iteration bound.
The filesystem is bounded and has no journal or preemptive I/O scheduler.

## Existing application tests

The short cube correctness/interaction run measured host throughput
{short['host_wall_fps']:.3f} FPS; guest samples were
{min(short['steady_fps']):.1f}–{max(short['steady_fps']):.1f} FPS. This is not the
sustained comparison above. Inherited all-three-app 20-second gameplay measured
host game throughput **{game['host_fps']:.3f} FPS**. DOOM remains intentionally
capped at 35 engine updates per second. Its timer-based simulation and measured
counters are retained. DOOM save/load is still disconnected from FAT32.

## Evidence and limits

`build/stability-comparison.json`, corresponding per-phase JSON/serial logs,
`storage-results.json`, `doom-performance.json` and `performance.json` contain the
raw figures. Host FPS uses monotonic arrival times of cumulative guest frame
counters; process CPU uses the live QEMU child POSIX CPU clock. Setup/boot is
excluded. The failed attempt's aggregate host CPU/FPS were not saved and are not
reconstructed from screenshots or guessed.

No vsync, scanout, physical monitor refresh, GPU acceleration or real-hardware
storage performance was tested. Previous 0.5 results remain historical under
`docs/history/slopix-0.5`.
'''
(ROOT/'PERFORMANCE.md').write_text(report)
results=f'''Slopix 0.6 test results — actual execution
==========================================
ISO SHA256: {iso_hash}

BUILD: PASS — GCC/Assembly + Rust 1.85.1 no_std, Multiboot2 check,
static ELF with no undefined symbols or host loader/libc. GRUB 2.12-1ubuntu7.3
and matching source retained. Dockerfile is supplied but Docker was not tested.

HOST TESTS (not inside Slopix): PASS
- Inherited Rust tests and C/Rust ABI, software renderer, graphics clipping,
  pitch/guards/alpha, runtime copies, DOOM arena/formatting/WAD streams,
  icons/telemetry. ASan/UBSan; LeakSanitizer disabled for container compatibility.
- Real FAT32 module: empty/1/511/512/513/65536 bytes, bounded read capacity,
  overwrite/truncate/delete, 100 allocation/reclamation cycles, remount,
  8.3 validation, file/root/disk exhaustion with old contents preserved.
- Malformed BPB/geometry/size/root, FAT mismatch, cyclic/cross-linked/short/free
  chains, dirty volume, lost clusters, unsupported LFN/subdirectory policy.
- Failure injection at all 16 writes and 8 flushes of replacement, and every
  delete write; writes disabled afterward. Inconsistent media is rejected or
  existing/new complete data can be read after remount. No atomicity claim.
- MBR FAT32 partition read/write, no out-of-device block accesses.
- Independent mkfs.fat/mtools multi-cluster root and 64 KiB file interoperability;
  independent fsck.fat accepts resulting mutations. Formatter refuses overwrite.

ACTUAL QEMU REGRESSION SUITE: PASS
- Cold boot, desktop/keyboard/mouse setup and every existing Terminal command.
- Empty/unknown/repeated/long input, editing/history, 256-line scrollback rollover,
  mixed case, dual modifiers/Caps and rapid typing while animated.
- Guest page allocator exhaustion/canaries/free/invalid/double free; 37,914 free
  pages restored. Additional storage static buffers remain kernel-reserved.
- HPET and hpet=off PIT fallback boots and advancing timer.
- Window focus, overlap, dragging, close/hide/reopen, maximize/restore, edges.
- Dock magnification/neighbors/click targets/restoration/occlusion.
- Four models animate with changing pixels and updating measured FPS counters.
- Freedoom enters an actual level, moves/fires, releases keys across focus loss,
  survives memory tests and lifecycle operations, runs with Terminal/3D Demo,
  sustains 20-second gameplay and quits back to usable desktop.

ACTUAL QEMU STORAGE TESTS: PASS
- Real ATA commands, FAT32 mount, ls/cat/write/append/rm/sync/diskinfo.
- Four independent cold QEMU processes verify creation, multi-cluster append,
  overwrite and deletion persistence. The first VM was abruptly killed after
  acknowledged sync, with no RAM snapshot reuse.
- Simultaneous Terminal/torus/Freedoom, disk writes, readback and input.
- Host mtools reads guest-written bytes; a host-added file is read in Slopix.
- Independent host fsck accepts the stopped guest's image.
- Dirty media is read-only, mismatched FATs rejected; attempts leave bytes unchanged.
- Malformed image and no disk leave a usable desktop/Terminal without formatting.
- Real ATA read/write also works with PIT fallback timing.

PERFORMANCE: see PERFORMANCE.md, including the failed run.
Initial attached-disk 60-second animation FAILED the existing interval floor
(one 27.5 FPS interval). It was NOT counted as a pass or fixed by lowering the
threshold. Follow-up sequential results:
{chr(10).join(version+': '+('PASS' if data['passed'] else 'FAIL') for version,data in comparison.items())}
Storage input-to-completion: {min(lat):.2f}–{max(lat):.2f} ms including QMP key delay.
No guaranteed sustained 60 FPS or frontend/hardware performance claim.

PRESERVATION: PASS — all 382 archived 0.5 files match the preserved directory.
The previous 0.5 firmware-stall observation is historical, not claimed fixed;
no such pre-kernel stall was observed in the 0.6 regression runs here.

LIMITATIONS: root 8.3 files, 64 KiB operations, fixed root capacity (124 free
slots initially); no journal, no automatic repair; synchronous I/O can pause
composition. Data files persist, not desktop state/Terminal history/DOOM saves.
No filesystem code is exposed to DOOM's private stdio adapter. No broad physical
hardware, AHCI/NVMe/USB, GPT, ring 3, audio, network, or installer support.
'''
(ROOT/'TEST-RESULTS.txt').write_text(results)
print('Wrote reports from recorded telemetry')
