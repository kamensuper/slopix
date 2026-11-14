#ifndef SLOP_STDLIB
#define SLOP_STDLIB
#include <stddef.h>
void *malloc(size_t);void free(void *);void *calloc(size_t,size_t);void *realloc(void *,size_t);
int abs(int);int atoi(const char *);long strtol(const char *,char **,int);double atof(const char *);char *getenv(const char *);
void exit(int) __attribute__((noreturn));void abort(void) __attribute__((noreturn));int system(const char *);
#endif
