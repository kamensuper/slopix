#include "heap.h"
#include "memory.h"
#include "audio/audio.h"
#define PAGE 4096u
#define SPANS 2048u
#define MAX_PAGES 4096u
#define MAGIC UINT64_C(0x534c4f5048454150)
/* Headers and payloads are multiples of 16. Headers are only followed after a
 * registry membership check, so arbitrary frees never dereference user input. */
struct block { size_t length,requested; uint64_t magic,reserved; };
struct span { uintptr_t base; size_t pages; };
static struct span spans[SPANS];
static struct heap_stats stats;
static int ready,busy,servicing;
static void checkpoint(void){if(!servicing){servicing=1;audio_checkpoint();servicing=0;}}
/* Transactions service audio only at points with no live metadata pointers.
 * Acquired but unpublished PMM pages remain privately owned across the hook. */
static void transaction_checkpoint(void){busy=0;checkpoint();busy=1;}
static size_t rounded(size_t n){return (n+15u)&~(size_t)15u;}
void heap_init(void){if(!ready){ready=1;}}
static void *allocate(size_t bytes){
    if(!bytes || bytes>MAX_PAGES*(size_t)PAGE-sizeof(struct block)){stats.failures++;return 0;}
    size_t need=rounded(bytes)+sizeof(struct block),slot=SPANS;
    for(size_t i=0;i<SPANS;i++){
        if(i && !(i&31u))transaction_checkpoint();
        if(!spans[i].base){if(slot==SPANS)slot=i;continue;}
        uintptr_t end=spans[i].base+spans[i].pages*PAGE;
        for(uintptr_t p=spans[i].base;p<end;){
            struct block*b=(struct block*)p;
            if(!b->requested && b->length>=need){
                size_t remain=b->length-need;
                if(remain>=sizeof(struct block)+16){struct block*n=(struct block*)(p+need);*n=(struct block){remain,0,MAGIC,0};b->length=need;}
                b->requested=bytes;stats.live_bytes+=bytes;stats.allocations++;
                if(stats.live_bytes>stats.peak_bytes)stats.peak_bytes=stats.live_bytes;
                return b+1;
            }
            p+=b->length;
        }
    }
    if(slot==SPANS){stats.failures++;return 0;}
    size_t pages=(need+PAGE-1)/PAGE,got=0;uintptr_t base=0;
    for(;got<pages;got++){
        if(got && !(got&31u))transaction_checkpoint();
        uintptr_t p=(uintptr_t)mr_pmm_alloc();
        if(!p)break;
        if(!got)base=p;
        else if(p!=base+got*PAGE){mr_pmm_free(p);break;}
    }
    /* Audio callbacks may have allocated spans while we acquired pages. */
    slot=SPANS;for(size_t i=0;i<SPANS;i++)if(!spans[i].base){slot=i;break;}
    if(got!=pages || slot==SPANS){while(got){mr_pmm_free(base+(--got)*PAGE);if(!(got&31u))transaction_checkpoint();}stats.failures++;return 0;}
    spans[slot]=(struct span){base,pages};stats.span_pages+=pages;
    struct block*b=(struct block*)base;*b=(struct block){pages*PAGE,0,MAGIC,0};
    /* Allocate directly; do not rescan all spans. */
    size_t remain=b->length-need;
    if(remain>=sizeof(*b)+16){struct block*n=(struct block*)(base+need);*n=(struct block){remain,0,MAGIC,0};b->length=need;}
    b->requested=bytes;stats.live_bytes+=bytes;stats.allocations++;
    if(stats.live_bytes>stats.peak_bytes)stats.peak_bytes=stats.live_bytes;
    return b+1;
}
static struct block*find(void*ptr,size_t*index,struct block**previous){
    uintptr_t addr=(uintptr_t)ptr;
    for(size_t i=0;i<SPANS;i++)if(spans[i].base && addr>=spans[i].base && addr<spans[i].base+spans[i].pages*PAGE){
        struct block*prev=0;uintptr_t end=spans[i].base+spans[i].pages*PAGE;
        for(uintptr_t p=spans[i].base;p<end;){struct block*b=(struct block*)p;
            if(b->magic!=MAGIC || b->length<sizeof(*b) || b->length>end-p)return 0;
            if((void*)(b+1)==ptr && b->requested){*index=i;*previous=prev;return b;}
            prev=b;p+=b->length;
        }return 0;
    }return 0;
}
static int release(void*ptr){
    size_t i=0;struct block*prev=0,*b=find(ptr,&i,&prev);
    if(!b){stats.invalid_frees++;return 0;}
    stats.live_bytes-=b->requested;stats.allocations--;b->requested=0;
    uintptr_t end=spans[i].base+spans[i].pages*PAGE;
    struct block*next=(struct block*)((uintptr_t)b+b->length);
    if((uintptr_t)next<end && !next->requested)b->length+=next->length;
    if(prev && !prev->requested){prev->length+=b->length;b=prev;}
    if((uintptr_t)b==spans[i].base && b->length==spans[i].pages*PAGE){
        uintptr_t base=spans[i].base;size_t pages=spans[i].pages;
        spans[i]=(struct span){0,0};stats.span_pages-=pages;
        for(size_t j=0;j<pages;j++){mr_pmm_free(base+j*PAGE);if(j && !(j&31u))transaction_checkpoint();}
    }return 1;
}
void *heap_alloc(size_t bytes){
    if(!ready||busy)return 0;
    checkpoint();if(busy)return 0;busy=1;void*p=allocate(bytes);busy=0;checkpoint();return p;
}
int heap_free(void*ptr){
    if(!ptr)return 1;
    if(!ready||busy)return 0;
    checkpoint();if(busy)return 0;busy=1;int ok=release(ptr);busy=0;checkpoint();return ok;
}
void *heap_calloc(size_t n,size_t bytes){
    if(n && bytes>SIZE_MAX/n)return 0;
    size_t count=n*bytes;unsigned char*p=heap_alloc(count);
    if(p)for(size_t i=0;i<count;i++){p[i]=0;if((i&4095u)==4095u)checkpoint();}
    return p;
}
void *heap_realloc(void*ptr,size_t bytes){
    if(!ptr)return heap_alloc(bytes);
    if(!bytes){heap_free(ptr);return 0;}
    if(!ready||busy)return 0;
    size_t i=0;struct block*prev=0,*b=find(ptr,&i,&prev);
    if(!b){stats.invalid_frees++;return 0;}
    size_t old=b->requested;void*p=heap_alloc(bytes);if(!p)return 0;
    unsigned char*d=p,*s=ptr;for(size_t j=0;j<(old<bytes?old:bytes);j++){d[j]=s[j];if((j&4095u)==4095u)checkpoint();}
    heap_free(ptr);return p;
}
struct heap_stats heap_get_stats(void){return stats;}
int heap_selftest(void){
    struct heap_stats before=stats;void*p[32]={0};int ok=1;
    for(unsigned round=0;round<3;round++){
        for(unsigned i=0;i<32;i++){p[i]=heap_alloc(17+i*113);if(!p[i]){ok=0;break;}if((uintptr_t)p[i]&15)ok=0;((unsigned char*)p[i])[0]=(unsigned char)i;}
        for(unsigned i=0;i<32;i+=2)if(p[i]){ok&=heap_free(p[i]);p[i]=0;}
        for(unsigned i=1;i<32;i+=2)if(p[i]){if(((unsigned char*)p[i])[0]!=i)ok=0;ok&=heap_free(p[i]);p[i]=0;}
    }
    /* Optional large-span exercise: a fragmented system may decline the run. */
    for(unsigned round=0;round<3;round++){
        size_t bytes=16u*1024u*1024u-sizeof(struct block);
        void*large=heap_alloc(bytes);
        if(large){unsigned char*d=large;for(size_t i=0;i<bytes;i+=4096)d[i]=(unsigned char)(i/4096);for(size_t i=0;i<bytes;i+=4096)if(d[i]!=(unsigned char)(i/4096))ok=0;ok&=heap_free(large);}
    }
    return ok && stats.live_bytes==before.live_bytes && stats.span_pages==before.span_pages;
}
