#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "../src/heap.h"
#include "../src/clipboard.h"
#define N 256
static _Alignas(4096) unsigned char ram[N][4096];
static unsigned char used[N];static size_t cursor,freepages=N,checkpoints;
uint64_t mr_pmm_alloc(void){for(size_t j=0;j<N;j++){size_t i=(cursor+j)%N;if(!used[i]){used[i]=1;freepages--;cursor=(i+1)%N;return(uintptr_t)ram[i];}}return 0;}
int32_t mr_pmm_free(uint64_t p){if(p<(uintptr_t)ram || p>=(uintptr_t)(ram+N) || (p-(uintptr_t)ram)%4096)return -1;size_t i=(p-(uintptr_t)ram)/4096;if(!used[i])return -1;used[i]=0;freepages++;return 0;}
static void*pending_release,*callback_allocation;static unsigned allocate_countdown;
void audio_checkpoint(void){checkpoints++;if(allocate_countdown && !--allocate_countdown){callback_allocation=heap_alloc(48);assert(callback_allocation);memset(callback_allocation,77,48);}if(pending_release){void*p=pending_release;pending_release=0;assert(heap_free(p));}}
int main(void){
 heap_init();assert(!heap_alloc(0));assert(!heap_alloc(SIZE_MAX));assert(!heap_calloc(SIZE_MAX,2));assert(!heap_realloc((void*)123,32));
 assert(!heap_free((void*)123));assert(heap_free(0));
 for(unsigned round=0;round<5;round++){
  void*p[N]={0};size_t n=0;
  while(n<N && (p[n]=heap_alloc(4000))){assert(!((uintptr_t)p[n]&15));memset(p[n],(int)n,4000);n++;}
  assert(n==N);assert(!heap_alloc(4000));
  for(size_t i=0;i<n;i+=2){assert(heap_free(p[i]));assert(!heap_free(p[i]));}
  assert(!heap_alloc(8192)); /* no contiguous run in fragmented PMM */
  for(size_t i=1;i<n;i+=2){assert(((unsigned char*)p[i])[3999]==(unsigned char)i);assert(!heap_free((char*)p[i]+1));assert(heap_free(p[i]));}
  assert(freepages==N);assert(heap_selftest());assert(freepages==N);
 }
 unsigned char*p=heap_calloc(100,2);assert(p);for(size_t i=0;i<200;i++)assert(!p[i]);memset(p,42,200);
 unsigned char*q=heap_realloc(p,10000);assert(q);for(size_t i=0;i<200;i++)assert(q[i]==42);assert(!heap_realloc(q,SIZE_MAX));assert(q[199]==42);assert(heap_free(q));
 pending_release=heap_alloc(12);assert(pending_release);p=heap_alloc(24);assert(!pending_release);assert(heap_free(p));
 allocate_countdown=2;p=heap_alloc(256*1024);/* callback interrupts run with a page of its own; outer run rolls back safely */
 if(p){assert(heap_free(p));}assert(callback_allocation);assert(((unsigned char*)callback_allocation)[47]==77);assert(heap_free(callback_allocation));assert(freepages==N);
 char text[8000];memset(text,'x',sizeof(text));text[3]=1;assert(clipboard_set(text,sizeof(text))==sizeof(text));size_t bytes;const char*c=clipboard_get(&bytes);assert(bytes==sizeof(text)&&c[3]=='?'&&c[7999]=='x'&&c[8000]==0);
 void*held[N]={0};size_t held_count=0;while(held_count<N && (held[held_count]=heap_alloc(4000)))held_count++;
 assert(!clipboard_set(text,8000));assert(clipboard_get(&bytes)==c&&bytes==8000);for(size_t j=0;j<held_count;j++)assert(heap_free(held[j]));
 assert(!clipboard_set(text,SIZE_MAX));assert(clipboard_get(&bytes)==c&&bytes==8000);assert(clipboard_set(c,8000)==8000);assert(!clipboard_set(0,0));assert(!*clipboard_get(&bytes)&&!bytes);
 assert(freepages==N);struct heap_stats s=heap_get_stats();assert(!s.allocations&&!s.live_bytes&&!s.span_pages&&s.failures&&s.invalid_frees&&s.peak_bytes);assert(checkpoints);puts("heap tests passed");
}
