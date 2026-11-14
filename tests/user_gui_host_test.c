#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include "../src/user/gui.h"
static unsigned allocations,frees,draws;
static int draw_x,draw_y,draw_w,draw_h;
void *heap_alloc(size_t n){allocations++;return malloc(n);}
int heap_free(void*p){frees++;free(p);return 1;}
uint32_t native_color(uint32_t n){return n^0x00555555u;}
void logstr(const char*s){(void)s;}
int graphics_standard(void){return 0;}
void slopix_mask_copy(uint32_t*d,const uint32_t*s,size_t n){for(size_t i=0;i<n;i++)d[i]=s[i];}
void rect(int x,int y,int w,int h,uint32_t c){(void)x;(void)y;(void)w;(void)h;(void)c;}
void text(int x,int y,const char*s,uint32_t c){(void)x;(void)y;(void)s;(void)c;}
void scaled_blit(const uint32_t*src,int sw,int sh,int x,int y,int w,int h){
 assert(sw==64&&sh==64&&w>0&&h>0);
 assert(src[0]==native_color(0xff00aa)||src[0]==native_color(0x00aaff));
 draw_x=x;draw_y=y;draw_w=w;draw_h=h;draws++;
}
int main(void){
 assert(gui_open(0,64,64)<0);assert(gui_open(100,64,64)<0);
 assert(gui_authorize(100)&&gui_authorize(200));assert(gui_open(100,63,64)<0);
 assert(gui_open(100,64,64)>0);assert(gui_open(100,64,64)<0);
 assert(gui_open(200,64,64)>0);
 assert(gui_active(100)&&gui_active(200));
 assert(gui_take_dirty(100)==1&&gui_take_dirty(200)==1);
 assert(!gui_take_dirty(100));
 uint32_t *data=malloc(4096*4);assert(data);
 for(unsigned i=0;i<4096;i++)data[i]=0xff00aa;
 assert(gui_present(200,data,4095)<0);
 assert(gui_present(100,data,4096)==4096);
 assert(gui_take_dirty(100)&&!gui_take_dirty(200));
 gui_draw(100,0,0,64,64);assert(draws==1);
 assert(draw_x==0&&draw_y==0&&draw_w==64&&draw_h==64);
 gui_draw(100,100,50,100,100);assert(draws==2);
 assert(draw_x==100&&draw_y==50&&draw_w==100&&draw_h==100);
 gui_draw(100,100,50,100,50);assert(draws==3);
 assert(draw_x==125&&draw_y==50&&draw_w==50&&draw_h==50);
 gui_draw(100,100,50,50,100);assert(draws==4);
 assert(draw_x==100&&draw_y==75&&draw_w==50&&draw_h==50);
 assert(gui_client_mouse(100,50,25,100,50,1));
 assert(gui_poll(100)==((2ULL<<32)|(1ULL<<24)|(32ULL<<12)|32u));
 assert(!gui_client_mouse(100,10,25,100,50,1));
 assert(gui_client_mouse(100,25,50,50,100,1));
 assert(gui_poll(100)==((2ULL<<32)|(1ULL<<24)|(32ULL<<12)|32u));
 assert(!gui_client_mouse(100,25,10,50,100,1));
 assert(gui_poll(100)==0);
 for(unsigned i=0;i<4096;i++)data[i]=0x00aaff;
 assert(gui_present(200,data,4096)==4096);
 gui_draw(200,0,0,64,64);assert(draws==5);
 gui_send_key(100,'1');gui_send_key(200,'2');
 gui_send_mouse(100,25,40,1);gui_send_mouse(200,15,20,1);
 gui_send_mouse(100,65,20,1); /* Out-of-bounds click is dropped. */
 assert(gui_poll(200)==((1ULL<<32)|'2'));
 assert(gui_poll(100)==((1ULL<<32)|'1'));
 assert(gui_poll(100)==((2ULL<<32)|(1ULL<<24)|(40ULL<<12)|25ULL));
 assert(gui_poll(200)==((2ULL<<32)|(1ULL<<24)|(20ULL<<12)|15ULL));
 assert(gui_poll(100)==0&&gui_poll(200)==0);
 gui_send_mouse(100,12,42,1);
 gui_send_visibility(100,0);
 gui_send_mouse(200,10,20,1);
 assert(gui_poll(100)==((2ULL<<32)|(1ULL<<24)|(42ULL<<12)|12u));
 assert(gui_poll(100)==(3ULL<<32));
 assert(gui_poll(200)==((2ULL<<32)|(1ULL<<24)|(20ULL<<12)|10u));
 gui_send_mouse(100,9999,9999,1);
 assert(gui_poll(100)==0);
 gui_process_exit(100);assert(!gui_active(100)&&gui_active(200));
 assert(gui_authorize(101));assert(gui_open(101,64,64)>0);assert(gui_active(101));
 gui_process_exit(101);gui_process_exit(200);
 assert(allocations==3&&frees==3);
 for(unsigned i=0;i<GUI_SURFACE_CAP;i++){assert(gui_authorize(i+1));assert(gui_open(i+1,64,64)==1);}
 assert(!gui_authorize(99));assert(gui_open(99,64,64)<0);
 for(unsigned i=0;i<GUI_SURFACE_CAP;i++)gui_process_exit(i+1);
 assert(allocations==3+GUI_SURFACE_CAP&&frees==3+GUI_SURFACE_CAP);
 free(data);puts("PASS: isolated multi-process GUI ownership/events/close/reopen/capacity");return 0;
}
