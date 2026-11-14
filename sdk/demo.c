/* Actual 3D renderer in Ring 3. Reuses the original kernel demo's meshes,
 * z-buffer and shading. Window/FB ownership is via syscalls, not kernel hooks. */
#include "slopix.h"
#include "demo_shim.h"
#include "font.h"
#define SW 512
#define SH 384
static uint32_t canvas[SW*SH];
uint64_t timer_us(void){return sx_time();}
uint32_t native_color(uint32_t c){return c;}
size_t length(const char*s){size_t n=0;while(s[n])n++;return n;}
void copystr(char*d,const char*s,size_t n){size_t i=0;if(!n)return;while(s[i]&&i<n-1){d[i]=s[i];i++;}d[i]=0;}
void decimal(uint64_t n,char*s){char digits[21];unsigned k=0,j=0;do{digits[k++]=(char)('0'+n%10);n/=10;}while(n);while(k)s[j++]=digits[--k];s[j]=0;}
void logstr(const char*s){while(*s){unsigned n=0;while(s[n]&&n<120)n++;sx_write(s,n);s+=n;}}
void blit(const uint32_t*src,int stride,int x,int y,int w,int h){
 for(int row=0;row<h;row++){
  int yy=y+row;if(yy<0||yy>=SH)continue;
  for(int col=0;col<w;col++){int xx=x+col;if(xx>=0&&xx<SW)canvas[yy*SW+xx]=src[row*stride+col];}
 }
}
static uint32_t blend(uint32_t under,uint32_t top,unsigned alpha){
 unsigned inverse=255-alpha;
 unsigned r=(((under>>16)&255)*inverse+((top>>16)&255)*alpha)/255;
 unsigned g=(((under>>8)&255)*inverse+((top>>8)&255)*alpha)/255;
 unsigned b=((under&255)*inverse+(top&255)*alpha)/255;
 return r<<16|g<<8|b;
}
void text(int x,int y,const char*s,uint32_t color){
 while(*s&&x<SW){unsigned char c=(unsigned char)*s++;if(c<32||c>126)c='?';
  for(int j=0;j<20;j++)for(int i=0;i<10;i++){
   int xx=x+i,yy=y+j;if(xx<0||xx>=SW||yy<0||yy>=SH)continue;
   unsigned alpha=font[c-32][j][i];if(alpha)canvas[yy*SW+xx]=blend(canvas[yy*SW+xx],color,alpha);
  }x+=10;
 }
}
__attribute__((noreturn)) void _start(void){
 unsigned short cs;__asm__ volatile("mov %%cs,%0":"=r"(cs));if((cs&3)!=3)sx_exit(90);
 if(sx_gui_open(SW,SH)<0)sx_exit(10);
 cube_init();uint64_t last=0;int visible=1;
 for(;;){
  uint64_t e;while((e=sx_gui_poll())!=0){
   if(sx_gui_event_type(e)==1){unsigned key=(unsigned)e;if(key>='1'&&key<='4')cube_select(key-'1');}
   else if(sx_gui_event_type(e)==3){visible=!!(e&1);last=0;}
  }
  if(!visible){sx_sleep(50000);continue;}
  uint64_t now=sx_time();if(now-last<16000){sx_sleep(1000);continue;}last=now;
  for(unsigned i=0;i<SW*SH;i++)canvas[i]=0x101b2e;
  uint64_t render_start=sx_time();cube_render(now,SW-48,SH-136);
  cube_draw(0,0,SW,SH);
  if(sx_gui_present(canvas,SW*SH)<0)sx_exit(11);
  cube_presented(sx_time(),sx_time()-render_start,0,0);
  sx_sleep(1000);
 }
}
