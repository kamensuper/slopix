#include "kernel.h"
#include "memory.h"
extern char kernel_end[];
static void check(int32_t result) {if(result)panic("physical memory bookkeeping rejected boot map");}
void rust_panic_abort(void) {panic("Rust memory component panic (abort)");}
void memory_init(uint32_t info,uint64_t fb_addr,uint64_t fb_bytes) {
    uintptr_t begin=(uintptr_t)info+8,end=(uintptr_t)info+*(const uint32_t *)(uintptr_t)info;
    check(mr_pmm_reset(0x100000000ULL));
    int maps=0;
    /* The boot parser has validated tag sizes and strides before this traversal. */
    for(uintptr_t p=begin;p+8<=end;) {
        const uint32_t *t=(const uint32_t *)p;if(!t[0])break;
        if(t[0]==6) {
            maps++;
            for(uintptr_t q=p+16;q+24<=p+t[1];q+=t[2]) {
                const uint64_t *e=(const uint64_t *)q;
                if(*(const uint32_t *)(q+16)==1)check(mr_pmm_add_usable(e[0],e[1]));
            }
        }
        p+=(t[1]+7U)&~7U;
    }
    if(maps!=1)panic("one memory map required");
    /* Reserved descriptors win even if a bootloader supplies overlapping entries. */
    for(uintptr_t p=begin;p+8<=end;) {
        const uint32_t *t=(const uint32_t *)p;if(!t[0])break;
        if(t[0]==6)for(uintptr_t q=p+16;q+24<=p+t[1];q+=t[2]) {
            const uint64_t *e=(const uint64_t *)q;
            if(*(const uint32_t *)(q+16)!=1)check(mr_pmm_reserve(e[0],e[1]));
        }
        if(t[0]==3)check(mr_pmm_reserve(t[2],(uint64_t)t[3]-t[2]));
        p+=(t[1]+7U)&~7U;
    }
    boot_usable=mr_pmm_stat(2)*4096; // normalized usable pages before kernel reservations
    check(mr_pmm_reserve(0,0x100000));
    check(mr_pmm_reserve(0x100000,(uintptr_t)kernel_end-0x100000));
    check(mr_pmm_reserve(info,end-info));
    /* Match the coarse huge-page cache attributes used for the framebuffer. */
    uint64_t fb_base=fb_addr&~0x1fffffULL;
    uint64_t fb_end=(fb_addr+fb_bytes+0x1fffffULL)&~0x1fffffULL;
    check(mr_pmm_reserve(fb_base,fb_end-fb_base));
    check(mr_pmm_reserve(0xfec00000,0x200000)); // QEMU PC IOAPIC/HPET huge MMIO span
    check(mr_pmm_seal());
    if(!mr_pmm_stat(0))panic("no usable physical pages after reservations");
    char n[21];decimal(mr_pmm_stat(0),n);logstr("RUST_PMM_READY free_pages=");logstr(n);logstr("\n");
}
int memory_selftest(void) {
    uint64_t before=mr_pmm_stat(0),head=0,count=0,addr;
    if(mr_pmm_free(0)==0||mr_pmm_free(1)==0)return 0;
    while((addr=mr_pmm_alloc())!=0) {
        if((addr&4095)||addr<((uintptr_t)kernel_end)||addr>=0x100000000ULL)panic("PMM returned invalid page");
        volatile uint64_t *p=(volatile uint64_t *)(uintptr_t)addr;
        p[0]=head;p[1]=addr^0x4d6f6f6e72697365ULL;head=addr;count++;
        if(count>before)panic("PMM overlapping allocation/count error");
        if(!(count&63))cooperative_checkpoint();
    }
    if(count!=before||mr_pmm_stat(0)!=0||mr_pmm_alloc()!=0)panic("PMM exhaustion mismatch");
    uint64_t last=0,freed=0;
    while(head) {
        volatile uint64_t *p=(volatile uint64_t *)(uintptr_t)head;uint64_t next=p[0];
        if(p[1]!=(head^0x4d6f6f6e72697365ULL))panic("PMM overlap canary corrupted");
        check(mr_pmm_free(head));last=head;head=next;
        if(!(++freed&63))cooperative_checkpoint();
    }
    if(mr_pmm_free(last)==0||mr_pmm_free(last+1)==0||mr_pmm_stat(0)!=before)return 0;
    return 1;
}
