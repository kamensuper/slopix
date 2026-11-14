/* Slopix libc startup - _start -> main(argc, argv, envp).
 * The kernel enters at _start with the SX_SPAWN payload in %rdi. */
#include "syscall.h"
#include "stdlib.h"
#include "errno.h"

extern int main(int argc, char **argv, char **envp);
extern void __libc_init_tls(void);

__attribute__((noreturn, visibility("hidden")))
void _start(uint64_t arg) {
    (void)arg;

    /* Never run libc from Ring 0. */
    unsigned short cs;
    __asm__ volatile("mov %%cs, %0" : "=r"(cs));
    if ((cs & 3) != 3) {
        syscall1(SX_EXIT, 90);
        __builtin_unreachable();
    }

    __libc_init_tls();

    /* Command lines are not part of ABI v2 yet; the SX_SPAWN payload is
     * delivered to main() as argv[1] so programs can still branch on it. */
    char payload[24];
    char *argv[3];
    char *envp[1] = { 0 };
    int argc = 1;
    argv[0] = (char *)"slopix";
    argv[1] = 0;
    argv[2] = 0;
    if (arg) {
        unsigned i = 0;
        do { payload[i] = (char)('0' + arg % 10); arg /= 10; } while (arg && i < sizeof(payload) - 1);
        /* reverse in place */
        for (unsigned a = 0, b = i; a < b; a++, b--) { char t = payload[a]; payload[a] = payload[b]; payload[b] = t; }
        payload[i + 1] = 0;
        argv[1] = payload;
        argc = 2;
    }

    int ret = main(argc, argv, envp);

    syscall1(SX_EXIT, ret);
    __builtin_unreachable();
}