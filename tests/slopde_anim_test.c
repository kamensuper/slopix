/* SlopDE 3 host test: integer animation core (src/ui/anim.h). */
#include <stdio.h>
#include "../src/ui/anim.h"
static int failures;
#define CHECK(c) do{if(!(c)){printf("FAIL %s:%d %s\n",__FILE__,__LINE__,#c);failures++;}}while(0)
int main(void){
    unsigned eases[]={ANIM_LINEAR,ANIM_EASE_OUT_CUBIC,ANIM_EASE_IN_OUT_CUBIC,ANIM_SMOOTHSTEP};
    for(unsigned e=0;e<4;e++){
        /* Exact boundaries and monotonic, bounded curves. */
        CHECK(anim_ease(eases[e],0)==0);
        CHECK(anim_ease(eases[e],ANIM_ONE)==ANIM_ONE);
        CHECK(anim_ease(eases[e],ANIM_ONE+500)==ANIM_ONE);
        uint32_t prev=0;
        for(uint32_t t=0;t<=ANIM_ONE;t+=97){uint32_t v=anim_ease(eases[e],t);CHECK(v<=ANIM_ONE);CHECK(v>=prev);prev=v;}
    }
    /* Midpoints: symmetric curves hit one half; ease-out is ahead of linear. */
    CHECK(anim_ease_in_out_cubic(ANIM_ONE/2)>=ANIM_ONE/2-2&&anim_ease_in_out_cubic(ANIM_ONE/2)<=ANIM_ONE/2+2);
    CHECK(anim_smoothstep(ANIM_ONE/2)>=ANIM_ONE/2-2&&anim_smoothstep(ANIM_ONE/2)<=ANIM_ONE/2+2);
    CHECK(anim_ease_out_cubic(ANIM_ONE/2)>ANIM_ONE*80/100); /* 0.875 */
    CHECK(anim_ease_out_cubic(ANIM_ONE/4)>ANIM_ONE/4);
    /* Progress is a function of elapsed time only. */
    CHECK(anim_progress(1000,0,0)==ANIM_ONE);             /* zero duration */
    CHECK(anim_progress(1000,200000,999)==0);             /* clock before start */
    CHECK(anim_progress(1000,200000,1000)==0);
    CHECK(anim_progress(1000,200000,101000)==ANIM_ONE/2);
    CHECK(anim_progress(1000,200000,201000)==ANIM_ONE);
    CHECK(anim_progress(1000,200000,~0ull)==ANIM_ONE);    /* no overflow */
    /* Dropped frames: sampling at 60 Hz or only once yields the same value. */
    {struct anim_track a,b;anim_start(&a,5000,180000,ANIM_EASE_OUT_CUBIC);b=a;
     for(uint64_t t=5000;t<5000+120000;t+=16667)(void)anim_value(&a,t);
     CHECK(anim_value(&a,125000)==anim_value(&b,125000));}
    /* Explicit states: RUNNING, DONE once, then IDLE. */
    {struct anim_track a={0};CHECK(a.state==ANIM_IDLE);CHECK(anim_value(&a,0)==ANIM_ONE);
     anim_start(&a,100,1000,ANIM_LINEAR);CHECK(anim_running(&a));
     CHECK(anim_step(&a,600)==ANIM_RUNNING);CHECK(anim_step(&a,1100)==ANIM_DONE);
     CHECK(anim_step(&a,1200)==ANIM_IDLE);CHECK(anim_step(&a,1300)==ANIM_IDLE);
     /* Zero duration completes on the first step. */
     anim_start(&a,50,0,ANIM_SMOOTHSTEP);CHECK(anim_value(&a,50)==ANIM_ONE);CHECK(anim_step(&a,50)==ANIM_DONE);
     /* Cancel is immediate and idempotent. */
     anim_start(&a,0,1000,ANIM_LINEAR);anim_cancel(&a);CHECK(!anim_running(&a));anim_cancel(&a);CHECK(anim_step(&a,10)==ANIM_IDLE);}
    /* Rapid replacement: restarting from the sampled value is continuous. */
    {struct anim_track a;anim_start(&a,0,200000,ANIM_EASE_OUT_CUBIC);
     int from=0,to=1000;
     for(int k=0;k<50;k++){uint64_t now=(uint64_t)k*3000;
        int v=anim_lerp(from,to,anim_value(&a,now));
        from=v;to=k&1?0:1000;anim_start(&a,now,200000,ANIM_EASE_OUT_CUBIC);
        CHECK(anim_lerp(from,to,anim_value(&a,now))==v);} /* no jump at restart */
    }
    /* Lerp exactness and sign symmetry. */
    CHECK(anim_lerp(10,-30,0)==10);CHECK(anim_lerp(10,-30,ANIM_ONE)==-30);
    CHECK(anim_lerp(0,100,ANIM_ONE/2)==50);CHECK(anim_lerp(100,0,ANIM_ONE/2)==50);
    CHECK(anim_lerp(-2000000000,2000000000,ANIM_ONE/2)==0);
    /* Rect helpers used for transitions and damage. */
    {struct anim_rect a={100,100,400,300},b={20,700,60,30};
     struct anim_rect s=anim_rect_lerp(a,b,0),f=anim_rect_lerp(a,b,ANIM_ONE);
     CHECK(s.x==a.x&&s.y==a.y&&s.w==a.w&&s.h==a.h);CHECK(f.x==b.x&&f.y==b.y&&f.w==b.w&&f.h==b.h);
     struct anim_rect u=anim_rect_union(a,b);
     CHECK(u.x==20&&u.y==100&&u.x+u.w==500&&u.y+u.h==730);
     struct anim_rect e={0,0,0,0};u=anim_rect_union(e,a);CHECK(u.x==a.x&&u.w==a.w);
     u=anim_rect_union(a,e);CHECK(u.x==a.x&&u.y==a.y&&u.w==a.w&&u.h==a.h);
     /* Every interpolated rect stays inside the damage union of endpoints. */
     u=anim_rect_union(a,b);
     for(uint32_t q=0;q<=ANIM_ONE;q+=1024){struct anim_rect m=anim_rect_lerp(a,b,anim_ease_in_out_cubic(q));
        CHECK(m.x>=u.x&&m.y>=u.y&&m.x+m.w<=u.x+u.w&&m.y+m.h<=u.y+u.h);}
     struct anim_rect st=anim_rect_settle(a);
     CHECK(st.x>a.x&&st.x+st.w<a.x+a.w&&st.w>a.w*9/10&&st.h>a.h*9/10);}
    /* Frame pacing with hysteresis. */
    CHECK(anim_pace(ANIM_FRAME_60,5000)==ANIM_FRAME_60);
    CHECK(anim_pace(ANIM_FRAME_60,15000)==ANIM_FRAME_30);
    CHECK(anim_pace(ANIM_FRAME_30,10000)==ANIM_FRAME_30);
    CHECK(anim_pace(ANIM_FRAME_60,10000)==ANIM_FRAME_60);
    CHECK(anim_pace(ANIM_FRAME_30,7000)==ANIM_FRAME_60);
    if(failures){printf("slopde-anim-test: %d failure(s)\n",failures);return 1;}
    printf("slopde-anim-test: ok\n");return 0;
}
