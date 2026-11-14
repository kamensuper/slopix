/* Exercise the ACTUAL Ring-3 browser input handlers with a host FAT32 file
 * substitute. This deliberately includes browser.c to test static handlers;
 * no browser behavior is reimplemented here. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "../sdk/slopix.h"
static FILE *slots[4];
static int64_t fake_open(const char *name){
 char path[200];int n=snprintf(path,sizeof(path),"sdk/pages/%s",name);
 if(n<=0||(size_t)n>=sizeof(path))return -1;
 for(int i=1;i<4;i++)if(!slots[i]){slots[i]=fopen(path,"rb");return slots[i]?i:-1;}
 return -1;
}
static int64_t fake_read(int fd,void *buffer,unsigned n){
 if(fd<=0||fd>=4||!slots[fd])return -1;
 return (int64_t)fread(buffer,1,n,slots[fd]);
}
static int64_t fake_close(int fd){if(fd<=0||fd>=4||!slots[fd])return -1;fclose(slots[fd]);slots[fd]=0;return 0;}
static int64_t fake_present(const uint32_t *pixels,unsigned count){(void)pixels;return count;}
static int64_t fake_http_get(const char *url,void *buffer,unsigned n){
 const char *page="<h1>HTTP page</h1><p>TCP data reached Ring-3</p><a href=\"docs/about.htm\">About online</a>";
 if(!strcmp(url,"http://example.com/docs/about.htm"))page="<h1>Online About</h1>";
 else if(strcmp(url,"http://example.com"))return -110;
 if(n<strlen(page)+1)return -90;
 memcpy(buffer,page,strlen(page));return (int64_t)strlen(page);
}
static int64_t fake_gui_open(unsigned w,unsigned h){(void)w;(void)h;return 1;}
static uint64_t fake_gui_poll(void){return 0;}
static void fake_sleep(uint64_t us){(void)us;}
static __attribute__((noreturn)) void fake_exit(int status){fprintf(stderr,"browser exit %d\n",status);abort();}
#define sx_http_get fake_http_get
#define sx_open fake_open
#define sx_read fake_read
#define sx_close fake_close
#define sx_gui_present fake_present
#define sx_gui_open fake_gui_open
#define sx_gui_poll fake_gui_poll
#define sx_time fake_time
#define sx_sleep fake_sleep
#define sx_exit fake_exit
#define _start browser_test_entry
#include "../sdk/browser.c"
#undef _start
#define KEY(v) (((uint64_t)SX_GUI_EVENT_KEY<<32)|(v))
#define MOUSE(x,y) (((uint64_t)SX_GUI_EVENT_MOUSE<<32)|(1ull<<24)|((uint64_t)(y)<<12)|(x))
int main(void){
 navigate("START.HTM",1);
 assert(!strcmp(address,"START.HTM")&&page.count>1);
 /* Mouse focus and type a new local filename. */
 handle_event(MOUSE(135,18));
 assert(address_mode&&replace_address&&edit==9);
 const char *destination="ABOUT.HTM";
 while(*destination)handle_event(KEY((unsigned char)*destination++));
 assert(!strcmp(address,"ABOUT.HTM")&&edit==9);
 handle_event(KEY(SXK_ENTER));
 assert(!address_mode&&!strcmp(address,"ABOUT.HTM"));
 assert(history_count==2&&history_index==1);
 /* Back then forward using the graphical toolbar. */
 handle_event(MOUSE(20,15));
 assert(!strcmp(address,"START.HTM")&&history_index==0);
 handle_event(MOUSE(50,15));
 assert(!strcmp(address,"ABOUT.HTM")&&history_index==1);
 handle_event(MOUSE(20,15));
 /* Click a hyperlink in page body after locating its row. */
 unsigned link=BH_MAX_LINES;
 for(unsigned i=0;i<page.count;i++)if(page.lines[i].href[0]){link=i;break;}
 assert(link!=BH_MAX_LINES&&link<VIEW_ROWS);
 handle_event(MOUSE(55,52+link*29+12));
 assert(!strcmp(address,"ABOUT.HTM"));
 /* Mock network syscall should feed real parser and preserve URL history. */
 handle_event(KEY('/'));
 const char *url="http://example.com";
 while(*url)handle_event(KEY((unsigned char)*url++));
 handle_event(KEY(SXK_ENTER));
 assert(!error[0] && !strcmp(address,"http://example.com"));
 assert(page.count && !strcmp(page.lines[0].text,"HTTP page"));
 char next_url[96];
 assert(resolve_link("http://example.com/docs/a.htm","../new.htm",next_url,sizeof(next_url)));
 assert(!strcmp(next_url,"http://example.com/new.htm"));
 assert(resolve_link("http://example.com/a.htm","/root",next_url,sizeof(next_url)));
 assert(!strcmp(next_url,"http://example.com/root"));
 assert(resolve_link("http://example.com/a.htm","?x=1",next_url,sizeof(next_url)));
 assert(!strcmp(next_url,"http://example.com/a.htm?x=1"));
 unsigned web_link=BH_MAX_LINES;
 for(unsigned i=0;i<page.count;i++)if(page.lines[i].href[0]){web_link=i;break;}
 assert(web_link<BH_MAX_LINES);
 selected=web_link;
 follow_link();
 assert(!strcmp(address,"http://example.com/docs/about.htm"));
 assert(!error[0]&&page.count&&!strcmp(page.lines[0].text,"Online About"));
 navigate("https://example.com",1);
 assert(error[0] && strstr(error,"HTTPS"));
 /* Bad input must not redirect the browser outside its local FAT32 sandbox. */
 navigate("../../SECRETS",1);
 assert(error[0]);
 puts("PASS: real SlopBrowse mouse address/edit/history/link click/HTTP response and HTTPS rejection");
 return 0;
}
