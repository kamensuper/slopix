#ifndef SLOPIX_KERNEL_H
#define SLOPIX_KERNEL_H
#include <stdint.h>
#include <stddef.h>
#define MAX_W 1920
#define MAX_H 1080
#define TIMER_HZ 1000
struct region { int x,y,w,h; };
extern uint32_t width,height,pitch;
extern uint64_t boot_usable;
extern int scene_dirty;
static inline void outb(uint16_t p,uint8_t v) { __asm__ volatile("outb %0,%1"::"a"(v),"Nd"(p)); }
static inline uint8_t inb(uint16_t p) { uint8_t v; __asm__ volatile("inb %1,%0":"=a"(v):"Nd"(p)); return v; }
/* Main-thread safe point: no allocation or foreground reentry. Never call
 * with allocator/filesystem metadata inconsistent or from an IRQ. */
extern void kernel_service(void) __attribute__((weak));
static inline void cooperative_checkpoint(void){if(kernel_service)kernel_service();}
void logstr(const char *s);
/* runtime.c: freestanding bulk primitives (SSE2 for 64 bytes and up). */
void *memcpy(void *dst,const void *src,size_t count);
void *memmove(void *dst,const void *src,size_t count);
void *memset(void *dst,int value,size_t count);
int memcmp(const void *a,const void *b,size_t count);
/* sse.S: masked 32-bit copy for the present path (dst[i] = src[i] & 0xffffff). */
void slopix_mask_copy(uint32_t *dst,const uint32_t *src,size_t pixels);
void panic(const char *s) __attribute__((noreturn));
void decimal(uint64_t n,char *s);
size_t length(const char *s);
void copystr(char *dest,const char *src,size_t cap);
void arch_init(void);
void arch_mmio_uncached(uint64_t base,uint64_t bytes);
/* Save/restore, never blindly enable IRQs; compiler barriers protect shared state. */
static inline uint64_t irq_save(void){uint64_t flags;__asm__ volatile("pushfq; popq %0; cli":"=r"(flags)::"memory");return flags;}
static inline void irq_restore(uint64_t flags){__asm__ volatile("pushq %0; popfq"::"r"(flags):"memory","cc");}
uint64_t ticks_now(void);
uint64_t timer_us(void);
const char *arch_clock_name(void);
void reboot(void);
void graphics_resize(void (*service)(void));
void desktop_resized(unsigned oldw,unsigned oldh);
void input_display_resize(int *x,int *y);
void graphics_init(volatile uint8_t *addr,uint8_t r,uint8_t g,uint8_t b);
void pixel(int x,int y,uint32_t c);
uint32_t readpixel(int x,int y);
uint32_t blend(uint32_t a,uint32_t b,unsigned t);
void rect(int x,int y,int w,int h,uint32_t c);
void roundbox(int x,int y,int w,int h,int r,uint32_t c,unsigned alpha);
void text(int x,int y,const char *s,uint32_t c);
void disc(int x,int y,int r,uint32_t c);
void background_save(void);
void background_restore(void);
void present(void);
void graphics_clip(struct region r);
void graphics_reset_clip(void);
void graphics_target(uint32_t *buffer,int w,int h);
uint32_t native_color(uint32_t c);
int graphics_standard(void);
void damage(int x,int y,int w,int h);
int damage_pending(void);
unsigned damage_count(void);
struct region damage_get(unsigned i);
void blit(const uint32_t *source,int stride,int x,int y,int w,int h);
void rgba_blit(const uint8_t *source,int w,int h,int x,int y);
void background_restore_region(struct region r);
void cursor_present(int x,int y);
void terminal_init(void);
void terminal_draw(int x,int y,int w,int h,int focused);
void terminal_key(unsigned key);
void terminal_scroll(int delta);
void terminal_focus(void);
enum { KEY_ENTER=256,KEY_BACKSPACE,KEY_LEFT,KEY_RIGHT,KEY_HOME,KEY_END,KEY_UP,KEY_DOWN,KEY_PGUP,KEY_PGDN,KEY_DELETE,KEY_CLEAR,KEY_ERASE,KEY_TAB,KEY_ESCAPE,KEY_COPY,KEY_PASTE,KEY_REFRESH };
void desktop_init(void);
void desktop_render(void);
void desktop_step(uint64_t now);
void cube_init(void);
void cube_render(uint64_t now,int w,int h);
void cube_draw(int x,int y,int w,int h);
void cube_presented(uint64_t now,uint64_t render_us,uint64_t compose_us,uint64_t upload_us);
void cube_reset_stats(uint64_t now);
void desktop_mouse(int x,int y,int buttons);
void desktop_key(unsigned key);
void desktop_shortcut(unsigned action);
int desktop_find_focused(void);
void input_init(void);
void input_poll(void);
void scaled_blit(const uint32_t *source,int sw,int sh,int x,int y,int w,int h);
void rgba_scaled(const uint8_t *source,int sw,int sh,int x,int y,int w,int h);
void doom_open(void);
void doom_close(void);
int doom_update(uint64_t now,int visible);
void doom_damage(int x,int y,int w,int h);
void doom_draw(int x,int y,int w,int h);
void doom_focus(int on);
void doom_scancode(unsigned code,int ext,int down);
void doom_release_keys(void);
int doom_take_quit(void);
void desktop_scancode(unsigned code,int ext,int down);
void cube_select(unsigned model);
unsigned cube_model(void);
#endif

int input_alt_down(void);
int input_ctrl_down(void);
int input_shift_down(void);
