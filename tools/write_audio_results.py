#!/usr/bin/env python3
"""Generate release claims from actual stored test measurements."""
from pathlib import Path
import hashlib,json
r=Path(__file__).resolve().parents[1];b=r/'build'
tests=json.loads((b/'release-tests.json').read_text())
assert len(tests)==14 and all(t['exit']==0 for t in tests),tests
perf=json.loads((b/'audio-performance.json').read_text())
audio=json.loads((b/'audio-results.json').read_text());doom=json.loads((b/'doom-audio-results.json').read_text())
doom_perf=json.loads((b/'doom-performance.json').read_text())
iso=hashlib.sha256((b/'slopix.iso').read_bytes()).hexdigest()
report=['Slopix 0.7.0 — actual audio release results','',f'ISO SHA256: {iso}',
'Environment: QEMU 8.2.2 / TCG / qemu64 / PC / 256 MiB / std VGA / 1280x800.',
'BIOS GRUB 2.12 (Ubuntu 2.12-1ubuntu7.3). GCC 13, Rust 1.85.1.',
'Audio: emulated ISA SB16, 0x220 / IRQ5 / DMA1 -> QEMU WAV backend.',
'No physical speakers, native hardware or host PulseAudio/SDL session tested.','',
'HOST TESTS: memory Rust tests and C ABI, renderer and framebuffer guards,',
'runtime, DOOM allocator/formatter/WAD compatibility, SlopAudio under ASan/UBSan.',
'Audio: PCM formats, exact rate conversion pattern, saturated multivoice mix,',
'128 KiB voice boundary, duration capacity, volume/silence, malformed/truncated',
'WAV corpus, invalid voices/rates, stop, simulated underrun and stalled IRQ.','',
'QEMU RELEASE TESTS:']
report += [f"PASS {t['test']}: {t['wall_s']:.2f} s" for t in tests]
report += ['',f"Captured tone/chime: {audio['capture_seconds']:.3f} s at {audio['capture_rate']} Hz / {audio['capture_channels']} channels (QEMU host conversion).",
'Guest output is 22050 Hz unsigned 8-bit mono; capture is 44100 Hz signed 16-bit stereo.',
'FFT verified actual 440 Hz tone and C4 chime; volume-zero sustained silence checked.',
f"Concurrent Terminal typed-command roundtrip: {audio['terminal_command_s']*1000:.2f} ms (includes simulated typing delays).",
f"Gameplay capture: {doom['capture_seconds']:.3f} s; {doom['nonzero_samples']} nonzero frames above threshold.",
'Menu muted, then gameplay unmuted; shots consume ammunition and produce captured sound.',
'All supplied 69 DMX effect lumps fit the capacity (asset check; not every effect/map played).',
'Audio control test and gameplay test reported zero underruns and zero device faults.',
'PIT fallback playback captured nonzero data; no-card boot and Terminal also passed.','',
'MEASURED PERFORMANCE:']
for name,p in perf.items():
 report.append(f"{name}: {p['wall_s']:.2f} s wall, {p['percent_one_core']:.2f}% of one host core (QEMU process CPU).")
 if 'host_frame_fps' in p:
  ss=p['samples'];report.append(f"  Host-observed cube: {p['host_frame_fps']:.3f} FPS; guest samples {min(x['fps10'] for x in ss)/10:.1f}..{max(x['fps10'] for x in ss)/10:.1f} FPS.")
  report.append(f"  Mean renderer work: {sum(x['render_us'] for x in ss)/len(ss)/1000:.3f} ms; compose {sum(x['compose_us'] for x in ss)/len(ss)/1000:.3f} ms; upload {sum(x['upload_us'] for x in ss)/len(ss)/1000:.3f} ms.")
report += ['',f"Simultaneous-app gameplay regression: {doom_perf['host_fps']:.3f} host-observed game FPS (35 Hz engine cap; separate from cube).",'No fixed FPS guarantee; headless counters do not measure display refresh or perceived latency.',
'Process CPU includes emulation, graphics and WAV backend work; not guest-only CPU utilization.','',
'EARLY FAILURE EVIDENCE:',
'An initial performance pass paired a stale pre-phase FPS sample with a fresh',
'host timestamp, biasing the average slightly high. Its raw results are retained.',
'The final run uses only pairs of newly arrived samples for host-observed FPS.',
'An early regression invocation stopped at GRUB with empty kernel serial output.',
'That validation batch overlapped an ISO rebuild and is not a clean final-image test.',
'Its log, register dump and screenshot are retained in build/early-attempt/.',
'An earlier smoke check also rejected the newly changed version string; expected',
'version assertions were updated to 0.7.0, without relaxing behavior or timeouts.',
'A mute assertion initially assumed zero-valued samples after host conversion.',
'Investigation found constant DC bias in the converted capture; native U8 mute',
'physical DMA readback independently verified every byte equals 128. The final check requires',
'constant silence in converted output and native-rate capture within one LSB.',
'The final regression run uses the fixed ISO SHA above; no rebuild during it.',
'This does not prove firmware/boot intermittency is permanently fixed.','',
'KNOWN LIMITS:',
'SB16 QEMU target only; no native HDA/AC97/USB driver, music synthesis, stereo',
'panning, high-quality resampler or filesystem streaming. Digital SFX and WAV are real.',
'Up to 186ms audio buffering; channels report source consumption ahead of DAC.',
'Nonpreemptive main-thread stalls can underrun; counters stop playback honestly.',
'FAT32/ATA unchanged and deferred to Genesis; intermittent ATA append failure unresolved.',
'Experimental disk disconnected by default. Storage tests not rerun for this audio release.',
'No ring 3, process isolation, persistent game saves or networking.',
'0.5/0.6 ISOs and 0.6 storage image/source preserved; see build/preserved-releases.txt.']
(r/'TEST-RESULTS.txt').write_text('\n'.join(report)+'\n')
(r/'PERFORMANCE.md').write_text('# Slopix 0.7 measured audio performance\n\n'+ '\n'.join(report[report.index('MEASURED PERFORMANCE:')+1:report.index('EARLY FAILURE EVIDENCE:')])+'\n\nRaw data: build/audio-performance.json, audio-results.json, doom-audio-results.json.\nTests and caveats: TEST-RESULTS.txt. Earlier 0.6 results are historical under docs/history/slopix-0.6.\n')
print(r/'TEST-RESULTS.txt')
