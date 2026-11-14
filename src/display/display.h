#ifndef SLOPIX_DISPLAY_H
#define SLOPIX_DISPLAY_H
#include <stdint.h>
void display_init(uint64_t framebuffer,uint64_t bytes,int rgb_standard);
uint64_t display_reserved_bytes(void);
int display_available(void);
int display_set(unsigned w,unsigned h);
int display_cycle(void);
const char *display_error(void);
#endif
