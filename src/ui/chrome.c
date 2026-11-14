/* Original PNG masters plus build-time vector primitives, premultiplied
 * Lanczos filtering at 16/24/32/48/64/96. No runtime asset decoder. */
#include "shell.h"
#include "../apps.h"
#include "../preferences.h"
#include "../ui_icons.h"
static void line(int x,int y,int xx,int yy,uint32_t c){int dx=xx>x?xx-x:x-xx,sx=x<xx?1:-1,dy=yy>y?y-yy:yy-y,sy=y<yy?1:-1,e=dx+dy;for(;;){pixel(x,y,c);if(x==xx&&y==yy)break;int q=2*e;if(q>=dy){e+=dy;x+=sx;}if(q<=dx){e+=dx;y+=sy;}}}
void ui_icon(unsigned id,int x,int y,int s){
 static const int sizes[]={16,24,32,48,64,96};
 if(s<=0)return;
 if(id>=11)id=10;
 unsigned choice=0;while(choice<5&&sizes[choice]<s)choice++;
 if(sizes[choice]==s)rgba_blit(ui_assets[id][choice],s,s,x,y);
 else rgba_scaled(ui_assets[id][choice],sizes[choice],sizes[choice],x,y,s,s);
}
/* Opaque glass-like gradients keep repainting deterministic and inexpensive. */
static int minimal(void){return prefs.wallpaper==2&&prefs.light&&prefs.accent==0x87aaba;}
static void gradient(int x,int y,int w,int h,uint32_t top,uint32_t bottom){if(minimal()){rect(x,y,w,h,bottom);return;}for(int r=0;r<h;r++)rect(x,y+r,w,1,blend(top,bottom,(unsigned)r*255/(h?h:1)));}
void ui_chrome(unsigned id,int x,int y,int w,int h,int focused,int maximized){
 uint32_t frame=prefs.light?0xdce8ed:0x314956,ink=0x183646;
 if(!maximized&&!minimal()){for(int r=0;r<6;r++){unsigned a=(unsigned)(6-r)*18;roundbox(x+3,y+h+r,w,1,0,0x071c2b,a);roundbox(x+w+r,y+6,1,h-3,0,0x071c2b,a);}}
 rect(x,y+32,w,h-32,id==0?(prefs.light?0xf5f7f4:0x1e2a33):id>=3?(prefs.light?0xf5f7f4:0x202e37):0x101b25);
 rect(x,y+32,2,h-32,focused?0x5a9ab8:frame);rect(x+w-2,y+32,2,h-32,0x557482);rect(x,y+h-2,w,2,0x557482);
 gradient(x,y+29,w,14,prefs.light?0xeaf2f4:0x536e7d,frame);
 rect(x,y+30,w,1,prefs.light?0xffffff:0x7c9daa);
 /* Native Haiku tab geometry and hit targets are unchanged. */
 int tab=w<330?w:330;
 uint32_t top=focused?blend(prefs.accent,0xffffff,135):0xd9e4e6;
 uint32_t bottom=focused?blend(prefs.accent,0x527686,58):0x9aaeb7;
 gradient(x,y,tab,31,top,bottom);rect(x+1,y+1,tab-2,1,0xf7fcfa);rect(x,y,1,31,0x728e9b);rect(x+tab-1,y+1,1,30,0x466878);
 rect(x+2,y+3,tab-4,9,blend(top,0xffffff,55));
 for(int i=0;i<3;i++){int bx=x+15+i*22;uint32_t bt=i==0?0xffd3bb:0xf5f9ee,bb=i==0?0xe58f73:0xc4d8db;rect(bx,y+13,16,16,0x577683);gradient(bx+1,y+14,14,14,focused?bt:0xe9efea,focused?bb:0xb5c7c9);rect(bx+2,y+15,12,1,0xffffff);}
 line(x+19,y+17,x+27,y+25,ink);line(x+27,y+17,x+19,y+25,ink);rect(x+41,y+24,9,2,ink);rect(x+62,y+17,10,9,ink);rect(x+64,y+19,6,5,0xe6f0ec);
 ui_icon(id,x+85,y+8,20);text(x+113,y+8,app_name(id),blend(top,0xffffff,180));text(x+112,y+7,app_name(id),ink);
}
