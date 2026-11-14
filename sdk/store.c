/* Independent Ring-3 filesystem writer exercising kernel-validated
 * create, write, seek, read, and close ABI against real persistent FAT32. */
#include "slopix.h"
static unsigned char chunk[4096];
static const char phrase[]="Hello from real Ring-3 filesystem I/O on Slopix Genesis!\n";
__attribute__((noreturn)) void _start(void){
 unsigned short cs;__asm__ volatile("mov %%cs,%0":"=r"(cs));
 if((cs&3)!=3)sx_exit(90);
 int64_t fd=sx_create("GENESIS.TXT",1);
 if(fd<=0){sx_write("STORE: create failed",20);sx_exit(1);}
 for(unsigned i=0;i<sizeof(chunk);i++)chunk[i]=phrase[i%(sizeof(phrase)-1)];
 for(unsigned i=0;i<80;i++){
  if(sx_fwrite((int)fd,chunk,sizeof(chunk))!=(int64_t)sizeof(chunk))sx_exit(2);
 }
 if(sx_seek((int)fd,0)!=0)sx_exit(3);
 for(unsigned i=0;i<80;i++){
  if(sx_read((int)fd,chunk,sizeof(chunk))!=(int64_t)sizeof(chunk))sx_exit(4);
  for(unsigned j=0;j<sizeof(chunk);j++)if(chunk[j]!=(unsigned char)phrase[j%(sizeof(phrase)-1)])sx_exit(5);
 }
 if(sx_read((int)fd,chunk,1)!=0||sx_close((int)fd)!=0)sx_exit(6);
 sx_write("STORE: wrote and verified 327680 bytes",36);
 sx_exit(0);
}
