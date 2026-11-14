#include "../net/http.h"
#include <assert.h>
#include <string.h>
int main(void){char host[128],path[256],request[512];unsigned port=0;struct http_response r;
 assert(http_parse_url("http://example.org:8080/a/b",host,sizeof host,path,sizeof path,&port));assert(!strcmp(host,"example.org")&&port==8080&&!strcmp(path,"/a/b"));
 assert(!http_parse_url("https://example.org/",host,sizeof host,path,sizeof path,&port));
 assert(!http_parse_url("http://x:99999/",host,sizeof host,path,sizeof path,&port));
 assert(!http_parse_url("http://x/hello\r\nInjected:yes",host,sizeof host,path,sizeof path,&port));
 assert(http_make_request("example.org","/",request,sizeof request)>0);assert(strstr(request,"Connection: close\r\n"));
 const unsigned char good[]="HTTP/1.0 200 OK\r\nContent-Type: text/html\r\n\r\nhello";
 assert(http_parse_response(good,sizeof good-1,&r)&&r.status==200&&r.body_bytes==5);
 assert(!http_parse_response((const unsigned char*)"HTTP/1.1 200 OK\n\nhi",19,&r));
 return 0;}
