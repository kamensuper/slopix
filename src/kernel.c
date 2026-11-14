#include "kernel.h"
#include "perf.h"
#include "user/process.h"
#include "preferences.h"
#include "ui/desktop_backend.h"
#include "display/display.h"
#include "memory.h"
#include "heap.h"
#include "net/stack.h"
#include "display/display.h"
#include "audio/audio.h"
#include "storage/storage.h"
struct __attribute__((packed)) fb_tag {
    uint32_t type,size; uint64_t addr; uint32_t pitch,w,h;
    uint8_t bpp,kind; uint16_t reserved;
    uint8_t rpos,rbits,gpos,gbits,bpos,bbits;
};
uint32_t width,height,pitch;
uint64_t boot_usable;
int scene_dirty=1;
size_t length(const char *s) {size_t n=0;while(s[n])n++;return n;}
void copystr(char *d,const char *s,size_t cap) {if(!cap)return;size_t i=0;while(s[i]&&i+1<cap){d[i]=s[i];i++;}d[i]=0;}
static void serial_init(void) {
    outb(0x3f9,0); outb(0x3fb,0x80); outb(0x3f8,1); outb(0x3f9,0);
    outb(0x3fb,3); outb(0x3fa,0xc7); outb(0x3fc,0x0b);
}
void logstr(const char *s) {
    while (*s) { unsigned n=100000; while (!(inb(0x3fd)&32) && --n) {} outb(0x3f8,(uint8_t)*s++); }
}
static __attribute__((noreturn)) void halt(void) { for (;;) __asm__ volatile("cli; hlt"); }
void panic(const char *s) { logstr("PANIC: "); logstr(s); logstr("\n"); halt(); }
void decimal(uint64_t n,char *s) {
    char b[21]; unsigned k=0,i=0; do { b[k++]=(char)('0'+n%10); n/=10; } while(n);
    while(k) { s[i++]=b[--k]; }
    s[i]=0;
}
void kernel_service(void){audio_checkpoint();}
void kernel_main(uint32_t info,uint32_t magic) {
    serial_init(); logstr("Slopix 0.9: entered x86-64 C kernel\n");
    if(magic!=0x36d76289) panic("bad Multiboot2 magic");
    if(info<4096||(info&7)) panic("invalid boot information address");
    uint32_t total=*(const uint32_t *)(uintptr_t)info;
    if(total<16||total>16*1024*1024||(uint64_t)info+total>0x100000000ULL) panic("invalid boot information size");
    struct fb_tag *fb=0; unsigned map_count=0;
    uintptr_t p=(uintptr_t)info+8,end=(uintptr_t)info+total; int ended=0;
    while(p+8<=end) {
        const uint32_t *tag=(const uint32_t *)p;
        if(tag[1]<8||tag[1]>end-p) panic("malformed boot tag");
        if(tag[0]==0) {if(tag[1]!=8||p+8!=end)panic("invalid end tag");ended=1;break;}
        if(tag[0]==8) {if(fb||tag[1]<38)panic("invalid framebuffer tag");fb=(struct fb_tag *)p;}
        if(tag[0]==3&&(tag[1]<16||tag[3]<tag[2]))panic("invalid boot module");
        if(tag[0]==6) {
            if(tag[1]<16||++map_count!=1)panic("invalid memory map tag");
            uint32_t step=tag[2];
            if(step<24||tag[3]!=0||(tag[1]-16)%step)panic("invalid memory map stride/version");
            for(uintptr_t q=p+16;q+24<=p+tag[1];q+=step) {
                const uint64_t *entry=(const uint64_t *)q;
                if(entry[1]>UINT64_MAX-entry[0])panic("memory map range overflow");
            }
        }
        p+=(tag[1]+7U)&~7U;
    }
    if(!ended||map_count!=1) panic("missing end tag or memory map");
    if(!fb) panic("no framebuffer");
    if(fb->kind!=1||fb->bpp!=32||fb->rbits!=8||fb->gbits!=8||fb->bbits!=8) panic("requires direct RGB888 in 32bpp");
    if(fb->rpos>24||fb->gpos>24||fb->bpos>24 ||
       ((0xffu<<fb->rpos)&(0xffu<<fb->gpos)) ||
       ((0xffu<<fb->rpos)&(0xffu<<fb->bpos)) ||
       ((0xffu<<fb->gpos)&(0xffu<<fb->bpos))) panic("invalid RGB masks");
    if(fb->w<800||fb->h<600||fb->w>MAX_W||fb->h>MAX_H||fb->pitch<(uint64_t)fb->w*4) panic("unsupported display geometry");
    uint64_t bytes=(uint64_t)fb->pitch*fb->h;
    if(!fb->addr||fb->addr>=0x100000000ULL||bytes>0x100000000ULL-fb->addr) panic("framebuffer outside identity map");
    extern char kernel_end[];
    display_init(fb->addr,bytes,fb->rpos==16&&fb->gpos==8&&fb->bpos==0);
    uint64_t reserved=display_reserved_bytes();
    uint64_t fb_end=fb->addr+reserved;
    if((fb->addr<(uintptr_t)kernel_end&&fb_end>0x100000)||(fb->addr<end&&fb_end>info))panic("framebuffer overlaps retained boot memory");
    memory_init(info,fb->addr,reserved);
    heap_init();
    arch_mmio_uncached(fb->addr,reserved);
    width=fb->w;height=fb->h;pitch=fb->pitch;
    graphics_init((volatile uint8_t *)(uintptr_t)fb->addr,fb->rpos,fb->gpos,fb->bpos);
    arch_init();
    input_init();
    struct block_device *disk=ata_init();
    if(fat_mount(disk))logstr(fat_info().writable?"FAT32_MOUNTED_RW\n":"FAT32_MOUNTED_RO\n");
    else {logstr("STORAGE: ");logstr(fat_error());logstr("\n");}
    extern const struct fs_backend fat32_backend;
    if(!vfs_bind(&fat32_backend))panic("filesystem backend binding failed");
    net_init();
    audio_init();
    preferences_init();
    /* SlopDE is the default desktop; dwm remains selectable. A stored config
     * must explicitly ask for dwm to override the default. Selection is
     * boot-only; the marker lets tests verify the active backend. */
    if(!desktop_backend_select_by_name(prefs.desktop_backend==1?"dwm":"slopde"))panic("desktop backend selection failed");
    logstr("DESKTOP_BACKEND: ");logstr(desktop_backend_name());logstr("\n");
    process_init();
    terminal_init();
    desktop_init();
    if(display_available()&&(width!=prefs.display_w||height!=prefs.display_h))display_set(prefs.display_w,prefs.display_h);
    else desktop_background_changed();
    desktop_render();
#ifdef RENDER_BENCH
    uint64_t begin=timer_us();
    for(unsigned i=0;i<120;i++){damage(0,0,(int)width,(int)height);desktop_render();}
    char value[21];decimal(timer_us()-begin,value);
    logstr("OPTIMIZED_RENDER_120_US: ");logstr(value);logstr("\n");
#endif
    logstr("INTERACTIVE_DESKTOP_READY\n");
    for(;;) {
        uint64_t loop=timer_us(),begin=loop;net_poll();input_poll();perf_add(P_INPUT,timer_us()-begin);
        audio_step(timer_us());begin=timer_us();desktop_step(begin);perf_add(P_DESKTOP,timer_us()-begin);
        /* A syscall returns to the scheduler with the process still runnable.
         * Service a bounded batch before idling, while retaining desktop/audio
         * responsiveness. One syscall per timer IRQ made file loading glacial. */
        int ran=0;for(unsigned i=0;i<8&&process_step();i++)ran=1;
        perf_add(P_LOOP,timer_us()-loop);perf_log(timer_us());begin=timer_us();
        /* IRQ0 wakes at 1 ms; input IRQs wake immediately. No frame spin loop. */
        if(!ran)__asm__ volatile("hlt");
        perf_add(P_WAIT,timer_us()-begin);
    }
}
