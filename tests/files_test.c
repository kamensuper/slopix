#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/apps/files.c"
#include "../src/clipboard.c"
void*heap_alloc(size_t n){return malloc(n);}int heap_free(void*p){free(p);return 1;}
struct preferences prefs;
static unsigned listed=1,writes,deletes;static int writable=1,fail_io,binary;static uint32_t source_size=4;static char saved[1024],saved_name[13];
void ui_icon(unsigned id,int x,int y,int size){(void)id;(void)x;(void)y;assert(size<=64);}
void logstr(const char*s){(void)s;}size_t length(const char*s){return strlen(s);}void copystr(char*d,const char*s,size_t n){if(n){snprintf(d,n,"%s",s);}}void decimal(uint64_t n,char*s){sprintf(s,"%llu",(unsigned long long)n);}
void rect(int x,int y,int w,int h,uint32_t c){(void)x;(void)y;(void)w;(void)h;(void)c;}
void roundbox(int x,int y,int w,int h,int r,uint32_t c,unsigned a){(void)x;(void)y;(void)w;(void)h;(void)r;(void)c;(void)a;}
void text(int x,int y,const char*s,uint32_t c){(void)x;(void)y;(void)s;(void)c;}
void desktop_open_app(unsigned n){assert(n==0);}int process_spawn(const char*n,uint64_t a){(void)n;(void)a;return 1;}
struct fs_info vfs_info(void){return(struct fs_info){.mounted=1,.writable=writable};}const char*vfs_name(void){return "mock";}const char*vfs_error(void){return "Injected disk full or I/O failure";}
int vfs_list(void(*fn)(const char*,uint32_t,int)){if(fail_io)return 0;for(unsigned i=0;i<listed;i++){char n[13];snprintf(n,sizeof(n),"F%u.TXT",i%1000);fn(n,source_size,0);}return 1;}
int vfs_read(const char*n,void*p,uint32_t cap,uint32_t*sz){(void)n;assert(cap==FS_MAX_FILE);if(fail_io)return 0;memset(p,binary?1:'\n',source_size);*sz=source_size;return 1;}
int vfs_write(const char*n,const void*p,uint32_t sz){if(fail_io)return 0;assert(writable&&sz<sizeof(saved));writes++;copystr(saved_name,n,sizeof(saved_name));memcpy(saved,p,sz);saved[sz]=0;return 1;}
int vfs_remove(const char*n){assert(!strcmp(n,"/F0.TXT"));if(fail_io)return 0;assert(writable);deletes++;return 1;}
int vfs_list_path(const char*p,void(*fn)(const char*,uint32_t,int)){assert(!strcmp(p,"/"));return vfs_list(fn);}
int vfs_read_at(const char*p,uint32_t off,void*b,uint32_t cap,uint32_t*s){assert(!off);return vfs_read(p,b,cap,s);}
int vfs_mkdir(const char*p){(void)p;return !fail_io;}
int vfs_rmdir(const char*p){(void)p;return !fail_io;}
int vfs_rename(const char*a,const char*b){(void)a;(void)b;return !fail_io;}
int vfs_copy(const char*a,const char*b){(void)a;(void)b;return !fail_io;}
int main(void){
 char input[2048];memset(input,'x',sizeof(input));assert(clipboard_set(input,sizeof(input))==sizeof(input));size_t sz;const char*clip=clipboard_get(&sz);assert(sz==sizeof(input)&&clip[sizeof(input)]==0);assert(clipboard_set("a\001\n",3)==3&&!strcmp(clipboard_get(0),"a?\n"));assert(!clipboard_set(0,1));
 files_open();assert(count==1&&mode==BROWSE);files_draw(0,0,640,480);files_mouse(580,90,640,480);files_draw(0,0,640,480);assert(icon_view&&columns==4);files_context(50,140,640,480);assert(context);files_key(KEY_DOWN);files_key(KEY_ENTER);assert(!strcmp(clipboard_get(0),"F0.TXT"));files_mouse(580,90,640,480);assert(!icon_view);listed=140;files_key(KEY_REFRESH);assert(count==128&&truncated);listed=1;files_key(KEY_REFRESH);
 binary=1;files_key(KEY_ENTER);assert(mode==BROWSE&&strstr(message,"binary"));binary=0;source_size=FS_MAX_FILE;files_key(KEY_ENTER);assert(mode==VIEW&&line_count==4096&&truncated);files_key(KEY_COPY);assert(strlen(clipboard_get(0))==FS_MAX_FILE);files_key(KEY_END);files_key(KEY_PGDN);files_draw(0,0,640,437);files_key(KEY_ESCAPE);
 writable=0;create_begin();assert(mode==BROWSE);delete_begin();assert(mode==BROWSE);writable=1;
 create_begin();for(unsigned i=0;i<2000;i++)files_key('A');assert(name_len==12);for(unsigned i=0;i<2000;i++)files_key(KEY_BACKSPACE);assert(!name_len);const char*n="NEW.TXT";while(*n)files_key(*n++);files_key(KEY_TAB);clipboard_set(input,sizeof(input));files_key(KEY_PASTE);files_key(KEY_PASTE);for(unsigned i=0;i<2000;i++)files_key('Z');assert(edit_len==1023&&edit[1023]==0);fail_io=1;create_save();assert(mode==CREATE&&!writes);fail_io=0;create_save();assert(mode==BROWSE&&writes==1&&!strcmp(saved_name,"/NEW.TXT")&&strlen(saved)==1023);
 create_begin();n="f0.txt";while(*n)files_key(*n++);create_save();assert(mode==CREATE&&writes==1&&strstr(message,"already exists"));files_key(KEY_ESCAPE);
 delete_begin();assert(mode==CONFIRM&&!deletes);files_key(KEY_ESCAPE);assert(mode==BROWSE&&!deletes);delete_begin();fail_io=1;files_key(KEY_ENTER);assert(mode==CONFIRM&&!deletes);fail_io=0;files_key(KEY_ENTER);assert(deletes==1&&mode==BROWSE);
 fail_io=1;files_open();assert(!count);puts("PASS: FileSlop bounds, read-only/full/failure paths, no overwrite, confirmation, listing/text limits, filtered bounded clipboard (host ASan/UBSan)");
}
