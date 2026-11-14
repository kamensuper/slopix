/* Exercise the desktop's real transition state and damage scheduling. */
#include <stdio.h>
#include "../src/desktop.c"
static int failures,damages;
#define CHECK(c) do{if(!(c)){printf("FAIL %s:%d %s\n",__FILE__,__LINE__,#c);failures++;}}while(0)
void damage(int x,int y,int w,int h){(void)x;(void)y;CHECK(w>0&&h>0);damages++;}
struct region ui_shell_item_rect(unsigned id){(void)id;return(struct region){50,700,80,38};}
int main(void){
 const int id=2;
 windows[id].box=(struct bounds){100,120,400,300};
 fx_start(id,FX_MINIMIZE,1000);
 CHECK(window_fx[id].kind==FX_MINIMIZE&&anim_running(&window_fx[id].track));
 CHECK(window_fx[id].last.x==100&&window_fx[id].to.x==50);
 fx_step(96000);CHECK(window_fx[id].last.x<100&&window_fx[id].last.y>120);CHECK(damages>=3);
 fx_step(191001);CHECK(window_fx[id].kind==FX_NONE&&!anim_running(&window_fx[id].track));
 fx_start(id,FX_CLOSE,200000);fx_step(240000);CHECK(window_fx[id].last.w<400);
 fx_start(id,FX_OPEN,250000);CHECK(window_fx[id].kind==FX_OPEN&&window_fx[id].last.w==400);
 fx_step(440001);CHECK(window_fx[id].kind==FX_NONE&&!anim_running(&window_fx[id].track));
 fx_start(id,FX_CLOSE,500000);fx_cancel(id);CHECK(window_fx[id].kind==FX_NONE&&!anim_running(&window_fx[id].track));
 if(failures)return 1;puts("slopde-transition-test: ok");return 0;
}
