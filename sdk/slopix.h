#ifndef SLOPIX_SDK_H
#define SLOPIX_SDK_H
#include <stdint.h>
/* Experimental ABI v2. int 0x80: rax=number, rdi/rsi/rdx=args; rax=result.
 * Negative errno values returned directly; no host libc or TLS required. */
enum {
    SX_WRITE=1, SX_EXIT, SX_TIME, SX_MAP, SX_YIELD, SX_SLEEP, SX_PID,
    SX_OPEN, SX_READ, SX_CLOSE, SX_SEEK, SX_SPAWN,
    SX_GUI_OPEN, SX_GUI_PRESENT, SX_GUI_POLL,
    SX_CREATE, SX_FWRITE, SX_HTTP_GET,
    SX_READDIR, SX_REMOVE, SX_MKDIR,
    SX_DESKTOP_OPEN, SX_PREF_GET, SX_PREF_SET, SX_PREF_SAVE,
    SX_PACKAGE, SX_PROCINFO, SX_CONSOLE_POLL, SX_STAT,
    SX_PCM_START, SX_PCM_STOP, SX_PCM_VOLUME, SX_PCM_PLAYING,
    /* CP07 additions. Numbering is part of the ABI: keep these explicit. */
    SX_SCHED_PARAM=34, SX_FUTEX=35, SX_TLS_BASE=36, SX_CLOCK_GET=37
};
/* Descriptor space: 0..2 standard console channels, 10..13 per-process file
 * slots. SX_OPEN/SX_CREATE return values in the file range. */
#define SX_FD_BASE 10
#define SX_FD_MAX  4
/* Stable ABI records. All pointers are copied and bounds-checked by kernel.
 * List return is entry count, or negative errno. Entries never share kernel memory. */
static inline int64_t sx_call(uint64_t n,uint64_t a,uint64_t b,uint64_t c){int64_t r;__asm__ volatile("int $0x80":"=a"(r):"a"(n),"D"(a),"S"(b),"d"(c):"memory","cc");return r;}
struct sx_dirent {char name[16];uint32_t size;uint32_t directory;};
struct sx_prefs {uint32_t accent,light,volume,magnify,wallpaper,fit;};
static inline int64_t sx_readdir(const char*path,struct sx_dirent*out,unsigned count){return sx_call(SX_READDIR,(uintptr_t)path,(uintptr_t)out,count);}
/* Paged listing: entries starting at `offset` (fewer than count = end of directory). */
static inline int64_t sx_readdir_at(const char*path,struct sx_dirent*out,unsigned count,unsigned offset){return sx_call(SX_READDIR,(uintptr_t)path,(uintptr_t)out,(uint64_t)count|((uint64_t)(offset&0xffffu)<<16));}
static inline int64_t sx_remove(const char*path){return sx_call(SX_REMOVE,(uintptr_t)path,0,0);}
static inline int64_t sx_mkdir(const char*path){return sx_call(SX_MKDIR,(uintptr_t)path,0,0);}
static inline int64_t sx_desktop_open(unsigned id){return sx_call(SX_DESKTOP_OPEN,id,0,0);}
static inline int64_t sx_pref_get(struct sx_prefs*p){return sx_call(SX_PREF_GET,(uintptr_t)p,0,0);}
/* Preferences: fields 0=accent 1=light 2=volume 3=magnify 4=wallpaper 5=fit */
static inline int64_t sx_pref_set(unsigned field,uint32_t value){return sx_call(SX_PREF_SET,field,value,0);}
static inline int64_t sx_pref_save(void){return sx_call(SX_PREF_SAVE,0,0,0);}
static inline int64_t sx_package(char*args,char*out,unsigned size){return sx_call(SX_PACKAGE,(uintptr_t)args,(uintptr_t)out,size);}
static inline int64_t sx_procinfo(char*out,unsigned size){return sx_call(SX_PROCINFO,(uintptr_t)out,size,0);}
static inline int64_t sx_console_poll(char*out,unsigned size){return sx_call(SX_CONSOLE_POLL,(uintptr_t)out,size,0);}
struct sx_pcm_request {uintptr_t data;uint32_t size,channel,rate,volume;};
static inline int64_t sx_stat(const char*path,uint32_t *size){return sx_call(SX_STAT,(uintptr_t)path,(uintptr_t)size,0);}
static inline int64_t sx_pcm_start(const struct sx_pcm_request*r){return sx_call(SX_PCM_START,(uintptr_t)r,0,0);}
static inline int64_t sx_pcm_stop(unsigned ch){return sx_call(SX_PCM_STOP,ch,0,0);}
static inline int64_t sx_pcm_volume(unsigned ch,unsigned v){return sx_call(SX_PCM_VOLUME,ch,v,0);}
static inline int64_t sx_pcm_playing(unsigned ch){return sx_call(SX_PCM_PLAYING,ch,0,0);}
/* Scheduling */
struct sx_sched_param {int policy; int priority; uint64_t deadline_ns, period_ns, runtime_ns;};
/* Policy ids are part of the ABI (sdk/libc calls them SCHED_OTHER...). */
#define SX_SCHED_OTHER    0
#define SX_SCHED_FIFO     1
#define SX_SCHED_RR       2
#define SX_SCHED_DEADLINE 3
/* Priority range accepted by sx_sched_param; 16 is the default. */
#define SX_PRIO_MIN 1
#define SX_PRIO_MAX 32
#define SX_PRIO_DEFAULT 16
/* Standalone timespec so this header stays independent of any libc headers. */
struct sx_timespec {int64_t tv_sec;int64_t tv_nsec;};
static inline int64_t sx_sched_param(int policy, const struct sx_sched_param *p){return sx_call(SX_SCHED_PARAM,policy,(uintptr_t)p,0);}
static inline int64_t sx_futex_wait(int *uaddr, int val, const struct sx_timespec *ts){return sx_call(SX_FUTEX,(uintptr_t)uaddr,val,(uintptr_t)ts);}
static inline int64_t sx_futex_wake(int *uaddr, int count){return sx_call(SX_FUTEX,(uintptr_t)uaddr,count|0x80000000,0);}
static inline int64_t sx_tls_base(void *base){return sx_call(SX_TLS_BASE,(uintptr_t)base,0,0);}
static inline int64_t sx_clock_get(int clk_id, struct sx_timespec *ts){return sx_call(SX_CLOCK_GET,clk_id,(uintptr_t)ts,0);}
/* Matching Slopix public keyboard event codes. */
enum {SXK_ENTER=256,SXK_BACKSPACE,SXK_LEFT,SXK_RIGHT,SXK_HOME,SXK_END,SXK_UP,SXK_DOWN,
 SXK_PGUP,SXK_PGDN,SXK_DELETE,SXK_CLEAR,SXK_ERASE,SXK_TAB,SXK_ESCAPE};
static inline int64_t sx_write(const void*p,uint64_t n){return sx_call(SX_WRITE,(uintptr_t)p,n,0);}
/* HTTPS is intentionally rejected. Returns HTML body bytes or a negative errno;
 * max buffer 32768 bytes. A synchronous fetch may briefly freeze the GUI. */
static inline int64_t sx_http_get(const char*url,void*buffer,unsigned n){return sx_call(SX_HTTP_GET,(uintptr_t)url,(uintptr_t)buffer,n);}
static inline int64_t sx_open(const char*path){return sx_call(SX_OPEN,(uintptr_t)path,0,0);}
static inline int64_t sx_read(int fd,void*buffer,unsigned n){return sx_call(SX_READ,(unsigned)fd,(uintptr_t)buffer,n);}
/* create flags: 0=new only; 1=truncate/create. FAT32 currently accepts 8.3 names. */
static inline int64_t sx_create(const char*path,int truncate){return sx_call(SX_CREATE,(uintptr_t)path,(uint64_t)(unsigned)truncate,0);}
static inline int64_t sx_fwrite(int fd,const void*buffer,unsigned n){return sx_call(SX_FWRITE,(unsigned)fd,(uintptr_t)buffer,n);}
static inline int64_t sx_close(int fd){return sx_call(SX_CLOSE,(unsigned)fd,0,0);}
static inline int64_t sx_seek(int fd,uint64_t offset){return sx_call(SX_SEEK,(unsigned)fd,offset,0);}
static inline int64_t sx_spawn(const char*path,uint64_t arg){return sx_call(SX_SPAWN,(uintptr_t)path,arg,0);}
/* GUI v1: process-owned window surface. Buffer is RGB888 XRGB32. */
static inline int64_t sx_gui_open(unsigned w,unsigned h){return sx_call(SX_GUI_OPEN,w,h,0);}
static inline int64_t sx_gui_present(const uint32_t*p,unsigned count){return sx_call(SX_GUI_PRESENT,(uintptr_t)p,count,0);}
static inline uint64_t sx_gui_poll(void){return (uint64_t)sx_call(SX_GUI_POLL,0,0,0);}
/* A process receives mouse presses only over its actual client pixels.
 * Events remain isolated from every other user application. */
#define SX_GUI_EVENT_KEY 1u
#define SX_GUI_EVENT_MOUSE 2u
#define SX_GUI_EVENT_VISIBILITY 3u
/* 5 is reserved for RESIZE. CLOSE asks the app to save and exit; the
 * desktop ends it after a short grace period if it does not. */
#define SX_GUI_EVENT_CLOSE 6u
static inline unsigned sx_gui_event_type(uint64_t e){return (unsigned)(e>>32);}
static inline unsigned sx_gui_mouse_x(uint64_t e){return (unsigned)(e&4095u);}
static inline unsigned sx_gui_mouse_y(uint64_t e){return (unsigned)((e>>12)&4095u);}
static inline unsigned sx_gui_mouse_buttons(uint64_t e){return (unsigned)((e>>24)&7u);}
/* Apps now receive moves and releases too. This returns 1 only on the event
 * where the left button goes down; *held remembers the previous state. */
static inline int sx_gui_left_pressed(uint64_t e,unsigned*held){unsigned now=sx_gui_mouse_buttons(e)&1u;int edge=now&&!*held;*held=now;return edge;}
static inline uint64_t sx_time(void){return (uint64_t)sx_call(SX_TIME,0,0,0);}
static inline void sx_yield(void){sx_call(SX_YIELD,0,0,0);}
static inline void sx_sleep(uint64_t us){sx_call(SX_SLEEP,us,0,0);}
static inline void* sx_map(unsigned pages){return (void*)(uintptr_t)sx_call(SX_MAP,pages,0,0);}
static inline __attribute__((noreturn)) void sx_exit(int n){sx_call(SX_EXIT,(uint32_t)n,0,0);for(;;)sx_yield();}
#endif
