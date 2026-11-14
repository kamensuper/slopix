#ifndef SLOPIX_SYSCALL_H
#define SLOPIX_SYSCALL_H

/* Slopix syscall numbers - must match kernel sdk/slopix.h */
enum {
    SX_WRITE       = 1,
    SX_EXIT        = 2,
    SX_TIME        = 3,
    SX_MAP         = 4,
    SX_YIELD       = 5,
    SX_SLEEP       = 6,
    SX_PID         = 7,
    SX_OPEN        = 8,
    SX_READ        = 9,
    SX_CLOSE       = 10,
    SX_SEEK        = 11,
    SX_SPAWN       = 12,
    SX_GUI_OPEN    = 13,
    SX_GUI_PRESENT = 14,
    SX_GUI_POLL    = 15,
    SX_CREATE      = 16,
    SX_FWRITE      = 17,
    SX_HTTP_GET    = 18,
    SX_READDIR     = 19,
    SX_REMOVE      = 20,
    SX_MKDIR       = 21,
    SX_DESKTOP_OPEN= 22,
    SX_PREF_GET    = 23,
    SX_PREF_SET    = 24,
    SX_PREF_SAVE   = 25,
    SX_PACKAGE     = 26,
    SX_PROCINFO    = 27,
    SX_CONSOLE_POLL= 28,
    SX_STAT        = 29,
    SX_PCM_START   = 30,
    SX_PCM_STOP    = 31,
    SX_PCM_VOLUME  = 32,
    SX_PCM_PLAYING = 33,
    SX_SCHED_PARAM = 34,
    SX_FUTEX       = 35,
    SX_TLS_BASE    = 36,
    SX_CLOCK_GET   = 37,
};

/* Descriptor space: 0..2 console channels, 10..13 file slots. */
#define SX_FD_BASE 10
#define SX_FD_MAX  4

/* Inline syscall - returns negative errno on error.
 * Building with -DSLOPIX_HOST routes through a host-provided shim so the
 * library can be unit-tested on a normal machine. */
#ifdef SLOPIX_HOST
long slopix_host_syscall(long n, long a, long b, long c);
static inline long syscall1(long n, long a) { return slopix_host_syscall(n, a, 0, 0); }
static inline long syscall2(long n, long a, long b) { return slopix_host_syscall(n, a, b, 0); }
static inline long syscall3(long n, long a, long b, long c) { return slopix_host_syscall(n, a, b, c); }
#else
static inline long syscall1(long n, long a) {
    long r;
    __asm__ volatile("int $0x80" : "=a"(r) : "a"(n), "D"(a) : "memory", "cc");
    return r;
}
static inline long syscall2(long n, long a, long b) {
    long r;
    __asm__ volatile("int $0x80" : "=a"(r) : "a"(n), "D"(a), "S"(b) : "memory", "cc");
    return r;
}
static inline long syscall3(long n, long a, long b, long c) {
    long r;
    __asm__ volatile("int $0x80" : "=a"(r) : "a"(n), "D"(a), "S"(b), "d"(c) : "memory", "cc");
    return r;
}
#endif

/* Errno handling */
extern int *__errno_location(void);
static inline void __set_errno(long r) {
    if (r < 0 && r > -4096) {
        *__errno_location() = (int)-r;
    }
}

#endif