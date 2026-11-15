/* Genesis process-owned framebuffer surfaces. No application identity is
 * hardcoded here: a PID may own one surface, and different PIDs never share
 * events, pixels, or lifetime. All calls execute on the kernel main thread. */
#include "gui.h"
#include "../kernel.h"
#include "../heap.h"
#include "../preferences.h"
#define GUI_MAX_W 640u
#define GUI_MAX_H 400u
#define GUI_SLOTS GUI_SURFACE_CAP
#define EVENT_CAP 64u
struct user_surface {
 unsigned pid,w,h,head,tail,dirty;
 uint32_t *pixels;
 uint64_t events[EVENT_CAP];
};
static struct user_surface surfaces[GUI_SLOTS];
static struct user_surface *lookup(unsigned pid){
 if(!pid)return 0;
 for(unsigned i=0;i<GUI_SLOTS;i++)if(surfaces[i].pid==pid)return &surfaces[i];
 return 0;
}
/* Authorize processes at desktop launch time, before their first scheduler slice.
 * An arbitrary `run DEMO.ELF` must not become a headless GUI render loop. */
int gui_authorize(unsigned pid){
 if(!pid||lookup(pid))return 0;
 for(unsigned i=0;i<GUI_SLOTS;i++)if(!surfaces[i].pid){
  surfaces[i]=(struct user_surface){.pid=pid};return 1;
 }
 return 0;
}
int64_t gui_open(unsigned pid,unsigned w,unsigned h){
 struct user_surface *slot=lookup(pid);
 if(!slot)return -13;
 if(slot->pixels||w<64||h<64||w>GUI_MAX_W||h>GUI_MAX_H)return -22;
 uint32_t *buffer=heap_alloc((size_t)w*h*sizeof(uint32_t));
 if(!buffer)return -12;
 *slot=(struct user_surface){.pid=pid,.w=w,.h=h,.pixels=buffer,.dirty=1};
 for(unsigned i=0;i<w*h;i++)buffer[i]=native_color(0x10182b);
 logstr("USER_GUI_OPEN\n");return 1;
}
int64_t gui_present(unsigned pid,const uint32_t*rgb,unsigned count){
 struct user_surface*s=lookup(pid);
 if(!s||!s->pixels||count!=s->w*s->h||!rgb)return -9;
 if(graphics_standard())slopix_mask_copy(s->pixels,rgb,count);
 else for(unsigned i=0;i<count;i++)s->pixels[i]=native_color(rgb[i]&0xffffffu);
 s->dirty=1;return count;
}
uint64_t gui_poll(unsigned pid){
 struct user_surface*s=lookup(pid);
 if(!s||!s->pixels||s->head==s->tail)return 0;
 uint64_t event=s->events[s->tail];s->tail=(s->tail+1)%EVENT_CAP;return event;
}
void gui_send_key(unsigned pid,unsigned key){
 struct user_surface*s=lookup(pid);if(!s||!s->pixels)return;
 unsigned next=(s->head+1)%EVENT_CAP;
 if(next==s->tail)s->tail=(s->tail+1)%EVENT_CAP;
 s->events[s->head]=(1ULL<<32)|key;s->head=next;
}
/* Raw set-1 make/break scancode event for true Ring-3 DOOM input.
 * The process receives only its own events and cannot view other windows. */
void gui_send_scancode(unsigned pid,unsigned code,int ext,int down){
 struct user_surface*s=lookup(pid);if(!s||!s->pixels||code>255)return;
 unsigned next=(s->head+1)%EVENT_CAP;
 if(next==s->tail)s->tail=(s->tail+1)%EVENT_CAP;
 s->events[s->head]=(4ULL<<32)|code|((uint64_t)!!ext<<8)|((uint64_t)!!down<<9);
 s->head=next;
}
/* Mouse uses the existing 12-bit-per-coordinate GUI event wire format.
 * Visibility type 3 is sent to Ring-3 programs on minimize/restore. */
/* Close request (event type 6). The app should save and exit; the desktop
 * terminates it after a grace period if it does not. */
void gui_send_close(unsigned pid){
 struct user_surface*s=lookup(pid);if(!s||!s->pixels)return;
 unsigned next=(s->head+1)%EVENT_CAP;
 if(next==s->tail)s->tail=(s->tail+1)%EVENT_CAP;
 s->events[s->head]=6ULL<<32;s->head=next;
}
void gui_send_visibility(unsigned pid,int visible){
 struct user_surface*s=lookup(pid);if(!s||!s->pixels)return;
 unsigned next=(s->head+1)%EVENT_CAP;
 if(next==s->tail)s->tail=(s->tail+1)%EVENT_CAP;
 s->events[s->head]=(3ULL<<32)|(visible?1u:0u);s->head=next;
}
void gui_send_mouse(unsigned pid,unsigned x,unsigned y,unsigned buttons){
 struct user_surface*s=lookup(pid);
 if(!s||!s->pixels||x>=s->w||y>=s->h||buttons>7)return;
 uint64_t ev=(2ULL<<32)|((uint64_t)buttons<<24)|((uint64_t)y<<12)|x;
 /* Coalesce: a pending mouse event with the same button state is only a
  * stale position, so overwrite it. Press/release transitions always get
  * their own slot and are never pushed out by a stream of moves. */
 if(s->head!=s->tail){
  unsigned last=(s->head+EVENT_CAP-1)%EVENT_CAP;uint64_t prev=s->events[last];
  if((prev>>32)==2ULL&&((prev>>24)&0xffu)==buttons){s->events[last]=ev;return;}
 }
 unsigned next=(s->head+1)%EVENT_CAP;
 if(next==s->tail)s->tail=(s->tail+1)%EVENT_CAP;
 s->events[s->head]=ev;
 s->head=next;
}
static void draw_geometry(const struct user_surface*s,int max_w,int max_h,int*dw,int*dh,int*ox,int*oy){
 if(max_w*(int)s->h<max_h*(int)s->w){*dw=max_w;*dh=max_w*(int)s->h/(int)s->w;}
 else{*dh=max_h;*dw=max_h*(int)s->w/(int)s->h;}
 if(*dw<1)*dw=1;
 if(*dh<1)*dh=1;
 *ox=(max_w-*dw)/2;*oy=(max_h-*dh)/2;
}
int gui_client_mouse(unsigned pid,int x,int y,int max_w,int max_h,unsigned buttons){
 struct user_surface*s=lookup(pid);
 if(!s||!s->pixels||max_w<1||max_h<1)return 0;
 int dw,dh,ox,oy;draw_geometry(s,max_w,max_h,&dw,&dh,&ox,&oy);
 if(x<ox||y<oy||x>=ox+dw||y>=oy+dh)return 0;
 gui_send_mouse(pid,(unsigned)((int64_t)(x-ox)*s->w/dw),(unsigned)((int64_t)(y-oy)*s->h/dh),buttons);
 return 1;
}
/* Like gui_client_mouse, but with clamp set a pointer outside the scaled
 * surface is pinned to its nearest edge. Used while an app holds pointer
 * capture so a drag that leaves the window still delivers its release. */
int gui_client_pointer(unsigned pid,int x,int y,int max_w,int max_h,unsigned buttons,int clamp){
 struct user_surface*s=lookup(pid);
 if(!s||!s->pixels||max_w<1||max_h<1)return 0;
 int dw,dh,ox,oy;draw_geometry(s,max_w,max_h,&dw,&dh,&ox,&oy);
 if(x<ox||y<oy||x>=ox+dw||y>=oy+dh){
  if(!clamp)return 0;
  if(x<ox)x=ox;
  if(y<oy)y=oy;
  if(x>=ox+dw)x=ox+dw-1;
  if(y>=oy+dh)y=oy+dh-1;
 }
 gui_send_mouse(pid,(unsigned)((int64_t)(x-ox)*s->w/dw),(unsigned)((int64_t)(y-oy)*s->h/dh),buttons);
 return 1;
}
void gui_draw(unsigned pid,int x,int y,int max_w,int max_h){
 struct user_surface*s=lookup(pid);
 if(!s||!s->pixels){text(x+15,y+20,"Starting Ring-3 app...",0xc0d8e7);return;}
 if(max_w<1||max_h<1)return;
 int sw=(int)s->w,sh=(int)s->h;
 if(sw<=0||sh<=0)return;

 int dw,dh,ox,oy;draw_geometry(s,max_w,max_h,&dw,&dh,&ox,&oy);
 ox+=x;oy+=y;

 /* Letterbox padding uses the window background, not black bars. */
 uint32_t pad=prefs.light?0xf3f5f8:0x1b2027;
 if(ox>x){
  rect(x,y,ox-x,max_h,pad);
  rect(ox+dw,y,(x+max_w)-(ox+dw),max_h,pad);
 }
 if(oy>y){
  rect(x,y,max_w,oy-y,pad);
  rect(x,oy+dh,max_w,(y+max_h)-(oy+dh),pad);
 }

 /* Native pixels only need clipping and nearest-neighbor scaling. */
 scaled_blit(s->pixels,sw,sh,ox,oy,dw,dh);
}
void gui_process_exit(unsigned pid){
 struct user_surface*s=lookup(pid);if(!s)return;
 if(s->pixels)heap_free(s->pixels);
 *s=(struct user_surface){0};logstr("USER_GUI_CLOSED\n");
}
int gui_active(unsigned pid){struct user_surface*s=lookup(pid);return s&&s->pixels!=0;}
int gui_take_dirty(unsigned pid){struct user_surface*s=lookup(pid);if(!s||!s->pixels)return 0;int old=(int)s->dirty;s->dirty=0;return old;}
