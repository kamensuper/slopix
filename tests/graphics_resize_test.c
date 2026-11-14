/* Host guards for framebuffer restriding and stale dirty/cursor state. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include "../src/graphics.c"
const uint8_t wallpaper_rgb[1280*800*3]={0};
uint32_t width,height,pitch;
static unsigned services;
static void service(void){services++;}
int main(void){
    static const unsigned modes[][2]={{1024,600},{1920,1080},{1280,800},{1024,768},{1600,900},{1024,600}};
    size_t capacity=(MAX_W+4)*MAX_H;
    uint32_t *mem=malloc((capacity+16)*4);assert(mem);
    for(unsigned m=0;m<sizeof(modes)/sizeof(modes[0]);m++){
        for(size_t i=0;i<capacity+16;i++)mem[i]=0xdeadbeef;
        width=modes[m][0];height=modes[m][1];pitch=(width+4)*4;
        graphics_init((volatile uint8_t*)(mem+8),16,8,0);
        damage(0,0,100,100);oldx=1900;oldy=1070;
        services=0;graphics_resize(service);assert(services==(height+31)/32);
        assert(damage_count()==0&&oldx==-100&&oldy==-100);
        pixel((int)width-1,(int)height-1,0xabcdef);
        damage(0,0,(int)width,(int)height);present();
        assert(mem[8+(height-1)*(width+4)+width-1]==0xabcdef);
        for(unsigned y=0;y<height;y++)for(unsigned x=width;x<width+4;x++)assert(mem[8+y*(width+4)+x]==0xdeadbeef);
        for(unsigned i=0;i<8;i++){assert(mem[i]==0xdeadbeef);assert(mem[8+capacity+i]==0xdeadbeef);}
    }
    free(mem);puts("PASS: framebuffer resize/restride guards, maximum size, stale damage/cursor reset and service slices");
}
