#ifndef SLOPIX_USER_DEMO_SHIM
#define SLOPIX_USER_DEMO_SHIM
#include <stddef.h>
#include <stdint.h>
uint64_t timer_us(void);
uint32_t native_color(uint32_t c);
size_t length(const char*s);
void copystr(char*d,const char*s,size_t n);
void decimal(uint64_t n,char*s);
void logstr(const char*s);
void text(int x,int y,const char*s,uint32_t rgb);
void blit(const uint32_t*source,int stride,int x,int y,int w,int h);
void cube_init(void);
void cube_reset_stats(uint64_t now);
void cube_render(uint64_t now,int w,int h);
void cube_draw(int x,int y,int w,int h);
void cube_select(unsigned model);
void cube_presented(uint64_t now,uint64_t render_us,uint64_t compose_us,uint64_t upload_us);
#endif
