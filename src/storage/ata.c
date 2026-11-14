/* SPDX-License-Identifier: GPL-3.0-or-later
 * QEMU PC legacy primary-master ATA, one 512-byte LBA28 sector per command.
 * Main-thread only. IRQ14 disabled at device; PIT IRQ wakes bounded waits.
 * No arbitrary pointers/sector counts supplied by callers to the hardware.
 */
#include "../kernel.h"
#include "storage.h"
static struct block_device disk;
static int online;
static unsigned last_status;
static char last_op;
static uint16_t inw(uint16_t p){uint16_t v;__asm__ volatile("inw %1,%0":"=a"(v):"Nd"(p));return v;}
static void outw(uint16_t p,uint16_t v){__asm__ volatile("outw %0,%1"::"a"(v),"Nd"(p));}
static void delay(void){for(unsigned i=0;i<4;i++)(void)inb(0x3f6);}
/* Poll the status register. `timeout_us` differs per command class: a data
 * transfer finishes in microseconds, while FLUSH CACHE waits for the host
 * filesystem to sync and can legitimately take far longer than a sector. */
static int wait_status(int drq,unsigned timeout_us){
    uint64_t start=timer_us();unsigned budget=2000000;
    while(budget--){
        uint8_t s=inb(0x3f6);
        last_status=s;
        if(!s||s==255)return 0;
        if(!(s&0x80)){
            if(s&0x21)return 0;
            if(drq?(s&8):!(s&8))return 1;
        }
        if(timer_us()-start>=timeout_us)return 0;
        /* Fast commands finish immediately; sleep only after a short poll. */
        if(budget%64==0){cooperative_checkpoint();__asm__ volatile("hlt");}
    }
    return 0;
}
/* The status byte is the only clue a user gets on real hardware, so keep it. */
static int fail(void){online=0;char n[21];logstr("STORAGE_IO_ERROR: ATA offline until reboot (op=");
 logstr(last_op=='w'?"write":last_op=='f'?"flush":"read");logstr(" status=");decimal(last_status,n);logstr(n);logstr(")\n");return 0;}
/* A command that never reports completion leaves the interface busy forever.
 * Reset both channels, re-select the master and let the drive settle again. */
static void bus_reset(void){
    outb(0x3f6,0x04);delay();outb(0x3f6,0x00);delay();
    outb(0x1f6,0xa0);delay();
    (void)wait_status(0,2000000);
}
static int transfer_once(uint32_t lba,void *data,int write){
    last_op=write?'w':'r';last_status=0;
    outb(0x1f6,(uint8_t)(0xe0|(lba>>24)));delay();
    /* Generous: a previous FLUSH may still be draining. */
    if(!wait_status(0,2000000))return 0;
    outb(0x1f2,1);outb(0x1f3,(uint8_t)lba);outb(0x1f4,(uint8_t)(lba>>8));outb(0x1f5,(uint8_t)(lba>>16));
    outb(0x1f7,write?0x30:0x20);delay();
    if(!wait_status(1,100000))return 0;
    uint8_t *b=data;
    for(unsigned i=0;i<256;i++){
        if(write)outw(0x1f0,(uint16_t)(b[2*i]|(uint16_t)b[2*i+1]<<8));
        else {uint16_t v=inw(0x1f0);b[2*i]=(uint8_t)v;b[2*i+1]=(uint8_t)(v>>8);}
    }
    delay();return wait_status(0,1000000)?1:0;
}
/* Emulated (and occasionally real) controllers drop a single command; retry a
 * couple of times before declaring the disk dead for the session. */
static int transfer(uint32_t lba,void *data,int write){
    if(!online||lba>=disk.sectors||lba>=0x10000000)return 0;
    for(int attempt=0;attempt<3;attempt++){
        if(attempt)bus_reset();
        if(transfer_once(lba,data,write))return 1;
    }
    return fail();
}
static int read_sector(uint32_t lba,void *buffer){return transfer(lba,buffer,0);}
static int write_sector(uint32_t lba,const void *buffer){return transfer(lba,(void *)buffer,1);}
static int flush(void){
    if(!online)return 0;
    for(int attempt=0;attempt<3;attempt++){
        if(attempt)bus_reset();
        last_op='f';last_status=0;outb(0x1f7,0xe7);delay();
        if(wait_status(0,5000000))return 1;
    }
    return fail();
}
struct block_device *ata_init(void){
    online=0;disk=(struct block_device){0,read_sector,write_sector,flush};
    outb(0x3f6,2);outb(0x1f6,0xa0);delay();
    if(!inb(0x1f7)||inb(0x1f7)==255)return 0;
    outb(0x1f2,0);outb(0x1f3,0);outb(0x1f4,0);outb(0x1f5,0);outb(0x1f7,0xec);delay();
    if(!wait_status(1,2000000)||inb(0x1f4)||inb(0x1f5))return 0;
    uint16_t id[256];for(unsigned i=0;i<256;i++)id[i]=inw(0x1f0);
    if(!(id[49]&(1u<<9)))return 0;
    uint32_t n=(uint32_t)id[60]|(uint32_t)id[61]<<16;
    if(!n)return 0;
    disk.sectors=n<0x10000000?n:0x10000000;online=1;
    logstr("ATA_PRIMARY_MASTER sectors=");char value[21];decimal(disk.sectors,value);logstr(value);logstr("\n");
    return &disk;
}
