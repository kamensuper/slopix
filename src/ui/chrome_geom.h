/* SlopDE 3 window geometry. Single source of truth for chrome drawing,
 * compositor opaque regions, damage extents and pointer hit testing.
 * Pure integer helpers with no kernel dependencies so host tests can
 * include this header directly. */
#ifndef SLOPIX_CHROME_GEOM_H
#define SLOPIX_CHROME_GEOM_H

#define CHROME_TITLE_H 40      /* titlebar height; client starts below */
#define CHROME_RADIUS 10       /* outer corner radius (not maximized) */
#define CHROME_PAD_X 8         /* frame inset left/right of client */
#define CHROME_PAD_B 8         /* frame inset below client */
#define CHROME_BTN_COUNT 3     /* close, minimize, maximize */
#define CHROME_BTN_X0 20       /* center of first control, from window x */
#define CHROME_BTN_STEP 24     /* center-to-center spacing */
#define CHROME_BTN_CY 20       /* control center, from window y */
#define CHROME_BTN_HIT 11      /* half extent of the clickable square */
#define CHROME_BTN_FACE 9      /* radius of the hover/pressed disc */
#define CHROME_TITLE_X0 (CHROME_BTN_X0+CHROME_BTN_STEP*(CHROME_BTN_COUNT-1)+CHROME_BTN_HIT+10)
#define CHROME_GRIP 20         /* bottom-right resize grip square */
/* Damage/shadow extents around the window box. Shadow drawing must stay
 * inside these or moving windows would leave trails. */
#define CHROME_EXT_L 12
#define CHROME_EXT_T 8
#define CHROME_EXT_R 12
#define CHROME_EXT_B 20

enum chrome_part {
    CHROME_NONE=0,
    CHROME_CLOSE,
    CHROME_MINIMIZE,
    CHROME_MAXIMIZE,
    CHROME_TITLE,
    CHROME_GRIP_PART,
    CHROME_CLIENT,
    CHROME_FRAME
};

struct chrome_rect {int x,y,w,h;};

static inline int chrome_radius(int w,int h,int maximized){
    int r=maximized?0:CHROME_RADIUS;
    if(r>w/2)r=w/2;
    if(r>h/2)r=h/2;
    return r<0?0:r;
}
/* Horizontal inset of row yy (0..h-1) of a rounded box. This mirrors the
 * integer test used by roundbox() in graphics.c exactly, so the visible
 * silhouette and the hit silhouette are the same set of pixels. */
static inline int chrome_row_inset(int yy,int h,int r){
    if(r<=0||yy<0||yy>=h)return 0;
    int dy=yy<r?r-1-yy:(yy>=h-r?yy-(h-r):0),inset=0;
    if(dy)while(inset<r&&(r-1-inset)*(r-1-inset)+dy*dy>r*r)inset++;
    return inset;
}
static inline int chrome_inside(int px,int py,int x,int y,int w,int h,int maximized){
    if(w<=0||h<=0||px<x||py<y||px>=x+w||py>=y+h)return 0;
    int r=chrome_radius(w,h,maximized),in=chrome_row_inset(py-y,h,r);
    return px>=x+in&&px<x+w-in;
}
/* Visible controls actually drawn for a window of width w. Narrow windows
 * drop trailing controls instead of overlapping the title or the edge. */
static inline int chrome_button_count(int w){
    int n=CHROME_BTN_COUNT;
    while(n>0&&CHROME_BTN_X0+CHROME_BTN_STEP*(n-1)+CHROME_BTN_HIT>w-4)n--;
    return n;
}
static inline struct chrome_rect chrome_button(int i,int x,int y){
    int cx=x+CHROME_BTN_X0+i*CHROME_BTN_STEP,cy=y+CHROME_BTN_CY;
    return (struct chrome_rect){cx-CHROME_BTN_HIT,cy-CHROME_BTN_HIT,CHROME_BTN_HIT*2,CHROME_BTN_HIT*2};
}
static inline struct chrome_rect chrome_client(int x,int y,int w,int h){
    int cw=w-2*CHROME_PAD_X,ch=h-CHROME_TITLE_H-CHROME_PAD_B;
    return (struct chrome_rect){x+CHROME_PAD_X,y+CHROME_TITLE_H,cw>0?cw:0,ch>0?ch:0};
}
/* Fully opaque part of the window: rows without rounded corners. The
 * compositor repaints lower layers under everything else first. */
static inline struct chrome_rect chrome_opaque(int x,int y,int w,int h,int maximized){
    int r=chrome_radius(w,h,maximized),oh=h-2*r;
    return (struct chrome_rect){x,y+r,w>0?w:0,oh>0?oh:0};
}
static inline struct chrome_rect chrome_extent(int x,int y,int w,int h){
    return (struct chrome_rect){x-CHROME_EXT_L,y-CHROME_EXT_T,w+CHROME_EXT_L+CHROME_EXT_R,h+CHROME_EXT_T+CHROME_EXT_B};
}
static inline int chrome_in_rect(int px,int py,struct chrome_rect r){return px>=r.x&&py>=r.y&&px<r.x+r.w&&py<r.y+r.h;}
/* Classify a pointer position against a window. Order matters and is the
 * same order the desktop used before SlopDE 3: controls, grip, client,
 * then titlebar drag. */
static inline enum chrome_part chrome_hit(int px,int py,int x,int y,int w,int h,int maximized){
    if(!chrome_inside(px,py,x,y,w,h,maximized))return CHROME_NONE;
    if(py<y+CHROME_TITLE_H){
        int n=chrome_button_count(w);
        for(int i=0;i<n;i++)if(chrome_in_rect(px,py,chrome_button(i,x,y)))return (enum chrome_part)(CHROME_CLOSE+i);
    }
    if(!maximized&&px>=x+w-CHROME_GRIP&&py>=y+h-CHROME_GRIP)return CHROME_GRIP_PART;
    if(py<y+CHROME_TITLE_H)return CHROME_TITLE;
    if(chrome_in_rect(px,py,chrome_client(x,y,w,h)))return CHROME_CLIENT;
    return CHROME_FRAME;
}
#endif
