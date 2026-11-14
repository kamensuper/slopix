/* Pinboard, panel and context menu. Native pixels; all I/O is debounced and
 * runs on the main thread, never in a paint callback or input IRQ. */
#include "shell.h"
#include "../apps.h"
#include "../preferences.h"
#include "../fs/vfs.h"
#include "../audio/audio.h"
#define PINS 8
_Static_assert(APP_COUNT<=PINS,"pinboard capacity");
struct shell_config {uint32_t magic,version,bytes,generation,autohide,top,x[PINS],y[PINS],style,checksum;};
_Static_assert(sizeof(struct shell_config)==96,"desktop config format");
static struct shell_config cfg;
static int shown=1,hover=-1,pin=-1,drag_pin=-1,grabx,graby,moved,menu,menu_x,menu_y,menu_hover=-1;
static unsigned last_pin=PINS;
static uint64_t last_click,hide_at,save_at,clock_at;
static char clock_text[6]="--:--";
static int pending;
static const char*status="Panel defaults";
extern unsigned desktop_app_state(unsigned id);
static int clamp(int v,int lo,int hi){if(hi<lo)hi=lo;return v<lo?lo:v>hi?hi:v;}
static uint32_t checksum(const struct shell_config*c){const unsigned char*b=(const unsigned char*)c;uint32_t h=2166136261u;for(unsigned i=0;i<sizeof(*c)-4;i++)h=(h^b[i])*16777619u;return h;}
static int valid(const struct shell_config*c){if(c->magic!=0x32454453||c->version!=2||c->bytes!=sizeof(*c)||c->autohide>1||c->top>1||c->style>2||c->checksum!=checksum(c))return 0;for(unsigned i=0;i<PINS;i++)if(c->x[i]>MAX_W||c->y[i]>MAX_H)return 0;return 1;}
static int panel_height(void){return cfg.style==1?60:cfg.style==2?36:48;}
static struct region panel(void){int h=panel_height();return (struct region){0,cfg.top?32:(int)height-h,(int)width,h};}
struct region ui_workarea(void){return(struct region){0,cfg.top?36+panel_height():32,(int)width,(int)height-(cfg.top?40+panel_height():36+panel_height())};}
static struct region icon(unsigned id){struct region a=ui_workarea();return(struct region){clamp((int)cfg.x[id],8,a.w-96),clamp((int)cfg.y[id],a.y+8,a.y+a.h-88),88,84};}
static int inside(int x,int y,struct region r){return x>=r.x&&y>=r.y&&x<r.x+r.w&&y<r.y+r.h;}
static int button_width(void){if(cfg.style==1)return 72;int w=((int)width-152)/APP_COUNT;return w>112?112:w;}
static int item_start(void){return cfg.style==1?((int)width-APP_COUNT*72)/2:52;}
static struct region item(unsigned i){struct region p=panel();return(struct region){item_start()+(int)i*button_width(),p.y+5,button_width()-3,p.h-10};}
void ui_shell_layout_changed(void){char n[21];logstr("PANEL_LAYOUT top=");decimal(cfg.top,n);logstr(n);logstr(" y=");decimal((unsigned)panel().y,n);logstr(n);logstr(" count=");decimal(APP_COUNT,n);logstr(n);logstr(" button=");decimal((unsigned)button_width(),n);logstr(n);logstr(" start=");decimal((unsigned)item_start(),n);logstr(n);logstr(" height=");decimal((unsigned)panel_height(),n);logstr(n);logstr(" style=");decimal(cfg.style,n);logstr(n);logstr("\n");for(unsigned i=0;i<APP_COUNT;i++){struct region b=icon(i);logstr("PIN_LAYOUT id=");decimal(i,n);logstr(n);logstr(" x=");decimal((unsigned)b.x,n);logstr(n);logstr(" y=");decimal((unsigned)b.y,n);logstr(n);logstr("\n");}}
void ui_shell_damage(void){struct region p=panel();damage(p.x,p.y,p.w,p.h);}
static void change(void){pending=1;save_at=timer_us()+1500000;status="Desktop applied; save pending";}
const char*ui_shell_status(void){return status;}
unsigned ui_shell_options(void){return cfg.autohide|(cfg.top<<1)|(cfg.style<<2);}
void ui_shell_configure(unsigned options){cfg.autohide=options&1;cfg.top=(options>>1)&1;cfg.style=(options>>2)%3;shown=1;hover=-1;change();desktop_resized(width,height);damage(0,0,(int)width,(int)height);}
int ui_shell_save(void){
 if(!pending)return 1;
 if(audio_get_status().playing){status="Desktop save waits for playback";return 0;}
 if(!vfs_info().mounted||!vfs_info().writable){pending=0;status="Desktop session only: storage unavailable";return 0;}
 if(cfg.generation==UINT32_MAX){pending=0;status="Desktop generation exhausted";return 0;}
 struct shell_config next=cfg;next.generation++;next.checksum=checksum(&next);const char*name=(next.generation&1)?"DESK1.CFG":"DESK0.CFG";
 if(!vfs_write(name,&next,sizeof(next))){pending=0;status=vfs_error();return 0;}
 struct shell_config read;uint32_t n;if(!vfs_read(name,&read,sizeof(read),&n)||n!=sizeof(read)||!valid(&read)||read.generation!=next.generation){pending=0;status="Desktop settings readback failed";return 0;}
 cfg=next;pending=0;status="Desktop saved to FAT32";logstr("DESKTOP_CONFIG_SAVED\n");return 1;
}
void ui_shell_init(void){
 cfg=(struct shell_config){.magic=0x32454453,.version=2,.bytes=sizeof(cfg)};for(unsigned i=0;i<PINS;i++){cfg.x[i]=20+(i/3)*100;cfg.y[i]=70+(i%3)*96;}
 int found=0;for(unsigned i=0;i<2;i++){struct shell_config c={0};uint32_t n;if(!vfs_read(i?"DESK1.CFG":"DESK0.CFG",&c,sizeof(c),&n))continue;
  if(n==92&&c.version==1&&c.bytes==92){const unsigned char*b=(const unsigned char*)&c;uint32_t h=2166136261u;for(unsigned j=0;j<88;j++)h=(h^b[j])*16777619u;if(c.style!=h)continue;c.style=0;c.version=2;c.bytes=sizeof(c);c.checksum=checksum(&c);}
  else if(n!=sizeof(c))continue;
  if(valid(&c)&&(!found||c.generation>cfg.generation)){cfg=c;found=1;}}

 if(found){status="Desktop settings loaded";logstr("DESKTOP_CONFIG_LOADED\n");}
}
int ui_shell_panel_hit(int x,int y){if(!shown)return -1;for(unsigned i=0;i<APP_COUNT;i++)if(inside(x,y,item(i)))return (int)i;return -1;}
void ui_shell_step(uint64_t now,int x,int y){
 if(now>=clock_at){char date[48],next[6]="--:--";extern int arch_date(char*,unsigned);clock_at=now+1000000;if(arch_date(date,sizeof(date))){for(unsigned j=0;j<5;j++)next[j]=date[15+j];}if(next[0]!=clock_text[0]||next[1]!=clock_text[1]||next[3]!=clock_text[3]||next[4]!=clock_text[4]){copystr(clock_text,next,sizeof(clock_text));ui_shell_damage();}}
 struct region p=panel();int before=shown;
 if(!cfg.autohide||inside(x,y,p)||(cfg.top?y<36:y>=(int)height-4)){shown=1;hide_at=now+600000;}
 else if(now>=hide_at)shown=0;
 int next=ui_shell_panel_hit(x,y);if(next!=hover||before!=shown){hover=next;ui_shell_damage();}
 if(pending&&now>=save_at){if(audio_get_status().playing)status="Desktop save waits for playback";else ui_shell_save();}
}
/* SlopDE 3 panel: flat surface, one hairline toward content, accent used
 * only for the launcher and the active-window indicator. Geometry (panel(),
 * item(), icon()) is unchanged so every hit test stays identical. */
static uint32_t accent(void){return prefs.accent?prefs.accent:0x4f8cc9;}
static uint32_t panel_surface(void){return prefs.light?0xf2f4f7:0x1b2027;}
static uint32_t panel_ink(void){return prefs.light?0x1f2833:0xe6eaef;}
void ui_shell_background(void){
 for(unsigned i=0;i<APP_COUNT;i++){struct region b=icon(i);if((int)i==pin)roundbox(b.x,b.y,b.w,b.h,8,accent(),70);ui_icon(i,b.x+22,b.y+5,36);const char*label=app_name(i);char shortname[9];copystr(shortname,label,sizeof(shortname));int tw=(int)length(shortname)*10+10;if(tw>b.w)tw=b.w;roundbox(b.x+(b.w-tw)/2,b.y+50,tw,23,8,0x111820,170);text(b.x+(b.w-tw)/2+5,b.y+52,shortname,0xf4f6f8);}
 struct region p=panel();uint32_t surface=panel_surface(),line=prefs.light?0xd4d9e0:0x2e353f;
 if(!shown){rect(0,cfg.top?32:(int)height-3,(int)width,3,blend(surface,accent(),90));return;}
 rect(p.x,p.y,p.w,p.h,surface);rect(0,cfg.top?p.y+p.h-1:p.y,(int)width,1,line);
 /* Launcher (opens Find, as before): accent tile with the S mark. */
 roundbox(6,p.y+5,36,p.h-10,8,accent(),255);text(19,p.y+(p.h-20)/2,"S",0xffffff);
 rect(47,p.y+10,1,p.h-20,line);
 const char*labels[]={"Term","3D","DOOM","Find","Setup","Files","Browse","Apps"};
 for(unsigned i=0;i<APP_COUNT;i++){struct region b=item(i);unsigned state=desktop_app_state(i);int hot=hover==(int)i;
  if(hot||state==2)roundbox(b.x,b.y,b.w,b.h,7,blend(surface,prefs.light?0x1f2833:0xffffff,hot?(state==2?40:26):18),255);
  if(state){int iw=state==2?(b.w>40?b.w/2:b.w-8):6;roundbox(b.x+(b.w-iw)/2,b.y+b.h-3,iw,3,1,state==2?accent():(prefs.light?0x8a94a1:0x7d8794),255);}
  int base=cfg.style==1?32:cfg.style==2?20:24;int s=prefs.magnify&&hot?base+6:base;
  int ix=cfg.style==1?b.x+(b.w-s)/2:b.x+7;ui_icon(i,ix,b.y+(b.h-s)/2-(state?1:0),s);
  if(cfg.style!=1){int room=(b.w-40)/10;char t[8];copystr(t,labels[i],sizeof(t));if(room<(int)length(t))t[room<0?0:room]=0;if(t[0])text(b.x+38,b.y+(b.h-20)/2,t,state==2?panel_ink():blend(panel_ink(),surface,70));}}
 /* Status area: volume toggle and clock (Settings), same hit regions. */
 rect((int)width-92,p.y+10,1,p.h-20,line);
 ui_icon(9,(int)width-83,p.y+(p.h-18)/2,18);if(!prefs.volume)rect((int)width-84,p.y+p.h/2,20,2,0xd9473f);text((int)width-60,p.y+(p.h-20)/2,clock_text,panel_ink());
}
static struct region menu_box(void){return(struct region){menu_x,menu_y,224,(APP_COUNT+1)*28+8};}
void ui_shell_overlay(void){if(!menu)return;struct region b=menu_box();uint32_t surface=prefs.light?0xfbfcfd:0x232931,line=prefs.light?0xcfd5dd:0x3a424d;
 for(int k=4;k>=1;k--)roundbox(b.x+k,b.y+k,b.w,b.h,10,0x000000,(unsigned)(5-k)*14);
 roundbox(b.x,b.y,b.w,b.h,10,line,255);roundbox(b.x+1,b.y+1,b.w-2,b.h-2,9,surface,255);
 for(unsigned i=0;i<APP_COUNT+1;i++){int y=b.y+4+(int)i*28;if((int)i==menu_hover)roundbox(b.x+4,y,b.w-8,28,6,blend(surface,accent(),70),255);if(i==APP_COUNT)rect(b.x+10,y-1,b.w-20,1,line);if(i<APP_COUNT)ui_icon(i,b.x+10,y+4,20);text(b.x+(i<APP_COUNT?38:12),y+4,i<APP_COUNT?app_name(i):"Tidy shortcuts",prefs.light?0x1f2833:0xe6eaef);}}
int ui_shell_escape(void){if(menu){struct region b=menu_box();menu=0;damage(b.x,b.y,b.w+5,b.h+5);return 1;}if(pin>=0){struct region b=icon((unsigned)pin);pin=-1;damage(b.x,b.y,b.w,b.h);return 1;}return 0;}
int ui_shell_overlay_open(void){return menu||pin>=0;}
static void menu_activate(int row){ui_shell_escape();if(row>=0&&(unsigned)row<APP_COUNT)desktop_open_app((unsigned)row);else if(row==(int)APP_COUNT){for(unsigned i=0;i<PINS;i++){cfg.x[i]=20+(i/3)*100;cfg.y[i]=70+(i%3)*96;}change();damage(0,32,(int)width,(int)height-32);}}
int ui_shell_key(unsigned key){
 if(menu){if(key==KEY_UP||key==KEY_DOWN){menu_hover=menu_hover<0?0:(menu_hover+(int)APP_COUNT+1+(key==KEY_UP?-1:1))%((int)APP_COUNT+1);struct region b=menu_box();damage(b.x,b.y,b.w+5,b.h+5);}else if(key==KEY_ENTER&&menu_hover>=0)menu_activate(menu_hover);return 1;}
 if(key==KEY_LEFT||key==KEY_UP||key==KEY_RIGHT||key==KEY_DOWN){if(pin>=0){struct region b=icon((unsigned)pin);damage(b.x,b.y,b.w,b.h);}int delta=key==KEY_LEFT||key==KEY_UP?-1:1;pin=pin<0?0:(pin+APP_COUNT+delta)%APP_COUNT;struct region b=icon((unsigned)pin);damage(b.x,b.y,b.w,b.h);return 1;}
 if(key==KEY_ENTER&&pin>=0){desktop_open_app((unsigned)pin);return 1;}return 0;
}
int ui_shell_mouse(int x,int y,int buttons,int old,int background){
 int press=(buttons&1)&&!(old&1);
 if(menu){struct region b=menu_box();int row=inside(x,y,b)&&y>=b.y+4&&y<b.y+b.h-4?(y-b.y-4)/28:-1;if(row<0||row>=(int)APP_COUNT+1)row=-1;if(row!=menu_hover){menu_hover=row;damage(b.x,b.y,b.w+5,b.h+5);}if(press)menu_activate(row);return 1;}
 if(drag_pin>=0){struct region before=icon((unsigned)drag_pin);if(buttons&1){struct region a=ui_workarea();int nx=clamp(x-grabx,8,a.w-96),ny=clamp(y-graby,a.y+8,a.y+a.h-88);if(nx!=(int)cfg.x[drag_pin]||ny!=(int)cfg.y[drag_pin]){cfg.x[drag_pin]=(unsigned)nx;cfg.y[drag_pin]=(unsigned)ny;moved=1;damage(before.x,before.y,before.w,before.h);struct region after=icon((unsigned)drag_pin);damage(after.x,after.y,after.w,after.h);}}else {if(moved){last_pin=PINS;change();logstr("PINBOARD: moved\n");ui_shell_layout_changed();}drag_pin=-1;}return 1;}
 struct region p=panel();if(shown&&inside(x,y,p)){if(press&&x<48){desktop_open_app(3);return 1;}if(press&&x>=(int)width-86&&x<(int)width-62){prefs.volume=prefs.volume?0:65;preferences_changed(0);ui_shell_damage();return 1;}if(press&&x>=(int)width-62){desktop_open_app(4);return 1;}return ui_shell_panel_hit(x,y)<0;}
 if(!background)return 0;
 if((buttons&2)&&!(old&2)){menu=1;menu_x=clamp(x,0,(int)width-229);menu_y=clamp(y,32,(int)height-(int)(APP_COUNT+1)*28-14);menu_hover=-1;logstr("CONTEXT_MENU: opened\n");struct region b=menu_box();damage(b.x,b.y,b.w+5,b.h+5);return 1;}
 if(press){for(unsigned i=0;i<APP_COUNT;i++)if(inside(x,y,icon(i))){if(pin>=0){struct region a=icon((unsigned)pin);damage(a.x,a.y,a.w,a.h);}pin=(int)i;struct region b=icon(i);damage(b.x,b.y,b.w,b.h);uint64_t now=timer_us();if(last_pin==i&&now-last_click<500000){last_pin=PINS;desktop_open_app(i);}else {last_pin=i;last_click=now;drag_pin=(int)i;grabx=x-b.x;graby=y-b.y;moved=0;}return 1;}ui_shell_escape();}
 return 0;
}
