#ifndef SLOPIX_AUDIO_DEVICE_H
#define SLOPIX_AUDIO_DEVICE_H
#include <stdint.h>
int sb16_init(void);
int sb16_start(void);
void sb16_stop(void);
uint32_t sb16_blocks(void);
void sb16_write_half(unsigned half,const uint8_t *data);
void audio_irq(void);
#endif
