#include "syscall.h"
#include "stdlib.h"
#include "string.h"
#include "limits.h"
#include "errno.h"
#include "stdio.h"

/* First-fit free-list allocator over pages obtained with SX_MAP.
 *
 * Invariants:
 *  - every block, free or in use, starts with a 16-byte free_block_t header
 *    whose size field is the usable byte count (a multiple of 16);
 *  - the free list is address ordered and its blocks never overlap;
 *  - the heap grows on demand. The kernel grants at most 8 pages per SX_MAP
 *    call, so growth maps in 8-page chunks; each chunk is published as a free
 *    block and merges with its neighbour when the addresses are contiguous.
 *  - total heap is bounded by HEAP_MAX_BYTES so a runaway loop fails with
 *    ENOMEM instead of exhausting the machine. */
#define ALIGN_UP(x, a) (((x) + (a) - 1) & ~((size_t)(a) - 1))
#define MIN_ALLOC 16
#define MAP_CHUNK_PAGES 8
#define HEAP_MAX_BYTES (64u * 1024u * 1024u)

typedef struct free_block {
    size_t size;
    struct free_block *next;
} free_block_t;
#define HDR sizeof(free_block_t)
_Static_assert(sizeof(free_block_t) == 16, "allocator header must keep 16-byte alignment");

static char *heap_base = NULL;   /* lowest mapped heap address */
static char *heap_limit = NULL;  /* one past the highest mapped heap byte */
static free_block_t *free_list = NULL;

/* Address-ordered insertion with coalescing on both sides. */
static void insert_free(free_block_t *block) {
    free_block_t *before = NULL;
    free_block_t *after = free_list;
    while (after && (char *)after < (char *)block) {
        before = after;
        after = after->next;
    }
    block->next = after;
    if (before) before->next = block;
    else free_list = block;
    if (after && (char *)block + HDR + block->size == (char *)after) {
        block->size += HDR + after->size;
        block->next = after->next;
    }
    if (before && (char *)before + HDR + before->size == (char *)block) {
        before->size += HDR + block->size;
        before->next = block->next;
    }
}

/* Map enough new pages for a request of `bytes` usable bytes. */
static int heap_grow(size_t bytes) {
    if (bytes > HEAP_MAX_BYTES) return 0;
    size_t want = ALIGN_UP(bytes + HDR, 4096), got = 0;
    while (got < want) {
        size_t mapped = heap_base ? (size_t)(heap_limit - heap_base) : 0;
        if (mapped >= HEAP_MAX_BYTES) break;
        size_t pages = (want - got) / 4096;
        if (pages > MAP_CHUNK_PAGES) pages = MAP_CHUNK_PAGES;
        long r = syscall1(SX_MAP, (long)pages);
        if (r <= 0) break;
        char *chunk = (char *)r;
        size_t len = pages * 4096u;
        if (!heap_base || chunk < heap_base) heap_base = chunk;
        if (!heap_limit || chunk + len > heap_limit) heap_limit = chunk + len;
        free_block_t *b = (free_block_t *)chunk;
        b->size = len - HDR;
        insert_free(b);
        got += len;
    }
    return got >= want;
}

static free_block_t **find_free(size_t size) {
    free_block_t **prev = &free_list;
    while (*prev) {
        if ((*prev)->size >= size) return prev;
        prev = &(*prev)->next;
    }
    return NULL;
}

/* Remove a block from the free list, splitting off the tail only when the
 * remainder can hold a header plus a minimum allocation. An exact or near
 * fit hands out the whole block (this used to underflow and corrupt the heap). */
static void *take_block(free_block_t **prev, size_t size) {
    free_block_t *block = *prev;
    if (block->size >= size + HDR + MIN_ALLOC) {
        free_block_t *rest = (free_block_t *)((char *)block + HDR + size);
        rest->size = block->size - size - HDR;
        rest->next = block->next;
        block->size = size;
        *prev = rest;
    } else {
        *prev = block->next;
    }
    block->next = NULL;
    return (char *)block + HDR;
}

void *malloc(size_t size) {
    if (!size) return NULL;
    if (size > HEAP_MAX_BYTES) { __set_errno(-ENOMEM); return NULL; }
    size = ALIGN_UP(size, 16);
    free_block_t **prev = find_free(size);
    if (!prev && heap_grow(size)) prev = find_free(size);
    if (!prev) { __set_errno(-ENOMEM); return NULL; }
    return take_block(prev, size);
}

void free(void *ptr) {
    if (!ptr || !heap_base) return;
    /* Ignore pointers that cannot belong to this heap instead of corrupting
     * the list: a bad free must never take the whole process down. */
    char *p = (char *)ptr;
    if (p < heap_base + HDR || p >= heap_limit || ((size_t)p & 15u)) return;
    free_block_t *block = (free_block_t *)(p - HDR);
    if (!block->size || block->size > (size_t)(heap_limit - p)) return;
    /* Reject double frees, including a pointer that now lies inside a
     * merged free block; otherwise the list can become cyclic. */
    for (free_block_t *it = free_list; it; it = it->next) {
        if ((char *)block >= (char *)it && (char *)block < (char *)it + HDR + it->size) return;
    }
    insert_free(block);
}

void *calloc(size_t nmemb, size_t size) {
    size_t total = nmemb * size;
    if (nmemb && total / nmemb != size) { __set_errno(-ENOMEM); return NULL; }
    void *ptr = malloc(total);
    if (ptr) memset(ptr, 0, total);
    return ptr;
}

void *realloc(void *ptr, size_t size) {
    if (!ptr) return malloc(size);
    if (!size) { free(ptr); return NULL; }
    free_block_t *block = (free_block_t *)((char *)ptr - HDR);
    size_t old_size = block->size;
    if (ALIGN_UP(size, 16) <= old_size) return ptr;
    void *new_ptr = malloc(size);
    if (!new_ptr) return NULL;
    memcpy(new_ptr, ptr, old_size);
    free(ptr);
    return new_ptr;
}

void exit(int status) __attribute__((noreturn));
void exit(int status) {
    /* Buffered output written without a trailing newline used to vanish. */
    fflush(NULL);
    syscall1(SX_EXIT, status);
    __builtin_unreachable();
}

void abort(void) __attribute__((noreturn));
void abort(void) {
    syscall1(SX_EXIT, 139);
    __builtin_unreachable();
}

int atoi(const char *nptr) {
    return (int)strtol(nptr, NULL, 10);
}

/* Shared digit parser. Saturates instead of wrapping (B-22): *overflow is
 * set once the value no longer fits in an unsigned long. */
static const char *parse_digits(const char *s, int base, unsigned long *out, int *any, int *overflow) {
    unsigned long val = 0;
    *any = 0; *overflow = 0;
    while (*s) {
        int digit;
        if (*s >= '0' && *s <= '9') digit = *s - '0';
        else if (*s >= 'a' && *s <= 'z') digit = *s - 'a' + 10;
        else if (*s >= 'A' && *s <= 'Z') digit = *s - 'A' + 10;
        else break;
        if (digit >= base) break;
        if (val > (ULONG_MAX - (unsigned long)digit) / (unsigned long)base) *overflow = 1;
        else val = val * (unsigned long)base + (unsigned long)digit;
        *any = 1;
        s++;
    }
    *out = val;
    return s;
}

static const char *parse_prefix(const char *s, int *base, int *neg) {
    while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r' || *s == '\v' || *s == '\f') s++;
    *neg = 0;
    if (*s == '-') { *neg = 1; s++; }
    else if (*s == '+') s++;
    if (*base == 0) {
        if (*s == '0') {
            if (s[1] == 'x' || s[1] == 'X') { *base = 16; s += 2; }
            else *base = 8;
        } else *base = 10;
    } else if (*base == 16 && *s == '0' && (s[1] == 'x' || s[1] == 'X')) {
        s += 2;
    }
    return s;
}

long strtol(const char *nptr, char **endptr, int base) {
    int neg, any, overflow;
    unsigned long val;
    const char *s = parse_prefix(nptr, &base, &neg);
    if (base < 2 || base > 36) { if (endptr) *endptr = (char *)nptr; __set_errno(-EINVAL); return 0; }
    s = parse_digits(s, base, &val, &any, &overflow);
    if (endptr) *endptr = (char *)(any ? s : nptr);
    unsigned long limit = neg ? (unsigned long)LONG_MAX + 1ul : (unsigned long)LONG_MAX;
    if (overflow || val > limit) { __set_errno(-ERANGE); return neg ? LONG_MIN : LONG_MAX; }
    if (neg) return val == limit ? LONG_MIN : -(long)val;
    return (long)val;
}

unsigned long strtoul(const char *nptr, char **endptr, int base) {
    int neg, any, overflow;
    unsigned long val;
    const char *s = parse_prefix(nptr, &base, &neg);
    if (base < 2 || base > 36) { if (endptr) *endptr = (char *)nptr; __set_errno(-EINVAL); return 0; }
    s = parse_digits(s, base, &val, &any, &overflow);
    if (endptr) *endptr = (char *)(any ? s : nptr);
    if (overflow) { __set_errno(-ERANGE); return ULONG_MAX; }
    return neg ? 0ul - val : val;   /* C semantics: strtoul("-1") == ULONG_MAX */
}

/* Simple RNG */
static unsigned rand_seed = 1;
int rand(void) {
    rand_seed = rand_seed * 1103515245 + 12345;
    return (rand_seed >> 16) & 0x7fff;
}
void srand(unsigned seed) { rand_seed = seed; }

void *bsearch(const void *key, const void *base, size_t nmemb, size_t size,
              int (*compar)(const void *, const void *)) {
    size_t lo = 0, hi = nmemb;
    while (lo < hi) {
        size_t mid = (lo + hi) / 2;
        const void *p = (const char *)base + mid * size;
        int cmp = compar(key, p);
        if (cmp < 0) hi = mid;
        else if (cmp > 0) lo = mid + 1;
        else return (void *)p;
    }
    return NULL;
}

static void swap(char *a, char *b, size_t size) {
    for (size_t i = 0; i < size; i++) {
        char t = a[i]; a[i] = b[i]; b[i] = t;
    }
}

/* Heap sort: O(n log n) worst case, no recursion, no allocation, and it
 * never keeps a pointer to an element that a swap can move (the old
 * quicksort compared against a pivot pointer and returned unsorted data). */
static void sift_down(char *base, size_t root, size_t end, size_t size,
                      int (*compar)(const void *, const void *)) {
    for (;;) {
        size_t child = 2 * root + 1;
        if (child >= end) return;
        if (child + 1 < end && compar(base + child * size, base + (child + 1) * size) < 0) child++;
        if (compar(base + root * size, base + child * size) >= 0) return;
        swap(base + root * size, base + child * size, size);
        root = child;
    }
}

void qsort(void *array, size_t nmemb, size_t size,
           int (*compar)(const void *, const void *)) {
    char *base = (char *)array;
    if (!base || nmemb < 2 || !size || !compar) return;
    if (nmemb <= 16) {
        for (size_t i = 1; i < nmemb; i++)
            for (size_t j = i; j > 0 && compar(base + (j - 1) * size, base + j * size) > 0; j--)
                swap(base + (j - 1) * size, base + j * size, size);
        return;
    }
    for (size_t i = nmemb / 2; i-- > 0;) sift_down(base, i, nmemb, size, compar);
    for (size_t end = nmemb - 1; end > 0; end--) {
        swap(base, base + end * size, size);
        sift_down(base, 0, end, size, compar);
    }
}

char *getenv(const char *name) { (void)name; return NULL; }
