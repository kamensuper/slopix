#include <stdio.h>
#include <stdlib.h>
#include "../src/graphics.c"
const uint8_t wallpaper_rgb[1280*800*3]={0};
uint32_t width=128,height=96,pitch=(128+3)*4;
static uint32_t framebuffer[8+(128+3)*96+8];
#define CHECK(x) do{if(!(x)){fprintf(stderr,"Failed: %s\n",#x);exit(1);}}while(0)
int main(void) {
    for(unsigned i=0;i<sizeof(framebuffer)/sizeof(framebuffer[0]);i++)framebuffer[i]=0x12345678;
    graphics_init((volatile uint8_t *)(framebuffer+8),16,8,0);background_save();
    damage(4,5,11,9);graphics_clip((struct region){4,5,11,9});rect(-40,-40,300,200,0xabcdef);present();
    for(unsigned y=0;y<height;y++)for(unsigned x=0;x<131;x++) {
        int inside=x>=4&&x<15&&y>=5&&y<14;
        CHECK(framebuffer[8+y*131+x]==(inside?0xabcdef:0x12345678));
    }
    for(unsigned i=0;i<8;i++){CHECK(framebuffer[i]==0x12345678);CHECK(framebuffer[8+131*96+i]==0x12345678);}
    graphics_clip((struct region){5000,5000,20,20});rect(-100,-100,10000,10000,0xffffff);
    roundbox(-100,-100,1000,1000,20,0xffffff,255);text(-200,-200,"clipped",0xffffff);
    background_restore_region((struct region){5000,0,20,50});
    graphics_reset_clip();damage(-4,-4,8,8);damage(2,2,12,12);
    CHECK(damage_count()==1);struct region r=damage_get(0);CHECK(r.x==0&&r.y==0&&r.w==14&&r.h==14);present();
    graphics_init((volatile uint8_t *)(framebuffer+8),0,8,16);rect(0,0,1,1,0x112233);damage(0,0,1,1);present();
    CHECK(framebuffer[8]==0x332211);
    graphics_reset_clip();rect(0,0,5,5,0x204060);
    const uint8_t icon[]={255,0,0,128,0,255,0,0,10,20,30,255,0,0,255,255};
    graphics_clip((struct region){0,0,1,1});rgba_blit(icon,2,2,0,0);
    CHECK(readpixel(0,0)==blend(0x204060,0xff0000,128));
    CHECK(readpixel(1,0)==0x204060&&readpixel(0,1)==0x204060);
    graphics_reset_clip();rgba_blit(icon,2,2,0,0);
    CHECK(readpixel(1,0)==0x204060&&readpixel(0,1)==0x0a141e);
    const uint32_t sprite[]={0x112233,0x445566,0x778899,0xaabbcc};
    graphics_reset_clip();rect(0,0,10,10,0x102030);graphics_clip((struct region){2,2,2,2});
    scaled_blit(sprite,2,2,1,1,4,4);
    CHECK(readpixel(1,1)==0x102030);CHECK(readpixel(2,2)==0x332211);
    CHECK(readpixel(3,3)==0xccbbaa);CHECK(readpixel(4,4)==0x102030);
    graphics_reset_clip();rect(0,0,10,10,0x204060);graphics_clip((struct region){2,2,2,2});
    rgba_scaled(icon,2,2,1,1,4,4);
    CHECK(readpixel(2,2)==blend(0x204060,0xff0000,128));CHECK(readpixel(3,2)==0x204060);
    CHECK(readpixel(2,3)==0x0a141e);CHECK(readpixel(4,4)==0x204060);
    puts("PASS: dirty-only upload, pitch/padding/guard integrity, empty/offscreen clipping, damage union and alternate channel packing under ASan/UBSan");
}
