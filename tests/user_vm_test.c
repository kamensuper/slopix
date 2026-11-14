/* Host-only VM ownership / ELF boundary tests with a bounded physical-page model.
 * CPU privilege enforcement is tested separately in the actual guest. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/user/elf.h"
static _Alignas(4096) unsigned char pool[128][4096];
static unsigned char used[128];static unsigned live,limit=128;
uint64_t boot_pdpt[512]={0x2003,0x3003,0x4003,0x5003};
uint64_t mr_pmm_alloc(void){if(live==limit)return 0;for(unsigned i=0;i<128;i++)if(!used[i]){used[i]=1;live++;memset(pool[i],0xa5,4096);return (uintptr_t)pool[i];}return 0;}
int32_t mr_pmm_free(uint64_t address){for(unsigned i=0;i<128;i++)if(address==(uintptr_t)pool[i]){assert(used[i]);used[i]=0;live--;return 0;}abort();}
static unsigned char elf[65536],mutated[65536];
static void put64(unsigned char*p,uint64_t v){for(unsigned i=0;i<8;i++)p[i]=(unsigned char)(v>>(i*8));}
static int load(const void*data,size_t n){struct user_vm v;uint64_t entry;int ok=user_vm_create(&v)&&user_elf_load(&v,data,n,&entry);if(ok){assert(user_vm_executable(&v,entry));assert(!user_vm_range(&v,0x100000,1,0));assert(!user_vm_range(&v,USER_STACK-5*4096,1,1));}user_vm_destroy(&v);assert(live==0);return ok;}
int main(int argc,char**argv){
 assert(argc==2);FILE*f=fopen(argv[1],"rb");assert(f);size_t n=fread(elf,1,sizeof(elf),f);assert(!ferror(f));fclose(f);assert(n>64&&n<sizeof(elf));
 assert(load(elf,n));
 for(limit=0;limit<10;limit++)assert(!load(elf,n));limit=128;
 struct user_vm v;assert(user_vm_create(&v));assert(!(((uint64_t*)(uintptr_t)v.tables[1])[0]&4));
 assert(user_vm_map(&v,USER_BASE+4096,0));assert(!user_vm_map(&v,USER_BASE+4096,VM_NX));assert(!user_vm_map(&v,USER_HEAP,VM_WRITE));
 assert(!user_vm_range(&v,USER_BASE+4096,1,1));assert(user_vm_range(&v,USER_BASE+4096,4096,0));assert(!user_vm_range(&v,USER_BASE+8191,2,0));
 assert(!user_vm_range(&v,UINT64_MAX,8,0));assert(!user_vm_range(&v,USER_STACK-1,8,1));
 assert(user_vm_map(&v,USER_HEAP,VM_WRITE|VM_NX));unsigned char b[16];memset(b,73,sizeof(b));assert(user_vm_copy(&v,USER_HEAP,b,sizeof(b),1));memset(b,0,sizeof(b));assert(user_vm_copy(&v,USER_HEAP,b,sizeof(b),0));for(unsigned i=0;i<sizeof(b);i++)assert(b[i]==73);
 user_vm_destroy(&v);assert(live==0);
 for(size_t k=0;k<64;k++)assert(!load(elf,k));
 memcpy(mutated,elf,n);put64(mutated+32,UINT64_MAX);assert(!load(mutated,n));
 memcpy(mutated,elf,n);put64(mutated+24,0x100000);assert(!load(mutated,n));
 memcpy(mutated,elf,n);put64(mutated+64+40,UINT64_MAX);assert(!load(mutated,n));
 memcpy(mutated,elf,n);mutated[64+4]=7;assert(!load(mutated,n));
 memcpy(mutated,elf,n);mutated[64]=3;assert(!load(mutated,n));
 uint32_t rng=765;
 for(unsigned k=0;k<2000;k++){memcpy(mutated,elf,n);for(unsigned j=0;j<4;j++){rng=rng*1664525+1013904223;unsigned at=rng%176;rng=rng*1664525+1013904223;mutated[at]=(unsigned char)(rng>>24);}load(mutated,n);}
 puts("PASS: bounded VM ownership, allocation exhaustion/rollback, supervisor roots, W^X, pointer/page boundaries, ELF validation and malformed corpus; host only");
}
