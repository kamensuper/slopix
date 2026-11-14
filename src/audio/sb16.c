/* SPDX-License-Identifier: GPL-3.0-or-later
 * QEMU/ISA SB16: base 0x220, IRQ5, 8-bit DMA1. No PCI/USB/HDA claim.
 * ISA DMA uses physical addresses: linker places this whole 2048-byte ring
 * below 16 MiB without crossing a 64KiB boundary; kernel PMM reserves it.
 * IRQ only acknowledges and counts blocks. Main thread alone fills PCM.
 */
#include "../kernel.h"
#include "audio.h"
#include "device.h"
static uint8_t dma[AUDIO_HALF*AUDIO_BLOCKS] __attribute__((section(".audio_dma"),aligned(65536)));
static volatile uint32_t completed;
static int ready;
static int send(uint8_t value){
    uint64_t until=timer_us()+10000;unsigned bound=100000;
    while(inb(0x22c)&0x80)if(! --bound||timer_us()>=until)return 0;
    outb(0x22c,value);return 1;
}
static int read_dsp(void){
    uint64_t until=timer_us()+10000;unsigned bound=100000;
    while(!(inb(0x22e)&0x80))if(! --bound||timer_us()>=until)return -1;
    return inb(0x22a);
}
static void mixer(uint8_t reg,uint8_t value){outb(0x224,reg);outb(0x225,value);}
void audio_irq(void){
    /* Ignore a stale PIC edge after stop/restart; count only an SB8 DMA IRQ. */
    outb(0x224,0x82);uint8_t source=inb(0x225);
    if(source&1){(void)inb(0x22e);completed++;}
    if(source&2)(void)inb(0x22f);
    outb(0x20,0x20);
}
uint32_t sb16_blocks(void){return completed;}
void sb16_write_half(unsigned half,const uint8_t *data){if(half>=AUDIO_BLOCKS)return;for(unsigned i=0;i<AUDIO_HALF;i++)dma[half*AUDIO_HALF+i]=data[i];__asm__ volatile("":::"memory");}
void sb16_stop(void){
    if(!ready)return;
    outb(0x0a,5); /* mask DMA1 first; bounded DSP pause, no wait for IRQ */
    (void)send(0xd0);(void)inb(0x22e);
}
int sb16_init(void){
    uintptr_t address=(uintptr_t)dma;
    if(address>=0x1000000||(address&65535)+sizeof(dma)>65536)return 0;
    outb(0x226,1);uint64_t until=timer_us()+10;
    while(timer_us()<until)__asm__ volatile("pause"); /* DSP reset needs >=3us */
    outb(0x226,0);if(read_dsp()!=0xaa)return 0;
    if(!send(0xe1))return 0;
    int major=read_dsp(),minor=read_dsp();if(major<4||minor<0)return 0;
    mixer(0x80,2);mixer(0x81,2); /* IRQ5, DMA1 */
    mixer(0x22,0xff);mixer(0x04,0xff);
    ready=1;outb(0x21,inb(0x21)&~(1u<<5));
    logstr("AUDIO_SB16_READY IRQ5 DMA1\n");return 1;
}
int sb16_start(void){
    if(!ready)return 0;
    sb16_stop();uint64_t flags=irq_save();completed=0;
    uintptr_t addr=(uintptr_t)dma;unsigned count=sizeof(dma)-1;
    outb(0x0a,5);outb(0x0c,0);outb(0x0b,0x59); /* single, auto-init, memory->device, ch1 */
    outb(0x02,addr&255);outb(0x02,(addr>>8)&255);outb(0x83,(addr>>16)&255);
    outb(0x03,count&255);outb(0x03,count>>8);outb(0x0a,1);
    int ok=send(0xd1)&&send(0x41)&&send(AUDIO_RATE>>8)&&send(AUDIO_RATE&255)&&send(0xc6)&&send(0)&&send((AUDIO_HALF-1)&255)&&send((AUDIO_HALF-1)>>8);
    irq_restore(flags);if(!ok)sb16_stop();return ok;
}
