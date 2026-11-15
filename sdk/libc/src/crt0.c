/* Slopix libc startup - _start -> main(argc, argv, envp).
 * The kernel enters at _start with the SX_SPAWN payload in %rdi and, when a
 * command line was given, a pointer to its text in %rsi. */
#include "syscall.h"
#include "stdlib.h"
#include "errno.h"

extern int main(int argc, char **argv, char **envp);
extern void __libc_init_tls(void);
extern int __libc_build_argv(uint64_t number, const char *text, char *store, size_t cap,
                             char **argv, int max_args);

#define MAX_ARGS 32

__attribute__((noreturn, visibility("hidden")))
void _start(uint64_t arg, const char *text) {
    /* Never run libc from Ring 0. */
    unsigned short cs;
    __asm__ volatile("mov %%cs, %0" : "=r"(cs));
    if ((cs & 3) != 3) {
        syscall1(SX_EXIT, 90);
        __builtin_unreachable();
    }

    __libc_init_tls();

    static char arg_store[256];
    static char *argv[MAX_ARGS + 1];
    char *envp[1] = { 0 };
    int argc = __libc_build_argv(arg, text, arg_store, sizeof(arg_store), argv, MAX_ARGS + 1);

    /* exit() flushes stdio; returning from main must not lose buffered text. */
    exit(main(argc, argv, envp));
}
