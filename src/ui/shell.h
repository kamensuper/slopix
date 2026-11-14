#ifndef SLOPIX_SHELL_H
#define SLOPIX_SHELL_H
#include "../kernel.h"
void ui_icon(unsigned id,int x,int y,int size);
void ui_chrome(unsigned id,int x,int y,int w,int h,int focused,int maximized);
void ui_shell_init(void);
void ui_shell_step(uint64_t now,int x,int y);
void ui_shell_background(void);
void ui_shell_overlay(void);
int ui_shell_mouse(int x,int y,int buttons,int oldbuttons,int background);
int ui_shell_key(unsigned key);
int ui_shell_escape(void);
int ui_shell_overlay_open(void);
int ui_shell_panel_hit(int x,int y);
void ui_shell_damage(void);
void ui_shell_layout_changed(void);
struct region ui_workarea(void);
unsigned ui_shell_options(void);
void ui_shell_configure(unsigned options);
int ui_shell_save(void);
const char*ui_shell_status(void);
#endif
