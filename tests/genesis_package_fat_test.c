/* End-to-end versioned .slop install/removal with the REAL Slopix FAT32/VFS code.
 * This reads only the dedicated Genesis disk in host memory, never changes
 * the file on the developer machine. */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/storage/storage.h"
#include "../src/fs/vfs.h"
#include "../src/slop_package.h"
extern const struct fs_backend fat32_backend;
#define SIZE (64u*1024u*1024u)
static uint8_t *disk;
static int read_sector(uint32_t lba,void *p){if(lba>=SIZE/512)return 0;memcpy(p,disk+(size_t)lba*512,512);return 1;}
static int write_sector(uint32_t lba,const void *p){if(lba>=SIZE/512)return 0;memcpy(disk+(size_t)lba*512,p,512);return 1;}
static int flush_sector(void){return 1;}
static struct block_device dev={SIZE/512,read_sector,write_sector,flush_sector};
size_t length(const char*s){return strlen(s);}
void copystr(char*to,const char*from,size_t size){if(!size)return;snprintf(to,size,"%s",from);}
void decimal(uint64_t x,char*s){sprintf(s,"%llu",(unsigned long long)x);}
static char output[4096];
static char last_launched[13];
int slopde_launch_installed(const char *name){snprintf(last_launched,sizeof(last_launched),"%s",name);return 1;}
static void out(const char*s){size_t a=strlen(output),n=strlen(s);assert(a+n+2<sizeof(output));memcpy(output+a,s,n);output[a+n]='\n';output[a+n+1]=0;}
static void call(const char *cmd,char *arg,const char *expected){output[0]=0;assert(slop_package_command(cmd,arg,out));assert(strstr(output,expected));}
static void remount(void){assert(fat_mount(&dev));assert(fat_info().writable);}
int main(int argc,char **argv){
 assert(argc==2);disk=malloc(SIZE);assert(disk);FILE*f=fopen(argv[1],"rb");assert(f&&fread(disk,1,SIZE,f)==SIZE);fclose(f);
 remount();assert(vfs_bind(&fat32_backend));uint32_t slp_size=0,got=0;int directory=0;
 assert(vfs_stat("HELLO.SLP",&slp_size,&directory)&&!directory&&slp_size>100);
 char verify_path[]="HELLO.SLP";call("slop", "help", "install FILE.SLP");
 char alias_verify[]="verify hello.slop";call("slop",alias_verify,"Package integrity OK");
 char verify_cmd[]="verify HELLO.SLP";call("slop",verify_cmd,"Package integrity OK");
 char info_cmd[]="info HELLO.SLP";call("slop",info_cmd,"Package HELLO version 1.0");
 char install_cmd[]="install HELLO.SLP";call("slop",install_cmd,"Installed package");
 assert(vfs_stat("HELLO.ELF",&got,&directory)&&!directory&&got==slp_size-32);
 uint8_t ref[4096],actual[4096];for(uint32_t i=0;i<got;){uint32_t a=got-i;if(a>sizeof(ref))a=sizeof(ref);uint32_t b=0,c=0;
   assert(vfs_read_at(verify_path,32+i,ref,a,&b)&&b==a);
   assert(vfs_read_at("HELLO.ELF",i,actual,a,&c)&&c==a);
   assert(!memcmp(ref,actual,a));i+=a;
 }
 remount();assert(vfs_stat("HELLO.ELF",&got,&directory));
 char list_cmd[]="list";call("slop",list_cmd,"HELLO.REG");
 char launch_cmd[]="launch HELLO";call("slop",launch_cmd,"Launched standalone Ring-3");assert(!strcmp(last_launched,"HELLO.ELF"));
 char again_cmd[]="install HELLO.SLP";call("slop",again_cmd,"Name already installed");
 char remove_cmd[]="remove HELLO";call("slop",remove_cmd,"Package removed");
 remount();assert(!vfs_stat("HELLO.ELF",&got,&directory));assert(!vfs_stat("HELLO.REG",&got,&directory));
 /* An independently packaged 129 KiB Ring-3 graphics executable can also be
  * installed onto the package-first disk without rebuilding the kernel. */
 if(vfs_stat("DEMO.SLP",&slp_size,&directory)){
  char install_demo[]="install DEMO.SLP";call("slop",install_demo,"Installed package");
  assert(vfs_stat("DEMO.ELF",&got,&directory)&&got>65536&&got==slp_size-32);
  for(uint32_t i=0;i<got;){uint32_t a=got-i;if(a>sizeof(ref))a=sizeof(ref);uint32_t b=0,c=0;
    assert(vfs_read_at("DEMO.SLP",32+i,ref,a,&b)&&b==a);
    assert(vfs_read_at("DEMO.ELF",i,actual,a,&c)&&c==a);
    assert(!memcmp(ref,actual,a));i+=a;
  }
  remount();assert(vfs_stat("DEMO.ELF",&got,&directory)&&got>65536);
  char list_demo[]="list";call("slop",list_demo,"DEMO.REG");
  char remove_demo[]="remove DEMO";call("slop",remove_demo,"Package removed");
  remount();assert(!vfs_stat("DEMO.ELF",&got,&directory));
 }
 /* Genesis v2 bundle: browser ELF and independent HTML assets on FAT32. */
 if(vfs_stat("BROWSE.SLP",&slp_size,&directory)){
  char verify_browser[]="verify BROWSE.SLP";call("slop",verify_browser,"Package integrity OK");
  char install_browser[]="install BROWSE.slop";call("slop",install_browser,"Installed package");
  uint32_t browser_size=0,start_size=0,about_size=0;
  assert(vfs_stat("BROWSE.ELF",&browser_size,&directory)&&!directory&&browser_size>10000);
  assert(vfs_stat("START.HTM",&start_size,&directory)&&start_size>50);
  assert(vfs_stat("ABOUT.HTM",&about_size,&directory)&&about_size>50);
  assert(browser_size+start_size+about_size+32+3*24==slp_size);
  for(uint32_t i=0;i<browser_size;){uint32_t n=browser_size-i;if(n>sizeof(ref))n=sizeof(ref);uint32_t b=0,c=0;
   assert(vfs_read_at("BROWSE.SLP",104+i,ref,n,&b)&&b==n);
   assert(vfs_read_at("BROWSE.ELF",i,actual,n,&c)&&c==n);
   assert(!memcmp(ref,actual,n));i+=n;
  }
  for(uint32_t i=0;i<start_size;){uint32_t n=start_size-i;if(n>sizeof(ref))n=sizeof(ref);uint32_t b=0,c=0;
   assert(vfs_read_at("BROWSE.SLP",104+browser_size+i,ref,n,&b)&&b==n);
   assert(vfs_read_at("START.HTM",i,actual,n,&c)&&c==n);
   assert(!memcmp(ref,actual,n));i+=n;
  }
  remount();assert(vfs_stat("BROWSE.REG",&got,&directory)&&got==104);
  char launch_browser[]="launch BROWSE";call("slop",launch_browser,"Launched standalone Ring-3");
  assert(!strcmp(last_launched,"BROWSE.ELF"));
  char list_browser[]="list";call("slop",list_browser,"BROWSE.REG");
  char again_browser[]="install BROWSE.SLP";call("slop",again_browser,"Name already installed");
  /* Installation manifests are not permission to delete user-modified assets. */
  unsigned char original=0, tampered=0x7f;uint32_t read_bytes=0;
  assert(vfs_read_at("START.HTM",0,&original,1,&read_bytes)&&read_bytes==1);
  assert(vfs_write_at("START.HTM",0,&tampered,1));
  char refuse_browser[]="remove BROWSE";call("slop",refuse_browser,"refusing destructive uninstall");
  assert(vfs_stat("START.HTM",&got,&directory)&&got==start_size);
  assert(vfs_stat("BROWSE.REG",&got,&directory)&&got==104);
  assert(vfs_write_at("START.HTM",0,&original,1));
  char remove_browser[]="remove BROWSE";call("slop",remove_browser,"Package removed");
  remount();assert(!vfs_stat("BROWSE.ELF",&got,&directory));
  assert(!vfs_stat("START.HTM",&got,&directory));
  assert(!vfs_stat("ABOUT.HTM",&got,&directory));
  assert(!vfs_stat("BROWSE.REG",&got,&directory));
 }
 if(vfs_stat("HELLOGUI.SLP",&slp_size,&directory)){
  char install_gui[]="install HELLOGUI.SLP";call("slop",install_gui,"Installed package");
  assert(vfs_stat("HELLOGUI.ELF",&got,&directory)&&got>1000);
  char launch_gui[]="launch HELLOGUI";call("slop",launch_gui,"Launched standalone Ring-3");
  assert(!strcmp(last_launched,"HELLOGUI.ELF"));
  char remove_gui[]="remove HELLOGUI";call("slop",remove_gui,"Package removed");
  remount();assert(!vfs_stat("HELLOGUI.ELF",&got,&directory));
 }
 /* We do not run downloaded/installed bytes until process loader validation. */
 puts("PASS: real FAT32 and VFS package verify/info/install/list/reinstall-refusal/remove, cold mounts and byte-exact installed ELF");free(disk);return 0;
}
