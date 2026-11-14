/* QEMU PCI standard VGA / Bochs DISPI. All mode changes run on the main
 * thread. BAR0 must match GRUB's framebuffer; the full VRAM aperture is
 * reserved and mapped uncached before the PMM is sealed. Other GPUs retain
 * the boot framebuffer. No BIOS calls, host-window resize protocol or GPU 3D. */
#include "../kernel.h"
#include "../audio/audio.h"
#include "display.h"
#include "../preferences.h"
static uint64_t aperture;
static int available;
static const char *error="Fixed boot framebuffer; runtime modes unavailable";
static const unsigned modes[][2]={{1024,600},{1024,768},{1280,720},{1280,800},{1440,900},{1600,900},{1920,1080}};
static void outw(uint16_t port,uint16_t v){__asm__ volatile("outw %0,%1"::"a"(v),"Nd"(port));}
static uint16_t inw(uint16_t port){uint16_t v;__asm__ volatile("inw %1,%0":"=a"(v):"Nd"(port));return v;}
static uint16_t reg(unsigned i){outw(0x1ce,(uint16_t)i);return inw(0x1cf);}
static void set(unsigned i,unsigned v){outw(0x1ce,(uint16_t)i);outw(0x1cf,(uint16_t)v);}
static uint32_t pci(unsigned dev,unsigned offset){uint32_t addr=0x80000000u|(dev<<11)|offset,v;__asm__ volatile("outl %0,%1"::"a"(addr),"Nd"((uint16_t)0xcf8));__asm__ volatile("inl %1,%0":"=a"(v):"Nd"((uint16_t)0xcfc));return v;}
void display_init(uint64_t framebuffer,uint64_t bytes,int rgb_standard){
    aperture=bytes;
    if(!rgb_standard)return;
    /* PC machine's standard VGA sits on PCI bus 0. Do not probe or modify BARs. */
    for(unsigned d=0;d<32;d++)if(pci(d,0)==0x11111234u){
        uint32_t bar=pci(d,0x10);uint16_t id=reg(0);
        if((bar&7)||((uint64_t)(bar&~15u))!=framebuffer||!(pci(d,4)&2)||id<0xb0c2||id>0xb0c5)return;
        uint64_t ram=(uint64_t)reg(10)*65536;
        if(ram<bytes||ram<(uint64_t)MAX_W*MAX_H*4||ram>64*1024*1024u||framebuffer+ram>0x100000000ULL)return;
        aperture=ram;available=1;error="Display ready";logstr("DISPLAY_DISPI_READY\n");return;
    }
}
uint64_t display_reserved_bytes(void){return aperture;}
int display_available(void){return available;}
const char *display_error(void){return error;}
static void service_audio(void){audio_step(timer_us());}
int display_set(unsigned w,unsigned h){
    if(!available){error="Runtime resolution requires QEMU PCI standard VGA";return 0;}
    if(w<800||h<600||w>MAX_W||h>MAX_H||(w&7)||(uint64_t)w*h*4>aperture){error="Display: width 800..1920 (multiple of 8), height 600..1080";return 0;}
    if(w==width&&h==height){error="Display unchanged";return 1;}
    unsigned old[10];for(unsigned i=1;i<10;i++)old[i]=reg(i);
    set(4,0);set(1,w);set(2,h);set(3,32);set(6,w);set(8,0);set(9,0);set(4,0x41);
    unsigned stride=reg(6);
    if(reg(1)!=w||reg(2)!=h||reg(3)!=32||stride!=w||reg(7)<h||(reg(4)&0x41)!=0x41){
        set(4,0);set(1,old[1]);set(2,old[2]);set(3,old[3]);set(5,old[5]);set(6,old[6]);set(8,old[8]);set(9,old[9]);set(4,old[4]);
        if(reg(1)!=old[1]||reg(2)!=old[2]||reg(3)!=old[3]||reg(6)!=old[6])panic("display mode rollback failed");
        error="Display controller rejected mode; previous mode restored";return 0;
    }
    unsigned ow=width,oh=height;width=w;height=h;pitch=stride*4;
    graphics_resize(service_audio);desktop_resized(ow,oh);audio_step(timer_us());
    char n[21];logstr("DISPLAY_MODE ");decimal(w,n);logstr(n);logstr("x");decimal(h,n);logstr(n);logstr(" pitch=");decimal(pitch,n);logstr(n);logstr("\n");
    if(prefs.display_w!=w||prefs.display_h!=h){prefs.display_w=w;prefs.display_h=h;preferences_changed(0);}
    error="Display mode applied";return 1;
}
int display_cycle(void){unsigned i;for(i=0;i<sizeof(modes)/sizeof(modes[0]);i++)if(modes[i][0]==width&&modes[i][1]==height)break;i=i<sizeof(modes)/sizeof(modes[0])?(i+1)%(sizeof(modes)/sizeof(modes[0])):0;return display_set(modes[i][0],modes[i][1]);}
