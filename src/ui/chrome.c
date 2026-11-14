/* SlopDE 3 window chrome. Original PNG masters plus build-time vector
 * primitives, premultiplied Lanczos filtering at 16/24/32/48/64/96. No
 * runtime asset decoder, no heap, no floating point.
 *
 * Every coordinate used here comes from chrome_geom.h, which the desktop
 * also uses for hit testing, opaque regions and damage extents. */
#include "shell.h"
#include "chrome_geom.h"
#include "../apps.h"
#include "../preferences.h"
#include "../ui_icons.h"
void ui_icon(unsigned id,int x,int y,int s){
 static const int sizes[]={16,24,32,48,64,96};
 if(s<=0)return;
 if(id>=11)id=10;
 unsigned choice=0;while(choice<5&&sizes[choice]<s)choice++;
 if(sizes[choice]==s)rgba_blit(ui_assets[id][choice],s,s,x,y);
 else rgba_scaled(ui_assets[id][choice],sizes[choice],sizes[choice],x,y,s,s);
}
/* "Minimal" preference: no shadows. */
static int minimal(void){return prefs.wallpaper==2&&prefs.light&&prefs.accent==0x87aaba;}
static int hot_part=CHROME_NONE,pressed_part=CHROME_NONE,have_clip;
static struct region chrome_clip;
void ui_chrome_state(int hot,int pressed,struct region clip){hot_part=hot;pressed_part=pressed;chrome_clip=clip;have_clip=1;}
static struct region meet(struct region a,struct region b){
 int x=a.x>b.x?a.x:b.x,y=a.y>b.y?a.y:b.y;
 int r=a.x+a.w<b.x+b.w?a.x+a.w:b.x+b.w,bt=a.y+a.h<b.y+b.h?a.y+a.h:b.y+b.h;
 return (struct region){x,y,r>x?r-x:0,bt>y?bt-y:0};
}
static void clip_to(struct region r){graphics_clip(meet(r,chrome_clip));}
static void soft(int x,int y,uint32_t c,unsigned a){if(a)pixel(x,y,a>=255?c:blend(readpixel(x,y),c,a));}
/* Two-pixel antialiased diagonal for the close glyph. */
static void diagonal(int cx,int cy,int half,int dir,uint32_t c){
 for(int k=-half;k<=half;k++){int px=cx+k,py=cy+k*dir;soft(px,py,c,255);soft(px+1,py,c,110);soft(px,py+dir,c,110);}
}
/* Soft drop shadow drawn only outside the opaque region, inside the
 * documented damage extents (CHROME_EXT_*). */
static void shadow(int x,int y,int w,int h,int r){
 struct chrome_rect o=chrome_opaque(x,y,w,h,0);
 struct region strips[4]={
  {x-CHROME_EXT_L,y-CHROME_EXT_T,w+CHROME_EXT_L+CHROME_EXT_R,o.y-(y-CHROME_EXT_T)},
  {x-CHROME_EXT_L,o.y+o.h,w+CHROME_EXT_L+CHROME_EXT_R,y+h+CHROME_EXT_B-(o.y+o.h)},
  {x-CHROME_EXT_L,o.y,CHROME_EXT_L,o.h},
  {x+w,o.y,CHROME_EXT_R,o.h}};
 uint32_t c=prefs.light?0x1b2430:0x000000;
 for(int s=0;s<4;s++){
  if(strips[s].w<=0||strips[s].h<=0)continue;
  clip_to(strips[s]);
  for(int k=7;k>=1;k--){unsigned a=prefs.light?(unsigned)(8-k)*4:(unsigned)(8-k)*7;
   roundbox(x-k,y-k/2+3,w+2*k,h+k,r+k,c,a);}
 }
 graphics_clip(chrome_clip);
}
void ui_chrome(unsigned id,int x,int y,int w,int h,int focused,int maximized){
 if(!have_clip)chrome_clip=(struct region){0,0,(int)width,(int)height};
 if(w<=2||h<=CHROME_TITLE_H)goto done;
 int light=prefs.light!=0,r=chrome_radius(w,h,maximized);
 uint32_t accent=prefs.accent?prefs.accent:0x4f8cc9;
 /* focused is an interpolated 0..255 emphasis, not a boolean. */
 unsigned emphasis=focused<0?0:focused>255?255:(unsigned)focused;
 uint32_t title=blend(light?0xe8ebef:0x1e232a,light?0xf3f5f8:0x272d36,emphasis);
 uint32_t body=light?0xfafbfc:(id==0?0x10161d:0x171c23);
 uint32_t border=blend(light?0xd2d6dc:0x30363f,light?blend(0xbfc6cf,accent,70):blend(0x3b4450,accent,80),emphasis);
 uint32_t sep=light?0xdde1e6:0x343b45;
 uint32_t ink=blend(light?0x7c8592:0x8a93a0,light?0x1d2530:0xe9edf2,emphasis);
 if(!maximized&&!minimal())shadow(x,y,w,h,r);
 /* Frame: 1px border, then the surface. Corners outside the rounded
  * silhouette are left untouched: the compositor repainted the layers
  * underneath before calling us (they are outside chrome_opaque). */
 roundbox(x,y,w,h,r,border,255);
 roundbox(x+1,y+1,w-2,h-2,r>1?r-1:0,body,255);
 clip_to((struct region){x,y,w,CHROME_TITLE_H-1});
 roundbox(x+1,y+1,w-2,h-2,r>1?r-1:0,title,255);
 graphics_clip(chrome_clip);
 rect(x+1,y+CHROME_TITLE_H-1,w-2,1,sep);
 if(emphasis)rect(x+r+1,y+1,w-2*r-2,1,blend(title,0xffffff,(light?160u:30u)*emphasis/255u));
 /* Controls: flat monochrome glyphs; hover/pressed show a disc. Close
  * turns red on hover so the destructive action is unmistakable. */
 int n=chrome_button_count(w);
 for(int i=0;i<n;i++){
  struct chrome_rect b=chrome_button(i,x,y);int cx=b.x+CHROME_BTN_HIT,cy=b.y+CHROME_BTN_HIT,part=CHROME_CLOSE+i;
  int hot=hot_part==part,down=pressed_part==part;uint32_t g=ink;
  if(hot||down){
   uint32_t face=i==0?(down?0xb83b34:0xe0524a):blend(title,light?0x1d2530:0xffffff,down?60:30);
   roundbox(cx-CHROME_BTN_FACE,cy-CHROME_BTN_FACE,CHROME_BTN_FACE*2+1,CHROME_BTN_FACE*2+1,CHROME_BTN_FACE,face,255);
   if(i==0)g=0xffffff;
  }
  if(i==0){diagonal(cx-1,cy-1,3,1,g);diagonal(cx-1,cy+1,3,-1,g);}
  else if(i==1)rect(cx-4,cy,9,2,g);
  else {rect(cx-4,cy-4,9,2,g);rect(cx-4,cy+4,9,1,g);rect(cx-4,cy-4,1,9,g);rect(cx+4,cy-4,1,9,g);}
 }
 /* Title: icon + name centered in the bar, never overlapping controls,
  * truncated with ".." on narrow windows. Kernel font: 10px advance. */
 {
  const char*name=app_name(id);char label[48];copystr(label,name?name:"Window",sizeof(label));
  int left=x+(n?CHROME_TITLE_X0-(CHROME_BTN_COUNT-n)*CHROME_BTN_STEP:12),right=x+w-12;
  int room=right-left-22,chars=room/10,len=(int)length(label);
  if(chars<1)len=0;
  else if(len>chars){len=chars>2?chars:0;if(len){label[len-2]='.';label[len-1]='.';}label[len]=0;}
  int need=len*10+(len?22:16),tx=x+(w-need)/2;
  if(tx<left)tx=left;
  if(room+22>=16){ui_icon(id,tx,y+(CHROME_TITLE_H-16)/2,16);}
  if(len)text(tx+22,y+(CHROME_TITLE_H-20)/2,label,ink);
 }
 /* Hairline separating client content from the frame. */
 {
  struct chrome_rect c=chrome_client(x,y,w,h);
  if(c.w>0&&c.h>0){rect(c.x-1,c.y+c.h,c.w+2,1,sep);rect(c.x-1,c.y,1,c.h,sep);rect(c.x+c.w,c.y,1,c.h,sep);}
 }
 /* Resize grip dots live in the bottom-right frame padding, matching the
  * CHROME_GRIP_PART hit square. */
 if(!maximized){uint32_t d=light?0xa7afba:0x56606c;rect(x+w-7,y+h-7,2,2,d);rect(x+w-12,y+h-6,2,2,d);rect(x+w-6,y+h-12,2,2,d);}
done:
 hot_part=pressed_part=CHROME_NONE;have_clip=0;
}
