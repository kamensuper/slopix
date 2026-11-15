/* Physical pages are owned by one VM and freed only on the kernel main thread.
 * Lower 4 GiB mappings stay supervisor-only, including all identity aliases.
 * Forty dedicated user page tables cover 4 GiB..4 GiB+80 MiB. Single CPU only. */
#include "vm.h"
#include "../kernel.h"
#include "../memory.h"
extern uint64_t boot_pdpt[];
static uint64_t zero_page(void){uint64_t p=mr_pmm_alloc();if(p)memset((void *)(uintptr_t)p,0,4096);return p;}
void user_vm_destroy(struct user_vm*v){
 for(unsigned i=0;i<v->count;i++)mr_pmm_free(v->pages[i].pa);
 for(unsigned i=0;i<USER_TABLES;i++)if(v->tables[i]){mr_pmm_free(v->tables[i]);v->tables[i]=0;}
 v->count=0;v->heap=USER_HEAP;
}
int user_vm_create(struct user_vm*v){
 v->count=0;v->heap=USER_HEAP;for(unsigned i=0;i<USER_TABLES;i++)v->tables[i]=0;
 for(unsigned i=0;i<USER_TABLES;i++)if(!(v->tables[i]=zero_page())){user_vm_destroy(v);return 0;}
 uint64_t*pml=(uint64_t*)(uintptr_t)v->tables[0],*pdpt=(uint64_t*)(uintptr_t)v->tables[1],*pd=(uint64_t*)(uintptr_t)v->tables[2];
 pml[0]=v->tables[1]|7;for(unsigned i=0;i<4;i++)pdpt[i]=boot_pdpt[i]&~4ULL;
 pdpt[4]=v->tables[2]|7;for(unsigned i=0;i<USER_PT_COUNT;i++)pd[i]=v->tables[3+i]|7;return 1;
}
int user_vm_map(struct user_vm*v,uint64_t va,uint64_t flags){
 if((va&4095)||va<USER_BASE+4096||va>=USER_STACK||v->count==USER_MAX_PAGES)return 0;
 if(flags&~(VM_WRITE|VM_NX))return 0;
 /* No writable executable mappings, including via the allocation syscall. */
 if((flags&VM_WRITE)&&!(flags&VM_NX))return 0;
 unsigned bank=(unsigned)((va-USER_BASE)>>21);if(bank>=USER_PT_COUNT||!v->tables[3+bank])return 0;
 uint64_t*pt=(uint64_t*)(uintptr_t)v->tables[3+bank];unsigned i=(unsigned)((va>>12)&511);
 if(pt[i])return 0;
 uint64_t p=zero_page();if(!p)return 0;
 pt[i]=p|flags|5;v->pages[v->count++]=(struct user_page){va,p,flags};return 1;
}
static const struct user_page*page(const struct user_vm*v,uint64_t va){
 static struct user_page decoded;
 if(va<USER_BASE||va>=USER_STACK)return 0;
 unsigned bank=(unsigned)((va-USER_BASE)>>21);
 if(bank>=USER_PT_COUNT||!v->tables[3+bank])return 0;
 const uint64_t *pt=(const uint64_t*)(uintptr_t)v->tables[3+bank];
 uint64_t entry=pt[(va>>12)&511];
 if(!(entry&1))return 0;
 decoded=(struct user_page){va&~4095ULL,entry&0x000ffffffffff000ULL,entry&(VM_WRITE|VM_NX)};
 return &decoded;
}
int user_vm_range(const struct user_vm*v,uint64_t va,size_t n,int write){
 if(va<USER_BASE||va>=USER_STACK||n>USER_STACK-va)return 0;
 if(!n)return page(v,va)!=0; /* B-35: an empty range must still be mapped */
 while(n){const struct user_page*p=page(v,va);if(!p||(write&&!(p->flags&VM_WRITE)))return 0;size_t k=4096-(va&4095);if(k>n)k=n;va+=k;n-=k;}
 return 1;
}
int user_vm_copy(const struct user_vm*v,uint64_t va,void*buffer,size_t n,int to_user){
 if(!user_vm_range(v,va,n,to_user))return 0;
 unsigned char*b=buffer;
 while(n){const struct user_page*p=page(v,va);size_t k=4096-(va&4095);if(k>n)k=n;unsigned char*d=(unsigned char*)(uintptr_t)(p->pa+(va&4095));if(to_user)memcpy(d,b,k);else memcpy(b,d,k);va+=k;b+=k;n-=k;}
 return 1;
}
int user_vm_executable(const struct user_vm*v,uint64_t va){const struct user_page*p=page(v,va);return p&&!(p->flags&VM_NX);}
