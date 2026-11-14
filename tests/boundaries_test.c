#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../src/ui/desktop_backend.h"
#include "../src/auth.h"
/* This boundary test selects an already-authorized fake desktop. */
void auth_init(void){}
int auth_active(void){return 0;}
void auth_render(void){}
void auth_step(uint64_t t){(void)t;}
void auth_mouse(int x,int y,int b){(void)x;(void)y;(void)b;}
void auth_key(unsigned k){(void)k;}
void auth_resized(void){}
#include "../src/fs/vfs.h"
static unsigned calls;
static void init(void){calls++;}static void render(void){calls++;}static void step(uint64_t n){assert(n==42);calls++;}
static void mouse(int x,int y,int b){assert(x==1&&y==2&&b==3);calls++;}
static void key(unsigned k){assert(k==9);calls++;}static void resized(unsigned a,unsigned b){assert(a==800&&b==600);calls++;}
static void scan(unsigned a,int b,int c){assert(a==5&&b==1&&c==0);calls++;}
static void openapp(unsigned a){assert(a==2);calls++;}static unsigned count(void){return 3;}static unsigned state(unsigned id){return id==2?1:0;}static int yes(void){return 1;}
const struct desktop_backend slopde_backend={"test",init,render,step,mouse,key,key,resized,render,scan,openapp,count,state,yes,yes};
static struct fs_info info(void){return(struct fs_info){.mounted=1,.writable=1};}static const char*error(void){return "backend error";}
static int listing(void(*fn)(const char*,uint32_t,int)){fn("TEST.TXT",4,0);return 1;}
static int reading(const char*n,void*p,uint32_t cap,uint32_t*size){assert(!strcmp(n,"TEST.TXT")&&cap>=4);memcpy(p,"data",4);*size=4;return 1;}
static int writing(const char*n,const void*p,uint32_t nbytes){assert(!strcmp(n,"TEST.TXT")&&nbytes==4&&!memcmp(p,"data",4));return 1;}
static int removing(const char*n){return !strcmp(n,"TEST.TXT");}static int syncfs(void){return 1;}
static void listed(const char*n,uint32_t size,int dir){assert(!strcmp(n,"TEST.TXT")&&size==4&&!dir);}
int main(void){
 assert(!desktop_backend_select(0));assert(desktop_backend_select(&slopde_backend));desktop_init();assert(!desktop_backend_select(&slopde_backend));
 desktop_render();desktop_step(42);desktop_mouse(1,2,3);desktop_key(9);desktop_shortcut(9);desktop_resized(800,600);desktop_background_changed();desktop_scancode(5,1,0);desktop_open_app(2);assert(calls==10);assert(desktop_open_count()==3&&desktop_app_state(2)==1&&desktop_find_focused()&&desktop_doom_focused());
 assert(!vfs_info().mounted&&!strcmp(vfs_name(),"Unavailable"));assert(!vfs_bind(0));
 static const struct fs_backend fs={.name="testfs",.info=info,.error=error,.list=listing,.read=reading,.write=writing,.remove=removing,.sync=syncfs};assert(vfs_bind(&fs)&&!vfs_bind(&fs));
 char buf[8];uint32_t size;assert(vfs_info().writable&&!strcmp(vfs_name(),"testfs"));assert(vfs_list(listed));assert(vfs_read("TEST.TXT",buf,sizeof(buf),&size)&&size==4);assert(vfs_write("TEST.TXT",buf,size));assert(vfs_remove("TEST.TXT")&&vfs_sync());
 assert(!vfs_read("TEST.TXT",0,4,&size)&&!vfs_read("TEST.TXT",buf,FS_MAX_FILE+1,&size)&&!vfs_write("TEST.TXT",0,4));
 puts("PASS: boot-only desktop selection, routed input/display/app lifecycle, filesystem binding/delegation and invalid buffer limits; host only");
}
