#ifndef SLOPIX_APPS_H
#define SLOPIX_APPS_H
#include "kernel.h"
#define APP_COUNT 8
struct application_info {const char*name,*detail;unsigned min_w,min_h,flags;};
#define APP_LEGACY_WINDOW 1u
const struct application_info*app_info(unsigned id);
const char *app_name(unsigned id);
void desktop_open_app(unsigned id);
/* Launch an installed Ring-3 ELF in the generic SlopDE window. */
int slopde_launch_installed(const char *name);
unsigned desktop_open_count(void);
void app_opened(unsigned id);
int app_allow_close(unsigned id);
void apps_draw(unsigned id,int x,int y,int w,int h);
void apps_key(unsigned id,unsigned key);
void apps_mouse(unsigned id,int x,int y,int w,int h);
int apps_terminal(const char*name,char*args,void(*line)(const char*));
void terminal_prefill(const char*command);
void apps_context(unsigned id,int x,int y,int w,int h);
#endif
