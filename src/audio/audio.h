/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef SLOPIX_AUDIO_H
#define SLOPIX_AUDIO_H
#include <stdint.h>
#include <stddef.h>
#define AUDIO_RATE 22050u
/* Four 23.2 ms blocks retain short bounded mixer slices while allowing three
 * pending completions. The 92.9 ms queue trades parameter latency for measured
 * tolerance of ~56 ms foreground stalls. A full-ring miss still stops playback. */
#define AUDIO_HALF 512u
#define AUDIO_BLOCKS 4u
#define AUDIO_MAX_SAMPLES (AUDIO_RATE*10u)
struct audio_status { int available,playing; unsigned volume; uint32_t blocks,underruns,faults; };
#define AUDIO_VOICES 8u
#define AUDIO_SFX_MAX 131072u
/* PCM unsigned 8-bit mono is copied into a bounded per-voice buffer. */
int audio_sfx_start(unsigned channel,const uint8_t *pcm,uint32_t count,unsigned rate,unsigned volume);
/* On success, borrow immutable PCM until release(context) runs. On failure,
 * ownership stays with the caller. Release runs on the main thread when the
 * voice ends, is replaced, or is stopped (possibly before return for tiny SFX). */
typedef void (*audio_sfx_release_fn)(void *context);
int audio_sfx_start_borrowed(unsigned channel,const uint8_t *pcm,uint32_t count,
                             unsigned rate,unsigned volume,
                             audio_sfx_release_fn release,void *context);
void audio_sfx_stop(unsigned channel);
void audio_sfx_volume(unsigned channel,unsigned volume);
int audio_sfx_playing(unsigned channel);
void audio_sfx_clear(void);
void audio_init(void);
void audio_step(uint64_t now);
/* Cheap polling hook for hot asset lookups: no clock read unless DMA is pending. */
void audio_checkpoint(void);
void audio_stop(void);
int audio_tone(unsigned hz,unsigned ms);
/* RIFF PCM only; input is validated and copied/resampled into owned static RAM.
 * Caller can release its input after return. No filesystem or heap dependency. */
int audio_play_wav(const uint8_t *data,size_t size);
int audio_volume(unsigned percent);
struct audio_status audio_get_status(void);
const char *audio_error(void);
struct audio_diagnostics { uint64_t services,total_gap_us,max_gap_us,start_max_us; uint32_t max_pending; };
struct audio_diagnostics audio_diagnostics(void);
extern const uint8_t audio_demo_start[],audio_demo_end[];
#endif
