#ifndef SLOPIX_AUTH_H
#define SLOPIX_AUTH_H
#include <stdint.h>
void auth_init(void);
int auth_active(void);
void auth_key(unsigned key);
void auth_mouse(int x,int y,int buttons);
void auth_step(uint64_t now);
void auth_render(void);
void auth_resized(void);
#endif
