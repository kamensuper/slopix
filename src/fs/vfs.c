#include "vfs.h"
static const struct fs_backend*active;
int vfs_bind(const struct fs_backend*b){if(active||!b||!b->name||!b->info||!b->error||!b->list||!b->read||!b->write||!b->remove||!b->sync)return 0;active=b;return 1;}
const char*vfs_name(void){return active?active->name:"Unavailable";}
struct fs_info vfs_info(void){return active?active->info():(struct fs_info){0};}
const char*vfs_error(void){return active?active->error():"No filesystem backend";}
int vfs_list(void(*entry)(const char*,uint32_t,int)){return active&&entry?active->list(entry):0;}
int vfs_read(const char*n,void*b,uint32_t cap,uint32_t*size){return active&&n&&b&&size&&cap<=FS_MAX_FILE?active->read(n,b,cap,size):0;}
int vfs_write(const char*n,const void*b,uint32_t size){return active&&n&&(b||!size)&&size<=FS_MAX_FILE?active->write(n,b,size):0;}
int vfs_remove(const char*n){return active&&n?active->remove(n):0;}
int vfs_sync(void){return active?active->sync():0;}

int vfs_stat(const char*p,uint32_t*s,int*d){return active&&active->stat&&p&&s&&d?active->stat(p,s,d):0;}
int vfs_list_path(const char*p,void(*e)(const char*,uint32_t,int)){return active&&active->list_path&&p&&e?active->list_path(p,e):0;}
int vfs_read_at(const char*p,uint32_t o,void*b,uint32_t c,uint32_t*s){return active&&active->read_at&&p&&(b||!c)&&s?active->read_at(p,o,b,c,s):0;}
int vfs_write_at(const char*p,uint32_t o,const void*b,uint32_t s){return active&&active->write_at&&p&&(b||!s)?active->write_at(p,o,b,s):0;}
int vfs_mkdir(const char*p){return active&&active->mkdir&&p?active->mkdir(p):0;}
int vfs_rmdir(const char*p){return active&&active->rmdir&&p?active->rmdir(p):0;}
int vfs_rename(const char*a,const char*b){return active&&active->rename&&a&&b?active->rename(a,b):0;}
int vfs_copy(const char*a,const char*b){return active&&active->copy&&a&&b?active->copy(a,b):0;}
