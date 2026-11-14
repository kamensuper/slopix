#ifndef SLOPIX_USER_VM_H
#define SLOPIX_USER_VM_H
#include <stdint.h>
#include <stddef.h>
#define USER_BASE 0x100000000ULL
#define USER_CODE_END (USER_BASE+0x400000)
#define USER_HEAP (USER_BASE+0x400000)
#define USER_HEAP_END (USER_BASE+0x4ff8000)
#define USER_STACK (USER_BASE+0x5000000)
#define USER_STACK_PAGES 4
#define USER_MAX_PAGES 19500
#define USER_PT_COUNT 40
#define USER_TABLES (3+USER_PT_COUNT)
#define VM_WRITE 2ULL
#define VM_NX (1ULL<<63)
struct user_page {uint64_t va,pa,flags;};
struct user_vm {uint64_t tables[USER_TABLES];struct user_page pages[USER_MAX_PAGES];unsigned count;uint64_t heap;};
int user_vm_create(struct user_vm *v);
void user_vm_destroy(struct user_vm *v);
int user_vm_map(struct user_vm *v,uint64_t va,uint64_t flags);
int user_vm_range(const struct user_vm *v,uint64_t va,size_t n,int write);
int user_vm_copy(const struct user_vm *v,uint64_t va,void *buffer,size_t n,int to_user);
int user_vm_executable(const struct user_vm *v,uint64_t va);
#endif
