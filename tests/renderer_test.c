/* Host-side invariants supplement (never replace) real QEMU integration tests. */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "../src/cube.c"
uint32_t native_color(uint32_t c){return c;}
uint64_t timer_us(void){return 0;}
void logstr(const char *s){(void)s;}
size_t length(const char *s){return strlen(s);}
void copystr(char *d,const char *s,size_t n){if(n)snprintf(d,n,"%s",s);}
void decimal(uint64_t n,char *s){sprintf(s,"%llu",(unsigned long long)n);}
void blit(const uint32_t *p,int stride,int x,int y,int w,int h){(void)p;(void)stride;(void)x;(void)y;(void)w;(void)h;}
void text(int x,int y,const char *s,uint32_t c){(void)x;(void)y;(void)s;(void)c;}
#define CHECK(x) do {if(!(x)){fprintf(stderr,"Failed: %s\n",#x);exit(1);}}while(0)
int main(void) {
    static uint32_t saved[CW*CH];
    cube_render(2300000,512,324);memcpy(saved,image,sizeof(image));
    for(uint64_t t=0;t<2000000;t+=16667)cube_render(t,512,324);
    cube_render(2300000,512,324);CHECK(!memcmp(saved,image,sizeof(image)));
    cube_render(3100000,512,324);CHECK(memcmp(saved,image,512*324*sizeof(uint32_t)));
    cube_render(UINT64_MAX,640,400);
    for(unsigned m=1;m<4;m++){
        cube_select(m);cube_render(0,512,324);memcpy(saved,image,sizeof(image));
        unsigned filled=0;for(int i=0;i<512*324;i++)if(image[i]!=0x10182b)filled++;
        printf("model %u filled=%u\n",m,filled);CHECK(filled>1000);
        cube_render(3100000,512,324);CHECK(memcmp(saved,image,512*324*sizeof(uint32_t)));
        cube_render(UINT64_MAX,640,400);
    }
    view_w=view_h=32;memset(image,0,sizeof(image));memset(depth,0,sizeof(depth));
    struct projected a={0,0,3000},b={31*16,0,3000},c={0,31*16,3000};
    triangle(a,b,c,0x112233);a.inverse_z=b.inverse_z=c.inverse_z=7000;triangle(a,b,c,0xaabbcc);
    CHECK(image[5*32+5]==0xaabbcc);
    memset(image,0,sizeof(image));memset(depth,0,sizeof(depth));
    triangle(a,b,c,0xaabbcc);a.inverse_z=b.inverse_z=c.inverse_z=3000;triangle(a,b,c,0x112233);
    CHECK(image[5*32+5]==0xaabbcc);
    a.x=-1000;a.y=-1000;b.x=1000;b.y=-1000;c.x=0;c.y=1000;triangle(a,b,c,0x556677);
    puts("PASS: absolute-time rendering survives skipped frames; nearest depth wins in both draw orders; clipped rasterization under ASan/UBSan");
}
