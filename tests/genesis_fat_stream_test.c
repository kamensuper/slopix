/* The actual Slopix FAT32 driver, tested against small and >4GiB sparse host
 * block devices. No writes to any user data disk or Genesis boot disk. */
#define _POSIX_C_SOURCE 200809L
#include <assert.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include "../src/storage/storage.h"
static int fd;
static int block_read(uint32_t lba,void *p){return pread(fd,p,512,(off_t)lba*512)==512;}
static int block_write(uint32_t lba,const void *p){return pwrite(fd,p,512,(off_t)lba*512)==512;}
static int block_flush(void){return 1;}
static struct block_device dev={0,block_read,block_write,block_flush};
void cooperative_checkpoint(void){}
static void remount(void){assert(fat_mount(&dev));assert(fat_info().writable);}
static void pattern(uint8_t *buf,uint32_t n,uint32_t offset){
 for(uint32_t i=0;i<n;i++)buf[i]=(uint8_t)(((offset+i)*13u)^((offset+i)>>9)^0x5au);
}
static void check_range(const char *path,uint32_t start,uint32_t count){
 uint8_t b[4096],expected[4096];uint32_t done=0,got;
 while(done<count){uint32_t n=count-done;if(n>sizeof(b))n=sizeof(b);
  assert(fat_read_at(path,start+done,b,n,&got)&&got==n);
  pattern(expected,n,start+done);assert(!memcmp(b,expected,n));done+=n;
 }
}
static void small(void){
 uint8_t b[4096];
 assert(fat_write("STREAM.BIN",0,0));
 uint32_t offset=0;
 for(uint32_t i=0;i<1600;i++){
  uint32_t n=1+(i*3877u)%sizeof(b);
  pattern(b,n,offset);
  assert(fat_write_at("STREAM.BIN",offset,b,n));offset+=n;
  if(i%257==0){uint32_t bytes;int directory;
   assert(fat_stat("STREAM.BIN",&bytes,&directory)&&bytes==offset&&!directory);
   check_range("STREAM.BIN",offset>4096?offset-4096:0,offset>4096?4096:offset);
  }
 }
 remount();check_range("STREAM.BIN",0,offset);
 uint32_t size;int is_dir;assert(fat_stat("STREAM.BIN",&size,&is_dir)&&size==offset);
 /* Interleave an independent file; cached stream tail must be invalidated. */
 assert(fat_write("OTHER.TXT","Hello",5));
 pattern(b,4096,offset);assert(fat_write_at("STREAM.BIN",offset,b,4096));
 remount();check_range("STREAM.BIN",offset,4096);
 assert(fat_copy("STREAM.BIN","COPIED.BIN"));
 check_range("COPIED.BIN",0,offset+4096);
 assert(fat_remove("COPIED.BIN"));
 puts("PASS: 1600 chunked appends, unaligned sectors/clusters, cold remount, cache invalidation, copied data");
}
static void boundary(void){
 uint32_t size;int directory;
 assert(fat_stat("MAXFILE.BIN",&size,&directory)&&size==0xffffff00u&&!directory);
 uint8_t data[256];pattern(data,255,0xffffff00u);
 assert(fat_write_at("MAXFILE.BIN",0xffffff00u,data,255));
 assert(fat_stat("MAXFILE.BIN",&size,&directory)&&size==UINT32_MAX);
 uint8_t actual[256];uint32_t got;
 assert(fat_read_at("MAXFILE.BIN",0xffffff00u,actual,255,&got)&&got==255);
 assert(!memcmp(actual,data,255));
 assert(fat_read_at("MAXFILE.BIN",UINT32_MAX,actual,1,&got)&&got==0);
 assert(!fat_write_at("MAXFILE.BIN",UINT32_MAX,"X",1));
 assert(fat_stat("MAXFILE.BIN",&size,&directory)&&size==UINT32_MAX);
 remount();assert(fat_stat("MAXFILE.BIN",&size,&directory)&&size==UINT32_MAX);
 assert(fat_read_at("MAXFILE.BIN",UINT32_MAX-255,actual,255,&got)&&got==255);
 assert(!memcmp(actual,data,255));
 puts("PASS: actual FAT32 4,294,967,295-byte limit, EOF, overflow refusal, sparse host-device remount");
}
int main(int argc,char**argv){
 assert(argc==3);fd=open(argv[1],O_RDWR);assert(fd>=0);
 struct stat st;assert(fstat(fd,&st)==0&&st.st_size%512==0&&st.st_size/512<=UINT32_MAX);
 dev.sectors=(uint32_t)(st.st_size/512);remount();
 if(!strcmp(argv[2],"small"))small();else if(!strcmp(argv[2],"boundary"))boundary();else abort();
 close(fd);return 0;
}
