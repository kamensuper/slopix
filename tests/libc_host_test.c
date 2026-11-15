/* Host-side unit test for sdk/libc.
 *
 * The library is built with -DSLOPIX_HOST so syscall1/2/3 dispatch here
 * instead of executing int 0x80. This exercises allocation, string handling,
 * formatted output and the buffered FILE layer without booting the kernel.
 *
 * Build: make libc-host-test
 */
/* MAP_ANONYMOUS is not part of strict C11/POSIX; expose it explicitly. */
#define _DEFAULT_SOURCE
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <limits.h>
#include <unistd.h>
#include <sys/mman.h>
#include "syscall.h"

/* ---- fake kernel ------------------------------------------------------- */

#define ARENA_PAGES 96
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
        if (a <= 0 || a > 8) return -12;   /* kernel grants at most 8 pages per call */
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
        if (b < 0 || b > 2) return -22;
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
        if (b == 1) files[i].size = 0;   /* 2 = open or create, keep contents */
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

/* ---- regression tests for the 2026-11 audit (BUG_REGISTER B-01/02/04/14/15/16) ---- */

static void test_alloc_regressions(void) {
    /* B-01: an exact-fit reuse used to underflow the split arithmetic and
     * plant a bogus free block inside the following allocation. */
    unsigned char *a = malloc(64), *b = malloc(64), *c = malloc(64);
    CHECK(a && b && c);
    memset(c, 0x5c, 64);
    free(b);
    unsigned char *x = malloc(64);
    CHECK(x == b);
    memset(x, 0xaa, 64);
    unsigned char *y = malloc(16);
    CHECK(y != NULL);
    CHECK(!(y >= c && y < c + 64));
    if (y) memset(y, 0x11, 16);
    int intact = 1;
    for (int i = 0; i < 64; i++) if (c[i] != 0x5c) intact = 0;
    CHECK(intact);
    free(a); free(x); free(c); free(y);

    /* Double free and interior pointers are ignored, not fatal. */
    unsigned char *d = malloc(48);
    CHECK(d != NULL);
    free(d);
    free(d);
    free(d + 16);

    /* The heap grows past the old fixed 32 KiB. */
    enum { N = 40 };
    unsigned char *blocks[N];
    int ok = 1;
    for (int i = 0; i < N; i++) {
        blocks[i] = malloc(4000);
        if (!blocks[i]) { ok = 0; break; }
        memset(blocks[i], i, 4000);
    }
    CHECK(ok);
    for (int i = 0; ok && i < N; i++)
        for (int k = 0; k < 4000; k += 997) if (blocks[i][k] != (unsigned char)i) ok = 0;
    CHECK(ok);
    for (int i = 0; i < N; i++) free(blocks[i]);

    /* One allocation larger than a single 8-page SX_MAP chunk. */
    unsigned char *big = malloc(100000);
    CHECK(big != NULL);
    if (big) { big[0] = 1; big[99999] = 2; CHECK(big[0] == 1 && big[99999] == 2); }
    free(big);

    /* Absurd sizes fail cleanly. */
    CHECK(malloc((size_t)1 << 40) == NULL);
    CHECK(calloc((size_t)1 << 40, (size_t)1 << 40) == NULL);
}

static int cmp_int(const void *l, const void *r) {
    int a = *(const int *)l, b = *(const int *)r;
    return (a > b) - (a < b);
}
struct triple { unsigned char k, pad1, pad2; };
static int cmp_triple(const void *l, const void *r) {
    return (int)((const struct triple *)l)->k - (int)((const struct triple *)r)->k;
}

static void test_qsort(void) {
    /* B-02: the old quicksort returned {0,2,1,2} for {2,2,0,1}. */
    int small[] = {2, 2, 0, 1};
    qsort(small, 4, sizeof(int), cmp_int);
    CHECK(small[0] == 0 && small[1] == 1 && small[2] == 2 && small[3] == 2);

    qsort(NULL, 0, sizeof(int), cmp_int);       /* empty: no-op */
    int one = 7;
    qsort(&one, 1, sizeof(int), cmp_int);
    CHECK(one == 7);

    unsigned seed = 12345u;
    int bad = 0;
    for (int round = 0; round < 300; round++) {
        int n = (int)(seed % 200u);
        int v[200];
        for (int i = 0; i < n; i++) {
            seed = seed * 1103515245u + 12345u;
            int mode = round % 4;
            v[i] = mode == 0 ? (int)(seed >> 16) % 7              /* many duplicates */
                 : mode == 1 ? i                                   /* sorted */
                 : mode == 2 ? n - i                               /* reversed */
                 : (int)(seed >> 8) - 0x400000;                    /* random, negatives */
        }
        qsort(v, (size_t)n, sizeof(int), cmp_int);
        for (int i = 1; i < n; i++) if (v[i - 1] > v[i]) bad++;
        seed = seed * 1103515245u + 12345u;
    }
    CHECK(bad == 0);

    struct triple t[50];
    for (int i = 0; i < 50; i++) { t[i].k = (unsigned char)((i * 37) % 50); t[i].pad1 = t[i].pad2 = 0; }
    qsort(t, 50, sizeof(t[0]), cmp_triple);
    int tri_ok = 1;
    for (int i = 0; i < 50; i++) if (t[i].k != i) tri_ok = 0;
    CHECK(tri_ok);
}

static int file_equals(const char *name, const char *want) {
    FILE *f = fopen(name, "r");
    if (!f) return 0;
    char buf[256];
    size_t n = fread(buf, 1, sizeof(buf) - 1, f);
    buf[n] = 0;
    fclose(f);
    return strcmp(buf, want) == 0;
}

static void test_file_modes(void) {
    /* B-04 / B-15: append must never destroy existing contents. */
    FILE *f = fopen("APP.TXT", "w");
    CHECK(f != NULL);
    fputs("abc", f);
    fclose(f);
    f = fopen("APP.TXT", "a");
    CHECK(f != NULL);
    fputs("def", f);
    fclose(f);
    CHECK(file_equals("APP.TXT", "abcdef"));

    int fd = open("APP.TXT", O_WRONLY | O_CREAT | O_APPEND);
    CHECK(fd > 0);
    CHECK(write(fd, "gh", 2) == 2);
    CHECK(close(fd) == 0);
    CHECK(file_equals("APP.TXT", "abcdefgh"));

    fd = open("APP.TXT", O_WRONLY | O_CREAT | O_EXCL);
    CHECK(fd < 0 && errno == EEXIST);

    fd = open("APP.TXT", O_WRONLY | O_TRUNC);
    CHECK(fd > 0);
    CHECK(write(fd, "z", 1) == 1);
    CHECK(close(fd) == 0);
    CHECK(file_equals("APP.TXT", "z"));

    /* "a" and "w+" create missing files. */
    f = fopen("NEWA.TXT", "a");
    CHECK(f != NULL);
    if (f) { fputs("1", f); fclose(f); }
    CHECK(file_equals("NEWA.TXT", "1"));
    f = fopen("NEWW.TXT", "w+");
    CHECK(f != NULL);
    if (f) fclose(f);

    /* B-16: more than one stream at a time. */
    FILE *s1 = fopen("APP.TXT", "r"), *s2 = fopen("NEWA.TXT", "r");
    CHECK(s1 != NULL && s2 != NULL);
    if (s1) fclose(s1);
    if (s2) fclose(s2);

    remove("APP.TXT"); remove("NEWA.TXT"); remove("NEWW.TXT");
}

int __libc_build_argv(uint64_t number, const char *text, char *store, size_t cap,
                      char **argv, int max_args);

static void test_argv(void) {
    /* B-05: the numeric payload 42 used to become "4". */
    char store[64], *argv[8];
    int argc = __libc_build_argv(42, NULL, store, sizeof(store), argv, 8);
    CHECK(argc == 2 && strcmp(argv[1], "42") == 0 && argv[2] == NULL);
    argc = __libc_build_argv(1234567890123ull, NULL, store, sizeof(store), argv, 8);
    CHECK(argc == 2 && strcmp(argv[1], "1234567890123") == 0);
    argc = __libc_build_argv(0, NULL, store, sizeof(store), argv, 8);
    CHECK(argc == 1 && argv[1] == NULL);

    /* Text wins over the number; quotes group words; "" is an empty arg. */
    argc = __libc_build_argv(7, "  alpha \"b c\"  '' d", store, sizeof(store), argv, 8);
    CHECK(argc == 5);
    if (argc == 5) {
        CHECK(strcmp(argv[1], "alpha") == 0);
        CHECK(strcmp(argv[2], "b c") == 0);
        CHECK(strcmp(argv[3], "") == 0);
        CHECK(strcmp(argv[4], "d") == 0);
        CHECK(argv[5] == NULL);
    }

    /* Bounded: too many words and too little storage never overflow. */
    argc = __libc_build_argv(0, "a b c d e f g h i j", store, sizeof(store), argv, 4);
    CHECK(argc == 3 && argv[3] == NULL);
    char tiny[6];
    argc = __libc_build_argv(0, "abcdefgh ijk", tiny, sizeof(tiny), argv, 8);
    CHECK(argc >= 2 && strlen(argv[1]) <= 5);
}

static void test_strtol(void) {
    /* B-22: overflow saturates with ERANGE instead of wrapping. */
    errno = 0;
    CHECK(strtol("99999999999999999999", NULL, 10) == LONG_MAX && errno == ERANGE);
    errno = 0;
    CHECK(strtol("-99999999999999999999", NULL, 10) == LONG_MIN && errno == ERANGE);
    errno = 0;
    CHECK(strtol("-9223372036854775808", NULL, 10) == LONG_MIN && errno == 0);
    CHECK(strtol("9223372036854775807", NULL, 10) == LONG_MAX);
    char *end;
    CHECK(strtol("  -42xyz", &end, 10) == -42 && *end == 'x');
    CHECK(strtol("0x1F", NULL, 0) == 31 && strtol("017", NULL, 0) == 15);
    CHECK(strtol("abc", &end, 10) == 0 && strcmp(end, "abc") == 0);
    CHECK(strtoul("-1", NULL, 10) == ULONG_MAX);
    errno = 0;
    CHECK(strtoul("99999999999999999999999", NULL, 10) == ULONG_MAX && errno == ERANGE);
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
    test_alloc_regressions();
    test_qsort();
    test_files();
    test_file_modes();
    test_argv();
    test_strtol();
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
