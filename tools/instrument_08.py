"""Recreate M0 timing instrumentation on a SEPARATE COPY of Slopix 0.8.
Usage: python3 tools/instrument_08.py /absolute/path/to/copy-of-slopix-0.8
It intentionally asserts if the input does not match the expected 0.8 source.
Never point this at the preserved release or at 0.85.
"""
from pathlib import Path
import sys
r=Path(sys.argv[1]).resolve()
def edit(p,a,b):
 q=r/p;s=q.read_text();assert a in s,(p,a[:60]);q.write_text(s.replace(a,b))
(r/'src/perf.h').write_text('''#ifndef SLOPIX_PERF_H
#define SLOPIX_PERF_H
#include <stdint.h>
enum perf_stage { P_LOOP,P_INPUT,P_DESKTOP,P_COMPOSE,P_UPLOAD,P_AUDIO,P_DOOM,P_GAME,P_DRENDER,P_CUBE,P_WAIT,P_COUNT };
struct perf_value {uint64_t count,total,maximum;};
extern void perf_record(unsigned id,uint64_t us) __attribute__((weak));
static inline void perf_add(unsigned id,uint64_t us){if(perf_record)perf_record(id,us);}
void perf_report(void (*line)(const char *));
void perf_frame(unsigned app,uint64_t now);
void perf_log(uint64_t now);
#endif
''')
(r/'src/perf.c').write_text('''#include "kernel.h"
#include "perf.h"
static struct perf_value values[P_COUNT];
static uint32_t gaps[2][256];static unsigned next[2],count[2];static uint64_t previous[2],last_log;
void perf_record(unsigned id,uint64_t us){if(id>=P_COUNT)return;struct perf_value*v=&values[id];v->count++;v->total+=us;if(us>v->maximum)v->maximum=us;}
void perf_frame(unsigned app,uint64_t now){if(app>1)return;if(previous[app]&&now-previous[app]<1000000){gaps[app][next[app]++%256]=(uint32_t)(now-previous[app]);if(count[app]<256)count[app]++;}previous[app]=now;}
static const char*names[]={"loop","input","desktop","compose","upload","audio","doom","game","doom_render","cube","wait"};
static void field(char*s,const char*name,uint64_t n){char b[21];decimal(n,b);copystr(s+length(s),name,240-length(s));copystr(s+length(s),b,240-length(s));}
void perf_report(void(*line)(const char*)){
 for(unsigned i=0;i<P_COUNT;i++){struct perf_value v=values[i];char s[240]="PERF ";copystr(s+5,names[i],235);field(s," count=",v.count);field(s," avg_us=",v.count?v.total/v.count:0);field(s," max_us=",v.maximum);line(s);}
 for(unsigned a=0;a<2;a++){unsigned n=count[a];if(!n)continue;uint32_t sorted[256];uint64_t sum=0;for(unsigned i=0;i<n;i++){sorted[i]=gaps[a][i];sum+=sorted[i];}for(unsigned i=1;i<n;i++){uint32_t v=sorted[i];unsigned j=i;while(j&&sorted[j-1]>v){sorted[j]=sorted[j-1];j--;}sorted[j]=v;}unsigned tail=n/100;if(!tail)tail=1;uint64_t slow=0;for(unsigned i=n-tail;i<n;i++)slow+=sorted[i];char s[240]="FRAMES ";field(s,"app=",a);field(s," n=",n);field(s," fps10=",sum?(uint64_t)n*10000000/sum:0);field(s," low1_fps10=",slow?(uint64_t)tail*10000000/slow:0);field(s," p99_us=",sorted[(n-1)*99/100]);field(s," max_us=",sorted[n-1]);line(s);}
}
static void serial_line(const char*s){logstr(s);logstr("\n");}
void perf_log(uint64_t now){if(now-last_log>=5000000){last_log=now;perf_report(serial_line);}}
''')
edit(Path('Makefile'),'OBJS := ','OBJS := build/perf.o ')
edit(Path('src/kernel.c'),'#include "kernel.h"','#include "kernel.h"\n#include "perf.h"')
edit(Path('src/kernel.c'),'        input_poll();\n        audio_step(timer_us());\n        desktop_step(timer_us());','''        uint64_t loop=timer_us(),begin=loop;input_poll();perf_add(P_INPUT,timer_us()-begin);
        audio_step(timer_us());begin=timer_us();desktop_step(begin);perf_add(P_DESKTOP,timer_us()-begin);
        perf_add(P_LOOP,timer_us()-loop);perf_log(timer_us());begin=timer_us();''')
edit(Path('src/kernel.c'),'        __asm__ volatile("hlt");','        __asm__ volatile("hlt");perf_add(P_WAIT,timer_us()-begin);')
edit(Path('src/desktop.c'),'#include "kernel.h"','#include "kernel.h"\n#include "perf.h"')
edit(Path('src/desktop.c'),'uint64_t composed=timer_us();present();','uint64_t composed=timer_us();perf_add(P_COMPOSE,composed-begin);present();')
edit(Path('src/desktop.c'),'uint64_t done=timer_us();','uint64_t done=timer_us();perf_add(P_UPLOAD,done-composed);if(doom_fresh){perf_frame(0,done);doom_fresh=0;}')
edit(Path('src/desktop.c'),'static int cube_fresh;','static int cube_fresh,doom_fresh;')
edit(Path('src/desktop.c'),'if(doom_update(now,doom_visible))damage(db.x,db.y+43,db.w,db.h-43);','if(doom_update(now,doom_visible)){doom_fresh=1;damage(db.x,db.y+43,db.w,db.h-43);}')
edit(Path('src/desktop.c'),'cube_render_us=timer_us()-start;cube_fresh=1;','cube_render_us=timer_us()-start;perf_add(P_CUBE,cube_render_us);cube_fresh=1;')
edit(Path('src/desktop.c'),'if(cube_fresh){cube_presented','if(cube_fresh){perf_frame(1,done);cube_presented')
edit(Path('src/doom/app.c'),'#include "../kernel.h"','#include "../kernel.h"\n#include "../perf.h"')
edit(Path('src/doom/app.c'),'work_total+=timer_us()-start;stats_frames++;','uint64_t work=timer_us()-start;perf_add(P_DOOM,work);work_total+=work;stats_frames++;')
# Vendor instrumentation resolves via the kernel perf boundary, not host std.
edit(Path('vendor/doomgeneric/d_main.c'),'void doomgeneric_Tick()','extern unsigned long long timer_us(void);\nextern void perf_record(unsigned,unsigned long long);\nvoid doomgeneric_Tick()')
edit(Path('vendor/doomgeneric/d_main.c'),'    TryRunTics (); // will run at least one tic','    unsigned long long begin=timer_us();\n    TryRunTics (); // cooperative simulation\n    perf_record(7,timer_us()-begin);')
edit(Path('vendor/doomgeneric/d_main.c'),'        D_Display ();','        begin=timer_us();D_Display ();perf_record(8,timer_us()-begin);')
edit(Path('src/audio/audio.c'),'#include "audio.h"','#include "audio.h"\n#include "../perf.h"\nextern uint64_t timer_us(void);')
edit(Path('src/audio/audio.c'),'    uint8_t block[AUDIO_HALF];','    uint64_t begin=timer_us();uint8_t block[AUDIO_HALF];')
edit(Path('src/audio/audio.c'),'    sb16_write_half(half,block);','    sb16_write_half(half,block);perf_add(P_AUDIO,timer_us()-begin);')

from pathlib import Path
r=Path(sys.argv[1]).resolve()
p=r/'src/perf.h';s=p.read_text().replace('void perf_report','void perf_reset(void);\nvoid perf_report');p.write_text(s)
p=r/'src/perf.c';s=p.read_text().replace('void perf_record','void perf_reset(void){for(unsigned i=0;i<P_COUNT;i++)values[i]=(struct perf_value){0};for(unsigned a=0;a<2;a++){next[a]=count[a]=0;previous[a]=0;}}\nvoid perf_record');p.write_text(s)
p=r/'src/terminal.c';s=p.read_text().replace('#include "kernel.h"','#include "kernel.h"\n#include "perf.h"').replace('else if(equal(name,"clear"))','else if(equal(name,"slopmon")){if(equal(args,"reset"))perf_reset();else perf_report(output);}\n    else if(equal(name,"clear"))');p.write_text(s)
p=r/'tests/qemu_driver.py';s=p.read_text().replace('import json','import os\nimport json',1).replace("str(ROOT/'build/slopix.iso')","os.environ.get('SLOPIX_TEST_ISO',str(ROOT/'build/slopix.iso'))");p.write_text(s)


p=r/'src/perf.c';p.write_text(p.read_text().replace('logstr("\n");','logstr("\\n");'))
p=r/'src/audio/audio.c';p.write_text(p.read_text().replace('extern uint64_t timer_us(void);','extern uint64_t timer_us(void) __attribute__((weak));').replace('uint64_t begin=timer_us();','uint64_t begin=perf_record?timer_us():0;').replace('perf_add(P_AUDIO,timer_us()-begin);','if(perf_record)perf_add(P_AUDIO,timer_us()-begin);'))
print('Instrumented the specified copy of 0.8. Build there, then pass its ISO to m0_measure.py/performance_matrix.py.')
