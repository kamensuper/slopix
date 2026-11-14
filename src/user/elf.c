/* Bounded ELF64 ET_EXEC subset: x86-64, little endian, static PT_LOAD, W^X.
 * No relocations, interpreter, TLS, dynamic linking, executable stack or overlap.
 * The caller destroys the entire private VM on any load failure. */
#include "elf.h"
#include "../kernel.h"
extern void user_loader_checkpoint(void) __attribute__((weak));
struct ehdr {unsigned char ident[16];uint16_t type,machine;uint32_t version;uint64_t entry,phoff,shoff;uint32_t flags;uint16_t ehsize,phsize,phnum,shsize,shnum,shstr;};
struct phdr {uint32_t type,flags;uint64_t offset,va,pa,filesz,memsz,align;};
_Static_assert(sizeof(struct ehdr)==64&&sizeof(struct phdr)==56,"ELF layout");
int user_elf_load(struct user_vm*v,const void*data,size_t bytes,uint64_t*entry){
 if(bytes<sizeof(struct ehdr)||bytes>1048576)return 0;
 const unsigned char*b=data;struct ehdr e;for(size_t i=0;i<sizeof(e);i++)((unsigned char*)&e)[i]=b[i];
 if(e.ident[0]!=127||e.ident[1]!='E'||e.ident[2]!='L'||e.ident[3]!='F'||e.ident[4]!=2||e.ident[5]!=1||e.ident[6]!=1||e.type!=2||e.machine!=62||e.version!=1||e.ehsize!=64||e.phsize!=56||!e.phnum||e.phnum>16||e.flags||e.phoff<64||e.phoff>bytes||e.phnum>(bytes-e.phoff)/56)return 0;
 unsigned loaded=0;int entry_valid=0;
 for(unsigned n=0;n<e.phnum;n++){
  struct phdr p;for(size_t i=0;i<sizeof(p);i++)((unsigned char*)&p)[i]=b[e.phoff+(size_t)n*56+i];
  if(p.type==2||p.type==3||p.type==7||(p.type==0x6474e551&&(p.flags&1)))return 0;
  if(p.type!=1||!p.memsz)continue;
  if((p.flags&~7u)||!(p.flags&4)||((p.flags&3)==3)||p.va<USER_BASE+4096||p.va>=USER_CODE_END||p.memsz>USER_CODE_END-p.va||p.filesz>p.memsz||p.offset>bytes||p.filesz>bytes-p.offset||(p.va&4095)!=(p.offset&4095)||p.align>4096||(p.align&&(p.align&(p.align-1))))return 0;
  uint64_t first=p.va&~4095ULL,end=(p.va+p.memsz+4095)&~4095ULL,flags=(p.flags&2)?VM_WRITE|VM_NX:(p.flags&1)?0:VM_NX;
  for(uint64_t a=first;a<end;a+=4096){if(!user_vm_map(v,a,flags))return 0;if(user_loader_checkpoint)user_loader_checkpoint();}
  if((p.flags&1)&&e.entry>=p.va&&e.entry-p.va<p.filesz)entry_valid=1;
  /* Loader writes through supervisor identity aliases, including read-only code. */
  for(uint64_t done=0;done<p.filesz;){
    uint64_t a=p.va+done;
    unsigned bank=(unsigned)((a-USER_BASE)>>21);
    const uint64_t *pt=(const uint64_t*)(uintptr_t)v->tables[3+bank];
    uint64_t page=pt[(a>>12)&511];if(!(page&1))return 0;
    size_t n=4096-(a&4095);if(n>p.filesz-done)n=p.filesz-done;
    memcpy((void*)(uintptr_t)((page&0x000ffffffffff000ULL)+(a&4095)),b+p.offset+done,n);
    done+=n;
   }
  loaded++;
 }
 if(!loaded||!entry_valid||!user_vm_executable(v,e.entry))return 0;
 for(unsigned i=0;i<USER_STACK_PAGES;i++)if(!user_vm_map(v,USER_STACK-(i+1)*4096,VM_WRITE|VM_NX))return 0;
 *entry=e.entry;return 1;
}
