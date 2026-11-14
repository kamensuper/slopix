/* Check that the original 3D renderer ELF actually loads into the enlarged VM
 * and that all mapped physical pages are freed after its session exits. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/user/elf.h"
#define PHYSICAL 1250
static _Alignas(4096) unsigned char pool[PHYSICAL][4096];
static unsigned char used[PHYSICAL];static unsigned live;
uint64_t boot_pdpt[512]={0x2003,0x3003,0x4003,0x5003};
uint64_t mr_pmm_alloc(void){for(unsigned i=0;i<PHYSICAL;i++)if(!used[i]){used[i]=1;live++;memset(pool[i],0,4096);return (uintptr_t)pool[i];}return 0;}
int32_t mr_pmm_free(uint64_t p){for(unsigned i=0;i<PHYSICAL;i++)if((uintptr_t)pool[i]==p){assert(used[i]);used[i]=0;live--;return 0;}abort();}
int main(int argc,char**argv){
 assert(argc==2);FILE*f=fopen(argv[1],"rb");assert(f);
 assert(!fseek(f,0,SEEK_END));long bytes=ftell(f);assert(bytes>65536&&bytes<1048576);rewind(f);
 unsigned char *elf=malloc((size_t)bytes);assert(elf);assert(fread(elf,1,(size_t)bytes,f)==(size_t)bytes);fclose(f);
 for(unsigned i=0;i<3;i++){
  struct user_vm v={0};uint64_t entry;
  assert(user_vm_create(&v));assert(user_elf_load(&v,elf,(size_t)bytes,&entry));
  assert(v.count>550&&v.count<USER_MAX_PAGES);
  assert(user_vm_executable(&v,entry));assert(user_vm_range(&v,USER_BASE+0x20000,512,1));
  assert(user_vm_range(&v,USER_BASE+0x20000,512,0)); /* valid writable data */
  assert(!user_vm_range(&v,USER_BASE+0x1000,4096,1)); /* code is read-only */
  assert(!user_vm_range(&v,USER_BASE+0x700000,4096,0)); /* unallocated heap */
  user_vm_destroy(&v);assert(live==0);
 }
 free(elf);puts("PASS: 129KB Ring3 demo ELF, >2MiB BSS, isolated mappings, 3x complete physical-page cleanup");return 0;
}
