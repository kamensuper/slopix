/* Deliberately small private freestanding compatibility layer for DoomGeneric.
 * No host libc, POSIX services or disk writes. Only the supported FAT32 WAD
 * is readable. Heap is a bounded, coalescing arena reserved in kernel BSS. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdint.h>
#include <limits.h>
extern void logstr(const char *);
extern void doom_fail(const char *) __attribute__((noreturn));
#define ARENA_BYTES (48u*1024u*1024u)
typedef struct block {size_t bytes;struct block *next;uint64_t used,guard;} block;
#ifdef SLOPIX_USER
#include "slopix.h"
static unsigned char *arena;
static int init_arena(void){
 if(arena)return 1;
 unsigned char *start=0;
 for(unsigned i=0;i<ARENA_BYTES/4096u;i+=8){
  unsigned char *p=(unsigned char*)sx_map(8);
  if((intptr_t)p<0)return 0;
  if(i && p!=start+(size_t)i*4096u)return 0;
  if(!start)start=p;
 }
 arena=start;return 1;
}
#else
static _Alignas(16) unsigned char arena[ARENA_BYTES];
#endif
static block *first;
size_t doom_heap_used(void){size_t n=0;for(block*b=first;b;b=b->next)if(b->used)n+=b->bytes;return n;}
void *malloc(size_t n){
 if(!n)n=1;if(n>ARENA_BYTES-16)return NULL;n=(n+15)&~(size_t)15;
 if(!first){
#ifdef SLOPIX_USER
  if(!init_arena())return NULL;
#endif
  first=(block*)arena;*first=(block){ARENA_BYTES-sizeof(block),NULL,0,0x51ab51ab};}
 for(block*b=first;b;b=b->next){
  if(b->guard!=0x51ab51ab)doom_fail("DOOM heap metadata damaged");
  if(b->used||b->bytes<n)continue;
  if(b->bytes>=n+sizeof(block)+16){block*c=(block*)((char*)(b+1)+n);*c=(block){b->bytes-n-sizeof(block),b->next,0,0x51ab51ab};b->next=c;b->bytes=n;}
  b->used=1;return b+1;
 }return NULL;
}
void free(void*p){if(!p)return;block*b;
 for(b=first;b;b=b->next)if((void*)(b+1)==p)break;
 if(!b||!b->used||b->guard!=0x51ab51ab)doom_fail("Invalid DOOM heap free");b->used=0;
 for(b=first;b&&b->next;){if(!b->used&&!b->next->used){b->bytes+=sizeof(block)+b->next->bytes;b->next=b->next->next;}else b=b->next;}
}
void *calloc(size_t n,size_t s){if(s&&n>SIZE_MAX/s)return NULL;void*p=malloc(n*s);if(p)memset(p,0,n*s);return p;}
void *realloc(void*p,size_t n){if(!p)return malloc(n);if(!n){free(p);return NULL;}block*b;for(b=first;b;b=b->next)if((void*)(b+1)==p&&b->used)break;if(!b)doom_fail("Invalid DOOM realloc");if(n<=b->bytes)return p;void*q=malloc(n);if(q){memcpy(q,p,b->bytes);free(p);}return q;}
size_t strlen(const char*s){size_t n=0;while(s[n])n++;return n;}
int strcmp(const char*a,const char*b){while(*a&&*a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
int strncmp(const char*a,const char*b,size_t n){for(size_t i=0;i<n;i++){int d=(unsigned char)a[i]-(unsigned char)b[i];if(d||!a[i])return d;}return 0;}
int strcasecmp(const char*a,const char*b){while(*a&&tolower(*a)==tolower(*b)){a++;b++;}return tolower((unsigned char)*a)-tolower((unsigned char)*b);}
int strncasecmp(const char*a,const char*b,size_t n){for(size_t i=0;i<n;i++){int d=tolower((unsigned char)a[i])-tolower((unsigned char)b[i]);if(d||!a[i])return d;}return 0;}
char *strcpy(char*d,const char*s){char*r=d;while((*d++=*s++));return r;}
char *strncpy(char*d,const char*s,size_t n){size_t i=0;for(;i<n&&s[i];i++)d[i]=s[i];for(;i<n;i++)d[i]=0;return d;}
char *strcat(char*d,const char*s){strcpy(d+strlen(d),s);return d;}
char *strchr(const char*s,int c){do{if(*s==(char)c)return (char*)s;}while(*s++);return NULL;}
char *strrchr(const char*s,int c){const char*r=NULL;do{if(*s==(char)c)r=s;}while(*s++);return (char*)r;}
char *strstr(const char*s,const char*t){size_t n=strlen(t);for(;*s;s++)if(!strncmp(s,t,n))return (char*)s;return n?NULL:(char*)s;}
char *strdup(const char*s){size_t n=strlen(s)+1;char*d=malloc(n);if(d)memcpy(d,s,n);return d;}
int abs(int n){return n<0?-n:n;}
long strtol(const char*s,char**end,int base){
 const char*original=s;while(isspace((unsigned char)*s))s++;
 int neg=0;if(*s=='-'||*s=='+')neg=*s++=='-';
 if(base&& (base<2||base>36)){if(end)*end=(char*)original;return 0;}
 if(!base)base=s[0]=='0'?(tolower(s[1])=='x'?16:8):10;
 if(base==16&&s[0]=='0'&&tolower(s[1])=='x')s+=2;
 const char*digits=s;unsigned long v=0,limit=(unsigned long)LONG_MAX+(unsigned)neg;
 while(*s){int d=isdigit((unsigned char)*s)?*s-'0':isalpha((unsigned char)*s)?tolower((unsigned char)*s)-'a'+10:-1;if(d<0||d>=base)break;if(v>(limit-(unsigned)d)/(unsigned)base)v=limit;else v=v*base+(unsigned)d;s++;}
 if(end)*end=(char*)(s==digits?original:s);
 if(s==digits)return 0;
 return neg?(v==(unsigned long)LONG_MAX+1?LONG_MIN:-(long)v):(long)v;
}
int atoi(const char*s){return (int)strtol(s,NULL,10);}
double atof(const char*s){return (double)atoi(s);} /* config reads are disabled */
char *getenv(const char*s){(void)s;return NULL;}
void exit(int n){(void)n;doom_fail("DOOM requested exit");}
void abort(void){doom_fail("DOOM aborted");}
int system(const char*s){(void)s;return -1;}
void slop_assert(const char*s,const char*f,int n){(void)f;(void)n;doom_fail(s);}

/* Formatting returns the full required length, even when output is truncated. */
static void emit(char*b,size_t cap,size_t*at,char c){if(*at+1<cap)b[*at]=c;(*at)++;}
int vsnprintf(char*b,size_t cap,const char*f,va_list ap){size_t at=0;
 while(*f){if(*f!='%'){emit(b,cap,&at,*f++);continue;}f++;int left=0,zero=0,width=0,precision=-1,longs=0;if(*f=='-'){left=1;f++;}if(*f=='0'){zero=1;f++;}while(isdigit(*f))width=width*10+*f++-'0';if(*f=='.'){f++;precision=0;while(isdigit(*f))precision=precision*10+*f++-'0';}while(*f=='l'||*f=='z'){longs++;f++;}char type=*f?*f++:0;char temp[70],*s=temp;size_t n=0;int neg=0;
 if(type=='s'){s=va_arg(ap,char*);if(!s)s="(null)";n=strlen(s);if(precision>=0&&n>(size_t)precision)n=precision;}
 else if(type=='c'){temp[n++]=(char)va_arg(ap,int);}
 else if(type=='%'){temp[n++]='%';}
 else if(type=='f'){(void)va_arg(ap,double);s="[float]";n=7;}
 else if(type=='d'||type=='i'||type=='u'||type=='x'||type=='X'||type=='o'||type=='p'){
  uint64_t v;if(type=='p')v=(uintptr_t)va_arg(ap,void*);else if(type=='d'||type=='i'){int64_t i=longs?va_arg(ap,long):va_arg(ap,int);neg=i<0;v=neg?0-(uint64_t)i:(uint64_t)i;}else v=longs?va_arg(ap,unsigned long):va_arg(ap,unsigned);
  unsigned base=(type=='x'||type=='X'||type=='p')?16:type=='o'?8:10;char rev[65];size_t k=0;do{rev[k++]="0123456789abcdef"[v%base];v/=base;}while(v);if(neg)temp[n++]='-';if(precision>60)precision=60;while(precision>(int)k){temp[n++]='0';precision--;}while(k)temp[n++]=rev[--k];
 }else {temp[n++]=type?type:'?';}
 if(width>256)width=256;if(!left)while(width>(int)n){emit(b,cap,&at,zero?'0':' ');width--;}for(size_t j=0;j<n;j++)emit(b,cap,&at,s[j]);if(left)while(width-->(int)n)emit(b,cap,&at,' ');
 }if(cap)b[at<cap?at:cap-1]=0;return (int)at;
}
int snprintf(char*b,size_t n,const char*f,...){va_list a;va_start(a,f);int r=vsnprintf(b,n,f,a);va_end(a);return r;}
int sprintf(char*b,const char*f,...){va_list a;va_start(a,f);int r=vsnprintf(b,4096,f,a);va_end(a);return r;}
int vfprintf(FILE*file,const char*f,va_list a){(void)file;char b[1024];int n=vsnprintf(b,sizeof(b),f,a);logstr(b);return n;}
int fprintf(FILE*file,const char*f,...){va_list a;va_start(a,f);int n=vfprintf(file,f,a);va_end(a);return n;}
int printf(const char*f,...){va_list a;va_start(a,f);int n=vfprintf(NULL,f,a);va_end(a);return n;}
int puts(const char*s){logstr(s);logstr("\n");return 0;}int putchar(int c){char s[2]={(char)c,0};logstr(s);return c;}
int fputs(const char*s,FILE*f){(void)f;logstr(s);return 0;}int fputc(int c,FILE*f){(void)f;return putchar(c);}int fflush(FILE*f){(void)f;return 0;}
int sscanf(const char*s,const char*f,...){va_list a;va_start(a,f);int count=0;while(*f){if(isspace(*f)){while(isspace(*s))s++;f++;continue;}if(*f!='%'){if(*s++!=*f++)break;continue;}f++;int base=*f=='x'?16:*f=='o'?8:*f=='i'?0:10;char*end;long v=strtol(s,&end,base);if(end==s)break;*va_arg(a,int*)=(int)v;count++;s=end;f++;}va_end(a);return count;}
int fscanf(FILE*f,const char*s,...){(void)f;(void)s;return EOF;}
int errno;
#ifdef SLOPIX_USER
/* Actual FAT32 WAD bytes streamed from the independent Ring-3 process.
 * Reopening revalidates the file; no user data pointer enters the kernel. */
struct slop_file {size_t pos,size;int fd,used;};
static FILE files[8];FILE *stdin,*stdout,*stderr;
FILE *fopen(const char*path,const char*mode){
 const char*base=strrchr(path,'/');base=base?base+1:path;
 if(mode[0]!='r'||strcasecmp(base,"FREEDOM.WAD")){errno=2;return NULL;}
 uint32_t length=0;if(sx_stat("FREEDOM.WAD",&length)!=0)return NULL;
 for(unsigned i=0;i<8;i++)if(!files[i].used){int64_t fd=sx_open("FREEDOM.WAD");if(fd<0)break;
  files[i]=(FILE){.pos=0,.size=length,.fd=(int)fd,.used=1};return files+i;}
 return NULL;
}
int fclose(FILE*f){if(!f||!f->used)return EOF;sx_close(f->fd);f->used=0;return 0;}
size_t fread(void*p,size_t s,size_t n,FILE*f){
 if(!f||!f->used||!s||n>SIZE_MAX/s)return 0;
 size_t bytes=n*s;if(f->pos>=f->size)return 0;if(bytes>f->size-f->pos)bytes=(f->size-f->pos)/s*s;
 if(sx_seek(f->fd,f->pos)<0)return 0;
 unsigned char*out=p;size_t done=0;
 while(done<bytes){unsigned want=(unsigned)(bytes-done>4096?4096:bytes-done);
  int64_t got=sx_read(f->fd,out+done,want);if(got<=0)break;done+=(unsigned)got;}
 f->pos+=done;return done/s;
}
size_t fwrite(const void*p,size_t s,size_t n,FILE*f){(void)p;(void)s;(void)n;(void)f;errno=30;return 0;}
int fseek(FILE*f,long off,int whence){
 if(!f||!f->used)return -1;
 int64_t base=whence==SEEK_SET?0:whence==SEEK_CUR?(int64_t)f->pos:whence==SEEK_END?(int64_t)f->size:-1;
 if(base<0||(int64_t)off< -base||(int64_t)off>(int64_t)f->size-base)return -1;
 f->pos=(size_t)(base+off);return 0;
}
long ftell(FILE*f){return f&&f->used?(long)f->pos:-1;}
int feof(FILE*f){return !f||f->pos>=f->size;}
int ferror(FILE*f){(void)f;return 0;}
#else
extern const unsigned char freedoom_wad_start[],freedoom_wad_end[];
struct slop_file{size_t pos;int used;};static FILE files[8];FILE *stdin,*stdout,*stderr;
FILE *fopen(const char*path,const char*mode){const char*base=strrchr(path,'/');base=base?base+1:path;if(mode[0]!='r'||strcmp(base,"freedoom1.wad")){errno=2;return NULL;}for(unsigned i=0;i<8;i++)if(!files[i].used){files[i]=(FILE){0,1};return files+i;}return NULL;}
int fclose(FILE*f){if(!f||!f->used)return EOF;f->used=0;return 0;}
size_t fread(void*p,size_t s,size_t n,FILE*f){if(!f||!f->used||!s||n>SIZE_MAX/s)return 0;size_t len=freedoom_wad_end-freedoom_wad_start,bytes=n*s;if(f->pos>len)return 0;if(bytes>len-f->pos)bytes=(len-f->pos)/s*s;memcpy(p,freedoom_wad_start+f->pos,bytes);f->pos+=bytes;return bytes/s;}
size_t fwrite(const void*p,size_t s,size_t n,FILE*f){(void)p;(void)s;(void)n;(void)f;errno=30;return 0;}
int fseek(FILE*f,long off,int whence){if(!f||!f->used)return -1;int64_t base=whence==SEEK_SET?0:whence==SEEK_CUR?(int64_t)f->pos:whence==SEEK_END?freedoom_wad_end-freedoom_wad_start:-1;if(base<0||off< -base||off>(freedoom_wad_end-freedoom_wad_start)-base)return -1;f->pos=(size_t)(base+off);return 0;}
long ftell(FILE*f){return f&&f->used?(long)f->pos:-1;}int feof(FILE*f){return !f||f->pos>=(size_t)(freedoom_wad_end-freedoom_wad_start);}int ferror(FILE*f){(void)f;return 0;}
#endif
int remove(const char*s){(void)s;return -1;}int rename(const char*a,const char*b){(void)a;(void)b;return -1;}int mkdir(const char*s,unsigned m){(void)s;(void)m;return -1;}
double fabs(double x){return x<0?-x:x;}
/* Freestanding copies: Doom must not import kernel or hosted libc memory. */
void *memcpy(void *dst,const void *src,size_t n){unsigned char*d=dst;const unsigned char*s=src;for(size_t i=0;i<n;i++)d[i]=s[i];return dst;}
void *memset(void *dst,int value,size_t n){unsigned char*d=dst;for(size_t i=0;i<n;i++)d[i]=(unsigned char)value;return dst;}
