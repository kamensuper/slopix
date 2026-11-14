/* SlopDE 3 animation core.
 *
 * Pure integer, header-only, no allocation, no floating point and no kernel
 * dependencies, so the kernel desktop and host tests share one
 * implementation. Time is in microseconds from the monotonic timer_us().
 *
 * Progress is derived from elapsed time on every query and never
 * accumulated per frame: a late or dropped frame lands on the correct point
 * of the curve, and a slow renderer cannot stretch an animation.
 *
 * Fixed point: progress and eased values are Q16 in 0..ANIM_ONE inclusive.
 * Callers own their tracks in fixed arrays (one per window, panel item or
 * menu), so the number of live animations is bounded by construction. */
#ifndef SLOPIX_UI_ANIM_H
#define SLOPIX_UI_ANIM_H
#include <stdint.h>

#define ANIM_ONE 65536u

enum anim_ease {ANIM_LINEAR=0,ANIM_EASE_OUT_CUBIC,ANIM_EASE_IN_OUT_CUBIC,ANIM_SMOOTHSTEP};
enum anim_state {ANIM_IDLE=0,ANIM_RUNNING,ANIM_DONE};

struct anim_track {
    uint64_t start;       /* timer_us() at start */
    uint32_t duration;    /* microseconds; 0 completes on the first query */
    uint8_t ease;         /* enum anim_ease */
    uint8_t state;        /* enum anim_state */
};

/* Q16 multiply, inputs in 0..ANIM_ONE. */
static inline uint32_t anim_mul(uint32_t a,uint32_t b){return (uint32_t)(((uint64_t)a*b+(ANIM_ONE/2))>>16);}
static inline uint32_t anim_clamp_q(int64_t v){return v<0?0u:v>(int64_t)ANIM_ONE?ANIM_ONE:(uint32_t)v;}

/* Linear progress from elapsed time. Saturates at both ends; a zero
 * duration is complete immediately (no division by zero). */
static inline uint32_t anim_progress(uint64_t start,uint32_t duration,uint64_t now){
    if(!duration)return ANIM_ONE;
    if(now<=start)return 0u;
    uint64_t elapsed=now-start;
    if(elapsed>=duration)return ANIM_ONE;
    return (uint32_t)((elapsed<<16)/duration);
}
/* 1-(1-t)^3 */
static inline uint32_t anim_ease_out_cubic(uint32_t t){
    if(t>=ANIM_ONE)return ANIM_ONE;
    uint32_t u=ANIM_ONE-t;
    return ANIM_ONE-anim_mul(anim_mul(u,u),u);
}
/* t<1/2: 4t^3, else 1-(2-2t)^3/2 */
static inline uint32_t anim_ease_in_out_cubic(uint32_t t){
    if(t>=ANIM_ONE)return ANIM_ONE;
    if(t<ANIM_ONE/2)return anim_clamp_q((int64_t)4*anim_mul(anim_mul(t,t),t));
    uint32_t u=2u*(ANIM_ONE-t);
    return ANIM_ONE-anim_mul(anim_mul(u,u),u)/2u;
}
/* t^2 (3-2t) */
static inline uint32_t anim_smoothstep(uint32_t t){
    if(t>=ANIM_ONE)return ANIM_ONE;
    uint64_t t2=anim_mul(t,t);
    return anim_clamp_q((int64_t)((t2*(uint64_t)(3u*ANIM_ONE-2u*t)+(ANIM_ONE/2))>>16));
}
static inline uint32_t anim_ease(unsigned ease,uint32_t t){
    if(t>ANIM_ONE)t=ANIM_ONE;
    switch(ease){
    case ANIM_EASE_OUT_CUBIC:return anim_ease_out_cubic(t);
    case ANIM_EASE_IN_OUT_CUBIC:return anim_ease_in_out_cubic(t);
    case ANIM_SMOOTHSTEP:return anim_smoothstep(t);
    default:return t;
    }
}
/* Starting a running track replaces it. Callers that need visual
 * continuity sample the old value first and use it as the new origin. */
static inline void anim_start(struct anim_track*a,uint64_t now,uint32_t duration,unsigned ease){
    a->start=now;a->duration=duration;a->ease=(uint8_t)ease;a->state=ANIM_RUNNING;
}
static inline void anim_cancel(struct anim_track*a){a->state=ANIM_IDLE;}
static inline int anim_running(const struct anim_track*a){return a->state==ANIM_RUNNING;}
/* Eased value. Idle and completed tracks report their final value. */
static inline uint32_t anim_value(const struct anim_track*a,uint64_t now){
    if(a->state!=ANIM_RUNNING)return ANIM_ONE;
    return anim_ease(a->ease,anim_progress(a->start,a->duration,now));
}
/* Explicit state machine: RUNNING while in flight, DONE exactly once on
 * completion (the caller finalises its object), then IDLE. */
static inline int anim_step(struct anim_track*a,uint64_t now){
    if(a->state==ANIM_RUNNING&&anim_progress(a->start,a->duration,now)>=ANIM_ONE){a->state=ANIM_DONE;return ANIM_DONE;}
    if(a->state==ANIM_DONE){a->state=ANIM_IDLE;return ANIM_IDLE;}
    return a->state;
}
/* Exact at both ends: q=0 gives a, q=ANIM_ONE gives b. */
static inline int anim_lerp(int a,int b,uint32_t q){
    if(q>=ANIM_ONE)return b;
    int64_t s=((int64_t)b-(int64_t)a)*(int64_t)q;
    int64_t off=s>=0?(s+(int64_t)ANIM_ONE/2)/(int64_t)ANIM_ONE:-((-s+(int64_t)ANIM_ONE/2)/(int64_t)ANIM_ONE);
    return (int)((int64_t)a+off);
}
static inline uint32_t anim_lerp_u8(uint32_t a,uint32_t b,uint32_t q){return (uint32_t)anim_lerp((int)a,(int)b,q);}

struct anim_rect {int x,y,w,h;};
static inline struct anim_rect anim_rect_lerp(struct anim_rect a,struct anim_rect b,uint32_t q){
    return (struct anim_rect){anim_lerp(a.x,b.x,q),anim_lerp(a.y,b.y,q),anim_lerp(a.w,b.w,q),anim_lerp(a.h,b.h,q)};
}
/* Bounding box of two rectangles; empty inputs are ignored so a damage
 * union never grows towards the origin. */
static inline struct anim_rect anim_rect_union(struct anim_rect a,struct anim_rect b){
    if(a.w<=0||a.h<=0)return b;
    if(b.w<=0||b.h<=0)return a;
    int x=a.x<b.x?a.x:b.x,y=a.y<b.y?a.y:b.y;
    int r=a.x+a.w>b.x+b.w?a.x+a.w:b.x+b.w,bt=a.y+a.h>b.y+b.h?a.y+a.h:b.y+b.h;
    return (struct anim_rect){x,y,r-x,bt-y};
}
/* Resting point of open/close transitions: ~92% size, centred, 8 px lower.
 * Always inside the horizontal span of the input. */
static inline struct anim_rect anim_rect_settle(struct anim_rect b){
    int dw=b.w/25,dh=b.h/25;
    return (struct anim_rect){b.x+dw,b.y+dh+8,b.w-2*dw,b.h-2*dh};
}
/* Frame pacing: 60 Hz while composing is cheap, 30 Hz once a frame costs
 * more than 12 ms, with hysteresis so the rate does not oscillate. */
#define ANIM_FRAME_60 16667u
#define ANIM_FRAME_30 33333u
static inline uint32_t anim_pace(uint32_t current,uint64_t render_us){
    if(render_us>12000u)return ANIM_FRAME_30;
    if(render_us<8000u)return ANIM_FRAME_60;
    return current;
}
#endif
