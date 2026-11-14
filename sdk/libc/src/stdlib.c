#include "syscall.h"
#include "stdlib.h"
#include "string.h"
#include "limits.h"

/* Simple bump allocator with free list */
#define ALIGN_UP(x, a) (((x) + (a) - 1) & ~((a) - 1))
#define MIN_ALLOC 16
#define MAX_HEAP_PAGES 8

typedef struct free_block {
    size_t size;
    struct free_block *next;
} free_block_t;

static char *heap_base = NULL;
static char *heap_limit = NULL;
static free_block_t *free_list = NULL;
static int heap_initialized = 0;

static void heap_init(void) {
    if (heap_initialized) return;
    heap_base = (char *)syscall1(SX_MAP, MAX_HEAP_PAGES);
    if ((long)heap_base < 0) {
        heap_base = NULL;
        heap_limit = NULL;
        return;
    }
    heap_limit = heap_base + MAX_HEAP_PAGES * 4096;
    free_list = (free_block_t *)heap_base;
    free_list->size = MAX_HEAP_PAGES * 4096 - sizeof(free_block_t);
    free_list->next = NULL;
    heap_initialized = 1;
}

static free_block_t **find_free(size_t size) {
    free_block_t **prev = &free_list;
    while (*prev) {
        if ((*prev)->size >= size) return prev;
        prev = &(*prev)->next;
    }
    return NULL;
}

static void *split_block(free_block_t **prev, size_t size) {
    free_block_t *block = *prev;
    size_t remaining = block->size - size - sizeof(free_block_t);
    if (remaining >= MIN_ALLOC) {
        free_block_t *new_block = (free_block_t *)((char *)block + sizeof(free_block_t) + size);
        new_block->size = remaining;
        new_block->next = block->next;
        block->size = size;
        block->next = new_block;
    }
    *prev = block->next;
    return (char *)block + sizeof(free_block_t);
}

void *malloc(size_t size) {
    if (!size) return NULL;
    heap_init();
    if (!heap_base) return NULL;
    size = ALIGN_UP(size, 16);
    free_block_t **prev = find_free(size);
    if (!prev) return NULL;
    return split_block(prev, size);
}

void free(void *ptr) {
    if (!ptr) return;
    heap_init();
    if (!heap_base || !heap_limit) return;

    /* Ignore pointers that do not belong to this heap instead of corrupting
     * the list: a bad free must never take the whole process down. */
    char *p = (char *)ptr;
    if (p < heap_base + sizeof(free_block_t) || p > heap_limit - MIN_ALLOC) return;
    free_block_t *block = (free_block_t *)(p - sizeof(free_block_t));

    /* Reject double frees outright. Without this test the list can become
     * cyclic, which turns every later malloc() into an infinite loop. */
    for (free_block_t *it = free_list; it; it = it->next) {
        if (it == block) return;
    }

    /* Address-ordered insertion keeps neighbours adjacent in the list. */
    free_block_t *before = NULL;
    free_block_t *after = free_list;
    while (after && (char *)after < (char *)block) {
        before = after;
        after = after->next;
    }
    block->next = after;
    if (before) before->next = block;
    else free_list = block;

    /* Merge with the block that follows in memory. */
    if (after && (char *)block + sizeof(free_block_t) + block->size == (char *)after) {
        block->size += sizeof(free_block_t) + after->size;
        block->next = after->next;
    }
    /* Merge with the block that precedes in memory. */
    if (before && (char *)before + sizeof(free_block_t) + before->size == (char *)block) {
        before->size += sizeof(free_block_t) + block->size;
        before->next = block->next;
    }
}

void *calloc(size_t nmemb, size_t size) {
    size_t total = nmemb * size;
    if (nmemb && total / nmemb != size) return NULL;
    void *ptr = malloc(total);
    if (ptr) memset(ptr, 0, total);
    return ptr;
}

void *realloc(void *ptr, size_t size) {
    if (!ptr) return malloc(size);
    if (!size) { free(ptr); return NULL; }
    /* Could implement in-place grow/shrink, but for now just alloc+copy+free */
    free_block_t *block = (free_block_t *)((char *)ptr - sizeof(free_block_t));
    size_t old_size = block->size;
    if (old_size >= size) return ptr;
    void *new_ptr = malloc(size);
    if (!new_ptr) return NULL;
    memcpy(new_ptr, ptr, old_size);
    free(ptr);
    return new_ptr;
}

void exit(int status) __attribute__((noreturn));
void exit(int status) {
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

long strtol(const char *nptr, char **endptr, int base) {
    const char *s = nptr;
    while (*s == ' ' || *s == '\t' || *s == '\n') s++;
    int neg = 0;
    if (*s == '-') { neg = 1; s++; }
    else if (*s == '+') s++;
    if (base == 0) {
        if (*s == '0') {
            if (s[1] == 'x' || s[1] == 'X') { base = 16; s += 2; }
            else { base = 8; }
        } else base = 10;
    } else if (base == 16 && *s == '0' && (s[1] == 'x' || s[1] == 'X')) {
        s += 2;
    }
    unsigned long val = 0;
    int any = 0;
    while (*s) {
        int digit;
        if (*s >= '0' && *s <= '9') digit = *s - '0';
        else if (*s >= 'a' && *s <= 'z') digit = *s - 'a' + 10;
        else if (*s >= 'A' && *s <= 'Z') digit = *s - 'A' + 10;
        else break;
        if (digit >= base) break;
        val = val * base + digit;
        any = 1;
        s++;
    }
    if (endptr) *endptr = (char *)(any ? s : nptr);
    if (neg) val = -val;
    return (long)val;
}

unsigned long strtoul(const char *nptr, char **endptr, int base) {
    const char *s = nptr;
    while (*s == ' ' || *s == '\t' || *s == '\n') s++;
    if (base == 0) {
        if (*s == '0') {
            if (s[1] == 'x' || s[1] == 'X') { base = 16; s += 2; }
            else { base = 8; }
        } else base = 10;
    } else if (base == 16 && *s == '0' && (s[1] == 'x' || s[1] == 'X')) {
        s += 2;
    }
    unsigned long val = 0;
    int any = 0;
    while (*s) {
        int digit;
        if (*s >= '0' && *s <= '9') digit = *s - '0';
        else if (*s >= 'a' && *s <= 'z') digit = *s - 'a' + 10;
        else if (*s >= 'A' && *s <= 'Z') digit = *s - 'A' + 10;
        else break;
        if (digit >= base) break;
        val = val * base + digit;
        any = 1;
        s++;
    }
    if (endptr) *endptr = (char *)(any ? s : nptr);
    return val;
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

static void qsort_rec(char *base, size_t nmemb, size_t size,
                      int (*compar)(const void *, const void *)) {
    if (nmemb <= 1) return;
    char *pivot = base + (nmemb / 2) * size;
    size_t i = 0, j = nmemb - 1;
    while (i <= j) {
        while (compar(base + i * size, pivot) < 0) i++;
        while (compar(base + j * size, pivot) > 0) j--;
        if (i <= j) { swap(base + i * size, base + j * size, size); i++; if (j) j--; }
    }
    if (j > 0) qsort_rec(base, j + 1, size, compar);
    if (i < nmemb) qsort_rec(base + i * size, nmemb - i, size, compar);
}

void qsort(void *base, size_t nmemb, size_t size,
           int (*compar)(const void *, const void *)) {
    qsort_rec(base, nmemb, size, compar);
}

char *getenv(const char *name) { (void)name; return NULL; }
int system(const char *command) { (void)command; return -1; }