/* Host-side unit test for sdk/libc.
 *
 * The library is built with -DSLOPIX_HOST so syscall1/2/3 dispatch here
 * instead of executing int 0x80. This exercises allocation, string handling,
 * formatted output and the buffered FILE layer without booting the kernel.
 *
 * Build: make libc-host-test
 */
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <unistd.h>
#include <sys/mman.h>
#include "syscall.h"

/* ---- fake kernel ------------------------------------------------------- */

#define ARENA_PAGES 8
#define ARENA_BYTES (ARENA_PAGES * 4096)
#define MAXF 6
#define FILE_CAP 4096

static unsigned char arena[ARENA_BYTES] __attribute__((aligned(16)));
static size_t arena_used;

static char console[8192];
static size_t console_len;

struct fake_file {
    char name[128];
    unsigned char data[FILE_CAP];
    uint32_t size;
    uint32_t off;
    int exists;   /* entry present in the directory */
    int open;     /* a descriptor currently refers to it */
};
static struct fake_file files[MAXF];

struct wire_sched { int policy; int priority; uint64_t deadline_ns, period_ns, runtime_ns; };
static struct wire_sched last_sched;
static int sched_calls;

static int find_file(const char *name) {
    for (int i = 0; i < MAXF; i++)
        if (files[i].exists && strcmp(files[i].name, name) == 0) return i;
    return -1;
}

static int free_slot(void) {
    for (int i = 0; i < MAXF; i++) if (!files[i].exists) return i;
    return -1;
}

long slopix_host_syscall(long n, long a, long b, long c) {
    switch (n) {
    case SX_MAP: {
        if (a <= 0) return -12;
        size_t want = (size_t)a * 4096u;
        if (want > ARENA_BYTES - arena_used) return -12;
        void *p = arena + arena_used;
        arena_used += want;
        return (long)p;
    }
    case SX_WRITE: {
        size_t len = (size_t)b;
        if (len > 127) return -14;
        if (console_len + len >= sizeof(console)) return -11;
        memcpy(console + console_len, (const void *)a, len);
        console_len += len;
        console[console_len] = 0;
        return a;
    }
    case SX_EXIT:
        _exit((int)a);
        return 0;
    case SX_PID: return 42;
    case SX_TLS_BASE: return 0;
    case SX_SLEEP: return 0;
    case SX_YIELD: return 0;
    case SX_TIME: return 1234567;
    case SX_OPEN: {
        int i = find_file((const char *)a);
        if (i < 0) return -2;
        files[i].off = 0;
        files[i].open = 1;
        return i + SX_FD_BASE;
    }
    case SX_CREATE: {
        int i = find_file((const char *)a);
        if (i < 0) {
            i = free_slot();
            if (i < 0) return -24;
            files[i].exists = 1;
            strcpy(files[i].name, (const char *)a);
            files[i].size = 0;
        } else if (!b) {
            return -17;
        }
        files[i].off = 0;
        files[i].open = 1;
        if (b) files[i].size = 0;
        return i + SX_FD_BASE;
    }
    case SX_READ: {
        int i = (int)a - SX_FD_BASE;
        if (i < 0 || i >= MAXF || !files[i].open) return -9;
        uint32_t want = (uint32_t)c;
        if (files[i].off >= files[i].size) return 0;
        uint32_t avail = files[i].size - files[i].off;
        if (want > avail) want = avail;
        memcpy((void *)b, files[i].data + files[i].off, want);
        files[i].off += want;
        return want;
    }
    case SX_FWRITE: {
        int i = (int)a - SX_FD_BASE;
        if (i < 0 || i >= MAXF || !files[i].open) return -9;
        uint32_t len = (uint32_t)c;
        if (files[i].off + len > FILE_CAP) return -27;
        memcpy(files[i].data + files[i].off, (const void *)b, len);
        files[i].off += len;
        if (files[i].off > files[i].size) files[i].size = files[i].off;
        return len;
    }
    case SX_SEEK: {
        int i = (int)a - SX_FD_BASE;
        if (i < 0 || i >= MAXF || !files[i].open) return -9;
        if (b < 0 || b > FILE_CAP) return -22;
        files[i].off = (uint32_t)b;
        return b;
    }
    case SX_CLOSE: {
        int i = (int)a - SX_FD_BASE;
        if (i < 0 || i >= MAXF || !files[i].open) return -9;
        files[i].open = 0;   /* closing a descriptor keeps the file */
        return 0;
    }
    case SX_STAT: {
        int i = find_file((const char *)a);
        if (i < 0) return -2;
        *(uint32_t *)(void *)b = files[i].size;
        return 0;
    }
    case SX_REMOVE: {
        int i = find_file((const char *)a);
        if (i < 0) return -2;
        files[i].exists = 0;
        files[i].open = 0;
        return 0;
    }
    case SX_MKDIR: return -5;
    case SX_CLOCK_GET: {
        struct timespec *ts = (struct timespec *)(void *)b;
        if (!ts) return -14;
        ts->tv_sec = 7;
        ts->tv_nsec = 250000000;
        return 0;
    }
    case SX_SCHED_PARAM: {
        const struct wire_sched *w = (const struct wire_sched *)(void *)b;
        if (!w) return -14;
        last_sched = *w;
        if (w->policy != (int)a) return -22;
        sched_calls++;
        return 0;
    }
    case SX_FUTEX: return 0;
    default: return -38;
    }
}

/* ---- test harness ------------------------------------------------------ */

static int failures;

/* Real stdout is unreachable through libc's write() override, so dump the
 * captured console with a direct syscall instruction. */
static void host_emit(const char *s, size_t n) {
    long ret;
    __asm__ volatile("syscall"
                     : "=a"(ret)
                     : "a"(1L), "D"(1L), "S"(s), "d"(n)
                     : "rcx", "r11", "memory");
    (void)ret;
}

static void check(int ok, const char *what, int line) {
    if (!ok) {
        printf("FAIL line %d: %s (errno=%d)\n", line, what, errno);
        failures++;
    }
}
#define CHECK(cond) check((cond), #cond, __LINE__)

/* These numbers are shared with sdk/slopix.h (the kernel's copy). The guest
 * test proves the two ends agree at runtime; this pins the libc side so a
 * silent renumbering cannot slip through. */
_Static_assert(SX_WRITE == 1 && SX_STAT == 29 && SX_PCM_PLAYING == 33,
               "core syscall numbering changed");
_Static_assert(SX_SCHED_PARAM == 34 && SX_FUTEX == 35 &&
               SX_TLS_BASE == 36 && SX_CLOCK_GET == 37,
               "CP07 syscall numbering must match sdk/slopix.h");

static void test_strings(void) {
    char buf[64];
    CHECK(strlen("") == 0);
    CHECK(strlen("slopix") == 6);
    strcpy(buf, "abc");
    CHECK(strcmp(buf, "abc") == 0);
    CHECK(strcmp("abc", "abd") < 0);
    CHECK(strcmp("abd", "abc") > 0);
    CHECK(strncmp("abcdef", "abcxyz", 3) == 0);
    CHECK(strcasecmp("HeLLo", "hello") == 0);
    CHECK(strncasecmp("ABCdef", "abcXYZ", 3) == 0);
    strcat(buf, "def");
    CHECK(strcmp(buf, "abcdef") == 0);
    CHECK(strchr(buf, 'c') == buf + 2);
    CHECK(strrchr(buf, 'f') == buf + 5);
    CHECK(strstr(buf, "cde") == buf + 2);
    CHECK(strstr(buf, "zzz") == NULL);
    CHECK(memcmp("abc", "abc", 3) == 0);
    CHECK(memcmp("abc", "abd", 3) < 0);
    CHECK(memchr("abcdef", 'd', 6) == (void *)"abcdef" + 3);

    char moved[8] = "abcdef";
    memmove(moved + 1, moved, 5);
    CHECK(memcmp(moved, "aabcde", 6) == 0);

    memset(buf, 'x', 5);
    buf[5] = 0;
    CHECK(strcmp(buf, "xxxxx") == 0);

    char *d = strdup("heap");
    CHECK(d && strcmp(d, "heap") == 0);
    free(d);
    char *nd = strndup("truncate", 4);
    CHECK(nd && strcmp(nd, "trun") == 0);
    free(nd);

    char tok[] = "a,b,,c";
    CHECK(strcmp(strtok(tok, ","), "a") == 0);
    CHECK(strcmp(strtok(NULL, ","), "b") == 0);
    CHECK(strcmp(strtok(NULL, ","), "c") == 0);
    CHECK(strtok(NULL, ",") == NULL);
}

static void test_format(void) {
    char out[128];
    snprintf(out, sizeof(out), "%d", 0);
    CHECK(strcmp(out, "0") == 0);
    snprintf(out, sizeof(out), "%d", -42);
    CHECK(strcmp(out, "-42") == 0);
    snprintf(out, sizeof(out), "%u", 4000000000u);
    CHECK(strcmp(out, "4000000000") == 0);
    snprintf(out, sizeof(out), "%x", 0xdeadbeefu);
    CHECK(strcmp(out, "deadbeef") == 0);
    snprintf(out, sizeof(out), "%X", 0xabcdu);
    CHECK(strcmp(out, "ABCD") == 0);
    snprintf(out, sizeof(out), "[%5d]", 42);
    CHECK(strcmp(out, "[   42]") == 0);
    snprintf(out, sizeof(out), "[%-5d]", 42);
    CHECK(strcmp(out, "[42   ]") == 0);
    snprintf(out, sizeof(out), "[%05d]", 42);
    CHECK(strcmp(out, "[00042]") == 0);
    snprintf(out, sizeof(out), "%.3s", "abcdef");
    CHECK(strcmp(out, "abc") == 0);
    snprintf(out, sizeof(out), "%s/%c/%%", "x", 'y');
    CHECK(strcmp(out, "x/y/%") == 0);
    snprintf(out, sizeof(out), "%ld", 1234567890123L);
    CHECK(strcmp(out, "1234567890123") == 0);
    snprintf(out, sizeof(out), "%p", (void *)0x1234);
    CHECK(strcmp(out, "0x1234") == 0);

    /* Truncation must always terminate and report the full length. */
    char small[6];
    char longtext[] = "abcdefgh";
    memset(small, '#', sizeof(small));
    int n = snprintf(small, sizeof(small), "%s", longtext);
    CHECK(n == 8);
    CHECK(small[5] == '\0');
    CHECK(strcmp(small, "abcde") == 0);
}

static void test_alloc(void) {
    unsigned char *p = malloc(100);
    CHECK(p != NULL);
    for (int i = 0; i < 100; i++) p[i] = (unsigned char)i;
    for (int i = 0; i < 100; i++) CHECK(p[i] == (unsigned char)i);
    free(p);

    /* calloc must zero. */
    unsigned char *z = calloc(64, 1);
    CHECK(z != NULL);
    int clean = 1;
    for (int i = 0; i < 64; i++) if (z[i]) clean = 0;
    CHECK(clean);
    free(z);

    /* realloc grows and preserves. */
    char *r = malloc(16);
    CHECK(r != NULL);
    strcpy(r, "0123456789abcde");
    r = realloc(r, 256);
    CHECK(r != NULL);
    CHECK(strcmp(r, "0123456789abcde") == 0);
    free(r);

    /* Free-list reuse: same-size churn must not exhaust the arena. */
    for (int i = 0; i < 64; i++) {
        void *q = malloc(512);
        CHECK(q != NULL);
        free(q);
    }

    CHECK(malloc(0) == NULL);
    free(NULL); /* must be a no-op */
}

static void test_files(void) {
    const char *path = "TEST.TXT";
    FILE *f = fopen(path, "w");
    CHECK(f != NULL);
    CHECK(fprintf(f, "line %d\n", 1) == 7);
    CHECK(fputs("second\n", f) == 0);
    CHECK(fclose(f) == 0);

    f = fopen(path, "r");
    CHECK(f != NULL);
    char line[32];
    CHECK(fgets(line, sizeof(line), f) != NULL);
    CHECK(strcmp(line, "line 1\n") == 0);
    CHECK(fgets(line, sizeof(line), f) != NULL);
    CHECK(strcmp(line, "second\n") == 0);
    CHECK(fgets(line, sizeof(line), f) == NULL);
    CHECK(feof(f) != 0);

    /* SEEK_END + ftell must agree with the byte count. */
    CHECK(fseek(f, 0, SEEK_END) == 0);
    long size = ftell(f);
    CHECK(size == 14);
    CHECK(fseek(f, 0, SEEK_SET) == 0);
    CHECK(ftell(f) == 0);
    CHECK(fclose(f) == 0);

    /* Missing file must set errno to ENOENT. */
    errno = 0;
    CHECK(fopen("NOPE.TXT", "r") == NULL);
    CHECK(errno == ENOENT);

    /* Descriptor API against the same fake FS. */
    int fd = open("RAW.TXT", O_CREAT | O_TRUNC);
    CHECK(fd > 0);
    CHECK(write(fd, "hello", 5) == 5);
    CHECK(close(fd) == 0);
    fd = open("RAW.TXT", O_RDONLY);
    CHECK(fd > 0);
    char raw[8];
    memset(raw, 0, sizeof(raw));
    CHECK(read(fd, raw, sizeof(raw)) == 5);
    CHECK(strcmp(raw, "hello") == 0);
    CHECK(close(fd) == 0);

    CHECK(remove("RAW.TXT") == 0);
    CHECK(fopen("RAW.TXT", "r") == NULL);
}

static void test_sched_and_clock(void) {
    struct sched_param sp;
    memset(&sp, 0, sizeof(sp));
    sp.sched_priority = 24;
    sp.period_ns = 10000000;
    sp.runtime_ns = 2000000;
    sp.deadline_ns = 10000000;
    CHECK(sched_param(SCHED_DEADLINE, &sp) == 0);
    CHECK(sched_calls == 1);
    CHECK(last_sched.policy == SCHED_DEADLINE);
    CHECK(last_sched.priority == 24);
    CHECK(last_sched.period_ns == 10000000);
    CHECK(last_sched.runtime_ns == 2000000);

    struct timespec ts;
    memset(&ts, 0, sizeof(ts));
    CHECK(clock_gettime(CLOCK_MONOTONIC, &ts) == 0);
    CHECK(ts.tv_sec == 7);
    CHECK(ts.tv_nsec == 250000000);
}

static void test_mem_bulk(void) {
    /* Every length across all three paths (<16 bytes, 16-byte blocks and the
     * 64-byte SSE2 loop), at every unaligned offset. */
    static unsigned char a[1200], b[1200], s[1200];
    for (unsigned i = 0; i < sizeof(s); i++) s[i] = (unsigned char)(i * 37 + 11);
    for (unsigned n = 0; n <= 1100; n++) {
        for (unsigned off = 0; off < 16; off++) {
            memset(a, 0x51, sizeof(a));
            memset(b, 0x51, sizeof(b));
            CHECK(memcpy(a + off, s + 15 - off, n) == a + off);
            memcpy(b + off, s + 15 - off, n);
            CHECK(memcmp(a, b, sizeof(a)) == 0);
            CHECK(memset(a + off, 0xa3, n) == a + off);
            memset(b + off, 0xa3, n);
            CHECK(memcmp(a, b, sizeof(a)) == 0);
            for (int shift = -15; shift <= 15; shift++) {
                memcpy(a, s, sizeof(a));
                memcpy(b, s, sizeof(b));
                unsigned dst = 100 + off, src = (unsigned)((int)dst + shift);
                CHECK(memmove(a + dst, a + src, n) == a + dst);
                memmove(b + dst, b + src, n);
                CHECK(memcmp(a, b, sizeof(a)) == 0);
            }
        }
    }
    /* Guard pages: the SSE2 path may never read or write outside [base,n).
     * Layout [guard][data 2 pages][guard]; the request is placed at the start
     * and at the end of the data pages so both edges are checked. */
    {
        const size_t ps = 4096, data = 2 * ps, span = 4 * ps;
        unsigned char *m = mmap(NULL, span, PROT_READ | PROT_WRITE,
                                MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        CHECK(m != MAP_FAILED);
        CHECK(mprotect(m, ps, PROT_NONE) == 0);
        CHECK(mprotect(m + span - ps, ps, PROT_NONE) == 0);
        unsigned char *src = m + ps, *dst = m + ps;
        for (size_t i = 0; i < data; i++) src[i] = (unsigned char)(i * 7 + 3);
        for (size_t n = 0; n <= data; n++) {
            for (int end = 1; end >= 0; end--) {
                unsigned char *sp = end ? src + data - n : src;
                unsigned char *dp = end ? dst + data - n : dst;
                memset(dst, 0x33, data);
                CHECK(memcpy(dp, sp, n) == dp);
                CHECK(memcmp(dp, sp, n) == 0);
                CHECK(memset(dp, 0x99, n) == dp);
                for (size_t i = 0; i < n; i++) CHECK(dp[i] == 0x99);
                if (n) {
                    memmove(dst, sp, n);
                    CHECK(memmove(dst + 1, dst, n - 1) == dst + 1);
                }
            }
        }
        CHECK(munmap(m, span) == 0);
    }
}

static void test_console(void) {
    printf("console-line\n");
    CHECK(console_len > 0);
    CHECK(strstr(console, "console-line") != NULL);
    /* Console streams are line buffered, so the newline must have flushed. */
    CHECK(console[console_len - 1] == '\n');
}

int main(void) {
    test_strings();
    test_mem_bulk();
    test_format();
    test_alloc();
    test_files();
    test_sched_and_clock();
    test_console();

    if (failures) {
        printf("LIBC_HOST_TEST: %d failure(s)\n", failures);
        host_emit(console, console_len);
        return 1;
    }
    printf("LIBC_HOST_TEST: ok\n");
    host_emit(console, console_len);
    return 0;
}