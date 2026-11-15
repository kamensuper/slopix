/* Genesis .slop package manager: legacy executable packages and v2 bundles.
 * Bounded 8.3 files, complete pre-verification, temp-file staging and cleanup.
 * Integrity CRCs are NOT a signature/authentication mechanism. */
#include "slop_package.h"
#include "fs/vfs.h"
#include "kernel.h"
#include "apps.h"
#include <stdint.h>
#define CHUNK 4096u
#define HEADER 32u
#define ENTRY 24u
#define FILES 8u
#define MAX_IMAGE (1024u*1024u)
#define MAX_ASSET (512u*1024u)
#define MAX_PAYLOAD (2u*1024u*1024u)
static unsigned char buffer[CHUNK];
static void (*line)(const char *);
static uint32_t le32(const unsigned char*p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
static uint32_t crc32_step(uint32_t crc,const unsigned char*p,uint32_t n){for(uint32_t i=0;i<n;i++){crc^=p[i];for(unsigned b=0;b<8;b++)crc=(crc>>1)^((crc&1)?0xedb88320u:0);}return crc;}
static int eql(const char*a,const char*b){while(*a&&*a==*b){a++;b++;}return *a==*b;}
static int valid_name(const char*s,unsigned n){if(!n||n>8)return 0;for(unsigned i=0;i<n;i++){unsigned char c=(unsigned char)s[i];if(!((c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='_'))return 0;}return 1;}
static int valid_filename(const char*s){unsigned stem=0,ext=0;while(s[stem]&&s[stem]!='.'&&stem<9)stem++;if(!valid_name(s,stem)||s[stem]!='.')return 0;for(const char*p=s+stem+1;*p;p++){unsigned char c=(unsigned char)*p;if(!((c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='_')||++ext>3)return 0;}return ext>0;}
static int ends(const char*s,const char*ext){unsigned n=(unsigned)length(s),m=(unsigned)length(ext);if(n<m)return 0;return eql(s+n-m,ext);}
/* Until VFAT long names land, the CLI accepts a .slop spelling but stores
 * the package on FAT32 under its compatible 8.3 .SLP filename. Do not claim
 * the volume itself supports four-character extensions yet. */
static const char *resolve_package_filename(const char *in,char alias[13]){
 unsigned n=(unsigned)length(in);
 if(n<6||n>13)return in;
 const char *ext=in+n-5;
 if(ext[0]!='.'||((ext[1]|32)!='s')||((ext[2]|32)!='l')||((ext[3]|32)!='o')||((ext[4]|32)!='p'))return in;
 unsigned base=n-5;
 if(base<1||base>8)return in;
 for(unsigned i=0;i<base;i++){
  char c=in[i];if(c>='a'&&c<='z')c=(char)(c-'a'+'A');
  if(!((c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='_'))return in;
  alias[i]=c;
 }
 alias[base]='.';alias[base+1]='S';alias[base+2]='L';alias[base+3]='P';alias[base+4]=0;
 return alias;
}
static void entry_name(char out[13],const char *name,const char *extension){unsigned i=0;for(;i<8&&name[i];i++)out[i]=name[i];out[i++]='.';for(unsigned j=0;j<3&&extension[j];j++)out[i++]=extension[j];out[i]=0;}
struct pkg_file {char name[13];uint32_t size,crc,kind,offset;};
struct pkg {char name[9];unsigned major,minor,version,count,meta_size;uint32_t total;struct pkg_file files[FILES];};
static int exists(const char*n){uint32_t size;int directory;return vfs_stat(n,&size,&directory);}
static int read_exact(const char*path,uint32_t at,void*dst,uint32_t cap){uint32_t n=0;return vfs_read_at(path,at,dst,cap,&n)&&n==cap;}
/* registry is a short, validated manifest, not a full package. */
static int manifest(const char*path,struct pkg*p,int registry){
 uint32_t bytes=0;int directory=0;unsigned char h[HEADER];
 if(!vfs_stat(path,&bytes,&directory)||directory||bytes<HEADER||!read_exact(path,0,h,HEADER))return 0;
 int version=0;
 if(!__builtin_memcmp(h,"SLOPPKG1",8))version=1;
 else if(!__builtin_memcmp(h,"SLOPPKG2",8))version=2;
 else return 0;
 unsigned n=0;while(n<8&&h[8+n]){p->name[n]=(char)h[8+n];n++;}p->name[n]=0;
 for(unsigned i=n;i<8;i++)if(h[8+i])return 0;
 if(!valid_name(p->name,n)||le32(h+28)!=1)return 0;
 p->version=(unsigned)version;p->major=(unsigned)h[24]|(unsigned)h[25]<<8;p->minor=(unsigned)h[26]|(unsigned)h[27]<<8;
 if(version==1){
  p->meta_size=HEADER;p->count=1;p->total=le32(h+16);
  if(p->total<64||p->total>MAX_IMAGE)return 0;
  entry_name(p->files[0].name,p->name,"ELF");
  p->files[0].size=p->total;p->files[0].crc=le32(h+20);p->files[0].kind=1;p->files[0].offset=HEADER;
  return bytes==(registry?HEADER:HEADER+p->total);
 }
 p->count=le32(h+16);p->total=le32(h+20);
 if(!p->count||p->count>FILES||p->total>MAX_PAYLOAD)return 0;
 p->meta_size=HEADER+p->count*ENTRY;
 if(bytes!=(registry?p->meta_size:p->meta_size+p->total))return 0;
 uint32_t offset=p->meta_size,sum=0,elfs=0;
 for(unsigned i=0;i<p->count;i++){
  unsigned char e[ENTRY];if(!read_exact(path,HEADER+i*ENTRY,e,ENTRY))return 0;
  unsigned k=0;while(k<12&&e[k]){p->files[i].name[k]=(char)e[k];k++;}
  p->files[i].name[k]=0;
  for(unsigned j=k;j<12;j++)if(e[j])return 0;
  struct pkg_file*f=&p->files[i];
  if(!valid_filename(f->name)||ends(f->name,".REG")||ends(f->name,".TMP")||ends(f->name,".SLP"))return 0;
  for(unsigned j=0;j<i;j++)if(eql(p->files[j].name,f->name))return 0;
  f->size=le32(e+12);f->crc=le32(e+16);f->kind=le32(e+20);
  if(f->kind==1){char expected[13];entry_name(expected,p->name,"ELF");if(!eql(f->name,expected)||f->size<64||f->size>MAX_IMAGE)return 0;elfs++;}
  else if(f->kind!=2||!f->size||f->size>MAX_ASSET||ends(f->name,".ELF"))return 0;
  if(sum>MAX_PAYLOAD-f->size)return 0;
  sum+=f->size;f->offset=offset;offset+=f->size;
 }
 return sum==p->total&&elfs==1;
}
static int verify_file(const char*path,const struct pkg_file*f,uint32_t offset,int exact_size){
 if(exact_size){uint32_t actual=0;int dir=0;if(!vfs_stat(path,&actual,&dir)||dir||actual!=f->size)return 0;}
 uint32_t crc=0xffffffffu;
 for(uint32_t off=0;off<f->size;){uint32_t cap=f->size-off;if(cap>CHUNK)cap=CHUNK;
  if(!read_exact(path,offset+off,buffer,cap))return 0;
  if(f->kind==1&&off==0&&!(buffer[0]==127&&buffer[1]=='E'&&buffer[2]=='L'&&buffer[3]=='F'&&buffer[4]==2&&buffer[5]==1&&buffer[18]==62&&buffer[19]==0))return 0;
  crc=crc32_step(crc,buffer,cap);off+=cap;
 }
 return (crc^0xffffffffu)==f->crc;
}
static int verify(const char *path,const struct pkg*p){
 for(unsigned i=0;i<p->count;i++)if(!verify_file(path,&p->files[i],p->files[i].offset,0))return 0;
 return 1;
}
static void print_pkg(const struct pkg*p){char s[100]="Package ";copystr(s+length(s),p->name,sizeof(s)-length(s));copystr(s+length(s)," version ",sizeof(s)-length(s));char n[21];decimal(p->major,n);copystr(s+length(s),n,sizeof(s)-length(s));copystr(s+length(s),".",sizeof(s)-length(s));decimal(p->minor,n);copystr(s+length(s),n,sizeof(s)-length(s));line(s);}
static void listing(const char*name,uint32_t bytes,int directory){
 if(directory||bytes<HEADER||bytes>HEADER+FILES*ENTRY)return;
 if(!ends(name,".REG"))return;
 struct pkg p={0};if(!manifest(name,&p,1))return;
 char reg[13],exe[13];entry_name(reg,p.name,"REG");entry_name(exe,p.name,"ELF");
 if(eql(name,reg)&&exists(exe))line(name);
}
static void temporary(char name[13],unsigned i){name[0]='S';name[1]='L';name[2]='P';name[3]=(char)('0'+i);name[4]='.';name[5]='T';name[6]='M';name[7]='P';name[8]=0;}
static int install(const char*path,const struct pkg*p){
 char reg[13],tmp[13];entry_name(reg,p->name,"REG");
 if(exists(reg)){line("Name already installed or in use; no files replaced");return 0;}
 for(unsigned i=0;i<p->count;i++){
  if(exists(p->files[i].name)){line("Name already installed or in use; no files replaced");return 0;}
  /* A staging file left by an interrupted install is ours (apps cannot create
   * SLP*.TMP); clean it up instead of blocking every future install (B-17). */
  temporary(tmp,i);if(exists(tmp)&&!vfs_remove(tmp)){line("Stale SLP*.TMP from an interrupted install could not be removed");return 0;}
 }
 unsigned staged=0,moved=0;int ok=1;
 for(unsigned i=0;i<p->count&&ok;i++){
  struct pkg_file const*f=&p->files[i];temporary(tmp,i);uint32_t written=0;
  while(written<f->size){uint32_t cap=f->size-written;if(cap>CHUNK)cap=CHUNK;
   if(!read_exact(path,f->offset+written,buffer,cap)||!vfs_write_at(tmp,written,buffer,cap)){ok=0;break;}
   written+=cap;
  }
  staged++;
 }
 if(ok)for(unsigned i=0;i<p->count;i++){
  temporary(tmp,i);
  if(!vfs_rename(tmp,p->files[i].name)){ok=0;break;}
  moved++;
 }
 if(ok){
  /* Registry is written LAST. Only fully committed packages appear installed. */
  unsigned char metadata[HEADER+FILES*ENTRY];
  if(!read_exact(path,0,metadata,p->meta_size)||!vfs_write(reg,metadata,p->meta_size))ok=0;
 }
 if(!ok){
  for(unsigned i=0;i<staged;i++){temporary(tmp,i);vfs_remove(tmp);}
  for(unsigned i=0;i<moved;i++)vfs_remove(p->files[i].name);
  vfs_remove(reg);line("Installation failed; staged files rolled back where possible");return 0;
 }
 print_pkg(p);line("Installed package; slop launch NAME (or run NAME.ELF)");return 1;
}
int slop_package_command(const char *command,char*args,void (*out)(const char*)){
 if(!eql(command,"slop"))return 0;
 line=out;
 if(!*args||eql(args,"help")){line("slop install FILE.SLP | verify FILE.SLP | info FILE.SLP");line("slop list | remove PACKAGENAME | launch PACKAGENAME");return 1;}
 char *opt=args;while(*args&&*args!=' ')args++;if(*args){*args++=0;while(*args==' ')args++;}
 if(eql(opt,"list")){if(*args||!vfs_list(listing))line("Package list unavailable");return 1;}
 if(eql(opt,"launch")){
  unsigned k=(unsigned)length(args);if(!valid_name(args,k)){line("Usage: slop launch PACKAGENAME (A-Z/0-9/_)");return 1;}
  char exe[13],reg[13];entry_name(exe,args,"ELF");entry_name(reg,args,"REG");
  struct pkg p={0};if(!manifest(reg,&p,1)||!eql(p.name,args)||!exists(exe)){line("Package is not installed");return 1;}
  if(!slopde_launch_installed(exe))line("Unable to start app (another installed window open or ELF invalid)");
  else line("Launched standalone Ring-3 graphical application");
  return 1;
 }
 if(eql(opt,"remove")){
  unsigned k=(unsigned)length(args);if(!valid_name(args,k)){line("Invalid package name (uppercase A-Z/0-9/_; max 8)");return 1;}
  char reg[13];entry_name(reg,args,"REG");struct pkg p={0};
  if(!manifest(reg,&p,1)||!eql(p.name,args)){line("Not a valid registered Slop package");return 1;}
  /* A user may have replaced an installed asset with personal data. Never
   * delete that unrelated data on uninstall. Validate all before deleting any. */
  /* Files already gone (a previous remove failed half way) are skipped, so a
   * failed uninstall can always be retried (B-18). */
  for(unsigned i=0;i<p.count;i++)if(exists(p.files[i].name)&&!verify_file(p.files[i].name,&p.files[i],0,1)){
   line("Installed file was modified; refusing destructive uninstall");return 1;
  }
  int ok=1;
  for(unsigned i=0;i<p.count;i++)if(exists(p.files[i].name)&&!vfs_remove(p.files[i].name))ok=0;
  if(!ok)line("Could not remove all package files; registration retained for retry");
  else if(!vfs_remove(reg))line("Package files removed; registry cleanup failed");
  else line("Package removed");
  return 1;
 }
 if(!eql(opt,"install")&&!eql(opt,"verify")&&!eql(opt,"info")){line("Unknown slop action; try slop help");return 1;}
 if(!*args||length(args)>255){line("Specify a valid .SLP package file path");return 1;}
 char alias[13];const char *package_path=resolve_package_filename(args,alias);
 struct pkg p={0};if(!manifest(package_path,&p,0)){line("Invalid package header, ABI, filenames or file sizes");return 1;}
 if(eql(opt,"info")){print_pkg(&p);return 1;}
 if(!verify(package_path,&p)){line("Package CRC32/ELF verification failed");return 1;}
 if(eql(opt,"verify")){print_pkg(&p);line("Package integrity OK (CRC32; not a digital signature)");return 1;}
 install(package_path,&p);return 1;
}
