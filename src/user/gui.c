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
/* Logical RGB edge strips per surface (left, right, top, bottom). Used to extend
 * the app's own edge pixels into letterbox padding instead of painting black. */
#define EDGE_L 0u
#define EDGE_R GUI_MAX_H
#define EDGE_T (2u*GUI_MAX_H)
#define EDGE_B (2u*GUI_MAX_H+GUI_MAX_W)
static uint32_t edges[GUI_SLOTS][2u*GUI_MAX_H+2u*GUI_MAX_W];
static uint32_t *edge_of(const struct user_surface*s){return edges[s-surfaces];}
static void edge_fill(struct user_surface*s,uint32_t c){uint32_t*e=edge_of(s);for(unsigned i=0;i<2u*GUI_MAX_H+2u*GUI_MAX_W;i++)e[i]=c;}
static void push_event(struct user_surface*s,uint64_t e){
 unsigned next=(s->head+1)%EVENT_CAP;
 if(next==s->tail)s->tail=(s->tail+1)%EVENT_CAP;
 s->events[s->head]=e;s->head=next;
}
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
/* First call creates the surface. Later calls re-allocate it at a new size
 * (e.g. after a type-5 resize event) while keeping the pending event queue. */
int64_t gui_open(unsigned pid,unsigned w,unsigned h){
 struct user_surface *slot=lookup(pid);
 if(!slot)return -13;
 if(w<64||h<64||w>GUI_MAX_W||h>GUI_MAX_H)return -22;
 if(slot->pixels&&slot->w==w&&slot->h==h){slot->dirty=1;return 1;}
 uint32_t *buffer=heap_alloc((size_t)w*h*sizeof(uint32_t));
 if(!buffer)return -12;
 int reopen=slot->pixels!=0;
 if(reopen)heap_free(slot->pixels);
 slot->w=w;slot->h=h;slot->pixels=buffer;slot->dirty=1;
 for(unsigned i=0;i<w*h;i++)buffer[i]=native_color(0x10182b);
 edge_fill(slot,0x10182b);
 logstr(reopen?"USER_GUI_RESIZED\n":"USER_GUI_OPEN\n");return 1;
}
int64_t gui_present(unsigned pid,const uint32_t*rgb,unsigned count){
 struct user_surface*s=lookup(pid);
 if(!s||!s->pixels||count!=s->w*s->h||!rgb)return -9;
 if(graphics_standard())slopix_mask_copy(s->pixels,rgb,count);
 else for(unsigned i=0;i<count;i++)s->pixels[i]=native_color(rgb[i]&0xffffffu);
 uint32_t*e=edge_of(s);unsigned w=s->w,h=s->h;
 for(unsigned y=0;y<h;y++){e[EDGE_L+y]=rgb[y*w]&0xffffffu;e[EDGE_R+y]=rgb[y*w+w-1]&0xffffffu;}
 for(unsigned x=0;x<w;x++){e[EDGE_T+x]=rgb[x]&0xffffffu;e[EDGE_B+x]=rgb[(h-1)*w+x]&0xffffffu;}
 s->dirty=1;return count;
}
uint64_t gui_poll(unsigned pid){
 struct user_surface*s=lookup(pid);
 if(!s||!s->pixels||s->head==s->tail)return 0;
 uint64_t event=s->events[s->tail];s->tail=(s->tail+1)%EVENT_CAP;return event;
}
void gui_send_key(unsigned pid,unsigned key){
 struct user_surface*s=lookup(pid);if(!s||!s->pixels)return;
 push_event(s,(1ULL<<32)|key);
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
/* Type 5: the window client area is now w x h (clamped to surface limits).
 * Apps may respond by calling gui_open again at that size. */
int gui_send_resize(unsigned pid,unsigned w,unsigned h){
 struct user_surface*s=lookup(pid);if(!s||!s->pixels)return 0;
 if(w>GUI_MAX_W)w=GUI_MAX_W;
 if(h>GUI_MAX_H)h=GUI_MAX_H;
 if(w<64)w=64;
 if(h<64)h=64;
 push_event(s,(5ULL<<32)|((uint64_t)h<<12)|w);return 1;
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
/* Prefer the largest whole-number scale so pixels stay uniform; only fall back
 * to fractional nearest-neighbor when the client is smaller than the surface. */
static void draw_geometry(const struct user_surface*s,int max_w,int max_h,int*dw,int*dh,int*ox,int*oy){
 int k=max_w/(int)s->w,kh=max_h/(int)s->h;if(kh<k)k=kh;
 if(k>=1){*dw=(int)s->w*k;*dh=(int)s->h*k;}
 else if(max_w*(int)s->h<max_h*(int)s->w){*dw=max_w;*dh=max_w*(int)s->h/(int)s->w;}
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

 /* Letterbox padding continues the app's own edge pixels (no black bars). */
 const uint32_t*e=edge_of(s);
 int left=ox-x,top=oy-y,right=(x+max_w)-(ox+dw),bottom=(y+max_h)-(oy+dh);
 if(left>0||right>0)for(int sy=0;sy<sh;sy++){
  int y0=oy+sy*dh/sh,y1=oy+(sy+1)*dh/sh;if(y1<=y0)continue;
  if(left>0)rect(x,y0,left,y1-y0,e[EDGE_L+sy]);
  if(right>0)rect(ox+dw,y0,right,y1-y0,e[EDGE_R+sy]);
 }
 if(top>0||bottom>0)for(int sx=0;sx<sw;sx++){
  int x0=ox+sx*dw/sw,x1=ox+(sx+1)*dw/sw;if(x1<=x0)continue;
  if(top>0)rect(x0,y,x1-x0,top,e[EDGE_T+sx]);
  if(bottom>0)rect(x0,oy+dh,x1-x0,bottom,e[EDGE_B+sx]);
 }
 if(top>0){if(left>0)rect(x,y,left,top,e[EDGE_L]);if(right>0)rect(ox+dw,y,right,top,e[EDGE_R]);}
 if(bottom>0){if(left>0)rect(x,oy+dh,left,bottom,e[EDGE_L+sh-1]);if(right>0)rect(ox+dw,oy+dh,right,bottom,e[EDGE_R+sh-1]);}

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
