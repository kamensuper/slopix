/* Freestanding primitives used by Rust/core and the game. No host libc.
 * x86-64 permits unaligned accesses; aligned(1)/may_alias express that
 * explicitly. Copies never read or write outside [base, base+count).
 *
 * Checkpoint 08: requests of 64 bytes or more are handed to the SSE2 loops in
 * sse.S (16 bytes per move, 64 bytes per unrolled block). The kernel is built
 * -mgeneral-regs-only, so no C code here keeps XMM live across a call; the
 * assembly routines still save and restore the XMM registers they use because
 * an IRQ can land in the middle of a block and run another copy.
 * Smaller requests stay in C and only touch 8/4/2/1-byte words, so they never
 * read past an end. */
#include "kernel.h"

typedef uint64_t memory_word __attribute__((aligned(1),may_alias));

#if defined(__x86_64__)
/* SSE2 is part of the x86-64 baseline; entry.S enables it once at boot. */
#define SLOPIX_SSE2 1
void *slopix_memcpy_sse(void *dst,const void *src,size_t count);
void *slopix_memset_sse(void *dst,int value,size_t count);
void *slopix_memmove_sse(void *dst,const void *src,size_t count);
#endif

void *memset(void *dst,int value,size_t count){
#if SLOPIX_SSE2
    if(count>=64)return slopix_memset_sse(dst,value,count);
#endif
    unsigned char *d=dst;
    unsigned char v=(unsigned char)value;
    uint64_t word=v*0x0101010101010101ULL;
    while(count>=8){*(memory_word *)(void *)d=word;d+=8;count-=8;}
    while(count--)*d++=v;
    return dst;
}

void *memcpy(void *dst,const void *src,size_t count){
#if SLOPIX_SSE2
    if(count>=64)return slopix_memcpy_sse(dst,src,count);
#endif
    unsigned char *d=dst;const unsigned char *s=src;
    while(count>=8){*(memory_word *)(void *)d=*(const memory_word *)(const void *)s;d+=8;s+=8;count-=8;}
    while(count--)*d++=*s++;
    return dst;
}

void *memmove(void *dst,const void *src,size_t count){
    if((uintptr_t)dst<(uintptr_t)src)return memcpy(dst,src,count);
    if(dst==src||!count)return dst;
#if SLOPIX_SSE2
    if(count>=64)return slopix_memmove_sse(dst,src,count);
#endif
    unsigned char *d=(unsigned char *)dst+count;
    const unsigned char *s=(const unsigned char *)src+count;
    while(count>=8){d-=8;s-=8;*(memory_word *)(void *)d=*(const memory_word *)(const void *)s;count-=8;}
    while(count){d--;s--;*d=*s;count--;}
    return dst;
}

int memcmp(const void *a,const void *b,size_t count){
    const unsigned char *x=a,*y=b;
    for(size_t i=0;i<count;i++)if(x[i]!=y[i])return x[i]<y[i]?-1:1;
    return 0;
}
