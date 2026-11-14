#include "slopix.h"
static unsigned char buffer[4096];
static unsigned append(char*out,unsigned at,const char*s){while(*s)out[at++]=*s++;return at;}
static unsigned number(char*out,unsigned at,uint64_t v){char n[24];unsigned k=0;do{n[k++]=(char)('0'+v%10);v/=10;}while(v);while(k)out[at++]=n[--k];return at;}
/* A real bounded-memory streaming file utility, not a kernel-side stand-in.
 * exec READ.ELF /DIR/FILE.BIN supplies the stack-owned second entry argument. */
__attribute__((noreturn)) void _start(uint64_t mode,const char*argument){
 (void)mode;const char*path=argument&&*argument?argument:"WELCOME.TXT";
 int64_t fd=sx_open(path);if(fd<0){sx_write("READ: open failed",17);sx_exit(1);}
 uint64_t size=0;uint32_t hash=2166136261u;
 for(;;){int64_t n=sx_read((int)fd,buffer,sizeof(buffer));if(n<0){sx_close((int)fd);sx_write("READ: I/O failed",16);sx_exit(2);}if(!n)break;
  for(int64_t i=0;i<n;i++)hash=(hash^buffer[i])*16777619u;
  size+=(uint64_t)n;if(!(size&65535u))sx_sleep(1000);
 }
 if(sx_seek((int)fd,size)!= (int64_t)size||sx_read((int)fd,buffer,1)!=0)sx_exit(3);
 sx_close((int)fd);char out[100];unsigned at=append(out,0,"READ bytes=");at=number(out,at,size);at=append(out,at," fnv32=");at=number(out,at,hash);sx_write(out,at);sx_exit(0);
}
