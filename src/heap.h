#ifndef SLOPIX_HEAP_H
#define SLOPIX_HEAP_H
#include <stddef.h>
#include <stdint.h>
/* Main-thread only, never IRQ. Non-reentrant mutation is rejected. 16-byte
 * alignment; zero size and overflow return NULL. Free(NULL) succeeds.
 * Large requests need contiguous physical pages and may fail under fragmentation.
 * Up to 2048 live spans, 16 MiB per allocation; no PMM reservations are changed. */
struct heap_stats { size_t live_bytes,peak_bytes,allocations,span_pages,failures,invalid_frees; };
void heap_init(void); /* once, after memory_init; repeated calls are harmless */
void *heap_alloc(size_t bytes);
void *heap_calloc(size_t count,size_t bytes);
void *heap_realloc(void *ptr,size_t bytes);
int heap_free(void *ptr); /* 1 success, 0 invalid/double free or busy */
struct heap_stats heap_get_stats(void);
int heap_selftest(void); /* bounded, nondestructive main-thread exercise */
#endif
