#include <assert.h>
#include <stdlib.h>
#include <stdio.h>
#include "../src/memory.h"
void rust_panic_abort(void){abort();}
/* Host core has unwind metadata; unwinding is forbidden and traps if invoked. */
void rust_eh_personality(void){abort();}
int main(void){
    assert(mr_pmm_reset(64*4096)==0);
    assert(mr_pmm_add_usable(0,64*4096)==0);
    assert(mr_pmm_add_usable(4096,10*4096)==0);
    assert(mr_pmm_reserve(0,4*4096)==0);
    assert(mr_pmm_reserve(7*4096+1,4096)==0);
    assert(mr_pmm_add_usable(UINT64_MAX,2)<0);
    assert(mr_pmm_stat(0)==58);
    assert(mr_pmm_alloc()==0);
    assert(mr_pmm_seal()==0);
    assert(mr_pmm_reset(64*4096)<0);
    uint64_t addresses[58];
    for(unsigned i=0;i<58;i++){addresses[i]=mr_pmm_alloc();assert(addresses[i]>=4*4096&&addresses[i]%4096==0);assert(addresses[i]!=7*4096&&addresses[i]!=8*4096);for(unsigned j=0;j<i;j++)assert(addresses[j]!=addresses[i]);}
    assert(mr_pmm_alloc()==0&&mr_pmm_stat(0)==0&&mr_pmm_stat(1)==58);
    assert(mr_pmm_free(0)<0&&mr_pmm_free(1)<0&&mr_pmm_free(4096)<0);
    for(unsigned i=0;i<58;i++){assert(mr_pmm_free(addresses[i])==0);assert(mr_pmm_free(addresses[i])<0);}
    assert(mr_pmm_stat(0)==58&&mr_pmm_stat(1)==0);
    for(unsigned i=0;i<1000;i++){uint64_t a=mr_pmm_alloc();assert(a&&mr_pmm_free(a)==0);}
    puts("PASS: C/Rust ABI reservations, overlap, exhaustion, alignment, repeated allocation, invalid/double free");
}
