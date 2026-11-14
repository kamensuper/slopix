/* Slopix first-boot account record. An early login gate, not disk encryption. */
#ifndef SLOPIX_ACCOUNT_H
#define SLOPIX_ACCOUNT_H
#include <stdint.h>
/* 1 loaded, 0 no account, -1 corrupt account file. */
int account_load(void);
/* 1 persisted, 2 session-only, 0 failure. */
int account_create(const char *name,const char *password,uint64_t entropy);
int account_check(const char *password);
const char *account_name(void);
int account_persistent(void);
int account_name_valid(const char *name);
void account_scrub(void *p,unsigned n);
#endif
