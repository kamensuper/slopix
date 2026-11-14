#ifndef SLOPIX_STDLIB_H
#define SLOPIX_STDLIB_H
#include <stddef.h>
#include <stdint.h>

/* Memory allocation */
void *malloc(size_t size);
void free(void *ptr);
void *calloc(size_t nmemb, size_t size);
void *realloc(void *ptr, size_t size);

/* Process control */
void exit(int status) __attribute__((noreturn));
void abort(void) __attribute__((noreturn));

/* String conversion */
int atoi(const char *nptr);
long strtol(const char *nptr, char **endptr, int base);
unsigned long strtoul(const char *nptr, char **endptr, int base);

/* Search/sort */
void *bsearch(const void *key, const void *base, size_t nmemb, size_t size,
              int (*compar)(const void *, const void *));
void qsort(void *base, size_t nmemb, size_t size,
           int (*compar)(const void *, const void *));

/* Random */
int rand(void);
void srand(unsigned seed);

/* Environment */
char *getenv(const char *name);
int system(const char *command) __attribute__((deprecated("not implemented")));

#endif