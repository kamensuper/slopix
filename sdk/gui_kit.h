#ifndef SLOPIX_GUI_KIT_H
#define SLOPIX_GUI_KIT_H
#include "slopix.h"
#include "font.h"
#define GW 512u
#define GH 320u
static uint32_t gpx[GW*GH];
static inline void gf(unsigned x,unsigned y,unsigned w,unsigned h,uint32_t color){
 for(unsigned yy=y;yy<y+h&&yy<GH;yy++)for(unsigned xx=x;xx<x+w&&xx<GW;xx++)gpx[yy*GW+xx]=color;
}
static inline void gt(unsigned x,unsigned y,const char*s,uint32_t color){
 while(*s&&x+10<GW){unsigned char c=(unsigned char)*s++;if(c<32||c>126)c='?';
  for(unsigned j=0;j<20;j++)for(unsigned k=0;k<10;k++)if(x+k<GW&&y+j<GH){unsigned a=font[c-32][j][k];if(a){uint32_t old=gpx[(y+j)*GW+x+k];unsigned v=255-a;
    gpx[(y+j)*GW+x+k]=((((((old>>16)&255)*v+((color>>16)&255)*a)/255)<<16)|(((((old>>8)&255)*v+((color>>8)&255)*a)/255)<<8)|(((old&255)*v+(color&255)*a)/255));}}x+=10;
 }
}
static inline unsigned gs(const char*s){unsigned n=0;while(s[n])n++;return n;}
static inline void gc(char*dst,const char*src,unsigned size){unsigned i=0;if(!size)return;while(src[i]&&i+1<size){dst[i]=src[i];i++;}dst[i]=0;}
static inline int ge(const char*a,const char*b){while(*a&&*a==*b){a++;b++;}return *a==*b;}
static inline void gu(char*s){while(*s){if(*s>='a'&&*s<='z')*s-=32;s++;}}
static inline void gd(char*out,unsigned n){char rev[16];unsigned i=0,j=0;do{rev[i++]=(char)('0'+n%10);n/=10;}while(n&&i<16);while(i)out[j++]=rev[--i];out[j]=0;}
static inline void gbase(const char*name){gf(0,0,GW,GH,0xf3f5f3);gf(0,0,GW,36,0x244256);gt(12,7,name,0xffffff);gf(0,GH-24,GW,24,0xd6e5e9);}
static inline void gp(void){sx_gui_present(gpx,GW*GH);}
static inline void gbutton(unsigned x,unsigned y,unsigned w,const char*s,int sel){gf(x,y,w,29,sel?0x91cecc:0xe2e9ea);gt(x+8,y+4,s,0x233d50);}
#endif
