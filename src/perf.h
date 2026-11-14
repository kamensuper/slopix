#ifndef SLOPIX_PERF_H
#define SLOPIX_PERF_H
#include <stdint.h>
enum perf_stage { P_LOOP,P_INPUT,P_DESKTOP,P_COMPOSE,P_UPLOAD,P_AUDIO,P_DOOM,P_GAME,P_DRENDER,P_CUBE,P_WAIT,P_QUEUE,P_COUNT };
struct perf_value {uint64_t count,total,maximum;};
extern void perf_record(unsigned id,uint64_t us) __attribute__((weak));
static inline void perf_add(unsigned id,uint64_t us){if(perf_record)perf_record(id,us);}
void perf_reset(void);
extern int perf_trace;
void perf_report(void (*line)(const char *));
void perf_pause(unsigned app);
void perf_frame(unsigned app,uint64_t now);
void perf_log(uint64_t now);
#endif
