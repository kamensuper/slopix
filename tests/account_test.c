/* Host regression for FAT32-backed setup records and password checks. */
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include "../src/account.h"
#include "../src/storage/storage.h"
static uint8_t record[256];static uint32_t record_size;static int mounted=1,writable=1,failwrite;
struct fs_info fat_info(void){return (struct fs_info){.mounted=mounted,.writable=writable};}
int fat_stat(const char *name,uint32_t *bytes,int *directory){assert(strcmp(name,"ACCOUNT.DAT")==0);if(!record_size)return 0;*bytes=record_size;*directory=0;return 1;}
int fat_read(const char *name,void *out,uint32_t cap,uint32_t *bytes){assert(strcmp(name,"ACCOUNT.DAT")==0);if(!record_size||cap<record_size)return 0;memcpy(out,record,record_size);*bytes=record_size;return 1;}
int fat_write(const char *name,const void *data,uint32_t bytes){assert(strcmp(name,"ACCOUNT.DAT")==0);if(failwrite||bytes>sizeof(record))return 0;memcpy(record,data,bytes);record_size=bytes;return 1;}
const char *fat_error(void){return "fake error";}
int main(void){
 assert(account_load()==0);assert(!account_name_valid(""));assert(!account_name_valid("a/b"));
 assert(account_name_valid("piggybank"));assert(!account_name_valid(" leading"));
 assert(account_create("piggybank","123",999)==0);assert(!record_size);
 assert(account_create("piggybank","hunter2!",0x12345678u)==1);
 assert(record_size==100);assert(account_persistent());assert(strcmp(account_name(),"piggybank")==0);
 /* Independent reference from Python hashlib.pbkdf2_hmac(sha256,12000). */
 static const uint8_t salt_expected[16]={0xaa,0x16,0x1a,0x4d,0x23,0x24,0xe1,0xb1,0xb2,0xbd,0xe5,0x82,0x7a,0x6a,0x33,0x5e};
 static const uint8_t key_expected[32]={0xf6,0xb2,0xdf,0x65,0x6e,0xfe,0x81,0x16,0xdd,0xb4,0xca,0x3b,0xe6,0x78,0x3b,0x60,0x34,0x1d,0x32,0xe9,0x31,0x3c,0xc2,0x06,0x6c,0xde,0xef,0xdd,0x22,0x58,0x7a,0xe2};
 assert(memcmp(record+48,salt_expected,16)==0);
 assert(memcmp(record+64,key_expected,32)==0);
 assert(account_check("hunter2!"));assert(!account_check("hunter2"));assert(!account_check("HUNTER2!"));
 for(unsigned i=0;i+8<=record_size;i++)assert(memcmp(record+i,"hunter2!",8)!=0);
 uint8_t copy[256];memcpy(copy,record,record_size);
 assert(account_load()==1);assert(account_check("hunter2!"));
 record[20]^=1;assert(account_load()==-1);assert(!account_check("hunter2!"));
 memcpy(record,copy,record_size);assert(account_load()==1);
 record_size=0;assert(account_load()==0);
 failwrite=1;assert(account_create("piggybank","hunter2!",1234)==0);assert(account_load()==0);failwrite=0;
 mounted=0;writable=0;assert(account_create("guest","pass123",4321)==2);assert(account_check("pass123"));assert(!account_persistent());
 assert(account_load()==0);assert(!account_check("pass123"));
 puts("account-test: PASS (save/load, credential checking, corruption, failures, session mode)");
 return 0;
}
