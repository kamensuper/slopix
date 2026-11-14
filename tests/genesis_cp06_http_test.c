/* Decode real HTTP framing, not merely status-line strings. */
#include "../net/http.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static void success(const char *wire,const char *expected){
 struct http_response r;unsigned char body[1024]={0};
 size_t len=strlen(wire);
 assert(http_parse_response((const unsigned char*)wire,len,&r));
 int got=http_decode_body((const unsigned char*)wire,len,&r,body,sizeof body);
 assert(got==(int)strlen(expected));assert(!memcmp(body,expected,(size_t)got));
}
int main(void){
 success("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n","Wikipedia");
 success("HTTP/1.1 200 OK\r\nTrAnSfEr-EnCoDiNg: ChUnKeD\r\n\r\n3;foo=bar\r\na<b\r\n0\r\n\r\n","a<b");
 success("HTTP/1.0 200 OK\r\nContent-Length: 4\r\n\r\nABCDignored","ABCD");
 success("HTTP/1.0 200 OK\r\n\r\ncontent","content");
 struct http_response r;unsigned char out[1024];
 const char *short_body="HTTP/1.1 200 OK\r\nContent-Length: 99\r\n\r\nshort";
 assert(http_parse_response((const unsigned char*)short_body,strlen(short_body),&r));
 assert(http_decode_body((const unsigned char*)short_body,strlen(short_body),&r,out,sizeof out)==-71);
 const char *bad="HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nx\r\n0\r\n\r\n";
 assert(http_parse_response((const unsigned char*)bad,strlen(bad),&r));
 assert(http_decode_body((const unsigned char*)bad,strlen(bad),&r,out,sizeof out)==-71);
 const char *over="HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nWiki\r\n0\r\n\r\n";
 assert(http_parse_response((const unsigned char*)over,strlen(over),&r));
 assert(http_decode_body((const unsigned char*)over,strlen(over),&r,out,3)==-90);
 const char *ambig="HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Length: 5\r\n\r\n";
 assert(!http_parse_response((const unsigned char*)ambig,strlen(ambig),&r));
 const char *dup="HTTP/1.1 200 OK\r\nContent-Length: 5\r\nContent-Length: 6\r\n\r\nabcdef";
 assert(!http_parse_response((const unsigned char*)dup,strlen(dup),&r));
 const char *redir="HTTP/1.1 302 Found\r\nLocation: /next\r\nContent-Length: 0\r\n\r\n";
 assert(http_parse_response((const unsigned char*)redir,strlen(redir),&r));
 assert(r.status==302&&!strcmp(r.location,"/next"));
 puts("PASS: HTTP/1.0 + HTTP/1.1 Content-Length, chunked encoding, malformed framing, Location");
}
