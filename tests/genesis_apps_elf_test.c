/* Verify that independent Genesis browser, demo and example applications are
 * genuinely loadable as isolated Ring-3 ELFs, without invoking host libc. */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/user/elf.h"
#define PHYSICAL 1800
static _Alignas(4096) unsigned char pool[PHYSICAL][4096];
static unsigned char allocated[PHYSICAL];
static unsigned live;
uint64_t boot_pdpt[512]={0x2003,0x3003,0x4003,0x5003};
uint64_t mr_pmm_alloc(void){for(unsigned i=0;i<PHYSICAL;i++)if(!allocated[i]){allocated[i]=1;live++;memset(pool[i],0,4096);return (uintptr_t)pool[i];}return 0;}
int32_t mr_pmm_free(uint64_t p){for(unsigned i=0;i<PHYSICAL;i++)if((uintptr_t)pool[i]==p){assert(allocated[i]);allocated[i]=0;live--;return 0;}abort();}
static void validate(const char*name){
 FILE*f=fopen(name,"rb");assert(f);assert(!fseek(f,0,SEEK_END));long size=ftell(f);assert(size>64&&size<1048576);rewind(f);
 unsigned char*img=malloc((size_t)size);assert(img&&fread(img,1,(size_t)size,f)==(size_t)size);fclose(f);
 for(unsigned i=0;i<3;i++){
  struct user_vm v={0};uint64_t entry=0;
  assert(user_vm_create(&v));assert(user_elf_load(&v,img,(size_t)size,&entry));
  assert(user_vm_executable(&v,entry));assert(v.count>0&&v.count<USER_MAX_PAGES);
  assert(!user_vm_range(&v,USER_BASE+0x1000,4096,1));
  user_vm_destroy(&v);assert(live==0);
 }
 printf("PASS: isolated Ring-3 ELF loader/reclaim: %s\n",name);free(img);
}
int main(int argc,char **argv){assert(argc>=2);for(int i=1;i<argc;i++)validate(argv[i]);return 0;}
