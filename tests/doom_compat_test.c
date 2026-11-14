/* Host-only tests of the exact freestanding arena/formatter/WAD reader,
 * renamed at compilation so host libc and sanitizer allocation stay intact. */
#include <stdio.h>
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <setjmp.h>
#include <assert.h>
void *dc_malloc(size_t);void dc_free(void*);void *dc_calloc(size_t,size_t);void *dc_realloc(void*,size_t);
size_t doom_heap_used(void);
int dc_snprintf(char*,size_t,const char*,...);
long dc_strtol(const char*,char**,int);
void *dc_fopen(const char*,const char*);int dc_fclose(void*);size_t dc_fread(void*,size_t,size_t,void*);int dc_fseek(void*,long,int);long dc_ftell(void*);
static jmp_buf recovery;static int expected;
void logstr(const char*s){(void)s;}
void doom_fail(const char*s){if(expected)longjmp(recovery,1);fprintf(stderr,"unexpected: %s\n",s);abort();}
int main(void){
 char b[16];assert(dc_snprintf(b,sizeof(b),"STCFN%.3d",33)==8);assert(!strcmp(b,"STCFN033"));
 assert(dc_snprintf(b,5,"%s","abcdef")==6&&!strcmp(b,"abcd"));
 assert(dc_snprintf(b,sizeof(b),"%02i %x %d",3,255,-12)==9&&!strcmp(b,"03 ff -12"));
 char*end;assert(dc_strtol("0xff",&end,0)==255&&!*end);assert(dc_strtol(" -123x",&end,10)==-123&&*end=='x');
 void*p=dc_malloc(15);assert(p&&!((uintptr_t)p%16));memset(p,0x4a,15);p=dc_realloc(p,400);assert(p&&((unsigned char*)p)[14]==0x4a);dc_free(p);
 assert(!dc_calloc(SIZE_MAX,2));
 void*pages[64];unsigned n=0;while(n<64&&(pages[n]=dc_malloc(1024*1024)))n++;
 assert(n>30&&n<48);assert(!dc_malloc(48*1024*1024));for(unsigned i=0;i<n;i++)dc_free(pages[i]);assert(doom_heap_used()==0);
 void*large=dc_malloc(47*1024*1024);assert(large);dc_free(large);
 expected=1;if(!setjmp(recovery)){dc_free(large);assert(!"double free accepted");}expected=0;
 expected=1;if(!setjmp(recovery)){dc_free(b);assert(!"foreign free accepted");}expected=0;
 for(int j=0;j<100;j++){p=dc_calloc(128,7);assert(p&&((unsigned char*)p)[895]==0);dc_free(p);}assert(doom_heap_used()==0);
 assert(!dc_fopen("whatever.cfg","rb"));assert(!dc_fopen("freedoom1.wad","wb"));
 void*f=dc_fopen("./freedoom1.wad","rb");assert(f);char magic[4];assert(dc_fread(magic,1,4,f)==4&&!memcmp(magic,"IWAD",4));
 assert(dc_fseek(f,-1,SEEK_SET)==-1);assert(dc_fseek(f,0,SEEK_END)==0);long size=dc_ftell(f);assert(size>1000000);
 assert(dc_fread(magic,1,4,f)==0);assert(dc_fseek(f,size+1,SEEK_SET)==-1);assert(dc_fseek(f,0,SEEK_SET)==0);assert(dc_fread(magic,SIZE_MAX,2,f)==0);assert(dc_fclose(f)==0);
 puts("PASS: private DOOM arena exhaustion/coalescing/alignment/realloc/invalid-free; bounded formatting; read-only WAD streams");
}
