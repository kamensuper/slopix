/* SPDX-License-Identifier: GPL-3.0-or-later
 * Minimal RTL8139 PCI IO driver for QEMU. Ring-buffer receive, four DMA TX
 * descriptors, strict frame bounds, device interrupts masked (polling only).
 * DMA buffers reside in the low identity-mapped kernel .bss, never user pages.
 */
#include "rtl8139.h"
#include "../kernel.h"
#define RX_BYTES 8192u
static _Alignas(256) volatile uint8_t rx[RX_BYTES+16+2048];
static _Alignas(16) uint8_t tx[4][2048];
static uint8_t mac[6];
static uint16_t port;
static unsigned rx_at, tx_at;
static int ready;
static uint32_t inl(uint16_t p){uint32_t x;__asm__ volatile("inl %1,%0":"=a"(x):"Nd"(p));return x;}
static void outl(uint16_t p,uint32_t x){__asm__ volatile("outl %0,%1"::"a"(x),"Nd"(p));}
static uint16_t inw(uint16_t p){uint16_t x;__asm__ volatile("inw %1,%0":"=a"(x):"Nd"(p));return x;}
static void outw(uint16_t p,uint16_t x){__asm__ volatile("outw %0,%1"::"a"(x),"Nd"(p));}
static uint32_t pci_read(unsigned slot,unsigned reg){outl(0xcf8,0x80000000u|(slot<<11)|(reg&0xfc));return inl(0xcfc);}
static void pci_write(unsigned slot,unsigned reg,uint32_t value){outl(0xcf8,0x80000000u|(slot<<11)|(reg&0xfc));outl(0xcfc,value);}
static void rx_setup(void){
 outl(port+0x30,(uint32_t)(uintptr_t)rx); /* RBSTART */
 rx_at=0;
 outl(port+0x44,0x0000e78a); /* 8K RX + NoWrap, FIFO/DMA=7, physical+broadcast only */
 outb(port+0x37,0x0c); /* RE | TE */
 outw(port+0x38,0xfff0); /* CAPR = -16: empty until CBR advances */
}
int rtl8139_init(void){
 ready=0;port=0;
 for(unsigned s=0;s<32;s++){
  uint32_t vendor=pci_read(s,0);
  if(vendor!=0x813910ecu)continue;
  uint32_t bar=pci_read(s,0x10);
  if(!(bar&1)||!(bar&~3u)||((bar&~3u)>0xff00))continue;
  port=(uint16_t)(bar&~3u);
  pci_write(s,4,(pci_read(s,4)&0xffffu)|5u); /* keep RW1C status bits clear */ /* PCI memory/IO and bus master */
  break;
 }
 if(!port)return 0;
 if((uintptr_t)rx>UINT32_MAX||(uintptr_t)tx>UINT32_MAX)return 0;
 outb(port+0x52,0); /* leave low-power mode */
 outb(port+0x37,0x10); /* reset */
 unsigned tries=200000;while((inb(port+0x37)&0x10)&&--tries)__asm__ volatile("pause");
 if(!tries)return 0;
 for(unsigned i=0;i<6;i++)mac[i]=inb(port+i);
 if(!(mac[0]|mac[1]|mac[2]|mac[3]|mac[4]|mac[5]))return 0;
 outw(port+0x3c,0); /* disable IRQ delivery completely */
 tx_at=0;
 outl(port+0x40,0x03000700); /* TX DMA burst */
 rx_setup();ready=1;
 logstr("NET_RTL8139_READY: polling DMA, IRQ masked\n");return 1;
}
int rtl8139_ready(void){return ready;}
const uint8_t *rtl8139_mac(void){return mac;}
int rtl8139_send(const uint8_t *frame,unsigned bytes){
 if(!ready||!frame||bytes<14||bytes>1514)return 0;
 unsigned i=tx_at&3u;
 /* Completed descriptor may be reused; all four descriptors have TOK set at reset. */
 uint32_t st=inl(port+0x10+4*i);
 if(!(st&(1u<<13))&&st!=0)return 0;
 for(unsigned j=0;j<bytes;j++)tx[i][j]=frame[j];
 if(bytes<60){for(unsigned j=bytes;j<60;j++)tx[i][j]=0;bytes=60;}
 outl(port+0x20+4*i,(uint32_t)(uintptr_t)tx[i]);
 __asm__ volatile("":::"memory"); /* publish DMA buffer before transmit */
 outl(port+0x10+4*i,bytes);
 tx_at++;return 1;
}
void rtl8139_poll(void (*receive)(const uint8_t*,unsigned)){
 if(!ready)return;
 /* Upper bound keeps malformed/corrupted device state from wedging the loop. */
 for(unsigned frames=0;frames<16&&!(inb(port+0x37)&1);frames++){
  unsigned at=rx_at%RX_BYTES;
  uint16_t status=(uint16_t)(rx[at]|(uint16_t)rx[at+1]<<8);
  uint16_t size=(uint16_t)(rx[at+2]|(uint16_t)rx[at+3]<<8);
  if(!(status&1)||size<18||size>1518){
   /* RX reset after malformed DMA header; do not pass garbage to the stack. */
   outb(port+0x37,0x10);{unsigned t=200000;while((inb(port+0x37)&0x10)&&--t)__asm__ volatile("pause");}
   rx_setup();outw(port+0x38,0xfff0);break;
  }
  static uint8_t frame[1514];
  unsigned len=size-4; /* strip Ethernet CRC */
  for(unsigned j=0;j<len;j++)frame[j]=rx[at+4+j];
  rx_at=((rx_at+size+4+3)&~3u)%RX_BYTES;
  outw(port+0x38,(uint16_t)(rx_at-16));
  if(receive)receive(frame,len);
 }
 /* Ack unused ISR bits; polling is deliberate, not half-enabled IRQ handling. */
 outw(port+0x3e,inw(port+0x3e));
}
