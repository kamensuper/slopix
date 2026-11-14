/* Checkpoint 08 benchmark: SSE2 bulk throughput, syscall cost, and proof that
 * the kernel keeps each process's SSE state across preemption.
 *
 * Run as `run BENCH.ELF` (parent) or `run BENCH.ELF 1` (worker). The parent
 * spawns the worker; both then hold a marker in an XMM register across a
 * blocking syscall while the other one floods every XMM register. If the
 * kernel shared or skipped FPU state, the markers would come back wrong.
 *
 * All buffers are static: the Ring-3 stack is only four pages. Output stays
 * short because SX_WRITE is rate limited per process. */
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <stdint.h>
#include "syscall.h"

#define BUF (256u * 1024u)

static unsigned char src[BUF] __attribute__((aligned(64)));
static unsigned char dst[BUF] __attribute__((aligned(64)));
static unsigned char marker_a[16] __attribute__((aligned(16)));
static unsigned char marker_b[16] __attribute__((aligned(16)));

static uint64_t now_ns(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 0;
    return (uint64_t)ts.tv_sec * 1000000000ull + (uint64_t)ts.tv_nsec;
}

static uint64_t mb_per_s(uint64_t bytes, uint64_t ns) {
    if (!ns) ns = 1;
    return (bytes * 1000000000ull / ns) / (1024ull * 1024ull);
}

static int mode_of(int argc, char **argv) {
    int mode = 0;
    if (argc > 1)
        for (const char *p = argv[1]; *p >= '0' && *p <= '9'; p++)
            mode = mode * 10 + (*p - '0');
    return mode;
}

/* Set xmm5, block in the kernel for `us`, then read xmm5 back -- all inside one
 * asm block, so the compiler cannot touch the register in between. Returns 1
 * when the 16 marker bytes survived. */
static int sleep_sse5(unsigned us, const unsigned char *in, unsigned char *out) {
    long ret;
    __asm__ volatile("movups (%2),%%xmm5\n\t"
                     "int $0x80\n\t"
                     "movups %%xmm5,(%3)"
                     : "=a"(ret)
                     : "a"((long)SX_SLEEP), "r"(in), "r"(out), "D"((long)us)
                     : "rcx", "r11", "xmm5", "memory");
    (void)ret;
    return memcmp(in, out, 16) == 0;
}

static int sleep_sse6(unsigned us, const unsigned char *in, unsigned char *out) {
    long ret;
    __asm__ volatile("movups (%2),%%xmm6\n\t"
                     "int $0x80\n\t"
                     "movups %%xmm6,(%3)"
                     : "=a"(ret)
                     : "a"((long)SX_SLEEP), "r"(in), "r"(out), "D"((long)us)
                     : "rcx", "r11", "xmm6", "memory");
    (void)ret;
    return memcmp(in, out, 16) == 0;
}

/* Make every SSE register hold something no other process uses. */
static void churn_xmm(void) {
    __asm__ volatile(
        "movups (%0),%%xmm0\n\tmovups (%0),%%xmm1\n\tmovups (%0),%%xmm2\n\tmovups (%0),%%xmm3\n\t"
        "movups (%0),%%xmm4\n\tmovups (%0),%%xmm5\n\tmovups (%0),%%xmm6\n\tmovups (%0),%%xmm7\n\t"
        "movups (%0),%%xmm8\n\tmovups (%0),%%xmm9\n\tmovups (%0),%%xmm10\n\tmovups (%0),%%xmm11\n\t"
        "movups (%0),%%xmm12\n\tmovups (%0),%%xmm13\n\tmovups (%0),%%xmm14\n\tmovups (%0),%%xmm15"
        :: "r"(marker_b)
        : "xmm0", "xmm1", "xmm2", "xmm3", "xmm4", "xmm5", "xmm6", "xmm7",
          "xmm8", "xmm9", "xmm10", "xmm11", "xmm12", "xmm13", "xmm14", "xmm15",
          "memory");
}

static int worker(void) {
    int bad = 0;
    for (int i = 0; i < 120 && !bad; i++) {
        unsigned char got[16] __attribute__((aligned(16)));
        churn_xmm();
        /* Marker goes in after the churn and must survive the sleep. */
        if (!sleep_sse6(1000, marker_b, got)) bad = 1;
        memcpy(dst, src, BUF);
        memset(dst + BUF / 2, 0x5a, BUF / 2);
        if (dst[BUF - 1] != 0x5a || dst[0] != src[0]) bad = 1;
        usleep(1000);
    }
    printf(bad ? "BENCH worker BAD\n" : "BENCH worker ok\n");
    return bad ? 1 : 0;
}

/* Fastest of several repetitions: a timer preemption in the middle of a run
 * adds another process's runtime to the wall clock, and the least-interrupted
 * run is the honest measure of the loop itself. Far more stable numbers come
 * from `make cp08-membench`, which runs the same loops natively. */
static uint64_t best_of(int fill, size_t n, int iters) {
    uint64_t best = ~0ull;
    for (int r = 0; r < 5; r++) {
        uint64_t t0 = now_ns();
        for (int i = 0; i < iters; i++) {
            if (fill) memset(dst, 0xa5, n);
            else memcpy(dst, src, n);
        }
        uint64_t dt = now_ns() - t0;
        if (dt < best) best = dt;
    }
    return best ? best : 1;
}

static void bench_copy(const char *label, size_t n, int iters) {
    for (size_t i = 0; i < n; i++) src[i] = (unsigned char)(i * 13 + 5);
    memset(dst, 0, n);
    /* Warm-up: the first calls also pay the TCG translation of the loop. */
    for (int i = 0; i < 4; i++) memcpy(dst, src, n);
    uint64_t bytes = (uint64_t)n * (uint64_t)iters;
    printf("BENCH memcpy %s=%lu MB/s\n", label,
           (unsigned long)mb_per_s(bytes, best_of(0, n, iters)));
    if (memcmp(dst, src, n) != 0) printf("BENCH copy mismatch %s\n", label);
}

static void bench_fill(const char *label, size_t n, int iters) {
    uint64_t bytes = (uint64_t)n * (uint64_t)iters;
    for (int i = 0; i < 4; i++) memset(dst, 0xa5, n);
    printf("BENCH memset %s=%lu MB/s\n", label,
           (unsigned long)mb_per_s(bytes, best_of(1, n, iters)));
    for (size_t i = 0; i < n; i++) if (dst[i] != 0xa5) { printf("BENCH fill mismatch %s\n", label); break; }
}

int main(int argc, char **argv) {
    for (int i = 0; i < 16; i++) { marker_a[i] = (unsigned char)(0xa0 + i); marker_b[i] = (unsigned char)(0x50 + i); }
    if (mode_of(argc, argv) == 1) return worker();

    printf("BENCH start\n");
    bench_copy("1k", 1024, 1024);
    bench_copy("64k", 64 * 1024, 16);
    bench_copy("256k", BUF, 4);
    bench_fill("256k", BUF, 8);

    struct timespec ts;
    uint64_t t0 = now_ns();
    for (int i = 0; i < 2000; i++) clock_gettime(CLOCK_MONOTONIC, &ts);
    uint64_t dt = now_ns() - t0;
    /* Each user slice ends at its syscall, so this is one trap plus one kernel
     * main-loop iteration (desktop service included), not just the trap. */
    printf("BENCH roundtrip=%lu us\n", (unsigned long)(dt / 2000 / 1000));

    int pid = spawn("BENCH.ELF", 1);
    if (pid < 0) { printf("BENCH worker spawn failed\n"); return 1; }

    int fpu_ok = 1;
    for (int i = 0; i < 40; i++) {
        unsigned char got[16] __attribute__((aligned(16)));
        if (!sleep_sse5(5000, marker_a, got)) fpu_ok = 0;
    }
    printf(fpu_ok ? "BENCH fpu ok\n" : "BENCH fpu BAD\n");

    /* Give the worker time to finish its own marker checks. */
    usleep(700000);
    if (!fpu_ok) { printf("BENCH: failed\n"); return 1; }
    printf("BENCH: ok\n");
    return 0;
}
