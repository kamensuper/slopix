/* Stable internal delivery boundary: input/display/apps do not call SlopDE. */
#include "desktop_backend.h"
#include "../auth.h"
extern const struct desktop_backend slopde_backend;
extern const struct desktop_backend dwm_backend;
static const struct desktop_backend*active=&slopde_backend;
static int started;
static int streq(const char *a, const char *b){while(*a&&*a==*b){a++;b++;}return *a==*b;}
int desktop_backend_select(const struct desktop_backend*b){if(started||!b||!b->name||!b->init||!b->render||!b->step||!b->mouse||!b->key||!b->shortcut||!b->resized||!b->background_changed||!b->scancode||!b->open_app||!b->open_count||!b->app_state||!b->wants_escape||!b->game_focused)return 0;active=b;return 1;}
const char*desktop_backend_name(void){return active->name;}
int desktop_backend_select_by_name(const char *name){
    if(started||!name)return 0;
    if(streq(name,"dwm"))return desktop_backend_select(&dwm_backend);
    if(streq(name,"slopde")||streq(name,"slopde2"))return desktop_backend_select(&slopde_backend);
    return 0;
}
void desktop_init(void){started=1;active->init();auth_init();}
void desktop_render(void){if(auth_active())auth_render();else active->render();}
void desktop_step(uint64_t t){if(auth_active())auth_step(t);else active->step(t);}
void desktop_mouse(int x,int y,int b){if(auth_active()){auth_mouse(x,y,b);if(!auth_active())active->background_changed();}else active->mouse(x,y,b);}
void desktop_key(unsigned k){if(auth_active()){auth_key(k);if(!auth_active())active->background_changed();}else active->key(k);}
void desktop_shortcut(unsigned k){if(!auth_active())active->shortcut(k);}
void desktop_resized(unsigned w,unsigned h){active->resized(w,h);if(auth_active())auth_resized();}
void desktop_background_changed(void){active->background_changed();}
void desktop_scancode(unsigned c,int e,int d){if(!auth_active())active->scancode(c,e,d);}
void desktop_open_app(unsigned id){if(!auth_active())active->open_app(id);}
unsigned desktop_open_count(void){return active->open_count();}
unsigned desktop_app_state(unsigned id){return active->app_state(id);}
int desktop_find_focused(void){return !auth_active()&&active->wants_escape();}
int desktop_doom_focused(void){return !auth_active()&&active->game_focused();}
