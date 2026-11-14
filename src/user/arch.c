/* x86-64 privilege machinery only; no app, filesystem or allocator policy. */
#include "process.h"
#include "../kernel.h"
static struct __attribute__((packed)) tss64 {
 uint32_t reserved0;uint64_t rsp[3],reserved1,ist[7],reserved2;uint16_t reserved3,iomap;
} tss;
static uint64_t gdt[7] __attribute__((aligned(16)))={0,0x00af9a000000ffffULL,0x00cf92000000ffffULL,0x00cff2000000ffffULL,0x00affa000000ffffULL,0,0};
_Static_assert(sizeof(tss)==104,"TSS layout");
int arch_user_init(void){
 uint32_t a,b,c,d;__asm__ volatile("cpuid":"=a"(a),"=b"(b),"=c"(c),"=d"(d):"a"(0x80000001u),"c"(0));
 if(!(d&(1u<<20)))return 0; /* NX required: never silently map executable data. */
 uintptr_t base=(uintptr_t)&tss;uint64_t limit=sizeof(tss)-1;tss.iomap=sizeof(tss);
 gdt[5]=(limit&65535)|((base&0xffffffULL)<<16)|(0x89ULL<<40)|((limit&0xf0000)<<32)|((base&0xff000000ULL)<<32);gdt[6]=base>>32;
 struct __attribute__((packed)){uint16_t limit;uint64_t base;} descriptor={sizeof(gdt)-1,(uintptr_t)gdt};
 uint64_t flags=irq_save();__asm__ volatile("lgdt %0"::"m"(descriptor):"memory");uint16_t selector=0x28;__asm__ volatile("ltr %0"::"r"(selector):"memory");
 uint32_t lo,hi;__asm__ volatile("rdmsr":"=a"(lo),"=d"(hi):"c"(0xc0000080u));lo|=1u<<11;__asm__ volatile("wrmsr"::"c"(0xc0000080u),"a"(lo),"d"(hi):"memory");
 uint64_t cr0;__asm__ volatile("mov %%cr0,%0":"=r"(cr0));cr0|=1u<<16;__asm__ volatile("mov %0,%%cr0"::"r"(cr0):"memory");irq_restore(flags);return 1;
}
void arch_user_stack(uint64_t top){tss.rsp[0]=top;__asm__ volatile("":::"memory");}
/* IA32_FS_BASE backs userspace TLS. The kernel never uses %fs itself, so the
 * MSR is only ever programmed around a user slice and cleared on return. */
void arch_user_fs(uint64_t base){
 uint32_t lo=(uint32_t)base,hi=(uint32_t)(base>>32);
 __asm__ volatile("wrmsr"::"c"(0xc0000100u),"a"(lo),"d"(hi):"memory");
}
