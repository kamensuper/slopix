#include "kernel.h"
#include "ui/desktop_backend.h"
#include "perf.h"
#include "apps.h"
#include "preferences.h"
#include "ui/shell.h"
#include "ui/chrome_geom.h"
#include "ui/winid.h"
#include "ui/anim.h"
#include "brand.h"
#include "display/display.h"
#include "audio/audio.h"
#include "user/process.h"
#include "user/gui.h"
#include "fs/vfs.h"
#define TERM 0
#define DEMO 1
#define DOOM 2
#define BROWSER 6
#define INSTALLED 7
#define APPS APP_COUNT
#define FRAME_US 16667
struct bounds {int x,y,w,h;};
struct window {struct bounds box,saved;int open,maximized,minimized;};
static struct window windows[APPS];
/* Fixed-size focus tracks use timer_us, not frame counts. */
static struct anim_track focus_anim[APPS];
static int focus_value[APPS],focus_from[APPS],focus_to[APPS],focus_target=-2;
static uint64_t focus_frame_at;
enum window_effect { FX_NONE, FX_OPEN, FX_CLOSE, FX_MINIMIZE };
struct window_transition {struct anim_track track;struct anim_rect from,to,last;uint32_t value;int kind;};
static struct window_transition window_fx[APPS];
static uint64_t window_fx_frame_at;
static uint32_t animation_period=ANIM_FRAME_60;
static int right_anchor[APPS],bottom_anchor[APPS];
static int order[APPS],focus=TERM,drag=-1,grabx,graby;
static int chrome_hot_win=-1,chrome_hot=CHROME_NONE,chrome_press_win=-1,chrome_press=CHROME_NONE;
static int mx,my,buttons,hover=-1,cursor_dirty=1,term_cache_dirty=1,cube_active;
static uint64_t next_frame,last_second,cube_render_us;
static int cube_fresh;
static unsigned user_app_pid[APP_COUNT];
static char installed_elf[13];
static int user_browser_missing;
static int user_demo_missing;
void slopde_open_app(unsigned id);
static int spawn_desktop_gui(const char *name){
 int pid=process_spawn(name,0);
 if(pid<=0)return -1;
 if(!gui_authorize((unsigned)pid)){process_kill((unsigned)pid);return -1;}
 return pid;
}
/* Toast notifications: one short message bottom-right above the panel,
 * shown for a few seconds. Used for crashes and launch failures so a
 * window never just vanishes without explanation. */
#define TOAST_US 4500000u
static char toast_text[96];
static uint64_t toast_until;
static struct region toast_rect(void){
 struct region a=ui_workarea();int w=(int)length(toast_text)*10+44,h=44;
 if(w>a.w-24)w=a.w-24;
 return (struct region){a.x+a.w-w-16,a.y+a.h-h-16,w,h};
}
static void toast_damage(void){struct region r=toast_rect();damage(r.x-2,r.y-2,r.w+8,r.h+10);}
static void toast(const char*message){
 if(toast_text[0])toast_damage();
 copystr(toast_text,message,sizeof(toast_text));toast_until=timer_us()+TOAST_US;toast_damage();
}
static void toast_app(int id,const char*what){
 char m[96];copystr(m,app_name((unsigned)id),sizeof(m));copystr(m+length(m)," ",sizeof(m)-length(m));
 copystr(m+length(m),what,sizeof(m)-length(m));toast(m);
}
static void toast_step(uint64_t now){if(toast_text[0]&&now>=toast_until){toast_damage();toast_text[0]=0;}}
static void draw_toast(void){
 struct region r=toast_rect();
 roundbox(r.x+2,r.y+4,r.w,r.h,12,0x000000,50);
 roundbox(r.x,r.y,r.w,r.h,12,prefs.light?0xffffff:0x2b313b,248);
 roundbox(r.x+12,r.y+12,4,r.h-24,2,prefs.accent,255);
 text(r.x+26,r.y+12,toast_text,prefs.light?0x1f2833:0xe6eaef);
}
/* Closing asks the app to save and exit (SX_GUI_EVENT_CLOSE) and only
 * terminates it if it is still running after CLOSE_GRACE_US (B-12). */
#define CLOSE_GRACE_US 1500000u
static uint64_t close_deadline[APP_COUNT];
static void app_close_process(int id){
 if(id<0||id>=APPS||!user_app_pid[id])return;
 unsigned pid=user_app_pid[id];
 if(!close_deadline[id]&&process_alive(pid)&&gui_active(pid)){
  process_resume(pid);gui_send_close(pid);close_deadline[id]=timer_us()+CLOSE_GRACE_US;
  logstr("GENESIS_CLOSE: close requested\n");return;
 }
 if(close_deadline[id]&&timer_us()<close_deadline[id]&&process_alive(pid))return;
 if(process_alive(pid)){process_kill(pid);logstr("GENESIS_CLOSE: userspace process terminated\n");}
 else logstr("GENESIS_CLOSE: userspace process exited\n");
 user_app_pid[id]=0;close_deadline[id]=0;
}
static void app_minimize_process(int id){
 if(id>=0&&id<APPS&&user_app_pid[id]){gui_send_visibility(user_app_pid[id],0);process_suspend(user_app_pid[id]);}
}
static void app_restore_process(int id){
 if(id>=0&&id<APPS&&user_app_pid[id]){gui_send_visibility(user_app_pid[id],1);process_resume(user_app_pid[id]);}
}
static int resizing=-1;
/* Last client size reported to each app (type-5 event), keyed by PID. */
static unsigned sent_pid[APP_COUNT],sent_w[APP_COUNT],sent_h[APP_COUNT];
static void sync_client_size(int id){
 if(id<0||id>=APPS||!user_app_pid[id]||!windows[id].open||id==resizing)return;
 /* Same client rectangle gui_draw/gui_client_pointer use (SlopDE 3 chrome). */
 struct chrome_rect cr=chrome_client(0,0,windows[id].box.w,windows[id].box.h);
 int cw=cr.w,ch=cr.h;if(cw<1||ch<1)return;
 if(sent_pid[id]==user_app_pid[id]&&sent_w[id]==(unsigned)cw&&sent_h[id]==(unsigned)ch)return;
 if(gui_send_resize(user_app_pid[id],(unsigned)cw,(unsigned)ch)){sent_pid[id]=user_app_pid[id];sent_w[id]=(unsigned)cw;sent_h[id]=(unsigned)ch;}
}
static void dock_layout(void){ui_shell_layout_changed();}

static struct region overlap(struct region a,struct region b);
static int min(int a,int b){return a<b?a:b;}
static int window_hit(int x,int y,int id){struct bounds b=windows[id].box;return chrome_hit(x,y,b.x,b.y,b.w,b.h,windows[id].maximized)!=CHROME_NONE;}
static struct region as_region(struct chrome_rect r){return (struct region){r.x,r.y,r.w,r.h};}
static int contains(struct bounds a,struct bounds b){return b.x>=a.x&&b.y>=a.y&&b.x+b.w<=a.x+a.w&&b.y+b.h<=a.y+a.h;}
static struct bounds cube_area(void) {
    struct bounds b=windows[DEMO].box;int w=min(640,b.w-48),h=min(400,b.h-136);
    return (struct bounds){b.x+(b.w-w)/2,b.y+54,w,h+76};
}
static void invalidate(int id){struct bounds b=windows[id].box;struct chrome_rect e=chrome_extent(b.x,b.y,b.w,b.h);damage(e.x,e.y,e.w,e.h);}
/* Callers pass validated ids only; see ui/winid.h. */
static void invalidate_title(int id){struct bounds b=windows[id].box;damage(b.x,b.y,b.w,CHROME_TITLE_H);}
static struct anim_rect fx_extent(struct anim_rect r){
 struct chrome_rect e=chrome_extent(r.x,r.y,r.w,r.h);return(struct anim_rect){e.x,e.y,e.w,e.h};
}
static void fx_damage(struct anim_rect r){struct anim_rect e=fx_extent(r);damage(e.x,e.y,e.w,e.h);}
static struct anim_rect fx_now(struct window_transition *f,uint64_t now){return anim_rect_lerp(f->from,f->to,anim_value(&f->track,now));}
static void fx_cancel(int id){
 struct window_transition *f=&window_fx[id];if(anim_running(&f->track))fx_damage(f->last);
 anim_cancel(&f->track);f->kind=FX_NONE;
}
static void fx_start(int id,int kind,uint64_t now){
 struct window_transition *f=&window_fx[id];fx_cancel(id);
 struct bounds b=windows[id].box;f->from=(struct anim_rect){b.x,b.y,b.w,b.h};f->to=f->from;
 if(kind==FX_CLOSE)f->to=anim_rect_settle(f->from);
 if(kind==FX_MINIMIZE){struct region r=ui_shell_item_rect((unsigned)id);f->to=(struct anim_rect){r.x,r.y,r.w,r.h};}
 f->last=f->from;f->value=0;f->kind=kind;anim_start(&f->track,now,kind==FX_OPEN?180000:kind==FX_CLOSE?130000:190000,ANIM_EASE_OUT_CUBIC);
 window_fx_frame_at=0;fx_damage(f->last);
}
static void fx_step(uint64_t now){
 if(now<window_fx_frame_at)return;
 int active=0;
 for(int i=0;i<APPS;i++){
  struct window_transition *f=&window_fx[i];if(!anim_running(&f->track))continue;
  f->value=anim_value(&f->track,now);struct anim_rect next=fx_now(f,now);fx_damage(f->last);fx_damage(next);f->last=next;
  if(anim_step(&f->track,now)==ANIM_DONE)f->kind=FX_NONE;
  else active=1;
 }
 if(active)window_fx_frame_at=now+animation_period;
}
static void focus_step(uint64_t now){
 if(focus!=focus_target){
  for(int i=0;i<APPS;i++){
   if(anim_running(&focus_anim[i]))focus_value[i]=anim_lerp(focus_from[i],focus_to[i],anim_value(&focus_anim[i],now));
   focus_from[i]=focus_value[i];focus_to[i]=i==focus?255:0;
   if(focus_from[i]!=focus_to[i]&&windows[i].open)anim_start(&focus_anim[i],now,120000,ANIM_SMOOTHSTEP);
   else {anim_cancel(&focus_anim[i]);focus_value[i]=focus_to[i];}
  }
  focus_target=focus;ui_shell_set_focus(focus);focus_frame_at=0;
 }
 if(now<focus_frame_at)return;
 int active=0;
 for(int i=0;i<APPS;i++)if(anim_running(&focus_anim[i])){
  int next=anim_lerp(focus_from[i],focus_to[i],anim_value(&focus_anim[i],now));
  if(next!=focus_value[i]){focus_value[i]=next;if(windows[i].open)invalidate(i);}
  anim_step(&focus_anim[i],now);if(anim_running(&focus_anim[i]))active=1;
 }
 if(active)focus_frame_at=now+ANIM_FRAME_60;
}
static int top_window_at(int x,int y){for(int i=APPS-1;i>=0;i--){int id=order[i];if(windows[id].open&&window_hit(x,y,id))return id;}return -1;}
static enum chrome_part part_of(int id,int x,int y){struct bounds b=windows[id].box;return chrome_hit(x,y,b.x,b.y,b.w,b.h,windows[id].maximized);}
static void event(int id,const char *s){logstr(id==TERM?"WINDOW: ":id==DEMO?"DEMO: ":id==DOOM?"DOOM: ":id==3?"FIND: ":id==4?"SETTINGS: ":"FILES: ");logstr(s);logstr("\n");}
static void dock_damage(void){ui_shell_damage();}
static void front(int id) {
    drag=resizing=-1;
    if(focus>=0)invalidate(focus);
    /* Stop stale held-game keys when another window takes keyboard focus. */
    if(focus==DOOM&&id!=DOOM&&user_app_pid[DOOM])gui_send_visibility(user_app_pid[DOOM],0);
    focus=id;
    if(focus==DOOM&&user_app_pid[DOOM])gui_send_visibility(user_app_pid[DOOM],1);
    int at=0;for(int i=0;i<APPS;i++)if(order[i]!=id)order[at++]=order[i];order[APPS-1]=id;
    term_cache_dirty=1;invalidate(id);
}
static void anchor(int id){
    struct bounds b=windows[id].saved;
    struct region a=ui_workarea();right_anchor[id]=b.x>a.x+(a.w-b.w)/2;
    bottom_anchor[id]=b.y>a.y+(a.h-b.h)/2;
}
static struct bounds fit(struct bounds b){
    struct region a=ui_workarea();if(b.w>a.w)b.w=a.w;if(b.h>a.h)b.h=a.h;
    if(b.x+b.w>a.x+a.w)b.x=a.x+a.w-b.w;
    if(b.y+b.h>a.y+a.h)b.y=a.y+a.h-b.h;
    if(b.x<a.x)b.x=a.x;
    if(b.y<a.y)b.y=a.y;
    return b;
}
static struct bounds work_bounds(int mode){struct region a=ui_workarea();if(mode==2)a.w/=2;else if(mode==3){int half=a.w/2;a.x+=half;a.w-=half;}return(struct bounds){a.x,a.y,a.w,a.h};}
static void tile(int id,int side){
 if(!slopde_win_valid(id,APPS)||!windows[id].open)return;
 struct bounds b=work_bounds(side);const struct application_info*info=app_info((unsigned)id);int minimum=(int)info->min_w;
 if(b.w<minimum){logstr("TILE: insufficient width; normal geometry retained\n");return;}
 invalidate(id);windows[id].box=b;windows[id].maximized=side;term_cache_dirty=1;next_frame=0;invalidate(id);event(id,side==2?"tiled-left":"tiled-right");
}
static void backdrop(void){
    for(int y=0;y<32;y++)for(unsigned x=0;x<width;x++)pixel((int)x,y,blend(readpixel((int)x,y),0xdce1d4,240));
    rgba_blit(slopix_logo,28,28,10,1);
    text(48,5,"Slopix",0x24263c);text(151,5,"SlopDE 3",0x52536b);
    char n[21],label[48];decimal(width,n);copystr(label,n,sizeof(label));copystr(label+length(label),"x",sizeof(label)-length(label));
    decimal(height,n);copystr(label+length(label),n,sizeof(label)-length(label));copystr(label+length(label),display_available()?" F12":" fixed",sizeof(label)-length(label));
    text((int)width-400,5,label,0x52536b);
    text((int)width-310,(int)height-37,"Slopix 1.0 Genesis",0xa3acc7);
    background_save();
}
static void maximize(int id) {
    if(!slopde_win_valid(id,APPS)||!windows[id].open)return;
    struct window *w=&windows[id];invalidate(id);
    if(!w->maximized){w->box=work_bounds(1);w->maximized=1;event(id,"maximized");}
    else {w->box=fit(w->saved);w->maximized=0;event(id,"restored");}
    if(id==TERM)term_cache_dirty=1;
    else if(id==DEMO){next_frame=0;cube_reset_stats(timer_us());}
    drag=resizing=-1;invalidate(id);dock_damage();
}
void slopde_init(void) {
    ui_shell_init();for(int i=0;i<APPS;i++){order[i]=i;focus_value[i]=i==focus?255:0;}
    focus_target=focus;ui_shell_set_focus(focus);
    windows[TERM]=(struct window){{60,155,720,460},{0,0,0,0},1,0,0};
    if(height<700)windows[TERM].box=(struct bounds){40,65,720,420};
#ifdef RENDER_BENCH
    windows[TERM].box=(struct bounds){240,150,800,460};
#endif
    windows[DEMO]=(struct window){{(int)width-620,115,560,460},{0,0,0,0},0,0,0};
    if(height<700){windows[DEMO].box.y=65;windows[DEMO].box.h=420;}
    windows[DOOM]=(struct window){{(int)width-730,80,680,510},{0,0,0,0},0,0,0};
    if(height<700){windows[DOOM].box.y=32;windows[DOOM].box.h=(int)height-137;}
    windows[3]=(struct window){{100,70,620,460},{0},0,0,0};
    windows[4]=(struct window){{140,80,620,470},{0},0,0,0};
    windows[5]=(struct window){{190,100,640,480},{0},0,0,0};
    windows[BROWSER]=(struct window){{(int)width-690,115,600,410},{0},0,0,0};
    windows[INSTALLED]=(struct window){{110,115,610,430},{0},0,0,0};
    user_demo_missing=0;mx=(int)width/2;my=(int)height/2;dock_layout();
    for(int i=0;i<APPS;i++){windows[i].saved=windows[i].box;anchor(i);windows[i].box=fit(windows[i].box);}
    backdrop();damage(0,0,(int)width,(int)height);
}
void slopde_resized(unsigned oldw,unsigned oldh){
    drag=-1;resizing=-1;hover=-1;
    for(int i=0;i<APPS;i++)fx_cancel(i);
    for(int i=0;i<APPS;i++){
        struct window *w=&windows[i];
        if(right_anchor[i])w->saved.x+=(int)width-(int)oldw;
        if(bottom_anchor[i])w->saved.y+=(int)height-(int)oldh;
        w->box=w->maximized?work_bounds(w->maximized):fit(w->saved);
        char n[21];const char *names[]={"id="," x="," y="," w="," h="," max="," open="};
        unsigned values[]={(unsigned)i,(unsigned)w->box.x,(unsigned)w->box.y,(unsigned)w->box.w,(unsigned)w->box.h,(unsigned)w->maximized,(unsigned)w->open};
        logstr("DISPLAY_LAYOUT ");for(unsigned k=0;k<7;k++){logstr(names[k]);decimal(values[k],n);logstr(n);}logstr("\n");
    }
    input_display_resize(&mx,&my);dock_layout();term_cache_dirty=1;cursor_dirty=1;
    cube_active=0;next_frame=0;cube_reset_stats(timer_us());backdrop();damage(0,0,(int)width,(int)height);
}
static int dock_hit(int x,int y){return ui_shell_panel_hit(x,y);}
static void dock_animate(uint64_t now){ui_shell_step(now,mx,my);}
static void dock(void){ui_shell_background();}
static void draw_window(int id,struct region damaged) {
    struct window *w=&windows[id];struct window_transition *f=&window_fx[id];
    if(!w->open){
        if(anim_running(&f->track)&&(f->kind==FX_CLOSE||f->kind==FX_MINIMIZE)){
            struct anim_rect r=f->last;
            unsigned alpha=(unsigned)anim_lerp(190,0,f->value);
            graphics_clip(damaged);
            roundbox(r.x,r.y,r.w,r.h,10,prefs.light?0xc7cdd5:0x3b4450,alpha);
            if(r.w>2&&r.h>2)roundbox(r.x+1,r.y+1,r.w-2,r.h-2,9,prefs.light?0xf3f5f8:0x272d36,alpha);
        }
        return;
    }
    struct bounds b=w->box;
    struct chrome_rect e=chrome_extent(b.x,b.y,b.w,b.h);
    if(e.x>=damaged.x+damaged.w||e.y>=damaged.y+damaged.h||e.x+e.w<=damaged.x||e.y+e.h<=damaged.y)return;
    int x=b.x,y=b.y;
    ui_chrome_state(id==chrome_hot_win?chrome_hot:CHROME_NONE,id==chrome_press_win?chrome_press:CHROME_NONE,damaged);
    ui_chrome((unsigned)id,x,y,b.w,b.h,focus_value[id],w->maximized);
    struct chrome_rect cr=chrome_client(x,y,b.w,b.h);
    struct region client=overlap(damaged,as_region(cr));
    graphics_clip(client);
    if(user_app_pid[id])gui_draw(user_app_pid[id],cr.x,cr.y,cr.w,cr.h);
    else {
        text(x+22,y+83,"Ring-3 application unavailable",prefs.light?0x40515c:0xc0d9df);
        text(x+22,y+111,"Install required ELF on FAT32",prefs.light?0x416979:0x92cbd9);
    }
    graphics_clip(damaged);
    /* A restrained wash fades in the real, correctly sized client. Input
     * geometry stays unchanged and dragging never follows an eased pointer. */
    if(f->kind==FX_OPEN&&anim_running(&f->track)){
        unsigned alpha=(unsigned)anim_lerp(110,0,f->value);
        roundbox(b.x,b.y,b.w,b.h,chrome_radius(b.w,b.h,w->maximized),prefs.light?0xf2f4f7:0x1b2027,alpha);
    }
}
static struct region overlap(struct region a,struct region b){int x=a.x>b.x?a.x:b.x,y=a.y>b.y?a.y:b.y;int right=min(a.x+a.w,b.x+b.w),bottom=min(a.y+a.h,b.y+b.h);return(struct region){x,y,right>x?right-x:0,bottom>y?bottom-y:0};}
static void compose_layer(int layer,struct region r){
 if(r.w<=0||r.h<=0)return;
 if(layer<0){graphics_clip(r);background_restore_region(r);char n[21],stamp[48]="up ";decimal(timer_us()/1000000,n);copystr(stamp+3,n,45);copystr(stamp+length(stamp),"s",48-length(stamp));text((int)width-210,5,stamp,0x52536b);dock();return;}
 int id=order[layer];struct bounds b=windows[id].box;
 if(!windows[id].open){
  compose_layer(layer-1,r);
  if(anim_running(&window_fx[id].track))draw_window(id,r);
  return;
 }
 struct region opaque=as_region(chrome_opaque(b.x,b.y,b.w,b.h,windows[id].maximized));
 struct region cut=overlap(r,opaque);
 if(cut.w&&cut.h){
  compose_layer(layer-1,(struct region){r.x,r.y,r.w,cut.y-r.y});
  compose_layer(layer-1,(struct region){r.x,cut.y+cut.h,r.w,r.y+r.h-cut.y-cut.h});
  compose_layer(layer-1,(struct region){r.x,cut.y,cut.x-r.x,cut.h});
  compose_layer(layer-1,(struct region){cut.x+cut.w,cut.y,r.x+r.w-cut.x-cut.w,cut.h});
 }else compose_layer(layer-1,r);
 graphics_clip(r);draw_window(id,r);audio_step(timer_us());
}
void slopde_render(void) {
 uint64_t begin=timer_us();audio_step(timer_us());
 for(unsigned i=0;i<damage_count();i++)compose_layer(APPS-1,damage_get(i));
 for(unsigned i=0;i<damage_count();i++){graphics_clip(damage_get(i));ui_shell_overlay();}
 if(toast_text[0])for(unsigned i=0;i<damage_count();i++){graphics_clip(damage_get(i));draw_toast();}
 uint64_t composed=timer_us();perf_add(P_COMPOSE,composed-begin);present();cursor_present(mx,my);cursor_dirty=0;
 uint64_t done=timer_us();perf_add(P_UPLOAD,done-composed);
 animation_period=anim_pace(animation_period,done-begin);
 if(cube_fresh){perf_frame(1,done);cube_presented(done,cube_render_us,composed-begin,done-composed);cube_fresh=0;}
 graphics_reset_clip();
}
void slopde_step(uint64_t now) {
    /* desktop_service calls this only after authentication unlocks. Do not
     * start user applications during the setup/login phase. */
    static int term_start_attempted;
    if(!term_start_attempted){
        term_start_attempted=1;
        int pid=spawn_desktop_gui("TERM.ELF");
        if(pid>0){user_app_pid[TERM]=(unsigned)pid;logstr("TERM_RING3_LAUNCHED\n");invalidate(TERM);}
        else logstr("TERM_RING3_MISSING: launch disabled until ELF installed\n");
    }
    const char*before=preferences_status();preferences_step(now);if(before!=preferences_status()&&windows[4].open)invalidate(4);
    if(scene_dirty){scene_dirty=0;term_cache_dirty=1;if(windows[TERM].open)invalidate(TERM);}
    if(now/1000000!=last_second){last_second=now/1000000;damage((int)width-212,0,212,32);}
    const char*shell_status=ui_shell_status();dock_animate(now);if(shell_status!=ui_shell_status()&&windows[4].open)invalidate(4);
    /* CP06: DOOM is scheduled only as its private Ring-3 process. */
    audio_step(timer_us());
    for(unsigned i=0;i<APPS;i++)if(user_app_pid[i]){
        /* Any path that closes a window must also terminate its owner.
         * A minimized window is explicitly suspended instead. */
        if(!windows[i].open&&!windows[i].minimized){app_close_process((int)i);continue;}
        if(!process_alive(user_app_pid[i])){
            invalidate((int)i);windows[i].open=0;windows[i].minimized=0;
            {int crashed=0;unsigned fault=0;if(process_exit_info(user_app_pid[i],&crashed,&fault)&&crashed)toast_app((int)i,"quit unexpectedly");}
            close_deadline[i]=0;
            user_app_pid[i]=0;dock_damage();event((int)i,"userspace-process-exited");
        }else{
            sync_client_size((int)i);
            if(gui_take_dirty(user_app_pid[i])&&windows[i].open)invalidate((int)i);
        }
    }
    struct bounds area=cube_area();
    int visible=0; /* Never schedule the obsolete Ring-0 3D renderer. */
    int above=0;for(int j=0;j<APPS;j++){int id=order[j];if(id==DEMO){above=1;continue;}if(above&&windows[id].open&&contains(windows[id].box,area))visible=0;}
    if(visible&&!cube_active){cube_reset_stats(now);next_frame=0;}
    cube_active=visible;if(!visible)perf_pause(1);
    toast_step(now);
    fx_step(now);
    focus_step(now);
    if(damage_pending())slopde_render();
    else if(cursor_dirty){cursor_present(mx,my);cursor_dirty=0;}
}
void slopde_key(unsigned key) {
    if(key==1001){display_cycle();return;}
    if(key==1000){maximize(focus);return;}
    if(focus<0&&ui_shell_key(key))return;
    if(focus>=0&&focus<APPS&&windows[focus].open&&user_app_pid[focus]){
        gui_send_key(user_app_pid[focus],key);return;
    }
    /* Closed/missing user apps have no privileged input handlers. */

}
static void slopde_mouse_inner(int x,int y,int current) {
    int oldbuttons=buttons;mx=x;my=y;buttons=current;cursor_dirty=1;
    int over=dock_hit(x,y);if(hover!=over){hover=over;dock_damage();}
    {int hw=top_window_at(x,y),hp=hw>=0?(int)part_of(hw,x,y):CHROME_NONE;
     if(hp<CHROME_CLOSE||hp>CHROME_MAXIMIZE){hw=-1;hp=CHROME_NONE;}
     if(hw!=chrome_hot_win||hp!=chrome_hot){if(slopde_win_valid(chrome_hot_win,APPS))invalidate_title(chrome_hot_win);chrome_hot_win=hw;chrome_hot=hp;if(slopde_win_valid(hw,APPS))invalidate_title(hw);}}
    /* Window controls activate on release over the same control, so the
     * pressed state is visible and a press can be cancelled by moving off. */
    if(chrome_press_win>=0&&!(current&1)&&(oldbuttons&1)){
        /* The pressed slot holds -1 or an id stored by the hit-tested press
         * path below. Take it through the single validation point so every
         * later windows[id] access is dominated by the range check. */
        int part=chrome_press;chrome_press=CHROME_NONE;
        int id=slopde_slot_take(&chrome_press_win,APPS);
        if(!slopde_win_valid(id,APPS))return;
        invalidate_title(id);
        if(windows[id].open&&top_window_at(x,y)==id&&(int)part_of(id,x,y)==part){
            if(part==CHROME_MAXIMIZE)maximize(id);
            else {
                int minimized=part==CHROME_MINIMIZE;if(!minimized&&!app_allow_close((unsigned)id)){invalidate(id);return;}
                fx_start(id,minimized?FX_MINIMIZE:FX_CLOSE,timer_us());
                if(minimized)app_minimize_process(id);else app_close_process(id);
                windows[id].open=0;windows[id].minimized=minimized;drag=resizing=-1;event(id,minimized?"minimized":"closed");invalidate(id);dock_damage();
                focus=-1;
                for(int j=APPS-1;j>=0;j--)if(windows[order[j]].open){focus=order[j];break;}
                if(focus>=0)invalidate(focus);
                term_cache_dirty=1;chrome_hot_win=-1;chrome_hot=CHROME_NONE;
            }
        }
        return;
    }
    if(chrome_press_win>=0&&(current&1)){
        int pw=chrome_press_win;
        if(!slopde_win_valid(pw,APPS)){chrome_press_win=-1;chrome_press=CHROME_NONE;return;}
        int still=windows[pw].open&&top_window_at(x,y)==pw&&(int)part_of(pw,x,y)==chrome_press;
        if(still!=(chrome_hot_win==pw&&chrome_hot==chrome_press)){invalidate_title(pw);}
        return;
    }
    int covered=0;for(int i=0;i<APPS;i++)if(windows[i].open&&window_hit(x,y,i))covered=1;
    struct region work=ui_workarea();int background=!covered&&over<0&&y>=work.y&&y<work.y+work.h;
    if(background&&((current&3)&~oldbuttons)){if(focus>=0)invalidate(focus);focus=-1;term_cache_dirty=1;}
    if(ui_shell_mouse(x,y,current,oldbuttons,background))return;
    if((current&2)&&!(oldbuttons&2)){for(int i=APPS-1;i>=0;i--){int id=order[i];if(windows[id].open&&window_hit(x,y,id)){front(id);struct bounds b=windows[id].box;apps_context((unsigned)id,x-b.x,y-b.y,b.w,b.h);invalidate(id);break;}}return;}

    if((buttons&1)&&!(oldbuttons&1)) {
        if(y<32&&x>=(int)width-400&&x<(int)width-215){display_cycle();return;}
        int id=-1;
        for(int i=APPS-1;i>=0;i--)if(windows[order[i]].open&&window_hit(x,y,order[i])){id=order[i];break;}
        if(slopde_win_valid(id,APPS)) {
            front(id);struct bounds b=windows[id].box;
            enum chrome_part part=chrome_hit(x,y,b.x,b.y,b.w,b.h,windows[id].maximized);
            if(part==CHROME_CLOSE||part==CHROME_MINIMIZE||part==CHROME_MAXIMIZE){chrome_press_win=id;chrome_press=(int)part;drag=resizing=-1;invalidate_title(id);}
            else if(part==CHROME_GRIP_PART){resizing=id;grabx=mx;graby=my;}
            else if(id==DEMO&&y>=cube_area().y+cube_area().h-23&&x>=cube_area().x&&x<cube_area().x+440){slopde_key((unsigned)('1'+(x-cube_area().x)/110));}
            else if(user_app_pid[id]&&part==CHROME_CLIENT){
                struct chrome_rect cr=chrome_client(b.x,b.y,b.w,b.h);int lx=x-cr.x,ly=y-cr.y;
                /* Delivered with real button state by forward_pointer(). */
                (void)lx;(void)ly;
            }
            else if(id>=3&&id<6&&part==CHROME_CLIENT){invalidate(id);}
            else if(part==CHROME_TITLE&&!windows[id].maximized){drag=id;grabx=x-b.x;graby=y-b.y;event(id,"drag-start");}
        }else if(over>=0) {
            slopde_open_app((unsigned)over);
        }else {
            if(focus>=0)invalidate(focus);
            focus=-1;term_cache_dirty=1;
        }
    }
    if(resizing>=0&&(buttons&1)){
        struct window*w=&windows[resizing];invalidate(resizing);int nw=w->box.w+mx-grabx,nh=w->box.h+my-graby;
        const struct application_info*info=app_info((unsigned)resizing);int minw=(int)info->min_w,minh=(int)info->min_h;
        w->box.w=nw<minw?minw:nw;w->box.h=nh<minh?minh:nh;w->box=fit(w->box);w->saved=w->box;anchor(resizing);grabx=mx;graby=my;
        term_cache_dirty=1;next_frame=0;invalidate(resizing);
    }
    if(resizing>=0&&!(buttons&1)){event(resizing,"resized");resizing=-1;}
    if(drag>=0&&(buttons&1)) {
        struct bounds *b=&windows[drag].box;invalidate(drag);b->x=mx-grabx;b->y=my-graby;
        *b=fit(*b);
        windows[drag].saved=*b;anchor(drag);invalidate(drag);
    }
    if(drag>=0&&!(buttons&1)) {
        event(drag,"drag-end");char n[21];logstr(drag==TERM?"POSITION: ":drag==DEMO?"DEMO_POSITION: ":"DOOM_POSITION: ");
        decimal((unsigned)windows[drag].box.x,n);logstr(n);logstr(",");decimal((unsigned)windows[drag].box.y,n);logstr(n);logstr("\n");int id=drag;drag=-1;if(mx<10)tile(id,2);else if(mx>=(int)width-10)tile(id,3);else if(my<=ui_workarea().y+6)maximize(id);
    }
}

/* Pointer protocol for Ring-3 apps (fixes SlopUI buttons never firing).
 * Every move, press and release over the focused window's client area is
 * forwarded with the real button mask. A press in the client gives that
 * window pointer capture: until all buttons are released it keeps receiving
 * events, clamped to its surface, even if the pointer leaves the window.
 * Without capture, held buttons are reported as 0 so a drag that started on
 * the desktop or on window chrome can never look like a press to an app. */
static int pointer_capture=-1;
static void forward_pointer(int x,int y,int current,int oldbuttons){
 if(drag>=0||resizing>=0){pointer_capture=-1;return;}
 int id=-1,clamp=0;
 if(slopde_win_valid(pointer_capture,APPS)&&windows[pointer_capture].open&&user_app_pid[pointer_capture]){id=pointer_capture;clamp=1;}
 else{
  pointer_capture=-1;
  int top=top_window_at(x,y);
  if(slopde_win_valid(top,APPS)&&top==focus&&user_app_pid[top]){
   struct bounds b=windows[top].box;
   if(chrome_hit(x,y,b.x,b.y,b.w,b.h,windows[top].maximized)==CHROME_CLIENT)id=top;
  }
 }
 if(id<0)return;
 unsigned press_edge=(unsigned)(current&~oldbuttons)&7u;
 unsigned report=clamp?(unsigned)current&7u:press_edge?(unsigned)current&7u:0u;
 struct bounds b=windows[id].box;struct chrome_rect cr=chrome_client(b.x,b.y,b.w,b.h);
 int delivered=gui_client_pointer(user_app_pid[id],x-cr.x,y-cr.y,cr.w,cr.h,report,clamp);
 if(delivered&&press_edge)pointer_capture=id;
 if(!(current&7))pointer_capture=-1;
}
void slopde_mouse(int x,int y,int current){
 int oldbuttons=buttons;
 slopde_mouse_inner(x,y,current);
 forward_pointer(x,y,current,oldbuttons);
}

void slopde_scancode(unsigned code,int ext,int down){
 if(focus!=DOOM||!windows[DOOM].open)return;
 if(user_app_pid[DOOM])gui_send_scancode(user_app_pid[DOOM],code,ext,down);

}

void slopde_open_app(unsigned id){
 if(id>=APPS)return;
 /* Reopening during a close grace period starts a fresh instance. */
 if(close_deadline[id]&&user_app_pid[id]){process_kill(user_app_pid[id]);user_app_pid[id]=0;close_deadline[id]=0;}
 static const char *const elf_names[APP_COUNT]={"TERM.ELF",0,0,"FIND.ELF","SET.ELF","FILES.ELF",0,0};
 if(elf_names[id]&&!user_app_pid[id]){
  int pid=spawn_desktop_gui(elf_names[id]);
  if(pid>0){user_app_pid[id]=(unsigned)pid;logstr("GENESIS_CP05_RING3_LAUNCHED\n");}
  else {toast_app((int)id,"could not start");logstr("GENESIS_CP05_RING3_LOAD_FAILED\n");}
 }

 if(id==DOOM && !user_app_pid[DOOM]){
 uint32_t bytes=0;int directory=0;
 if(vfs_stat("DOOM.ELF",&bytes,&directory)&&!directory&&vfs_stat("FREEDOM.WAD",&bytes,&directory)&&!directory){
  int pid=spawn_desktop_gui("DOOM.ELF");
  if(pid>0){user_app_pid[DOOM]=(unsigned)pid;logstr("DOOM_RING3_LAUNCHED\n");}
  else logstr("DOOM_RING3_START_FAILED: no Ring-0 fallback\n");
 }else logstr("DOOM_RING3_MISSING: install DOOM.ELF and FREEDOM.WAD\n");
}
 if(id==BROWSER && !user_app_pid[BROWSER]){
     uint32_t bytes=0;int directory=0;
     if(vfs_stat("BROWSE.ELF",&bytes,&directory)&&!directory){
         int pid=spawn_desktop_gui("BROWSE.ELF");
         if(pid>0){user_app_pid[BROWSER]=(unsigned)pid;user_browser_missing=0;logstr("BROWSE_RING3_LAUNCHED\n");}
         else user_browser_missing=1;
     }else user_browser_missing=1;
 }
 if(id==DEMO && !user_app_pid[DEMO]){
     uint32_t bytes=0;int directory=0;
     if(vfs_stat("DEMO.ELF",&bytes,&directory)&&!directory){
         int pid=spawn_desktop_gui("DEMO.ELF");
         if(pid<=0){user_demo_missing=1;logstr("DEMO_USER_LOAD_FAILED\n");}
         if(pid>0){user_app_pid[DEMO]=(unsigned)pid;user_demo_missing=0;logstr("DEMO_RING3_LAUNCHED\n");}
     }else {user_demo_missing=1;logstr("DEMO_RING3_MISSING: install DEMO.SLP\n");}
 }
 int was_hidden=!windows[id].open;
 if(was_hidden)fx_start((int)id,FX_OPEN,timer_us());
 windows[id].open=1;windows[id].minimized=0;app_restore_process((int)id);front((int)id);dock_damage();
 /* Only the process-owning Ring-3 ELF may implement the application. */
 app_opened(id);event((int)id,"opened-from-launcher");
}
/* A package-launched executable gets its own Ring-3 PID, owned compositor
 * surface and close lifecycle; no package name is wired into kernel UI code. */
int slopde_launch_installed(const char *path){
 if(!path||!path[0])return 0;
 if(user_app_pid[INSTALLED]&&process_alive(user_app_pid[INSTALLED]))return 0;
 int pid=spawn_desktop_gui(path);
 if(pid<=0)return 0;
 user_app_pid[INSTALLED]=(unsigned)pid;
 copystr(installed_elf,path,sizeof(installed_elf));
 slopde_open_app(INSTALLED);
 return 1;
}
unsigned slopde_app_state(unsigned id){return id<APPS?(windows[id].open?1:windows[id].minimized?2:0):0;}
unsigned slopde_open_count(void){unsigned n=0;for(unsigned i=0;i<APPS;i++)n+=!!(windows[i].open||windows[i].minimized);return n;}
static int cycle_active,cycle_index,cycle_order[APPS];
void slopde_shortcut(unsigned action){
 if(action==4&&focus<0&&ui_shell_escape())return;
 if(action==6||action==7){tile(focus,action==6?2:3);return;}
 if(action==1){if(!cycle_active){for(int i=0;i<APPS;i++)cycle_order[i]=order[i];cycle_index=APPS-1;cycle_active=1;}for(int j=0;j<APPS;j++){cycle_index=(cycle_index+APPS-1)%APPS;if(windows[cycle_order[cycle_index]].open||windows[cycle_order[cycle_index]].minimized){int id=cycle_order[cycle_index];if(!windows[id].open)fx_start(id,FX_OPEN,timer_us());windows[id].open=1;windows[id].minimized=0;app_restore_process(id);front(id);dock_damage();break;}}}
 else if(action==5)cycle_active=0;
 else if(action==3)slopde_open_app(3);
 else if((action==2||(action==4&&focus==3))&&focus>=0&&focus<APPS){int id=focus;if(!app_allow_close((unsigned)id)){invalidate(id);return;}fx_start(id,FX_CLOSE,timer_us());app_close_process(id);drag=resizing=-1;windows[id].open=0;windows[id].minimized=0;invalidate(id);event(id,"closed");focus=-1;for(int i=APPS-1;i>=0;i--)if(windows[order[i]].open){front(order[i]);break;}dock_damage();}
}
static void background_service(void){audio_step(timer_us());}
void slopde_background_changed(void){graphics_resize(background_service);backdrop();term_cache_dirty=1;damage(0,0,(int)width,(int)height);}

int slopde_find_focused(void){return focus==3||(focus<0&&ui_shell_overlay_open());}
int slopde_doom_focused(void){return focus==DOOM;}

const struct desktop_backend slopde_backend={
 .name="SlopDE 3",.init=slopde_init,.render=slopde_render,.step=slopde_step,
 .mouse=slopde_mouse,.key=slopde_key,.shortcut=slopde_shortcut,
 .resized=slopde_resized,.background_changed=slopde_background_changed,
 .scancode=slopde_scancode,.open_app=slopde_open_app,.open_count=slopde_open_count,
 .app_state=slopde_app_state,.wants_escape=slopde_find_focused,.game_focused=slopde_doom_focused};
