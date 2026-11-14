/* Headless onboarding / lock-screen state machine smoke test. */
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <stdio.h>
#include "../src/auth.h"
#include "../src/kernel.h"
#include "../src/account.h"
#include "../src/storage/storage.h"
uint32_t width=1280,height=800,pitch;
static int load_state,create_calls,check_calls,render_count;
static char fake_name[32],fake_password[64];
int account_load(void){return load_state;}
int account_name_valid(const char*n){return *n&&strlen(n)<=24;}
int account_create(const char*n,const char*p,uint64_t e){(void)e;create_calls++;strcpy(fake_name,n);strcpy(fake_password,p);return 1;}
int account_check(const char*p){check_calls++;return strcmp(fake_password,p)==0;}
const char*account_name(void){return fake_name;}
int account_persistent(void){return 1;}
void account_scrub(void*p,unsigned n){memset(p,0,n);}
struct fs_info fat_info(void){return (struct fs_info){.mounted=1,.writable=1};}
void copystr(char*d,const char*s,size_t cap){size_t n=strlen(s);if(n>=cap)n=cap-1;memcpy(d,s,n);d[n]=0;}
size_t length(const char*s){return strlen(s);}
uint64_t timer_us(void){static uint64_t x=10;return ++x;}
void logstr(const char*s){(void)s;}
int arch_date(char*out,unsigned cap){if(cap<40)return 0;strcpy(out,"RTC 2026-10-19 15:10:00 (hardware clock)");return 1;}
uint32_t blend(uint32_t a,uint32_t b,unsigned t){(void)a;(void)t;return b;}
void graphics_reset_clip(void){}
void rect(int x,int y,int w,int h,uint32_t c){(void)x;(void)y;(void)w;(void)h;(void)c;}
void roundbox(int x,int y,int w,int h,int r,uint32_t c,unsigned alpha){(void)x;(void)y;(void)w;(void)h;(void)r;(void)c;(void)alpha;}
void text(int x,int y,const char*s,uint32_t c){(void)x;(void)y;(void)c;assert(!strstr(s,"hunter2"));}
void disc(int x,int y,int r,uint32_t c){(void)x;(void)y;(void)r;(void)c;}
void rgba_blit(const uint8_t*src,int w,int h,int x,int y){(void)src;(void)w;(void)h;(void)x;(void)y;}
void cursor_present(int x,int y){(void)x;(void)y;}
void damage(int x,int y,int w,int h){(void)x;(void)y;(void)w;(void)h;}
void present(void){render_count++;}
static void type(const char *s){while(*s)auth_key((unsigned char)*s++);}
int main(void){
 load_state=0;auth_init();assert(auth_active());auth_render();assert(render_count==1);
 auth_key(KEY_ENTER);type("piggybank");auth_key(KEY_ENTER);
 type("hunter2!");auth_key(KEY_ENTER);type("hunter2!");auth_key(KEY_ENTER);
 assert(create_calls==1);assert(strcmp(fake_name,"piggybank")==0);
 type("incorrect");auth_key(KEY_ENTER);assert(auth_active());assert(check_calls==1);
 type("hunter2!");auth_key(KEY_ENTER);assert(!auth_active());assert(check_calls==2);
 load_state=1;auth_init();assert(auth_active());type("hunter2!");auth_key(KEY_ENTER);assert(!auth_active());
 load_state=-1;auth_init();assert(auth_active());type("hunter2!");auth_key(KEY_ENTER);assert(auth_active());
 puts("auth-flow-test: PASS (setup, incorrect login, correct login, saved login, corrupt guard)");
 return 0;
}
