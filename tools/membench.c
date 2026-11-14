/* Checkpoint 08: native A/B benchmark of the shipped memcpy/memset.
 *
 * The SSE2 implementation is sdk/libc/src/string.c compiled exactly as the
 * kernel/libc build does it (-O2 -fno-builtin), with the symbols renamed so it
 * can live next to the host libc. The baseline is the Checkpoint 07 word loop,
 * compiled with the same flags so GCC makes the same decisions it made then.
 *
 * This runs on the host CPU, which is the only place where microbenchmarks are
 * not swamped by TCG emulation noise. Build with `make cp08-membench`.
 */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

void *slopix_memcpy(void *dest, const void *src, size_t n);
void *slopix_memset(void *s, int c, size_t n);

/* Checkpoint 07 implementations, verbatim. */
static void *cp07_memcpy(void *dest, const void *src, size_t n) {
    unsigned char *d = (unsigned char *)dest;
    const unsigned char *s = (const unsigned char *)src;
    if (n >= 32 && (((uintptr_t)d | (uintptr_t)s) & 7) == 0) {
        uint64_t *dw = (uint64_t *)d;
        const uint64_t *sw = (const uint64_t *)s;
        size_t words = n / 8;
        for (size_t i = 0; i < words; i++) dw[i] = sw[i];
        for (size_t i = words * 8; i < n; i++) d[i] = s[i];
        return dest;
    }
    for (size_t i = 0; i < n; i++) d[i] = s[i];
    return dest;
}

static void *cp07_memset(void *s, int c, size_t n) {
    unsigned char *p = (unsigned char *)s;
    unsigned char v = (unsigned char)c;
    if (n >= 32 && (((uintptr_t)p) & 7) == 0) {
        uint64_t word = 0;
        for (unsigned i = 0; i < 8; i++) word = (word << 8) | v;
        uint64_t *pw = (uint64_t *)p;
        size_t words = n / 8;
        for (size_t i = 0; i < words; i++) pw[i] = word;
        for (size_t i = words * 8; i < n; i++) p[i] = v;
        return s;
    }
    for (size_t i = 0; i < n; i++) p[i] = v;
    return s;
}

typedef void *(*copy_fn)(void *, const void *, size_t);
typedef void *(*fill_fn)(void *, int, size_t);

static double now_s(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (double)t.tv_sec + (double)t.tv_nsec / 1e9;
}

static double best_copy(copy_fn fn, unsigned char *dst, const unsigned char *src,
                        size_t n, unsigned long iters) {
    double best = 1e9;
    for (int r = 0; r < 5; r++) {
        double t = now_s();
        for (unsigned long i = 0; i < iters; i++) fn(dst, src, n);
        t = now_s() - t;
        if (t < best) best = t;
    }
    return best;
}

static double best_fill(fill_fn fn, unsigned char *dst, size_t n, unsigned long iters) {
    double best = 1e9;
    for (int r = 0; r < 5; r++) {
        double t = now_s();
        for (unsigned long i = 0; i < iters; i++) fn(dst, 0xa5, n);
        t = now_s() - t;
        if (t < best) best = t;
    }
    return best;
}

struct bench { size_t size; unsigned long iters; };

int main(void) {
    static const struct bench cases[] = {
        { 64, 1000000 }, { 1024, 200000 }, { 4096, 50000 },
        { 65536, 4000 }, { 262144, 1000 }, { 1048576, 256 },
    };
    const size_t cap = 1u << 20;
    unsigned char *src = aligned_alloc(64, cap);
    unsigned char *dst = aligned_alloc(64, cap);
    unsigned char *ref = aligned_alloc(64, cap);
    if (!src || !dst || !ref) { fputs("out of memory\n", stderr); return 1; }
    for (size_t i = 0; i < cap; i++) src[i] = (unsigned char)(i * 13 + 5);

    int bad = 0;
    for (size_t c = 0; c < sizeof(cases) / sizeof(cases[0]); c++) {
        size_t n = cases[c].size;
        unsigned long it = cases[c].iters;
        double bytes = (double)n * (double)it;

        /* Correctness first: both implementations must produce identical bytes. */
        memset(dst, 0x11, cap);
        slopix_memcpy(dst, src, n);
        memset(ref, 0x22, cap);
        cp07_memcpy(ref, src, n);
        if (memcmp(dst, ref, n) != 0) { printf("FAIL: memcpy %zu\n", n); bad = 1; }
        slopix_memset(dst, 0xa5, n);
        memset(ref, 0xa5, n);
        if (memcmp(dst, ref, n) != 0) { printf("FAIL: memset %zu\n", n); bad = 1; }
        memset(dst, 0, cap);

        double c_old = best_copy(cp07_memcpy, dst, src, n, it);
        double c_new = best_copy(slopix_memcpy, dst, src, n, it);
        double f_old = best_fill(cp07_memset, dst, n, it);
        double f_new = best_fill(slopix_memset, dst, n, it);

        printf("%8zu B  copy %7.1f -> %7.1f GB/s  %5.2fx   fill %7.1f -> %7.1f GB/s  %5.2fx\n",
               n,
               bytes / c_old / 1e9, bytes / c_new / 1e9, c_old / c_new,
               bytes / f_old / 1e9, bytes / f_new / 1e9, f_old / f_new);
    }
    printf(bad ? "FAIL: SSE2 results differ from the reference\n"
               : "PASS: SSE2 copy/fill bytes are identical; speedups shown above\n");
    free(src); free(dst); free(ref);
    return bad;
}
