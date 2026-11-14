/* SlopDE 3 host test: chrome geometry shared by drawing, compositing and
 * hit testing. Pure integer header; no kernel objects or asset stubs. */
#include <stdio.h>
#include <stdlib.h>
#include "../src/ui/chrome_geom.h"
static int failures;
#define CHECK(c) do{if(!(c)){printf("FAIL %s:%d %s\n",__FILE__,__LINE__,#c);failures++;}}while(0)
/* Same silhouette test as graphics.c roundbox(), used independently. */
static int drawn(int px,int py,int x,int y,int w,int h,int r){
    if(r>w/2)r=w/2;
    if(r>h/2)r=h/2;
    if(px<x||py<y||px>=x+w||py>=y+h)return 0;
    int yy=py-y,dy=yy<r?r-1-yy:(yy>=h-r?yy-(h-r):0),inset=0;
    if(dy)while(inset<r&&(r-1-inset)*(r-1-inset)+dy*dy>r*r)inset++;
    return px>=x+inset&&px<x+w-inset;
}
int main(void){
    int x=100,y=80,w=720,h=460;
    /* Every control center hits its own part; the visible disc is inside
     * the hit square; squares do not overlap. */
    for(int i=0;i<CHROME_BTN_COUNT;i++){
        struct chrome_rect b=chrome_button(i,x,y);int cx=b.x+CHROME_BTN_HIT,cy=b.y+CHROME_BTN_HIT;
        CHECK((int)chrome_hit(cx,cy,x,y,w,h,0)==(int)CHROME_CLOSE+i);
        CHECK(cx-CHROME_BTN_FACE>=b.x&&cx+CHROME_BTN_FACE<b.x+b.w);
        CHECK(b.y>=y&&b.y+b.h<=y+CHROME_TITLE_H);
        if(i)CHECK(chrome_button(i-1,x,y).x+chrome_button(i-1,x,y).w<=b.x);
        CHECK((int)chrome_hit(cx,cy,x,y,w,h,1)==(int)CHROME_CLOSE+i);
    }
    CHECK(CHROME_TITLE_X0>chrome_button(CHROME_BTN_COUNT-1,0,0).x+chrome_button(CHROME_BTN_COUNT-1,0,0).w);
    /* Titlebar outside controls drags; first client row is client. */
    CHECK(chrome_hit(x+w/2,y+5,x,y,w,h,0)==CHROME_TITLE);
    CHECK(chrome_hit(x+w/2,y+CHROME_TITLE_H-1,x,y,w,h,0)==CHROME_TITLE);
    CHECK(chrome_hit(x+w/2,y+CHROME_TITLE_H,x,y,w,h,0)==CHROME_CLIENT);
    CHECK(chrome_hit(x+2,y+200,x,y,w,h,0)==CHROME_FRAME);
    CHECK(chrome_hit(x+w-3,y+h-3,x,y,w,h,0)==CHROME_GRIP_PART);
    CHECK(chrome_hit(x+w-3,y+h-3,x,y,w,h,1)!=CHROME_GRIP_PART);
    CHECK(chrome_hit(x-1,y+10,x,y,w,h,0)==CHROME_NONE);
    CHECK(chrome_hit(x+w,y+10,x,y,w,h,0)==CHROME_NONE);
    /* Rounded corners: hit silhouette equals drawn silhouette, and the
     * exact corner pixel passes through to the window below. */
    int mismatch=0;
    for(int py=y-2;py<y+h+2;py++)for(int px=x-2;px<x+w+2;px++)
        if((chrome_hit(px,py,x,y,w,h,0)!=CHROME_NONE)!=drawn(px,py,x,y,w,h,CHROME_RADIUS))mismatch++;
    CHECK(mismatch==0);
    CHECK(chrome_hit(x,y,x,y,w,h,0)==CHROME_NONE);
    CHECK(chrome_hit(x,y,x,y,w,h,1)==CHROME_TITLE);
    /* Every non-opaque silhouette pixel lies outside chrome_opaque, so the
     * compositor repaints what is under rounded corners. */
    struct chrome_rect o=chrome_opaque(x,y,w,h,0);
    for(int py=y;py<y+h;py++)for(int px=x;px<x+w;px++)
        if(chrome_in_rect(px,py,o))CHECK(drawn(px,py,x,y,w,h,CHROME_RADIUS));
    struct chrome_rect om=chrome_opaque(x,y,w,h,1);CHECK(om.y==y&&om.h==h&&om.w==w);
    /* Client fits inside the opaque body and the extent covers shadows. */
    struct chrome_rect c=chrome_client(x,y,w,h);
    CHECK(c.x>=x&&c.y>=y+CHROME_TITLE_H&&c.x+c.w<=x+w&&c.y+c.h<=y+h);
    for(int py=c.y;py<c.y+c.h;py+=7)for(int px=c.x;px<c.x+c.w;px+=7)CHECK(drawn(px,py,x,y,w,h,CHROME_RADIUS));
    struct chrome_rect e=chrome_extent(x,y,w,h);
    CHECK(e.x<=x-8&&e.y<=y-4&&e.x+e.w>=x+w+8&&e.y+e.h>=y+h+11);
    /* Small windows: no negative sizes; controls never cross the edge. */
    for(int sw=1;sw<200;sw++)for(int sh=1;sh<120;sh+=13){
        struct chrome_rect cc=chrome_client(0,0,sw,sh),oo=chrome_opaque(0,0,sw,sh,0);
        CHECK(cc.w>=0&&cc.h>=0&&oo.w>=0&&oo.h>=0);
        int n=chrome_button_count(sw);
        if(n){struct chrome_rect last=chrome_button(n-1,0,0);CHECK(last.x+last.w<=sw-2);}
        for(int i=n;i<CHROME_BTN_COUNT;i++){struct chrome_rect b=chrome_button(i,0,0);
            int hp=chrome_hit(b.x+CHROME_BTN_HIT,b.y+CHROME_BTN_HIT,0,0,sw,sh,0);CHECK(hp!=(int)CHROME_CLOSE+i);}
    }
    /* Screen-edge clipping: partially off-screen windows still classify. */
    CHECK(chrome_hit(-50+w/2,5,-50,0,w,h,0)==CHROME_TITLE);
    CHECK(chrome_hit(20,20,-50,0,w,h,0)!=CHROME_NONE);
    /* Large coordinates stay in int range. */
    CHECK(chrome_hit(1920*2,1080*2,1920*2-10,1080*2-10,100,100,0)!=CHROME_NONE);
    if(failures){printf("slopde-geom-test: %d failures\n",failures);return 1;}
    printf("slopde-geom-test: all checks passed\n");return 0;
}
