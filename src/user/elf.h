#ifndef SLOPIX_USER_ELF_H
#define SLOPIX_USER_ELF_H
#include "vm.h"
int user_elf_load(struct user_vm*v,const void*data,size_t bytes,uint64_t*entry);
#endif
