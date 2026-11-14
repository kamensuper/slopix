/* Same FAT32 implementation as the guest, backed by a guarded host disk. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/storage/storage.h"
#define BYTES (64u*1024*1024)
#define FATSTART 32u
#define FATSECT 1024u
#define ROOTSTART (32u+2048u)
static unsigned char *image,*original;
static uint32_t disk_sectors=BYTES/512;
static int writes,flushes,reads,fail_write,fail_read,fail_flush;
static int read_block(uint32_t lba,void *buf){assert(lba<disk_sectors);reads++;if(fail_read&&reads==fail_read)return 0;memcpy(buf,image+(size_t)lba*512,512);return 1;}
static int write_block(uint32_t lba,const void *buf){assert(lba<disk_sectors);writes++;if(fail_write&&writes==fail_write)return 0;memcpy(image+(size_t)lba*512,buf,512);return 1;}
static int flush_disk(void){flushes++;return !fail_flush||flushes!=fail_flush;}
static struct block_device device={BYTES/512,read_block,write_block,flush_disk};
static void reset(void){memcpy(image,original,BYTES);disk_sectors=device.sectors=BYTES/512;writes=reads=flushes=fail_write=fail_read=fail_flush=0;}
static void mount_rw(void){assert(fat_mount(&device));assert(fat_info().writable);}
static void put32(unsigned char *p,uint32_t x){for(int i=0;i<4;i++)p[i]=(unsigned char)(x>>(i*8));}
static void fatentry(uint32_t c,uint32_t value){for(int f=0;f<2;f++)put32(image+(FATSTART+f*FATSECT)*512+c*4,value);}
static unsigned char content[FS_MAX_FILE+1],readback[FS_MAX_FILE+1];
static uint32_t entries;
static void listed(const char *name,uint32_t size,int dir){assert(strlen(name)<=12);(void)size;(void)dir;entries++;}
static void verify_file(const char *name,const void *data,uint32_t size){uint32_t n=999;memset(readback,0xa5,sizeof(readback));assert(fat_read(name,readback,FS_MAX_FILE,&n));assert(n==size&&!memcmp(readback,data,n));assert(readback[FS_MAX_FILE]==0xa5);}
int main(int argc,char **argv){
    assert(argc==3);image=malloc(BYTES+2048*512);original=malloc(BYTES);assert(image&&original);
    FILE *f=fopen(argv[1],"rb");assert(f&&fread(original,1,BYTES,f)==BYTES);fclose(f);
    reset();mount_rw();
    /* Fragmentation is deliberate: every other free cluster is marked bad. */
    uint32_t advanced_clusters=fat_info().clusters;
    for(uint32_t c=12;c<advanced_clusters+2;c+=2)fatentry(c,0x0ffffff7);
    mount_rw();
    const uint32_t bigsize=3u*1024*1024+137;
    unsigned char *big=malloc(bigsize+4096),chunk[4093];assert(big);
    for(uint32_t i=0;i<bigsize+4096;i++)big[i]=(unsigned char)(i*37u+(i>>11));
    assert(fat_mkdir("TREE"));assert(fat_mkdir("/TREE/INNER"));
    assert(fat_write("/TREE/INNER/LARGE.BIN",big,bigsize));mount_rw();
    uint32_t st;int dir;assert(fat_stat("/TREE/INNER/LARGE.BIN",&st,&dir)&&st==bigsize&&!dir);
    for(uint32_t off=0;off<bigsize;){uint32_t n=0;assert(fat_read_at("TREE/INNER/LARGE.BIN",off,chunk,sizeof(chunk),&n));assert(n&&n<=sizeof(chunk)&&!memcmp(chunk,big+off,n));off+=n;}
    /* WAD reads are clustered and seek backwards/forwards rather than purely
     * sequential. Every cached continuation must still honor the exact offset. */
    uint32_t rng=0x12345678;
    for(unsigned i=0;i<512;i++){
        rng=rng*1664525u+1013904223u;uint32_t off=rng%bigsize;
        uint32_t n=0;assert(fat_read_at("TREE/INNER/LARGE.BIN",off,chunk,sizeof(chunk),&n));
        assert(n==sizeof(chunk)&&!memcmp(chunk,big+off,n));
    }
    uint32_t n=99;assert(fat_read_at("TREE/INNER/LARGE.BIN",bigsize,chunk,sizeof(chunk),&n)&&!n);
    assert(!fat_read_at("TREE/INNER/LARGE.BIN",bigsize+1,chunk,sizeof(chunk),&n));
    assert(fat_write_at("TREE/INNER/LARGE.BIN",509,"PATCH-CROSS-SECTOR",18));memcpy(big+509,"PATCH-CROSS-SECTOR",18);
    assert(fat_read_at("TREE/INNER/LARGE.BIN",497,chunk,100,&n)&&n==100&&!memcmp(chunk,big+497,100));
    assert(fat_write_at("TREE/INNER/LARGE.BIN",bigsize+1000,"END",3));
    assert(fat_read_at("TREE/INNER/LARGE.BIN",bigsize,chunk,1003,&n)&&n==1003);
    for(unsigned i=0;i<1000;i++)assert(!chunk[i]);
    assert(!memcmp(chunk+1000,"END",3));
    assert(fat_copy("TREE/INNER/LARGE.BIN","TREE/INNER/COPY.BIN"));
    assert(!fat_copy("TREE/INNER/LARGE.BIN","TREE/INNER/COPY.BIN"));
    assert(fat_rename("TREE/INNER/COPY.BIN","TREE/INNER/MOVED.BIN"));
    assert(!fat_rename("TREE/INNER/MOVED.BIN","TREE/OTHER.BIN"));
    assert(!fat_rmdir("TREE/INNER"));mount_rw();
    assert(fat_stat("TREE/INNER/MOVED.BIN",&st,&dir)&&st==bigsize+1003);
    assert(fat_read_at("TREE/INNER/MOVED.BIN",497,chunk,100,&n)&&!memcmp(chunk,big+497,100));
    /* Disk-full preflight must not write or change the original file. */
    for(uint32_t c=2;c<advanced_clusters+2;c++){
        uint32_t v=0;for(unsigned k=0;k<4;k++)v|=(uint32_t)image[FATSTART*512+c*4+k]<<(k*8);
        if(!(v&0x0fffffff))fatentry(c,0x0ffffff7);
    }
    mount_rw();int before_writes=writes;assert(!fat_write_at("TREE/INNER/LARGE.BIN",0,"bad",3)&&writes==before_writes);
    assert(fat_read_at("TREE/INNER/LARGE.BIN",497,chunk,100,&n)&&!memcmp(chunk,big+497,100));
    assert(fat_remove("TREE/INNER/LARGE.BIN"));assert(fat_remove("TREE/INNER/MOVED.BIN"));
    assert(fat_rmdir("TREE/INNER"));assert(fat_rmdir("TREE"));mount_rw();free(big);
    puts("PASS: fragmented 3 MiB binary, odd chunk reads, cross-sector range COW, gap zero-fill, nested create/read/copy/rename/delete, cold remount, disk-full preservation");
    reset();mount_rw();
    char deep[256]="";
    for(unsigned i=0;i<16;i++){strcat(deep,"/D");assert(fat_mkdir(deep));}
    uint32_t depthfree=fat_info().free_clusters;strcat(deep,"/TOODEEP");assert(!fat_mkdir(deep));assert(fat_info().free_clusters==depthfree);mount_rw();
    puts("PASS: depth-16 tree cold remount and depth-17 creation rejected before mutation");
    for(unsigned variant=0;variant<9;variant++){
        reset();mount_rw();assert(fat_mkdir("DOTTEST"));
        unsigned char *root_entry=image+ROOTSTART*512+128;
        uint32_t dc=(uint32_t)root_entry[26]|(uint32_t)root_entry[27]<<8|(uint32_t)root_entry[20]<<16|(uint32_t)root_entry[21]<<24;
        unsigned char *dot=image+(ROOTSTART+dc-2)*512;
        if(variant==0)dot[1]='B'; /* .BAD alias must not bypass ownership validation */
        if(variant==1)dot[10]='X';
        if(variant==2)dot[32+2]='X';
        if(variant==3)dot[11]=0x20;
        if(variant==4)dot[11]=0x18;
        if(variant==5)put32(dot+28,1);
        if(variant==6)dot[26]++;
        if(variant==7)memcpy(dot+32,dot,32);
        if(variant==8){memcpy(root_entry,dot,32);assert(!fat_mount(&device));continue;}
        int before=writes;assert(!fat_rmdir("DOTTEST")&&writes==before);assert(!fat_mount(&device));
    }
    puts("PASS: corrupt dot/dotdot alias, padding, attributes, size, linkage, duplicate and root-dot rejection; rmdir refuses without writes");
    reset();mount_rw();uint32_t initial=fat_info().free_clusters;
    uint32_t tiny_size=123;assert(!fat_read("WELCOME.TXT",readback,1,&tiny_size)&&tiny_size==123);
    entries=0;assert(fat_list(listed)&&entries==3);verify_file("empty.txt","",0);
    assert(!fat_read("missing.txt",readback,sizeof(readback),&entries));
    assert(!fat_write("../BAD",content,1));assert(!fat_write("TOOLONGGG.TXT",content,1));assert(!fat_write("X.",content,1));assert(!fat_write("X.ABCD",content,1));
    /* Legacy UI buffers are bounded; streaming file storage is not 64 KiB limited. */
    for(unsigned i=0;i<FS_MAX_FILE;i++)content[i]=(unsigned char)(i*19+7);
    for(unsigned size=0;size<=FS_MAX_FILE;size=size==0?1:size==1?511:size==511?512:size==512?513:size==513?FS_MAX_FILE:FS_MAX_FILE+1){
        assert(fat_write("mixed.bin",content,size));verify_file("MIXED.BIN",content,size);mount_rw();verify_file("mixed.bin",content,size);
        assert(fat_info().free_clusters==initial-(size+511)/512);
    }
    assert(fat_remove("mixed.bin"));assert(fat_info().free_clusters==initial);mount_rw();assert(!fat_remove("mixed.bin"));
    for(unsigned i=0;i<100;i++){assert(fat_write("REPEAT.TXT","hello",5));assert(fat_write("REPEAT.TXT","x",1));assert(fat_remove("REPEAT.TXT"));}
    assert(fat_info().free_clusters==initial);
    puts("PASS: exact bytes, empty/511/512/513/65536 sizes, overwrite/truncate/delete, repeated allocation/reclamation, remount, name and buffer bounds");
    // Fill the bounded root; refusal must preserve all existing entries.
    for(unsigned i=0;i<124;i++){char name[13];snprintf(name,sizeof(name),"F%u.TXT",i);assert(fat_write(name,"ok",2));}
    assert(!fat_write("FULL.TXT","no",2));verify_file("F0.TXT","ok",2);mount_rw();
    reset();mount_rw();uint32_t cluster_count=fat_info().clusters;for(uint32_t c=12;c<cluster_count+2;c++)fatentry(c,0x0ffffff7);mount_rw();assert(fat_info().free_clusters==0);
    assert(!fat_write("FULL.TXT","no",2));verify_file("LICENSE.TXT",original+(ROOTSTART+9)*512,(uint32_t)strlen((char *)original+(ROOTSTART+9)*512));
    puts("PASS: root capacity and full disk fail without corrupting existing files");
    reset();image[12]=0;assert(!fat_mount(&device));
    reset();put32(image+32,0xffffffffu);assert(!fat_mount(&device));
    reset();put32(image+44,0x0fffffff);assert(!fat_mount(&device));
    reset();image[16]=255;assert(!fat_mount(&device));
    reset();put32(image+36,0xffffffffu);assert(!fat_mount(&device));
    reset();image[13]=3;assert(!fat_mount(&device));
    reset();fatentry(2,2);assert(!fat_mount(&device));
    reset();fatentry(3,2);assert(!fat_mount(&device));
    reset();fatentry(3,0);assert(!fat_mount(&device));
    reset();put32(image+ROOTSTART*512+32+28,999999);assert(!fat_mount(&device));
    reset();image[(FATSTART+FATSECT)*512+12]^=1;assert(!fat_mount(&device));
    reset();fatentry(1,0x07ffffff);assert(fat_mount(&device)&&!fat_info().writable);assert(!fat_write("X.TXT","x",1));
    reset();fatentry(99,0x0fffffff);assert(fat_mount(&device)&&!fat_info().writable);
    reset();image[ROOTSTART*512+128+11]=0x0f;image[ROOTSTART*512+128]=1;assert(fat_mount(&device)&&!fat_info().writable);
    reset();image[ROOTSTART*512+32+11]|=0x10;assert(!fat_mount(&device));
    reset();device.sectors--;assert(!fat_mount(&device));
    reset();fail_read=2;assert(!fat_mount(&device));
    puts("PASS: malformed BPB, overflow, FAT mismatch, cycles, crosslinks, short/free chains, dirty volume, lost clusters, LFN/subdirectory restrictions, I/O failures");
    reset();mount_rw();assert(fat_write("TXN.TXT","before",6));
    memcpy(original,image,BYTES); // transaction baseline with an existing file
    reset();mount_rw();assert(fat_write("TXN.TXT",content,1025));int count_writes=writes,count_flush=flushes;
    for(int step=1;step<=count_writes;step++){
        reset();mount_rw();fail_write=step;assert(!fat_write("TXN.TXT",content,1025));assert(!fat_info().writable);assert(!fat_write("OTHER","x",1));
        fail_write=0;int ok=fat_mount(&device);
        if(ok){uint32_t size;assert(fat_read("TXN.TXT",readback,sizeof(readback),&size));assert((size==6&&!memcmp(readback,"before",6))||(size==1025&&!memcmp(readback,content,1025)));}
    }
    for(int step=1;step<=count_flush;step++){
        reset();mount_rw();fail_flush=step;assert(!fat_write("TXN.TXT",content,1025));assert(!fat_info().writable);
    }
    printf("PASS: failures injected at all %d writes and %d flushes; no further writes after failure; remount rejects inconsistent metadata or returns old/new complete file\n",count_writes,count_flush);
    reset();mount_rw();assert(fat_remove("TXN.TXT"));count_writes=writes;
    for(int step=1;step<=count_writes;step++){
        reset();mount_rw();fail_write=step;assert(!fat_remove("TXN.TXT"));assert(!fat_info().writable);
    }
    puts("PASS: delete failure injection");
    reset();memmove(image+2048*512,image,BYTES);memset(image,0,2048*512);
    image[446+4]=0x0c;put32(image+446+8,2048);put32(image+446+12,BYTES/512);image[510]=0x55;image[511]=0xaa;
    disk_sectors=device.sectors=BYTES/512+2048;mount_rw();assert(fat_write("MBR.TXT","partition",9));verify_file("MBR.TXT","partition",9);
    puts("PASS: bounded MBR FAT32 partition reads/writes");
    // Deliver a host-generated mutated image for independent fsck/mtools checks.
    reset();mount_rw();assert(fat_write("HOST.TXT",content,65536));assert(fat_write("HOST.TXT","persisted host test\n",20));assert(fat_sync());
    f=fopen(argv[2],"wb");assert(f&&fwrite(image,1,BYTES,f)==BYTES);fclose(f);
    free(image);free(original);puts("ALL FAT32 HOST TESTS PASSED");return 0;
}
