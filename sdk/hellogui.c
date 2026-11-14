/* Independent Ring-3 SDK example: no application-specific kernel changes. */
#include "slopix.h"
#include "font.h"
#define W 320u
#define H 200u
static uint32_t canvas[W*H];
static void fill(unsigned x,unsigned y,unsigned w,unsigned h,uint32_t c){
 for(unsigned j=y;j<y+h&&j<H;j++)for(unsigned i=x;i<x+w&&i<W;i++)canvas[j*W+i]=c;
}
static void title(unsigned x,unsigned y,const char*s,uint32_t c){
 for(;*s&&x+10<W;s++,x+=10){unsigned k=(unsigned char)*s;if(k<32||k>126)k='?';
  for(unsigned j=0;j<20;j++)for(unsigned i=0;i<10;i++)if(y+j<H&&font[k-32][j][i]>100)canvas[(y+j)*W+x+i]=c;
 }
}
__attribute__((noreturn)) void _start(void){
 unsigned short cs;__asm__ volatile("mov %%cs,%0":"=r"(cs));if((cs&3)!=3)sx_exit(91);
 if(sx_gui_open(W,H)<0)sx_exit(1);
 fill(0,0,W,H,0x112c3d);fill(10,10,W-20,H-20,0x244a59);
 fill(19,16,W-38,40,0x4ca8a2);title(27,24,"HELLO, GENESIS!",0xffffff);
 title(27,81,"Ring-3 GUI package",0xf2eac9);title(27,115,"Press Q to quit",0xa5e3df);
 sx_gui_present(canvas,W*H);
 for(;;){uint64_t e=sx_gui_poll();if((e>>32)==1&&((unsigned)e=='q'||(unsigned)e=='Q'))sx_exit(0);sx_sleep(16000);}
}
