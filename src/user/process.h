#ifndef SLOPIX_PROCESS_H
#define SLOPIX_PROCESS_H
#include "vm.h"
struct user_frame {uint64_t r15,r14,r13,r12,r11,r10,r9,r8,rbp,rdi,rsi,rdx,rcx,rbx,rax,vector,error,rip,cs,flags,rsp,ss;};
_Static_assert(sizeof(struct user_frame)==176,"assembly trap frame");
void process_init(void);
int process_step(void);
void process_exception(struct user_frame*f);
void process_timer(struct user_frame*f);
void process_syscall(struct user_frame*f);
int process_spawn(const char*path,uint64_t arg);
int process_kill(unsigned pid);
/* Minimized GUI programs preserve state without consuming CPU. */
int process_suspend(unsigned pid);
int process_resume(unsigned pid);
int process_alive(unsigned pid);
/* For an exited pid: crashed=1 if it died on a CPU fault. Returns 0 if unknown. */
int process_exit_info(unsigned pid,int*crashed,unsigned*fault);
void process_report(void(*line)(const char*));
int process_command(const char*name,char*args,void(*line)(const char*));
void arch_user_stack(uint64_t top);
/* Program IA32_FS_BASE for the duration of one user slice (0 = clear). */
void arch_user_fs(uint64_t base);
void user_enter(struct user_frame*f,uint64_t root,void*fp);
void user_leave(void) __attribute__((noreturn));
void user_fp_init(void*fp);
void terminal_process_output(unsigned pid,const char*s);
#endif
