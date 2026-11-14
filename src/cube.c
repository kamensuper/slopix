#ifdef SLOPIX_USER
#include "../sdk/demo_shim.h"
#else
#include "kernel.h"
#endif
#include "sine.h"
#define CW 640
#define CH 400
#define Q 65536
struct vec {int32_t x,y,z;};
#include "meshes.h"
static unsigned model;
void cube_select(unsigned m){model=m%4;cube_reset_stats(timer_us());}
unsigned cube_model(void){return model;}
struct projected {int x,y;int32_t inverse_z;};
static uint32_t image[CW*CH],depth[CW*CH];
static int view_w,view_h;
static uint64_t epoch,frames,render_total,compose_total,upload_total;
static unsigned fps10,frame_us,render_avg,compose_avg,upload_avg;
static uint64_t lifetime;
static int stats_started;
static int32_t mul(int32_t a,int32_t b){return (int32_t)((int64_t)a*b/Q);}
static int32_t sine(unsigned phase) {
    phase&=65535;unsigned index=phase>>8,t=phase&255;
    return sine_table[index]+(sine_table[index+1]-sine_table[index])*(int)t/256;
}
static struct vec rotate(struct vec p,int32_t sx,int32_t cx,int32_t sy,int32_t cy) {
    int32_t y=mul(p.y,cx)-mul(p.z,sx),z=mul(p.y,sx)+mul(p.z,cx);
    return (struct vec){mul(p.x,cy)+mul(z,sy),y,-mul(p.x,sy)+mul(z,cy)};
}
static int64_t edge(struct projected a,struct projected b,int x,int y) {
    return (int64_t)(x-a.x)*(b.y-a.y)-(int64_t)(y-a.y)*(b.x-a.x);
}
static int minimum(int a,int b){return a<b?a:b;}
static int maximum(int a,int b){return a>b?a:b;}
static void triangle(struct projected a,struct projected b,struct projected c,uint32_t color) {
    int64_t area=edge(a,b,c.x,c.y);
    if(!area)return;
    if(area<0){struct projected t=b;b=c;c=t;area=-area;}
    int minx=maximum(0,minimum(a.x,minimum(b.x,c.x))/16);
    int miny=maximum(0,minimum(a.y,minimum(b.y,c.y))/16);
    int maxx=minimum(view_w-1,(maximum(a.x,maximum(b.x,c.x))+15)/16);
    int maxy=minimum(view_h-1,(maximum(a.y,maximum(b.y,c.y))+15)/16);
    if(minx>maxx||miny>maxy)return;
    int64_t e0=edge(b,c,minx*16+8,miny*16+8),e1=edge(c,a,minx*16+8,miny*16+8),e2=edge(a,b,minx*16+8,miny*16+8);
    int64_t dx0=(c.y-b.y)*16,dx1=(a.y-c.y)*16,dx2=(b.y-a.y)*16;
    int64_t dy0=-(c.x-b.x)*16,dy1=-(a.x-c.x)*16,dy2=-(b.x-a.x)*16;
    /* Perspective-correct inverse depth is affine across screen coordinates. */
    int64_t z=(e0*a.inverse_z+e1*b.inverse_z+e2*c.inverse_z)/area;
    int64_t dzx=(dx0*a.inverse_z+dx1*b.inverse_z+dx2*c.inverse_z)/area;
    int64_t dzy=(dy0*a.inverse_z+dy1*b.inverse_z+dy2*c.inverse_z)/area;
    for(int y=miny;y<=maxy;y++) {
        int64_t w0=e0,w1=e1,w2=e2,iz=z;size_t at=(size_t)y*view_w+minx;
        for(int x=minx;x<=maxx;x++,at++) {
            if((w0|w1|w2)>=0&&iz>0&&(uint64_t)iz>depth[at]){depth[at]=(uint32_t)iz;image[at]=color;}
            w0+=dx0;w1+=dx1;w2+=dx2;iz+=dzx;
        }
        e0+=dy0;e1+=dy1;e2+=dy2;z+=dzy;
    }
}
void cube_init(void){cube_reset_stats(timer_us());}
void cube_reset_stats(uint64_t now) {
    epoch=now;frames=render_total=compose_total=upload_total=0;stats_started=0;
    fps10=frame_us=render_avg=compose_avg=upload_avg=0;
}
void cube_render(uint64_t now,int w,int h) {
    view_w=minimum(CW,w);view_h=minimum(CH,h);
    if(view_w<1||view_h<1)return;
    uint32_t bg=native_color(0x10182b);
    for(int i=0;i<view_w*view_h;i++){image[i]=bg;depth[i]=0;}
    /* Absolute elapsed time sets both angles; missed frames never slow rotation. */
    unsigned ax=(unsigned)((now%17000000)*65536/17000000)+7200;
    unsigned ay=(unsigned)((now%12000000)*65536/12000000)+5000;
    int32_t sx=sine(ax)*2,cx=sine(ax+16384)*2,sy=sine(ay)*2,cy=sine(ay+16384)*2;
    if(model){
        const struct mesh_face *mesh=model==1?teapot_mesh:model==2?circle_mesh:torus_mesh;
        unsigned count=model==1?sizeof(teapot_mesh)/sizeof(teapot_mesh[0]):model==2?sizeof(circle_mesh)/sizeof(circle_mesh[0]):sizeof(torus_mesh)/sizeof(torus_mesh[0]);
        int focal=view_h*6/5;
        for(unsigned i=0;i<count;i++){
            const struct mesh_face *f=mesh+i;struct vec vertices[3]={f->a,f->b,f->c};struct projected p[3];
            for(unsigned j=0;j<3;j++){
                struct vec v=rotate(vertices[j],sx,cx,sy,cy);v.z+=4*Q;
                p[j]=(struct projected){view_w*8+(int)((int64_t)v.x*focal*16/v.z),view_h*8+(int)((int64_t)v.y*focal*16/v.z),(int32_t)((1LL<<40)/v.z)};
            }
            struct vec n=rotate(f->n,sx,cx,sy,cy);
            int light=(int)(((int64_t)n.x*-18000+(int64_t)n.y*-24000+(int64_t)n.z*-55000)/Q);
            /* Circle is a two-sided sheet; both sides receive useful light. */
            if(model==2&&light<0)light=-light;
            if(light<0)light=0;
            unsigned shade=85+(unsigned)light*170/Q;if(shade>255)shade=255;
            uint32_t base=f->color,c=((((base>>16)&255)*shade/255)<<16)|((((base>>8)&255)*shade/255)<<8)|((base&255)*shade/255);
            triangle(p[0],p[1],p[2],native_color(c));
        }
    }else {
    static const struct vec vertices[8]={{-Q,-Q,-Q},{Q,-Q,-Q},{Q,Q,-Q},{-Q,Q,-Q},{-Q,-Q,Q},{Q,-Q,Q},{Q,Q,Q},{-Q,Q,Q}};
    static const uint8_t faces[6][4]={{0,1,2,3},{5,4,7,6},{4,0,3,7},{1,5,6,2},{4,5,1,0},{3,2,6,7}};
    static const struct vec normals[6]={{0,0,-Q},{0,0,Q},{-Q,0,0},{Q,0,0},{0,-Q,0},{0,Q,0}};
    static const uint32_t colors[6]={0xf87579,0x59d69c,0x6d9dff,0xffb45c,0xb28aff,0x54d9df};
    struct projected projected[8];int focal=view_h*6/5;
    for(unsigned i=0;i<8;i++) {
        struct vec v=rotate(vertices[i],sx,cx,sy,cy);v.z+=4*Q;
        /* Cube bounds and camera guarantee z >= 2.26, safely past near z=.25. */
        projected[i]=(struct projected){view_w*8+(int)((int64_t)v.x*focal*16/v.z),view_h*8+(int)((int64_t)v.y*focal*16/v.z),(int32_t)((1LL<<40)/v.z)};
    }
    for(unsigned f=0;f<6;f++) {
        struct vec n=rotate(normals[f],sx,cx,sy,cy);
        int light=(int)(((int64_t)n.x*-18000+(int64_t)n.y*-24000+(int64_t)n.z*-55000)/(Q*1LL));
        if(light<0)light=0;
        unsigned shade=85+(unsigned)light*170/Q;if(shade>255)shade=255;
        uint32_t base=colors[f],c=((((base>>16)&255)*shade/255)<<16)|((((base>>8)&255)*shade/255)<<8)|((base&255)*shade/255);
        const uint8_t *v=faces[f];triangle(projected[v[0]],projected[v[1]],projected[v[2]],native_color(c));
        triangle(projected[v[0]],projected[v[2]],projected[v[3]],native_color(c));
    }
    }
}
static void append(char *s,const char *value){size_t n=length(s);copystr(s+n,value,128-n);}
static void fixed(char *s,unsigned value,unsigned divisor) {
    value+=divisor/20;
    char n[21];decimal(value/divisor,n);append(s,n);append(s,".");decimal((value%divisor)*10/divisor,n);append(s,n);
}
void cube_draw(int x,int y,int w,int h) {
    int vw=minimum(CW,w-48),vh=minimum(CH,h-136);
    int vx=x+(w-vw)/2,vy=y+54;
    blit(image,view_w,vx,vy,view_w,view_h);
    char s[128]="";
    if(fps10){append(s,"FPS ");fixed(s,fps10,10);append(s," | frame ");fixed(s,frame_us,1000);append(s," ms");}
    else append(s,"Measuring presented frames...");
    text(vx,vy+vh+9,s,0xd5def0);
    s[0]=0;append(s,"Work ");fixed(s,render_avg+compose_avg+upload_avg,1000);append(s," ms | C software + depth buffer");
    text(vx,vy+vh+31,s,0x8295b8);
    static const char *labels[]={"[1 Cube]  2 Teapot  3 Circle  4 Torus","1 Cube  [2 Teapot]  3 Circle  4 Torus","1 Cube  2 Teapot  [3 Circle]  4 Torus","1 Cube  2 Teapot  3 Circle  [4 Torus]"};
    text(vx,vy+vh+53,labels[model],0x8295b8);
}
void cube_presented(uint64_t now,uint64_t render_us,uint64_t compose_us,uint64_t upload_us) {
    lifetime++;
    if(!stats_started){stats_started=1;epoch=now;return;}
    frames++;render_total+=render_us;compose_total+=compose_us;upload_total+=upload_us;
    uint64_t elapsed=now-epoch;if(elapsed<1000000)return;
    fps10=(unsigned)(frames*10000000/elapsed);frame_us=(unsigned)(elapsed/frames);
    render_avg=(unsigned)(render_total/frames);compose_avg=(unsigned)(compose_total/frames);upload_avg=(unsigned)(upload_total/frames);
    char n[21];logstr("CUBE_STATS fps10=");decimal(fps10,n);logstr(n);
    logstr(" frame_us=");decimal(frame_us,n);logstr(n);
    logstr(" render_us=");decimal(render_avg,n);logstr(n);
    logstr(" compose_us=");decimal(compose_avg,n);logstr(n);
    logstr(" upload_us=");decimal(upload_avg,n);logstr(n);
    logstr(" frames=");decimal(lifetime,n);logstr(n);logstr("\n");
    epoch=now;frames=render_total=compose_total=upload_total=0;
}
