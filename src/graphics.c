#include "kernel.h"
#include "font.h"
extern uint32_t preferences_pixel(unsigned,unsigned) __attribute__((weak));
#define DAMAGE_MAX 24
typedef uint64_t unaligned64 __attribute__((aligned(1),may_alias));
static uint32_t canvas[MAX_W*MAX_H],background[MAX_W*MAX_H];
static uint32_t *target=canvas;
static int target_w,target_h;
static volatile uint8_t *video;
static uint8_t rp,gp,bp;
static int standard,oldx=-100,oldy=-100;
static struct region clip,regions[DAMAGE_MAX];
static unsigned region_count;
static int min(int a,int b){return a<b?a:b;}
static int max(int a,int b){return a>b?a:b;}
static struct region intersect(struct region a,struct region b) {
    int x=max(a.x,b.x),y=max(a.y,b.y),right=min(a.x+a.w,b.x+b.w),bottom=min(a.y+a.h,b.y+b.h);
    return (struct region){x,y,max(0,right-x),max(0,bottom-y)};
}
uint32_t native_color(uint32_t c) {return standard?c:(((c>>16)&255)<<rp|((c>>8)&255)<<gp|(c&255)<<bp);}
static uint32_t logical(uint32_t c) {return standard?c:(((c>>rp)&255)<<16|((c>>gp)&255)<<8|((c>>bp)&255));}
static void words(uint32_t *dst,const uint32_t *src,int n) {
    /* Bulk copy through the SSE2 primitive: 16 bytes per move for n >= 16. */
    if(n>0)memcpy(dst,src,(size_t)n*sizeof(uint32_t));
}
/* True when the framebuffer word order is already 0x00RRGGBB, so a surface can
 * be presented without per-pixel channel swizzling. */
int graphics_standard(void){return standard;}
uint32_t blend(uint32_t a,uint32_t b,unsigned t) {
    unsigned r=(((a>>16)&255)*(255-t)+((b>>16)&255)*t)/255;
    unsigned g=(((a>>8)&255)*(255-t)+((b>>8)&255)*t)/255;
    unsigned bl=((a&255)*(255-t)+(b&255)*t)/255;return r<<16|g<<8|bl;
}
void graphics_reset_clip(void){clip=(struct region){0,0,target_w,target_h};}
void graphics_target(uint32_t *buffer,int w,int h){target=buffer?buffer:canvas;target_w=w;target_h=h;graphics_reset_clip();}
void graphics_clip(struct region r){clip=intersect(r,(struct region){0,0,target_w,target_h});}
void pixel(int x,int y,uint32_t c) {
    if(x>=clip.x&&y>=clip.y&&x<clip.x+clip.w&&y<clip.y+clip.h)target[(size_t)y*target_w+x]=native_color(c);
}
uint32_t readpixel(int x,int y) {
    if(x<0||y<0||x>=target_w||y>=target_h)return 0;
    return logical(target[(size_t)y*target_w+x]);
}
void rect(int x,int y,int w,int h,uint32_t c) {
    struct region r=intersect((struct region){x,y,w,h},clip);if(!r.w||!r.h)return;uint32_t v=native_color(c);
    for(int j=r.y;j<r.y+r.h;j++) {
        uint32_t *d=target+(size_t)j*target_w+r.x;
        for(int i=0;i<r.w;i++)d[i]=v;
    }
}
void roundbox(int x,int y,int w,int h,int radius,uint32_t c,unsigned alpha) {
    struct region r=intersect((struct region){x,y,w,h},clip);if(!r.w||!r.h)return;uint32_t v=native_color(c);
    if(radius>w/2)radius=w/2;
    if(radius>h/2)radius=h/2;
    for(int py=r.y;py<r.y+r.h;py++) {
        int yy=py-y,dy=yy<radius?radius-1-yy:(yy>=h-radius?yy-(h-radius):0),inset=0;
        if(dy)while(inset<radius&&(radius-1-inset)*(radius-1-inset)+dy*dy>radius*radius)inset++;
        int left=max(r.x,x+inset),right=min(r.x+r.w,x+w-inset);
        uint32_t *d=target+(size_t)py*target_w;
        if(alpha==255){for(int px=left;px<right;px++)d[px]=v;}
        else for(int px=left;px<right;px++)d[px]=native_color(blend(logical(d[px]),c,alpha));
    }
}
void text(int x,int y,const char *s,uint32_t c) {
    int top=max(0,clip.y-y),bottom=min(20,clip.y+clip.h-y);
    if(top>=bottom)return;
    while(*s&&x<clip.x+clip.w) {
        unsigned ch=(unsigned char)*s++;if(ch<32||ch>126)ch='?';
        int left=max(0,clip.x-x),right=min(10,clip.x+clip.w-x);
        for(int j=top;j<bottom;j++)for(int i=left;i<right;i++) {
            unsigned a=font[ch-32][j][i];if(!a)continue;
            uint32_t *d=target+(size_t)(y+j)*target_w+x+i;
            *d=native_color(a==255?c:blend(logical(*d),c,a));
        }
        x+=10;
    }
}
void disc(int x,int y,int radius,uint32_t c) {
    int top=max(-radius,clip.y-y),bottom=min(radius,clip.y+clip.h-1-y);
    for(int j=top;j<=bottom;j++)for(int i=max(-radius,clip.x-x);i<=min(radius,clip.x+clip.w-1-x);i++)
        if(i*i+j*j<=radius*radius)pixel(x+i,y+j,c);
}
void blit(const uint32_t *source,int stride,int x,int y,int w,int h) {
    struct region r=intersect((struct region){x,y,w,h},clip);if(!r.w||!r.h)return;
    for(int py=r.y;py<r.y+r.h;py++)words(target+(size_t)py*target_w+r.x,source+(size_t)(py-y)*stride+r.x-x,r.w);
}
/* Input is straight (unpremultiplied) RGBA8. Filtering premultiplication is
 * performed offline and undone before embedding; blend exactly once here. */
void rgba_blit(const uint8_t *source,int w,int h,int x,int y) {
    struct region r=intersect((struct region){x,y,w,h},clip);if(!r.w||!r.h)return;
    for(int py=r.y;py<r.y+r.h;py++)for(int px=r.x;px<r.x+r.w;px++) {
        const uint8_t *s=source+((size_t)(py-y)*w+px-x)*4;
        unsigned alpha=s[3];if(!alpha)continue;
        uint32_t color=(uint32_t)s[0]<<16|(uint32_t)s[1]<<8|s[2];
        uint32_t *d=target+(size_t)py*target_w+px;
        *d=native_color(alpha==255?color:blend(logical(*d),color,alpha));
    }
}
static void wallpaper(void (*service)(void)) {
    extern const uint8_t wallpaper_rgb[];
    for(unsigned y=0;y<height;y++){
        if(service&&!(y&31))service();
        for(unsigned x=0;x<width;x++){
        size_t at=((size_t)(y*800/height)*1280+x*1280/width)*3;
        pixel((int)x,(int)y,preferences_pixel?preferences_pixel(x,y):((uint32_t)wallpaper_rgb[at]<<16|(uint32_t)wallpaper_rgb[at+1]<<8|wallpaper_rgb[at+2]));
    }
    }
}
void graphics_resize(void (*service)(void)){
    region_count=0;oldx=oldy=-100;graphics_target(0,(int)width,(int)height);wallpaper(service);
}

void graphics_init(volatile uint8_t *addr,uint8_t r,uint8_t g,uint8_t b) {
    video=addr;rp=r;gp=g;bp=b;standard=r==16&&g==8&&b==0;graphics_target(0,(int)width,(int)height);wallpaper(0);
}
void background_save(void){for(size_t i=0;i<(size_t)width*height;i++)background[i]=canvas[i];}
void background_restore_region(struct region r) {
    r=intersect(r,(struct region){0,0,(int)width,(int)height});
    if(!r.w||!r.h)return;
    for(int y=r.y;y<r.y+r.h;y++)words(canvas+(size_t)y*width+r.x,background+(size_t)y*width+r.x,r.w);
}
void background_restore(void){background_restore_region((struct region){0,0,(int)width,(int)height});}
void damage(int x,int y,int w,int h) {
    struct region r=intersect((struct region){x,y,w,h},(struct region){0,0,(int)width,(int)height});
    if(!r.w||!r.h)return;
    for(unsigned i=0;i<region_count;) {
        struct region a=regions[i];
        if(r.x<=a.x+a.w&&a.x<=r.x+r.w&&r.y<=a.y+a.h&&a.y<=r.y+r.h) {
            int right=max(r.x+r.w,a.x+a.w),bottom=max(r.y+r.h,a.y+a.h);
            r.x=min(r.x,a.x);r.y=min(r.y,a.y);r.w=right-r.x;r.h=bottom-r.y;
            regions[i]=regions[--region_count];i=0;
        }else i++;
    }
    if(region_count==DAMAGE_MAX){region_count=0;r=(struct region){0,0,(int)width,(int)height};}
    regions[region_count++]=r;
}
int damage_pending(void){return region_count!=0;}
unsigned damage_count(void){return region_count;}
struct region damage_get(unsigned i){return regions[i];}
static void upload(struct region r) {
    if(!r.w||!r.h)return;
    for(int y=r.y;y<r.y+r.h;y++) {
        const uint32_t *s=canvas+(size_t)y*width+r.x;
        volatile uint32_t *d=(volatile uint32_t *)(video+(size_t)y*pitch)+(unsigned)r.x;
        int x=0;
        for(;x+1<r.w;x+=2) {
            uint64_t v=(uint64_t)s[x]|((uint64_t)s[x+1]<<32);
            *(volatile unaligned64 *)(void *)(d+x)=v;
        }
        if(x<r.w)d[x]=s[x];
    }
}
void present(void){for(unsigned i=0;i<region_count;i++)upload(regions[i]);region_count=0;}
static void screenpixel(int x,int y,uint32_t c) {
    if(x>=0&&y>=0&&(unsigned)x<width&&(unsigned)y<height)
        *(volatile uint32_t *)(video+(size_t)y*pitch+(size_t)x*4)=native_color(c);
}
void cursor_present(int x,int y) {
    struct region r=intersect((struct region){oldx,oldy,17,23},(struct region){0,0,(int)width,(int)height});
    upload(r);
    static const char *shape[]={"X","XX","XOX","XOOX","XOOOX","XOOOOX","XOOOOOX","XOOOOOOX","XOOOOOOOX","XOOOOOOOOX","XOOOOOOOOOX","XOOOOOOOOOOX","XOOOOOOXXXXX","XOOOXOOX","XOOX XOOX","XOX  XOOX","XX    XOOX","X     XOOX","       XX"};
    for(unsigned j=0;j<sizeof(shape)/sizeof(shape[0]);j++)for(unsigned i=0;shape[j][i];i++)
        if(shape[j][i]!=' ')screenpixel(x+(int)i,y+(int)j,shape[j][i]=='X'?0x101525:0xf8f9fc);
    oldx=x;oldy=y;
}
/* Nearest sampling preserves the pixel art in DOOM. Destination clipping keeps
 * work proportional to the damaged intersection, including partially covered
 * windows. Source dimensions are trusted fixed app/asset buffer dimensions. */
void scaled_blit(const uint32_t *source,int sw,int sh,int x,int y,int w,int h){
 if(sw<1||sh<1||w<1||h<1)return;
 struct region r=intersect((struct region){x,y,w,h},clip);
 if(!r.w||!r.h)return;
 /* Pre-expand one source row and copy duplicate destination rows in bulk.
  * Exactly r.w divisions per call instead of r.w*r.h; no new frame buffer. */
 uint32_t row[MAX_W];unsigned xmap[MAX_W];
 for(int i=0;i<r.w;i++)xmap[i]=(unsigned)((int64_t)(r.x+i-x)*sw/w);
 int previous=-1;
 for(int py=r.y;py<r.y+r.h;py++){
  int sy=(int)((int64_t)(py-y)*sh/h);
  if(sy!=previous){const uint32_t*src=source+(size_t)sy*sw;for(int i=0;i<r.w;i++)row[i]=src[xmap[i]];previous=sy;}
  words(target+(size_t)py*target_w+r.x,row,r.w);
 }
}

void rgba_scaled(const uint8_t *source,int sw,int sh,int x,int y,int w,int h){
 if(sw<1||sh<1||w<1||h<1)return;
 struct region r=intersect((struct region){x,y,w,h},clip);
 for(int py=r.y;py<r.y+r.h;py++)for(int px=r.x;px<r.x+r.w;px++){
  const uint8_t*s=source+((size_t)((int64_t)(py-y)*sh/h)*sw+(int64_t)(px-x)*sw/w)*4;
  unsigned a=s[3];if(!a)continue;uint32_t c=(uint32_t)s[0]<<16|(uint32_t)s[1]<<8|s[2];uint32_t*d=target+(size_t)py*target_w+px;
  *d=native_color(a==255?c:blend(logical(*d),c,a));
 }
}
