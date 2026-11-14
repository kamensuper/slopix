# SlopAudio 0.7

## Architecture

`src/audio/audio.c` owns PCM validation, conversion, volume, a finite tone/WAV
source, eight copied sound-effect voices, saturating mixing, and scheduling.
`src/audio/sb16.c` owns the ISA device, DSP reset/version, DMA1, and IRQ5.
`src/doom/sound.c` adapts DoomGeneric's sound-module interface to this API.
Kernel initialization calls audio_init; the ordinary event loop calls
`audio_step`. There is no audio work in the timer IRQ and no audio thread.

RIFF input accepts integer PCM, mono/stereo, 8/16-bit, 8000–48000 Hz, up to ten
seconds after conversion. Chunk lengths, padding, block alignment and byte
rate are validated before sample access. Stereo averages into mono. Conversion
uses nearest-neighbor resampling and owned storage: callers may release WAV
bytes immediately after the call. No dynamic allocation or disk access.

Each digital-effect channel copies at most 131072 unsigned 8-bit mono samples,
with a 4000–48000 Hz rate and 0–127 voice volume. Eight voices mix with the
finite PCM source; master volume applies to the saturated output. Doom DMX
format headers and length are checked and padding removed. The general PCM
API copies caller data; DOOM instead leases its cached WAD sample until the
voice ends, is replaced or stopped, avoiding a synchronous per-effect copy.
DOOM's stereo separation parameter is currently ignored because output is mono.
Effects stop on hide/occlusion/quit; already queued DMA audio can take up to
46 ms to drain. SoundIsPlaying tracks source consumption ahead of the DAC,
so channel timing is approximate by the buffer latency.

The fixed 1024-byte DMA ring has two 512-byte halves (about 23 ms each at
22.05 kHz). The linker puts it in a
separate writable load segment below 16 MiB, aligned to 64 KiB. The kernel's
existing retained span reserves it from the physical allocator. Linker and
runtime checks prevent a 64 KiB boundary crossing. One half lasts 23.22 ms.

IRQ5 checks the DSP interrupt source, acknowledges the device and PIC, and
increments a counter. The main thread refills only the completed half.
Multiple missed blocks count as an underrun and stop output rather than
pretending playback remained continuous. A 500 ms lack of progress counts a
fault. DSP commands have finite iteration/time limits. The only intentional
short spin is the hardware's reset pulse (10 microseconds). Normal waiting
uses the existing HLT event loop. Idle audio does not issue periodic I/O.

Sound device absence disables audio without blocking the desktop. No detection
of arbitrary ISA resources, ACPI routing, PCI sound cards, USB or native HDA
is attempted. The mixer/device boundary can support future backends, but that
is an architectural option, not universal hardware support today.

## Verification

`make audio-test`: real C parser/converter/mixer/scheduler with a fake DMA sink,
ASan/UBSan, truncated/malformed corpus, volume, mixing saturation, channel and
capacity bounds, rate conversion, final silence, stop, underrun, lost IRQ and
absent-device behavior. These are host tests, not hardware tests.

`tests/audio_guest_test.py`: real guest commands and SB16 DMA/IRQ, capture WAV,
FFT checks for 440 Hz tone and chime C4, guest physical DMA mute exactly 128,
native-rate constant capture within one LSB; converted-output silence independent of DC bias, command handling during sound, cube,
volume/stop/restart, fault counters and no-device boot.

`tests/doom_audio_test.py`: starts Freedoom with menu audio muted, unmutes in
level, fires, verifies ammo consumption and nonzero captured gameplay audio,
then checks simultaneous apps and audio fault counters.

`tests/audio_performance.py`: measured process CPU and guest/host frame
counters during 15 seconds idle and 60 seconds cube animation with recurring
ten-second tones. Records data without inventing a target FPS result.

Reference: Creative Sound Blaster Series Hardware Programming Guide,
https://pdos.csail.mit.edu/6.1810/2017/readings/hardware/SoundBlaster.pdf .
No code from a third-party audio driver is copied into this implementation.

The supplied WAD contains 69 DMX effect lumps. All fit the 128 KiB per-voice
capacity, including DSBRSSIT (110480 DMX bytes at 44100 Hz). This is an asset
bounds check, not a claim to have played every effect or map.

QEMU 8.2.2's unsigned sample conversion uses HALF=IN_MAX>>1 (127 for U8),
which introduces a small DC offset even for correct guest midpoint 128. The
mute test reads the entire guest DMA ring through QMP and requires every byte
be exactly 128. It also verifies constant captured output, allowing the host
conversion's one-LSB offset. Reference (not linked kernel code):
https://github.com/qemu/qemu/blob/v8.2.2/audio/mixeng_template.h .
