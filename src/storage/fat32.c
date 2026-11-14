/* SPDX-License-Identifier: GPL-3.0-or-later
 * Bounded streaming FAT32 implementation, no allocator or host libc.
 * Main thread owns all state; mounting validates geometry and cluster ownership.
 * Disk I/O failure disables writes. No in-kernel format or automatic repair.
 * Metadata is ordered and flushed but FAT is NOT a journal: abrupt power loss
 * during a transaction requires host fsck. Every successful mutation is synced.
 */
#include "storage.h"
#include "../kernel.h"
#define MAX_CLUSTERS 262144u
#define PATH_DEPTH 16u
#define PATH_MAX 256u
#define EOC 0x0fffffffu
#define MASK 0x0fffffffu
static struct block_device *dev;
static uint32_t fat[MAX_CLUSTERS];
static uint8_t owned[MAX_CLUSTERS/8],dirty[MAX_CLUSTERS/128];
static uint8_t sector[512];
static uint32_t base,total,reserved,fatsz,nfats,spc,clusters,root_cluster,fsinfo,backup;
static int mounted,writable;
/* Single-threaded sequential read cursor. Identity includes directory entry
 * metadata so cache hits cannot outlive a file replacement. */
static uint32_t read_first,read_next,read_offset,read_length,read_stamp;
static int read_cached;
/* Repeated range reads must not resolve and stat the same directory sectors
 * twice. The entry itself is the capability; all mutations clear it. */
static char read_path[PATH_MAX];
static struct location read_entry_cache;
static int read_path_cached;
/* Cached free count and rotating allocation cursor: a 4 GiB stream must not
 * walk the entire FAT on every 4 KiB append. Rebuilt on each cold mount. */
static uint32_t free_count,allocation_hint;
/* A single hot sequential writer. Cache is invalidated by every transaction
 * and mount; location + size + first cluster guard against stale reuse. */
static struct {uint32_t lba,first,size,last,count;unsigned offset,valid;} stream;
static const char *error="No FAT32 disk mounted";
static uint16_t u16(const uint8_t *p){return (uint16_t)(p[0]|(uint16_t)p[1]<<8);}
static uint32_t u32(const uint8_t *p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
static void put16(uint8_t *p,uint16_t n){p[0]=(uint8_t)n;p[1]=(uint8_t)(n>>8);}
static void put32(uint8_t *p,uint32_t n){for(unsigned i=0;i<4;i++)p[i]=(uint8_t)(n>>(8*i));}
static void zero(void *p,uint32_t n){uint8_t *b=p;while(n--)*b++=0;}
static void copy(void *d,const void *s,uint32_t n){uint8_t *a=d;const uint8_t *b=s;while(n--)*a++=*b++;}
static uint32_t text_length(const char*s){uint32_t n=0;while(s[n])n++;return n;}
static int eq(const void *a,const void *b,unsigned n){const uint8_t *x=a,*y=b;while(n--)if(*x++!=*y++)return 0;return 1;}
static int bad(const char *s){error=s;return 0;}
static int io_bad(void){writable=0;return bad("Disk I/O failed; writes disabled until reboot");}
static int rd(uint32_t lba,void *p){cooperative_checkpoint();if(!dev||lba>=dev->sectors||!dev->read(lba,p))return io_bad();return 1;}
static int wr(uint32_t lba,const void *p){cooperative_checkpoint();if(!writable||lba>=dev->sectors||!dev->write(lba,p))return io_bad();return 1;}
static int flush(void){cooperative_checkpoint();return dev&&dev->flush&&dev->flush()?1:io_bad();}
static int valid(uint32_t c){return c>=2&&c<clusters+2;}
static uint32_t next(uint32_t c){return fat[c]&MASK;}
static uint32_t data_lba(uint32_t c){return base+reserved+nfats*fatsz+(c-2)*spc;}
static int mark(uint32_t c){if(!valid(c)||(owned[c/8]&(1u<<(c%8))))return 0;owned[c/8]|=(uint8_t)(1u<<(c%8));return 1;}
static uint32_t entry_cluster(const uint8_t *e){return ((uint32_t)u16(e+20)<<16|u16(e+26))&MASK;}
static int walk(uint32_t c,uint32_t *count){
    *count=0;
    while(valid(c)){
        if(!mark(c))return bad("Corrupt FAT32: cross-linked or cyclic cluster chain");
        (*count)++;if(!(*count%4096))cooperative_checkpoint();uint32_t n=next(c);
        if(n>=0x0ffffff8)return 1;
        c=n;
    }
    return bad("Corrupt FAT32: invalid cluster chain");
}
static int name83(const char *s,uint8_t out[11]){
    for(unsigned i=0;i<11;i++)out[i]=' ';
    unsigned n=0,ext=0;int dot=0;
    if(!s||!*s)return bad("Use a root filename in 8.3 format, e.g. NOTE.TXT");
    while(*s){
        unsigned char c=(unsigned char)*s++;
        if(c=='.'&&!dot&&n){dot=1;continue;}
        if(c>='a'&&c<='z')c=(unsigned char)(c-'a'+'A');
        if(!((c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='_'||c=='-'))return bad("Only letters, numbers, _ and - in root 8.3 names");
        if(!dot){if(n==8)return bad("Filename exceeds 8.3 limit");out[n++]=c;}
        else {if(ext==3)return bad("Filename exceeds 8.3 limit");out[8+ext++]=c;}
    }
    if(dot&&!ext)return bad("Filename extension is empty");
    return 1;
}
static void printable_name(const uint8_t *e,char s[13]){
    unsigned n=0;for(unsigned i=0;i<8&&e[i]!=' ';i++)s[n++]=(e[i]>=32&&e[i]<127)?(char)e[i]:'?';
    if(e[8]!=' '){s[n++]='.';for(unsigned i=8;i<11&&e[i]!=' ';i++)s[n++]=(e[i]>=32&&e[i]<127)?(char)e[i]:'?';}s[n]=0;
}
/* A directory location contains only one entry; scans use one sector. */
struct location { uint32_t lba; unsigned offset; uint8_t e[32]; };
static int scan(uint32_t dir,const uint8_t *key,struct location *loc,int empty){
    uint8_t buf[512];uint32_t steps=0;
    for(uint32_t c=dir;valid(c)&&steps++<clusters;c=next(c)){
        for(unsigned s=0;s<spc;s++){
            if(!rd(data_lba(c)+s,buf))return -1;
            for(unsigned i=0;i<16;i++){
                uint8_t *e=buf+i*32;
                if((empty&&(!e[0]||e[0]==0xe5))||(!empty&&e[0]&&e[0]!=0xe5&&e[11]!=0x0f&&!(e[11]&8)&&eq(e,key,11))){
                    loc->lba=data_lba(c)+s;loc->offset=i*32;copy(loc->e,e,32);return 1;
                }
                if(!e[0]&&!empty)return 0;
            }
        }
        if(next(c)>=0x0ffffff8)return 0;
    }
    bad("Invalid directory chain");return -1;
}
static int publish(const struct location *loc){
    uint8_t buf[512];if(!rd(loc->lba,buf))return 0;copy(buf+loc->offset,loc->e,32);
    return wr(loc->lba,buf)&&flush();
}
/* Paths accept /, ., ..; lexical ascent never escapes root. */
static unsigned resolved_depth;
static int parent(const char *path,uint32_t *dir,uint8_t key[11]){
    uint32_t stack[PATH_DEPTH+1];unsigned depth=0,parts=0;char part[13];
    if(!path)return bad("Missing path");
    unsigned len=0;while(path[len]){if(++len>=PATH_MAX)return bad("Path exceeds 255 bytes");}
    stack[0]=root_cluster;const char *p=path;
    while(*p){
        while(*p=='/')p++;
        if(!*p)break;
        unsigned n=0;while(*p&&*p!='/'){if(n==12)return bad("Filename exceeds 8.3 limit");part[n++]=*p++;}part[n]=0;
        while(*p=='/')p++;
        if(n==1&&part[0]=='.'){if(!*p)return bad("Path must name an entry");continue;}
        if(n==2&&part[0]=='.'&&part[1]=='.'){if(!depth)return bad("Path escapes root");depth--;if(!*p)return bad("Path must name an entry");continue;}
        if(!name83(part,key))return 0;
        if(!*p){*dir=stack[depth];resolved_depth=depth;return 1;}
        if(++parts>PATH_DEPTH||depth==PATH_DEPTH)return bad("Directory depth limit is 16");
        struct location loc;int found=scan(stack[depth],key,&loc,0);
        if(found<=0)return found<0?0:bad("Directory not found");
        if(!(loc.e[11]&0x10))return bad("Path component is not a directory");
        stack[++depth]=entry_cluster(loc.e);
    }
    return bad("Path must name an entry");
}
static int lookup(const char *path,struct location *loc){
    uint8_t key[11];uint32_t dir;if(!parent(path,&dir,key))return 0;
    int found=scan(dir,key,loc,0);return found>0?1:found<0?0:bad("File not found");
}
static int directory(const char *path,uint32_t *dir){
    if(!path||!*path||(path[0]=='/'&&!path[1])||(path[0]=='.'&&!path[1])){*dir=root_cluster;return 1;}
    /* Append a dummy final component so parent resolves terminal . and ... */
    char normalized[PATH_MAX];unsigned n=0;while(path[n]){if(n>=PATH_MAX-3)return bad("Path too long");normalized[n]=path[n];n++;}
    normalized[n++]='/';normalized[n++]='_';normalized[n]=0;uint8_t key[11];return parent(normalized,dir,key);
}
/* Only exact, space-padded FAT dot entries are exempt from ownership walks. */
static unsigned dot_kind(const uint8_t *e){
    if(e[0]!='.')return 0;
    unsigned kind=e[1]=='.'?2:1;
    for(unsigned i=kind;i<11;i++)if(e[i]!=' ')return 0;
    if(e[11]!=0x10||u32(e+28))return 0;
    return kind;
}
static int supported;
static int validate_directory(uint32_t dir,unsigned depth,uint32_t parent_dir){
    if(depth>PATH_DEPTH)return bad("Directory nesting exceeds 16");
    uint32_t count;if(!walk(dir,&count))return 0;
    uint8_t buf[512];unsigned dots=0;
    for(uint32_t c=dir;;c=next(c)){
        for(unsigned s=0;s<spc;s++){
            if(!rd(data_lba(c)+s,buf))return 0;
            for(unsigned i=0;i<16;i++){
                uint8_t *e=buf+i*32;if(!e[0])return 1;if(e[0]==0xe5)continue;
                if(e[11]==0x0f){supported=0;continue;}
                if(e[0]=='.'){
                    unsigned kind=dot_kind(e);
                    uint32_t expected=kind==2?parent_dir:dir;
                    if(!depth||!kind||(dots&(1u<<kind))||entry_cluster(e)!=expected)return bad("Invalid dot directory entry");
                    dots|=1u<<kind;continue;
                }
                if(e[11]&8)continue;
                if(e[11]&0xc0)return bad("Invalid directory entry attributes");
                /* A lookup must return exactly this entry, catching duplicate names. */
                struct location first;if(scan(dir,e,&first,0)<=0)return 0;
                if(first.lba!=data_lba(c)+s||first.offset!=i*32)return bad("Duplicate FAT32 short filename");
                uint32_t start=entry_cluster(e),size=u32(e+28),used=0;
                if(e[11]&0x10){
                    if(!valid(start))return bad("Directory without valid cluster");
                    if(!validate_directory(start,depth+1,depth?dir:0))return 0;
                }else{
                    if(start){if(!walk(start,&used))return 0;}else if(size)return bad("File size without cluster chain");
                    if((uint64_t)used*spc*512<size)return bad("File chain shorter than file size");
                }
            }
        }
        if(next(c)>=0x0ffffff8)return 1;
    }
}
int fat_mount(struct block_device *device){
    mounted=writable=read_cached=read_path_cached=0;dev=device;base=0;error="No FAT32 disk mounted";
    stream.valid=0;free_count=0;allocation_hint=2;
    zero(owned,sizeof(owned));zero(dirty,sizeof(dirty));
    if(!dev||!dev->read||!dev->write||!dev->flush||!dev->sectors)return 0;
    if(!rd(0,sector))return 0;
    if(u16(sector+510)!=0xaa55)return bad("Disk has no boot-sector signature");
    /* FAT32 superfloppy or the first explicitly typed FAT32 MBR partition. */
    uint32_t limit=dev->sectors;
    if(u16(sector+11)!=512||sector[16]!=2||u16(sector+17)!=0){
        int found=0;
        for(unsigned i=0;i<4;i++){
            uint8_t *p=sector+446+i*16;
            if(p[4]==0x0b||p[4]==0x0c){
                base=u32(p+8);limit=u32(p+12);
                if(!base||!limit||base>=dev->sectors||limit>dev->sectors-base)return bad("Invalid FAT32 partition bounds");
                found=1;break;
            }
        }
        if(!found)return bad("No supported FAT32 partition");
        if(!rd(base,sector))return 0;
    }
    reserved=u16(sector+14);nfats=sector[16];spc=sector[13];fatsz=u32(sector+36);total=u32(sector+32);
    root_cluster=u32(sector+44)&MASK;fsinfo=u16(sector+48);backup=u16(sector+50);
    uint64_t overhead=(uint64_t)reserved+(uint64_t)nfats*fatsz;
    if(u16(sector+510)!=0xaa55||u16(sector+11)!=512||!spc||spc>128||(spc&(spc-1))||
       !reserved||nfats!=2||u16(sector+17)||u16(sector+19)||u16(sector+22)||u16(sector+40)||u16(sector+42)||
       total>limit||overhead>=total)return bad("Unsupported or malformed FAT32 geometry");
    clusters=(total-(uint32_t)overhead)/spc;
    if(clusters<65525||clusters>MAX_CLUSTERS-2||(uint64_t)fatsz*128<clusters+2||!valid(root_cluster))return bad("Unsupported FAT32 cluster count/root");
    uint8_t media=sector[21];
    uint32_t needed=(clusters+2+127)/128;
    for(uint32_t i=0;i<needed;i++){
        if(!rd(base+reserved+i,sector))return 0;
        for(unsigned j=0;j<128&&i*128+j<clusters+2;j++)fat[i*128+j]=u32(sector+4*j);
        uint8_t other[512];if(!rd(base+reserved+fatsz+i,other))return 0;
        if(!eq(sector,other,512))return bad("FAT copies disagree; run host fsck");
    }
    if((fat[0]&MASK)!=(0x0fffff00u|media)||(fat[1]&0x03ffffffu)!=0x03ffffffu)return bad("Invalid reserved FAT entries");
    int clean=(fat[1]&0x0c000000u)==0x0c000000u;
    supported=1;
    if(!validate_directory(root_cluster,0,0))return 0;
    int lost=0;
    for(uint32_t c=2;c<clusters+2;c++){
        if(!(c%4096))cooperative_checkpoint();
        uint32_t n=next(c);
        if(!n||n==0x0ffffff7)continue;
        if(!(owned[c/8]&(1u<<(c%8))))lost=1;
        if(n<0x0ffffff8&&!valid(n)&&n!=0x0ffffff7)return bad("Invalid FAT entry");
    }
    for(uint32_t c=2;c<clusters+2;c++)if(!next(c))free_count++;
    mounted=1;writable=clean&&supported&&!lost;
    error=writable?"OK":!clean?"Read-only: unclean volume; run host fsck":!supported?"Read-only: long names not supported for writes":"Read-only: lost allocated clusters; run host fsck";
    return 1;
}
struct fs_info fat_info(void){
    struct fs_info i={0,0,0,0,mounted,writable};
    if(mounted){i.sectors=total;i.clusters=clusters;i.cluster_bytes=spc*512;i.free_clusters=free_count;}
    return i;
}
const char *fat_error(void){return error;}
int fat_list_path(const char *path,void (*entry)(const char *,uint32_t,int)){
    if(!mounted)return bad("No FAT32 disk mounted");
    if(!entry)return bad("Missing listing callback");
    uint32_t dir;if(!directory(path,&dir))return 0;uint8_t buf[512];
    for(uint32_t c=dir;;c=next(c)){
        for(unsigned s=0;s<spc;s++){
            if(!rd(data_lba(c)+s,buf))return 0;
            for(unsigned i=0;i<16;i++){
                const uint8_t *e=buf+i*32;if(!e[0])return 1;
                if(e[0]==0xe5||e[0]=='.'||e[11]==0x0f||(e[11]&8))continue;
                char name[13];printable_name(e,name);entry(name,u32(e+28),!!(e[11]&0x10));
            }
        }
        if(next(c)>=0x0ffffff8)return 1;
    }
}
int fat_list(void (*entry)(const char *,uint32_t,int)){return fat_list_path("/",entry);}
int fat_stat(const char *path,uint32_t *size,int *is_dir){
    if(!mounted)return bad("No FAT32 disk mounted");
    if(!path||!size||!is_dir)return bad("Invalid stat arguments");
    if((path[0]=='/'&&!path[1])||(path[0]=='.'&&!path[1])){*size=0;*is_dir=1;return 1;}
    struct location loc;if(!lookup(path,&loc))return 0;*size=u32(loc.e+28);*is_dir=!!(loc.e[11]&0x10);return 1;
}
static int read_entry(const uint8_t *e,uint32_t offset,void *buffer,uint32_t capacity,uint32_t *size){
    if(e[11]&0x10)return bad("Directories are not readable as files");
    uint32_t length=u32(e+28);if(offset>length)return bad("Offset exceeds file size");
    uint32_t remaining=length-offset;if(remaining>capacity)remaining=capacity;
    uint32_t first=entry_cluster(e),c=first,skip=offset/(spc*512),at=0,inside=offset%(spc*512);
    if(read_cached&&read_first==first&&read_length==length&&read_stamp==u32(e+22)&&
       !(read_offset%(spc*512))&&offset>=read_offset&&skip<read_offset/(spc*512)+64){
        uint32_t advance=(offset-read_offset)/(spc*512);
        skip=advance;c=read_next;read_cached=0;
        while(advance--){if(!valid(c))return bad("Invalid file chain");c=next(c);}
    }else{
        read_cached=0;
        while(skip--){if(!(skip%4096))cooperative_checkpoint();if(!valid(c))return bad("Invalid file chain");c=next(c);}
    }
    uint32_t position=offset;
    while(remaining){
        if(!valid(c))return bad("Invalid file chain");
        for(unsigned s=inside/512;s<spc&&remaining;s++){
            if(!rd(data_lba(c)+s,sector))return 0;
            uint32_t start=inside%512,n=512-start;if(n>remaining)n=remaining;
            copy((uint8_t *)buffer+at,sector+start,n);at+=n;remaining-=n;inside=0;
        }
        c=next(c);
    }
    read_first=first;read_next=c;read_offset=position+at;read_length=length;
    read_stamp=u32(e+22);read_cached=1;
    *size=at;return 1;
}
int fat_read_at(const char *name,uint32_t offset,void *buffer,uint32_t capacity,uint32_t *size){
    if(!mounted)return bad("No FAT32 disk mounted");
    if((capacity&&!buffer)||!size)return bad("Invalid read arguments");
    struct location loc;
    if(read_path_cached&&eq(name,read_path,(unsigned)text_length(name)+1))loc=read_entry_cache;
    else{
        unsigned n=(unsigned)text_length(name);if(n>=sizeof(read_path))return bad("Path exceeds 255 bytes");
        if(!lookup(name,&loc))return 0;
        copy(read_path,name,n+1);read_entry_cache=loc;read_path_cached=1;
    }
    return read_entry(loc.e,offset,buffer,capacity,size);
}
int fat_read(const char *name,void *buffer,uint32_t capacity,uint32_t *size){
    if(!mounted)return bad("No FAT32 disk mounted");
    struct location loc;if(!lookup(name,&loc))return 0;
    if(u32(loc.e+28)>capacity)return bad("File exceeds caller buffer capacity; use chunk reads");
    if((capacity&&!buffer)||!size)return bad("Invalid read arguments");
    return read_entry(loc.e,0,buffer,capacity,size);
}
static void setfat(uint32_t c,uint32_t value){
    uint32_t old=next(c),now=value&MASK;
    if(c>=2){if(!old&&now)free_count--;else if(old&&!now)free_count++;}
    fat[c]=(fat[c]&0xf0000000u)|now;dirty[c/128]=1;
}
static int savefat(void){
    for(uint32_t s=0;s<(clusters+2+127)/128;s++)if(dirty[s]){
        /* Preserve FAT entries past our geometry on the final partial sector. */
        if(!rd(base+reserved+s,sector))return 0;
        for(unsigned j=0;j<128&&s*128+j<clusters+2;j++)put32(sector+j*4,fat[s*128+j]);
        for(unsigned f=0;f<nfats;f++)if(!wr(base+reserved+f*fatsz+s,sector))return 0;
        dirty[s]=0;
    }
    return flush();
}
static int info_sector(uint32_t relative,uint32_t free){
    if(!relative||relative>=reserved)return 1;
    if(!rd(base+relative,sector))return 0;
    if(u32(sector)!=0x41615252||u32(sector+484)!=0x61417272||u32(sector+508)!=0xaa550000)return 1;
    put32(sector+488,free);put32(sector+492,0xffffffffu);return wr(base+relative,sector);
}
static int info_update(uint32_t free){
    if(fsinfo==0xffff)return 1;
    if(!info_sector(fsinfo,free))return 0;
    if(backup&&backup!=0xffff&&backup<reserved&&fsinfo<reserved-backup)
        if(!info_sector(backup+fsinfo,free))return 0;
    return flush();
}
static int begin(void){
    stream.valid=0;
    setfat(1,next(1)&~0x08000000u);
    return savefat()&&info_update(0xffffffffu);
}
static int finish(void){
    struct fs_info i=fat_info();
    if(!info_update(i.free_clusters))return 0;
    setfat(1,next(1)|0x0c000000u);
    if(!savefat())return 0;
    error="OK";return 1;
}
static void release(uint32_t c){uint32_t steps=0;while(valid(c)){if(!(steps++%4096))cooperative_checkpoint();uint32_t n=next(c);setfat(c,0);if(n>=0x0ffffff8)break;c=n;}}
/* Allocate a private chain in the in-memory FAT; preflight free space before
 * starting an on-disk transaction. Allocation uses no file-sized arrays. */
static uint32_t allocate(uint32_t needed){
    uint32_t first=0,last=0,examined=0,c=allocation_hint;
    while(examined++<clusters&&needed){
        if(!((examined-1)%4096))cooperative_checkpoint();
        if(!next(c)){
            setfat(c,EOC);if(last)setfat(last,c);else first=c;
            last=c;needed--;
        }
        if(++c>=clusters+2)c=2;
    }
    allocation_hint=c;
    return needed?0:first;
}
/* Identify the real chain tail once on cold access, then cache it for
 * contiguous stream writes. Never trust the byte count to imply FAT links. */
static int chain_tail(uint32_t first,uint32_t *last,uint32_t *count){
    *last=0;*count=0;
    if(!first)return 1;
    uint32_t c=first;
    while(valid(c)&&*count<clusters){
        *last=c;(*count)++;
        if(!(*count%4096))cooperative_checkpoint();
        uint32_t n=next(c);
        if(n>=0x0ffffff8)return 1;
        c=n;
    }
    return bad("Corrupt FAT32 stream chain");
}
/* True append: do not recopy old file contents for each network/download
 * chunk. Old EOF remains visible until new data and FAT links are flushed.
 * In-place append is not an atomic replacement or a journaled transaction. */
static int mutation_ready(void);
static int append(const char *path,const void *buffer,uint32_t bytes){
    if(!mutation_ready())return 0;
    if(bytes&&!buffer)return bad("Invalid append buffer");
    struct location loc;
    if(!lookup(path,&loc))return 0;
    if(loc.e[11]&0x11)return bad("File is read-only or is a directory");
    uint32_t old_size=u32(loc.e+28),first=entry_cluster(loc.e);
    if(bytes>UINT32_MAX-old_size)return bad("FAT32 maximum file size exceeded");
    if(!bytes)return 1;
    uint32_t cluster_bytes=spc*512,last=0,owned_count=0;
    if(stream.valid&&stream.lba==loc.lba&&stream.offset==loc.offset&&
       stream.first==first&&stream.size==old_size){
        last=stream.last;owned_count=stream.count;
    }else if(!chain_tail(first,&last,&owned_count))return 0;
    uint32_t old_needed=old_size/cluster_bytes+!!(old_size%cluster_bytes);
    if(owned_count<old_needed)return bad("Short existing stream chain");
    uint32_t new_size=old_size+bytes;
    uint32_t new_needed=new_size/cluster_bytes+!!(new_size%cluster_bytes);
    uint32_t extra=new_needed>owned_count?new_needed-owned_count:0;
    if(extra>free_count)return bad("Disk full; original file preserved");
    /* Locate the cluster containing EOF. The fast path handles normal files
     * with no reserved excess chain; the slow path supports unusual valid FATs. */
    uint32_t c=0;
    if(old_size&&old_size%cluster_bytes&&owned_count==old_needed)c=last;
    else if(old_size%cluster_bytes||owned_count>old_needed){
        c=first;uint32_t hops=old_size/cluster_bytes;
        while(hops--){if(!valid(c))return bad("Short stream chain");c=next(c);}
    }
    uint32_t new_chain=extra?allocate(extra):0;
    if(extra&&!new_chain)return bad("FAT32 allocation failed");
    if(!begin())return 0;
    if(!c)c=old_size?new_chain:(first?first:new_chain);
    uint32_t inside=old_size%cluster_bytes,at=0;
    const uint8_t *src=buffer;
    while(at<bytes){
        if(!valid(c))return io_bad();
        uint32_t sector_in_cluster=inside/512,sector_offset=inside%512;
        uint8_t out[512];uint32_t n=512-sector_offset;
        if(n>bytes-at)n=bytes-at;
        if(sector_offset){if(!rd(data_lba(c)+sector_in_cluster,out))return 0;}
        else zero(out,512);
        copy(out+sector_offset,src+at,n);
        if(!wr(data_lba(c)+sector_in_cluster,out))return 0;
        inside+=n;at+=n;
        if(inside==cluster_bytes&&at<bytes){
            uint32_t next_cluster=next(c);
            if(next_cluster>=0x0ffffff8&&c==last&&new_chain)next_cluster=new_chain;
            c=next_cluster;inside=0;
        }
    }
    if(!flush())return 0;
    if(extra&&last){setfat(last,new_chain);if(!savefat())return 0;}
    if(!first)first=new_chain;
    put16(loc.e+20,(uint16_t)(first>>16));put16(loc.e+26,(uint16_t)first);
    put32(loc.e+28,new_size);
    if(!publish(&loc)||!finish())return 0;
    uint32_t tail=last;
    if(extra){uint32_t count=0;if(!chain_tail(new_chain,&tail,&count))return 0;}
    stream.lba=loc.lba;stream.offset=loc.offset;stream.first=first;
    stream.size=new_size;stream.last=tail;stream.count=owned_count+extra;stream.valid=1;
    return 1;
}
static int mutation_ready(void){
    read_cached=read_path_cached=0;
    if(!mounted)return bad("No FAT32 disk mounted");
    return writable?1:bad("Volume is read-only; inspect diskinfo and run host fsck if needed");
}
static int target(const char *path,struct location *loc,uint8_t key[11],int *exists){
    uint32_t dir;if(!parent(path,&dir,key))return 0;
    int result=scan(dir,key,loc,0);if(result<0)return 0;*exists=result;
    if(result)return 1;
    result=scan(dir,0,loc,1);return result>0?1:result<0?0:bad("Directory is full; fixed chain capacity");
}
static void make_entry(uint8_t *e,const uint8_t *key,uint32_t first,uint32_t size,uint8_t attr){
    zero(e,32);copy(e,key,11);e[11]=attr;
    put16(e+16,0x21);put16(e+18,0x21);put16(e+24,0x21);
    put16(e+20,(uint16_t)(first>>16));put16(e+26,(uint16_t)first);put32(e+28,size);
}
/* Whole replacement and range writes both publish a complete private chain.
 * A range write preserves untouched bytes and zero-fills any extension gap.
 * No sparse files: enough free space for the entire replacement is required. */
static int replace(const char *path,const void *buffer,uint32_t offset,uint32_t bytes,int partial,const uint8_t *source){
    if(!mutation_ready())return 0;
    if(bytes&&!buffer&&!source)return bad("Invalid write buffer");
    if(offset>0xffffffffu-bytes)return bad("File size overflow");
    struct location loc;uint8_t key[11],old_entry[32];int exists;
    if(!target(path,&loc,key,&exists))return 0;
    if(exists&&(loc.e[11]&0x11))return bad("File is read-only or is a directory");
    copy(old_entry,loc.e,32);
    uint32_t old=exists?entry_cluster(loc.e):0,old_size=exists?u32(loc.e+28):0;
    uint32_t size=offset+bytes;if(partial&&old_size>size)size=old_size;
    if(source)size=u32(source+28);
    uint32_t cluster_bytes=spc*512,needed=size/cluster_bytes+!!(size%cluster_bytes);
    if(fat_info().free_clusters<needed)return bad("Disk full; original file preserved");
    uint32_t first=allocate(needed);
    if(!begin())return 0;
    uint8_t out[512];uint32_t at=0;
    /* Sequential old/source chain cursor avoids quadratic reads on big files. */
    uint32_t input_size=source?size:old_size,input_c=source?entry_cluster(source):old;
    for(uint32_t c=first;valid(c);c=next(c)){
        for(unsigned s=0;s<spc;s++){
            zero(out,512);
            uint32_t n=size-at;if(n>512)n=512;
            if(n&&(source||partial)&&at<input_size){
                if(!valid(input_c))return io_bad();
                if(!rd(data_lba(input_c)+s,out))return 0;
                if(input_size-at<512)zero(out+(input_size-at),512-(input_size-at));
            }
            if(n&&!source){
                uint64_t end=(uint64_t)at+n,patch_end=(uint64_t)offset+bytes;
                uint32_t start=at>offset?at:offset;
                uint32_t stop=(uint32_t)(end<patch_end?end:patch_end);
                if(stop>start)copy(out+start-at,(const uint8_t *)buffer+start-offset,stop-start);
            }
            if(!wr(data_lba(c)+s,out))return 0;
            at+=n;
        }
        if(valid(input_c))input_c=next(input_c);
        if(next(c)>=0x0ffffff8)break;
    }
    if(!flush()||!savefat())return 0;
    make_entry(loc.e,key,first,size,0x20);
    if(!publish(&loc))return 0;
    release(old);return savefat()&&finish();
}
int fat_write(const char *name,const void *buffer,uint32_t size){return replace(name,buffer,0,size,0,0);}
int fat_write_at(const char *name,uint32_t offset,const void *buffer,uint32_t size){
    if(mounted&&size&&offset<=UINT32_MAX-size){
        uint32_t old_size=0;int directory=0;
        if(fat_stat(name,&old_size,&directory)&&!directory&&offset==old_size)
            return append(name,buffer,size);
    }
    return replace(name,buffer,offset,size,1,0);
}
int fat_copy(const char *from,const char *to){
    if(!mutation_ready())return 0;
    struct location src,dst;if(!lookup(from,&src))return 0;
    if(src.e[11]&0x10)return bad("Directory copy is unsupported");
    uint8_t key[11];uint32_t dir;if(!parent(to,&dir,key))return 0;
    int found=scan(dir,key,&dst,0);if(found<0)return 0;if(found)return bad("Destination already exists");
    return replace(to,0,0,0,0,src.e);
}
int fat_remove(const char *name){
    if(!mutation_ready())return 0;
    struct location loc;if(!lookup(name,&loc))return 0;
    if(loc.e[11]&0x11)return bad("File is read-only or is a directory");
    uint32_t old=entry_cluster(loc.e);if(!begin())return 0;
    loc.e[0]=0xe5;if(!publish(&loc))return 0;
    release(old);return savefat()&&finish();
}
int fat_mkdir(const char *path){
    if(!mutation_ready())return 0;
    struct location loc;uint8_t key[11];int exists;
    if(!target(path,&loc,key,&exists))return 0;
    if(exists)return bad("Entry already exists");
    uint32_t parent_dir;if(!parent(path,&parent_dir,key))return 0;
    if(resolved_depth==PATH_DEPTH)return bad("Directory depth limit is 16");
    if(!fat_info().free_clusters)return bad("Disk full");
    uint32_t first=allocate(1);if(!begin())return 0;
    uint8_t buf[512];zero(buf,512);
    uint8_t dot[11];for(unsigned i=0;i<11;i++)dot[i]=' ';dot[0]='.';
    make_entry(buf,dot,first,0,0x10);dot[1]='.';make_entry(buf+32,dot,parent_dir==root_cluster?0:parent_dir,0,0x10);
    if(!wr(data_lba(first),buf))return 0;
    zero(buf,512);
    for(unsigned s=1;s<spc;s++)if(!wr(data_lba(first)+s,buf))return 0;
    if(!flush()||!savefat())return 0;
    make_entry(loc.e,key,first,0,0x10);return publish(&loc)&&finish();
}
int fat_rmdir(const char *path){
    if(!mutation_ready())return 0;
    struct location loc;if(!lookup(path,&loc))return 0;
    if(!(loc.e[11]&0x10)||(loc.e[11]&1))return bad("Not a writable directory");
    uint8_t key[11];uint32_t parent_dir;if(!parent(path,&parent_dir,key))return 0;
    if(parent_dir==root_cluster)parent_dir=0;
    uint32_t first=entry_cluster(loc.e);uint8_t buf[512];int end=0;unsigned dots=0;
    for(uint32_t c=first;!end;c=next(c)){
        for(unsigned s=0;s<spc&&!end;s++){
            if(!rd(data_lba(c)+s,buf))return 0;
            for(unsigned i=0;i<16;i++){
                uint8_t *e=buf+i*32;if(!e[0]){end=1;break;}
                if(e[0]==0xe5)continue;
                unsigned kind=dot_kind(e);
                if(!kind)return bad("Directory is not empty or has malformed dot entries");
                if((dots&(1u<<kind))||entry_cluster(e)!=(kind==2?parent_dir:first))return bad("Invalid dot directory entry");
                dots|=1u<<kind;
            }
        }
        if(next(c)>=0x0ffffff8)break;
    }
    if(!begin())return 0;
    loc.e[0]=0xe5;if(!publish(&loc))return 0;
    release(first);return savefat()&&finish();
}
int fat_rename(const char *from,const char *to){
    if(!mutation_ready())return 0;
    uint8_t oldkey[11],newkey[11];uint32_t a,b;struct location src,dst;
    if(!parent(from,&a,oldkey)||!parent(to,&b,newkey))return 0;
    if(a!=b)return bad("Rename requires the same directory");
    if(!lookup(from,&src))return 0;
    if(src.e[11]&1)return bad("Entry is read-only");
    int found=scan(b,newkey,&dst,0);if(found<0)return 0;if(found)return bad("Destination already exists");
    if(!begin())return 0;
    copy(src.e,newkey,11);return publish(&src)&&finish();
}
int fat_sync(void){if(!mounted)return bad("No FAT32 disk mounted");return flush();}
