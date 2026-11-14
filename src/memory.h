#ifndef SLOPIX_MEMORY_H
#define SLOPIX_MEMORY_H
#include <stdint.h>
/* Main-loop/boot-only ABI. Never call from an IRQ. 0 address means failure.
 * Reset/add/reserve/seal are boot-only; reservations cannot change after seal.
 * FFI owns no C pointers. All addresses are physical, identity-mapped below 4 GiB. */
int32_t mr_pmm_reset(uint64_t bytes);
int32_t mr_pmm_add_usable(uint64_t base,uint64_t bytes);
int32_t mr_pmm_reserve(uint64_t base,uint64_t bytes);
int32_t mr_pmm_seal(void);
uint64_t mr_pmm_alloc(void);
int32_t mr_pmm_free(uint64_t address);
uint64_t mr_pmm_stat(uint32_t which); /* 0 free, 1 used, 2 eligible, 3 mapped-limit pages */
void memory_init(uint32_t info,uint64_t fb_addr,uint64_t fb_bytes);
int memory_selftest(void);
#endif
