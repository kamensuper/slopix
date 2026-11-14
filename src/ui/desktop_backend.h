#ifndef SLOPIX_DESKTOP_BACKEND_H
#define SLOPIX_DESKTOP_BACKEND_H
#include "../kernel.h"
struct desktop_backend {
 const char*name;
 void(*init)(void);void(*render)(void);void(*step)(uint64_t);
 void(*mouse)(int,int,int);void(*key)(unsigned);void(*shortcut)(unsigned);
 void(*resized)(unsigned,unsigned);void(*background_changed)(void);
 void(*scancode)(unsigned,int,int);void(*open_app)(unsigned);
 unsigned(*open_count)(void);unsigned(*app_state)(unsigned);
 int(*wants_escape)(void);int(*game_focused)(void);
};
/* Selection is boot-only. Runtime migration and additional DEs are future work. */
int desktop_backend_select(const struct desktop_backend*backend);
const char*desktop_backend_name(void);
void desktop_open_app(unsigned id);
unsigned desktop_open_count(void);
void desktop_background_changed(void);
unsigned desktop_app_state(unsigned id);
int desktop_doom_focused(void);
extern const struct desktop_backend slopde_backend;
extern const struct desktop_backend dwm_backend;
/* Select backend by name at early init (before desktop_init). Returns 1 on success. */
int desktop_backend_select_by_name(const char *name);
#endif