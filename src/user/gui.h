#ifndef SLOPIX_USER_GUI_H
#define SLOPIX_USER_GUI_H
#include <stdint.h>
/* Includes all eight SlopDE slots; the surface limit is shared by tests. */
#define GUI_SURFACE_CAP 8u
/* Genesis v2: isolated process-owned surfaces. A PID owns at most one surface;
 * closing a process reclaims its pixel storage and drops pending input. */
int gui_authorize(unsigned pid); /* Only a desktop-owned PID can open a GUI surface. */
int64_t gui_open(unsigned pid,unsigned w,unsigned h);
int64_t gui_present(unsigned pid,const uint32_t *rgb,unsigned pixels);
uint64_t gui_poll(unsigned pid);
void gui_send_key(unsigned pid,unsigned key);
void gui_send_scancode(unsigned pid,unsigned code,int ext,int down);
void gui_send_mouse(unsigned pid,unsigned x,unsigned y,unsigned buttons);
void gui_send_visibility(unsigned pid,int visible);
/* Type-5 event: client area resized; returns 1 if queued. */
int gui_send_resize(unsigned pid,unsigned w,unsigned h);
void gui_draw(unsigned pid,int x,int y,int max_w,int max_h);
/* Translate window-client coordinates through the same aspect-ratio mapping. */
int gui_client_mouse(unsigned pid,int x,int y,int w,int h,unsigned buttons);
void gui_process_exit(unsigned pid);
int gui_active(unsigned pid);
int gui_take_dirty(unsigned pid);
#endif
