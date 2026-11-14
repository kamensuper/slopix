#include "kernel.h"
#include "user/process.h"
struct __attribute__((packed)) gate { uint16_t low,cs; uint8_t ist,flags; uint16_t mid; uint32_t high,zero; };
static struct gate idt[256];
extern void *exception_stubs[32];
extern void syscall_entry(void);
extern void irq_timer(void),irq_keyboard(void),irq_mouse(void),irq_audio(void);
static volatile uint64_t ticks;
static volatile uint32_t *hpet;
static uint32_t hpet_period_fs;
static uint64_t hpet_read(void) {
    /* Split MMIO reads stay coherent across the low word's ~43-second wrap. */
    uint32_t high,low,again;
    do {high=hpet[0xf4/4];low=hpet[0xf0/4];again=hpet[0xf4/4];}while(high!=again);
    return (uint64_t)high<<32|low;
}
const char *arch_clock_name(void){return hpet?"Clocksource: HPET free-running counter":"Clocksource: PIT IRQ-count fallback";}
static void clock_init(void) {
    /* QEMU PC's standard HPET address; capability-check, otherwise retain PIT.
     * This is not ACPI discovery or a claim of support for arbitrary hardware. */
    arch_mmio_uncached(0xfed00000,4096);
    volatile uint32_t *candidate=(volatile uint32_t *)(uintptr_t)0xfed00000;
    uint32_t cap=candidate[0],period=candidate[1];
    if((cap&0xff)&&(cap&(1u<<13))&&period>=100000&&period<=100000000) {
        uint32_t config=candidate[0x10/4];candidate[0x10/4]=config&~3u;
        for(unsigned i=0;i<=((cap>>8)&31);i++)candidate[(0x100+i*0x20)/4]&=~4u; // unused comparator IRQs off
        candidate[0xf0/4]=0;candidate[0xf4/4]=0;
        candidate[0x10/4]=(config&~2u)|1u; // enable, never take over legacy PIT IRQs
        hpet_period_fs=period;hpet=candidate;
    }
    logstr(arch_clock_name());logstr("\n");
}
static void setgate(unsigned n,uintptr_t address) {
    idt[n]=(struct gate){address&65535,8,0,0x8e,(address>>16)&65535,(uint32_t)(address>>32),0};
}
void arch_fault(uint64_t vector,uint64_t error,uint64_t rip) {
    char n[21]; logstr("FAULT vector=");decimal(vector,n);logstr(n);
    logstr(" error=");decimal(error,n);logstr(n);logstr(" rip=");decimal(rip,n);logstr(n);
    if(vector==14){uint64_t address;__asm__ volatile("mov %%cr2,%0":"=r"(address));logstr(" cr2=");decimal(address,n);logstr(n);logstr(error&16?" instruction":" data");logstr(error&2?" write":" read");logstr(error&1?" protection":" not-present");}
    logstr("\n");panic("CPU exception");
}
void timer_irq(void) { ticks++; outb(0x20,0x20); }
void timer_dispatch(struct user_frame*f){timer_irq();process_timer(f);}
uint64_t ticks_now(void) { return ticks; }
uint64_t timer_us(void) {
    if(hpet) {
        uint64_t count=hpet_read();
        return (count/1000000000)*hpet_period_fs+(count%1000000000)*hpet_period_fs/1000000000;
    }
    /* Exact nominal conversion for PIT fallback; delayed IRQs can still coalesce. */
    uint64_t value=ticks,seconds=value/1193182,remainder=value%1193182;
    return seconds*1193000000ULL+remainder*1193000000ULL/1193182;
}
void arch_mmio_uncached(uint64_t base,uint64_t bytes) {
    if(base>=0x100000000ULL||bytes>0x100000000ULL-base)panic("MMIO outside identity map");
    if(!bytes)return;
    extern uint64_t boot_page_directories[];
    for(uint64_t p=base>>21;p<((base+bytes+0x1fffffULL)>>21);p++)boot_page_directories[p]|=0x18; // PCD/PWT on huge MMIO pages
    uintptr_t cr3;__asm__ volatile("mov %%cr3,%0; mov %0,%%cr3":"=r"(cr3)::"memory");
}
void arch_init(void) {
    for(unsigned i=0;i<32;i++) setgate(i,(uintptr_t)exception_stubs[i]);
    setgate(32,(uintptr_t)irq_timer);
    setgate(33,(uintptr_t)irq_keyboard);
    setgate(44,(uintptr_t)irq_mouse);
    setgate(37,(uintptr_t)irq_audio);
    setgate(128,(uintptr_t)syscall_entry);idt[128].flags=0xee;
    struct __attribute__((packed)) { uint16_t limit; uint64_t base; } ptr={sizeof(idt)-1,(uintptr_t)idt};
    __asm__ volatile("lidt %0"::"m"(ptr));
    /* Remap PICs; PS/2 IRQs are unmasked after device initialization. */
    outb(0x20,0x11);outb(0xa0,0x11);outb(0x21,32);outb(0xa1,40);
    outb(0x21,4);outb(0xa1,2);outb(0x21,1);outb(0xa1,1);
    outb(0x21,0xfe);outb(0xa1,0xff);
    outb(0x43,0x34);outb(0x40,1193&255);outb(0x40,1193>>8);
    clock_init();
    __asm__ volatile("sti");
    logstr("IDT/PIC/PIT ready: approximately 1000 Hz\n");
}
void reboot(void) {
    __asm__ volatile("cli");
    unsigned n=100000;while((inb(0x64)&2)&&--n) {}
    if(n) outb(0x64,0xfe);
    /* If the controller cannot reset, a null IDT deliberately triple-faults. */
    struct __attribute__((packed)) { uint16_t limit;uint64_t base; } empty={0,0};
    __asm__ volatile("lidt %0; int3"::"m"(empty));
    for(;;) __asm__ volatile("hlt");
}
/* CPUID is read-only; no scheduling or host specification guesses. */
void arch_cpu_name(char*out,unsigned cap){
 uint32_t a,b,c,d;__asm__ volatile("cpuid":"=a"(a),"=b"(b),"=c"(c),"=d"(d):"a"(0x80000000u),"c"(0));
 if(a<0x80000004u){copystr(out,"CPU identification unavailable",cap);return;}
 char brand[49];for(unsigned i=0;i<3;i++){__asm__ volatile("cpuid":"=a"(a),"=b"(b),"=c"(c),"=d"(d):"a"(0x80000002u+i),"c"(0));uint32_t vals[]={a,b,c,d};for(unsigned j=0;j<4;j++)for(unsigned k=0;k<4;k++)brand[i*16+j*4+k]=(char)(vals[j]>>(k*8));}brand[48]=0;copystr(out,brand,cap);
}
static uint8_t rtc(unsigned i){outb(0x70,(uint8_t)i);return inb(0x71);}
int arch_date(char*out,unsigned cap){
 if(cap<40)return 0;
 uint8_t a[6],b[6];const unsigned regs[]={0,2,4,7,8,9};unsigned tries;
 for(tries=0;tries<8;tries++){if(rtc(10)&128)continue;for(unsigned i=0;i<6;i++)a[i]=rtc(regs[i]);if(rtc(10)&128)continue;for(unsigned i=0;i<6;i++)b[i]=rtc(regs[i]);unsigned i=0;while(i<6&&a[i]==b[i])i++;if(i==6)break;}if(tries==8)return 0;
 unsigned fmt=rtc(11),pm=a[2]&128;a[2]&=127;for(unsigned i=0;i<6;i++)if(!(fmt&4))a[i]=(a[i]&15)+(a[i]>>4)*10;if(!(fmt&2))a[2]=(a[2]%12)+(pm?12:0);
 if(a[0]>59||a[1]>59||a[2]>23||a[3]<1||a[3]>31||a[4]<1||a[4]>12)return 0;
 copystr(out,"RTC 20YY-MM-DD HH:MM:SS (hardware clock)",cap);const unsigned pos[]={21,18,15,12,9,6};for(unsigned i=0;i<6;i++){out[pos[i]]=(char)('0'+a[i]/10);out[pos[i]+1]=(char)('0'+a[i]%10);}return 1;
}
