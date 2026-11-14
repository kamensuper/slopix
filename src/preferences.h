#ifndef SLOPIX_PREFERENCES_H
#define SLOPIX_PREFERENCES_H
#include "kernel.h"
struct preferences {uint32_t magic,version,bytes,generation,wallpaper,fit,accent,light,volume,magnify,display_w,display_h,desktop_backend;char path[16];uint32_t checksum;};
extern struct preferences prefs;
void preferences_init(void);
void preferences_changed(int background);
void preferences_step(uint64_t now);
int preferences_save(void);
int preferences_wallpaper(const char *name);
const char *preferences_status(void);
uint32_t preferences_pixel(unsigned x,unsigned y);
void desktop_background_changed(void);
#endif
