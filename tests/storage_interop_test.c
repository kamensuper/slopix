/* Verify the real filesystem implementation against a host-formatted volume. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/storage/storage.h"
static FILE *disk;
static uint32_t count;
static int read_sector(uint32_t lba,void *b){assert(lba<count);return !fseek(disk,(long)lba*512,SEEK_SET)&&fread(b,1,512,disk)==512;}
static int write_sector(uint32_t lba,const void *b){assert(lba<count);return !fseek(disk,(long)lba*512,SEEK_SET)&&fwrite(b,1,512,disk)==512;}
static int flush(void){return !fflush(disk);}
static unsigned entries;
static void entry(const char *name,uint32_t bytes,int dir){(void)name;(void)bytes;(void)dir;entries++;}
int main(int argc,char **argv){
 assert(argc==2);disk=fopen(argv[1],"r+b");assert(disk);fseek(disk,0,SEEK_END);long bytes=ftell(disk);assert(bytes>0&&bytes%512==0);count=(uint32_t)(bytes/512);
 struct block_device device={count,read_sector,write_sector,flush};
 assert(fat_mount(&device)&&fat_info().writable);assert(fat_list(entry)&&entries>=24);
 unsigned char b[65536];uint32_t n;assert(fat_read("EXTERN.BIN",b,sizeof(b),&n)&&n==sizeof(b));for(unsigned i=0;i<n;i++)assert(b[i]==(unsigned char)(i*7));
 assert(fat_write("SLOPIX.TXT","host-formatted FAT32\n",(uint32_t)strlen("host-formatted FAT32\n")));
 assert(fat_mount(&device)&&fat_info().writable);assert(fat_read("slopix.txt",b,sizeof(b),&n)&&n==strlen("host-formatted FAT32\n"));
 assert(fat_remove("F0.TXT"));assert(fat_sync());fclose(disk);puts("PASS: host mkfs.fat format, mtools-populated multi-cluster root, 64 KiB external file, writes, remount and delete");return 0;
}
