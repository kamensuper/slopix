#include "syscall.h"
#include "errno.h"

/* One private address space per process, so a plain static is already
 * per-process state. The kernel only touches IA32_FS_BASE so that a future
 * threaded libc can move this to real TLS without an ABI change. */
static int process_errno;

int *__errno_location(void) {
    return &process_errno;
}

void __libc_init_tls(void) {
    /* Best effort: the kernel validates the pointer and programs %fs. */
    syscall1(SX_TLS_BASE, (long)&process_errno);
}