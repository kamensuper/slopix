/* MAP_ANONYMOUS is not part of strict C11/POSIX; expose it explicitly. */
#define _DEFAULT_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <unistd.h>
#include <sys/mman.h>
void *mr_test_memcpy(void*,const void*,size_t);
void *mr_test_memmove(void*,const void*,size_t);
void *mr_test_memset(void*,int,size_t);
void slopix_mask_copy(unsigned *dst,const unsigned *src,size_t pixels);

/* Two pages of usable data with an unmapped guard page on each side. The
 * checkpoint-08 SSE2 loop must never touch a byte outside [base,base+n), so
 * placing the requested range against a guard makes an over-read or over-write
 * crash immediately (no sanitizer required). */
struct guarded { unsigned char *base; unsigned char *data; size_t size, span; };
/* Layout [guard][data pages][guard]; data starts and ends against a guard, so
 * both the first and the last byte of a request can be checked. */
static struct guarded guarded_alloc(size_t data_size){
    long ps=sysconf(_SC_PAGESIZE);
    size_t pages=(data_size+ps-1)/(size_t)ps;
    size_t span=(pages+2)*(size_t)ps;
    unsigned char *m=mmap(NULL,span,PROT_READ|PROT_WRITE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
    assert(m!=MAP_FAILED);
    assert(mprotect(m,(size_t)ps,PROT_NONE)==0);
    assert(mprotect(m+span-(size_t)ps,(size_t)ps,PROT_NONE)==0);
    struct guarded g={m,m+ps,pages*(size_t)ps,span};
    return g;
}
static void guarded_free(struct guarded *g){ munmap(g->base,g->span); }

int main(void){
    unsigned char a[1100],b[1100],s[1100];
    for(unsigned i=0;i<sizeof(s);i++)s[i]=(unsigned char)(i*37+11);
    for(unsigned n=0;n<513;n++)for(unsigned off=0;off<16;off++){
        memset(a,0x51,sizeof(a));memset(b,0x51,sizeof(b));
        assert(mr_test_memcpy(a+off,s+15-off,n)==a+off);memcpy(b+off,s+15-off,n);assert(!memcmp(a,b,sizeof(a)));
        mr_test_memset(a+off,0xa3,n);memset(b+off,0xa3,n);assert(!memcmp(a,b,sizeof(a)));
        for(int shift=-15;shift<=15;shift++){
            memcpy(a,s,sizeof(a));memcpy(b,s,sizeof(b));
            unsigned dst=100+off,src=(unsigned)((int)dst+shift);
            assert(mr_test_memmove(a+dst,a+src,n)==a+dst);memmove(b+dst,b+src,n);assert(!memcmp(a,b,sizeof(a)));
        }
    }
    /* ASan allocation boundaries: words may never read/write beyond n. */
    for(unsigned n=0;n<129;n++){
        unsigned char *x=malloc(n?n:1),*y=malloc(n?n:1);
        memset(x,0x73,n);mr_test_memcpy(y,x,n);assert(!memcmp(x,y,n));mr_test_memset(x,0x91,n);free(x);free(y);
    }
    /* Guard-page boundaries: end-aligned (over-read) and start-aligned
     * (under-read) range positions, including the 64-byte SSE2 threshold. */
    struct guarded gs=guarded_alloc(8192),gd=guarded_alloc(8192);
    for(unsigned i=0;i<8192;i++)gs.data[i]=(unsigned char)(i*29+7);
    for(unsigned n=0;n<=8192;n++){
        for(int end=1;end>=0;end--){
            unsigned char *src=end?gs.data+8192-n:gs.data;
            unsigned char *dst=end?gd.data+8192-n:gd.data;
            memset(gd.data,0x5a,8192);
            assert(mr_test_memcpy(dst,src,n)==dst);
            assert(!memcmp(dst,src,n));
            assert(mr_test_memset(dst,0xc7,n)==dst);
            for(unsigned i=0;i<n;i++)assert(dst[i]==0xc7);
            /* Overlapping backwards move inside the guarded region. */
            if(n&&n<=512){
                memmove(gd.data,src,n);
                assert(mr_test_memmove(gd.data+1,gd.data,n-1)==gd.data+1);
            }
        }
    }
    guarded_free(&gs);guarded_free(&gd);
    /* Present path: SIMD masked copy must equal the scalar form, including the
     * 8-pixel bulk loop, the scalar tail and unaligned starts. */
    for(unsigned n=0;n<300;n++)for(unsigned off=0;off<4;off++){
        unsigned s[320],d[320],want[320];
        for(unsigned i=0;i<320;i++)s[i]=(0x01020304u*(i+1))^0xa5b6c7d8u;
        for(unsigned i=0;i<320;i++)want[i]=s[i]&0xffffffu;
        for(unsigned i=0;i<320;i++)d[i]=0xdeadbeefu;
        slopix_mask_copy(d+off,s,n);
        for(unsigned i=0;i<n;i++)assert(d[off+i]==want[i]);
        for(unsigned i=0;i<off;i++)assert(d[i]==0xdeadbeefu);
        for(unsigned i=off+n;i<320;i++)assert(d[i]==0xdeadbeefu);
    }
    puts("PASS: runtime word/SSE copies-fills, all short lengths, unaligned buffers, overlapping moves, masked present copy, and guard-page boundaries with no access past either end");
}
