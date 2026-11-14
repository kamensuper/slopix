#include "slopix.h"
static volatile uint64_t private_counter;
static const char hello[]="Hello from a disk-loaded Ring-3 program!";
__attribute__((noreturn)) void _start(uint64_t mode){
 unsigned short cs;__asm__ volatile("mov %%cs,%0":"=r"(cs));if((cs&3)!=3)sx_exit(90);
 if(mode==1){__asm__ volatile("ud2");}
 if(mode==2){*(volatile uint64_t*)(uintptr_t)0x100000=1;}
 if(mode==3){__asm__ volatile("cli");}
 if(mode==4){__asm__ volatile("xor %%edx,%%edx; mov $1,%%eax; xor %%ecx,%%ecx; div %%ecx":::"rax","rcx","rdx");}
 if(mode==5){for(;;)private_counter++;} /* Must be preempted and killable. */
 if(mode==6){
  if(sx_call(SX_WRITE,0x100000,8,0)!=-14)sx_exit(61);
  if(sx_call(999,0,0,0)!=-38)sx_exit(62);
  void*p=sx_map(1);if((int64_t)(uintptr_t)p<0)sx_exit(63);*(volatile uint64_t*)p=0xcafebabe;
  if(sx_call(SX_READ,99,(uintptr_t)p,4)!=-9)sx_exit(64);
  int64_t fd=sx_call(SX_OPEN,(uintptr_t)"WELCOME.TXT",0,0);if(fd<1)sx_exit(66);
  if(sx_call(SX_READ,(uint64_t)fd,(uintptr_t)p,128)<=0)sx_exit(67);
  if(sx_call(SX_CLOSE,(uint64_t)fd,0,0)!=0)sx_exit(68);
  if(sx_call(SX_READ,(uint64_t)fd,(uintptr_t)p,4)!=-9)sx_exit(69);
  if(sx_write(hello,sizeof(hello)-1)!=(int64_t)sizeof(hello)-1)sx_exit(65);
  sx_exit(0);
 }
 if(mode==7){void*p=sx_map(1);if((int64_t)(uintptr_t)p<0)sx_exit(71);((unsigned char*)p)[0]=0xc3;((void(*)(void))p)();}
 if(mode==8){*(volatile uint64_t*)(uintptr_t)(0x100200000ULL-5*4096)=1;}
 if(mode==10){*(volatile unsigned char*)(uintptr_t)_start=0;}
 if(mode==11){volatile uint64_t value=*(volatile uint64_t*)(uintptr_t)0x100000;(void)value;}
 if(mode==12){unsigned char*code=(unsigned char*)(uintptr_t)(0x100200000ULL-4096);*code=0xc3;((void(*)(void))code)();}
 if(mode==13){__asm__ volatile("pushfq; orq $0x4000,(%%rsp); popfq":::"memory","cc");sx_yield();uint64_t flags;__asm__ volatile("pushfq; popq %0":"=r"(flags));if(flags&0x4000)sx_exit(93);}
 if(mode==14){unsigned count=0;for(;count<16;count++){uint64_t*p=sx_map(8);if((int64_t)(uintptr_t)p<0)sx_exit(96);for(unsigned i=0;i<4096;i++){if(p[i])sx_exit(94);p[i]=0xabcdef+count;}}}
 if(mode==15){if(sx_call(SX_WRITE,0x1001ffff8ULL,64,0)!=-14)sx_exit(97);if(sx_call(SX_WRITE,UINT64_MAX,8,0)!=-14)sx_exit(98);}
 if(mode==9){
  uint64_t token=0x1122334455667788ULL^(uint64_t)sx_call(SX_PID,0,0,0);
  __asm__ volatile("movq %0,%%xmm0"::"r"(token):"xmm0");
  for(unsigned i=0;i<50;i++){sx_sleep(20000);uint64_t value;__asm__ volatile("movq %%xmm0,%0":"=r"(value));if(value!=token)sx_exit(91);}
 }
 sx_write(hello,sizeof(hello)-1);sx_exit(0);
}
