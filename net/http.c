#include "http.h"
static int digit(char c){return c>='0'&&c<='9';}
static int token(char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||digit(c)||c=='-'||c=='.';}
static int put(char *out,size_t cap,size_t *n,char c){if(*n+1>=cap)return 0;out[(*n)++]=c;out[*n]=0;return 1;}
int http_parse_url(const char *url,char *host,size_t hc,char *path,size_t pc,unsigned *port){
 if(!url||!host||!path||!port||hc<2||pc<2)return 0;
 const char *p=url;const char *scheme="http://";while(*scheme){if(*p++!=*scheme++)return 0;}
 size_t n=0;while(token(*p)){if(!put(host,hc,&n,*p++))return 0;}
 if(!n||host[n-1]=='.'||host[0]=='.')return 0;
 *port=80;if(*p==':'){p++;unsigned value=0,count=0;while(digit(*p)){if(++count>5)return 0;value=value*10+(*p++-'0');}if(!count||!value||value>65535)return 0;*port=value;}
 if(*p&&*p!='/')return 0;
 n=0;if(!*p)return put(path,pc,&n,'/');
 while(*p){unsigned char c=(unsigned char)*p++;if(c<=32||c>=127||c=='#'||c=='\\')return 0;if(!put(path,pc,&n,(char)c))return 0;}
 return 1;
}
int http_make_request(const char *host,const char *path,char *out,size_t cap){
 if(!host||!path||!out||!*host||*path!='/')return 0;
 size_t n=0;const char *pieces[]={"GET ",path," HTTP/1.0\r\nHost: ",host,"\r\nConnection: close\r\nAccept: text/html\r\n\r\n"};
 for(unsigned i=0;i<5;i++)for(const char*p=pieces[i];*p;p++){if(*p=='\r'||*p=='\n'){if(i!=2&&i!=4)return 0;}else if((unsigned char)*p<32||(unsigned char)*p>126)return 0;if(!put(out,cap,&n,*p))return 0;}
 return (int)n;
}
static int eqi(unsigned char a,unsigned char b){
 if(a>='A'&&a<='Z')a+=32;
 if(b>='A'&&b<='Z')b+=32;
 return a==b;
}
static int field(const unsigned char*p,size_t len,const char *name){
 size_t n=0;while(name[n])n++;
 if(n>=len||p[n]!=':')return 0;
 for(size_t i=0;i<n;i++)if(!eqi(p[i],(unsigned char)name[i]))return 0;
 return 1;
}
int http_parse_response(const unsigned char *b,size_t len,struct http_response *r){
 if(!b||!r||len<16||len>1048576)return 0;
 const char *prefix="HTTP/1.";for(unsigned i=0;i<7;i++)if(b[i]!=(unsigned char)prefix[i])return 0;
 if((b[7]!='0'&&b[7]!='1')||b[8]!=' '||!digit(b[9])||!digit(b[10])||!digit(b[11])||b[12]!=' ')return 0;
 size_t end=0;for(size_t i=12;i+3<len;i++)if(b[i]=='\r'&&b[i+1]=='\n'&&b[i+2]=='\r'&&b[i+3]=='\n'){end=i+4;break;}
 if(!end||end>16384)return 0;
 for(size_t i=0;i<end;i++)if(b[i]=='\n'&&(i==0||b[i-1]!='\r'))return 0;
 *r=(struct http_response){0};
 r->status=(unsigned)(b[9]-'0')*100u+(unsigned)(b[10]-'0')*10u+(unsigned)(b[11]-'0');
 r->header_bytes=end;r->body_bytes=len-end;
 /* Header name matching is anchored at line beginnings. */
 size_t pos=0;
 while(pos+1<end&&!(b[pos]=='\r'&&b[pos+1]=='\n'))pos++;
 if(pos+1>=end)return 0;
 pos+=2;
 while(pos+1<end&&!(b[pos]=='\r'&&b[pos+1]=='\n')){
  size_t last=pos;while(last+1<end&&!(b[last]=='\r'&&b[last+1]=='\n'))last++;
  if(last+1>=end)return 0;
  size_t value=pos;while(value<last&&b[value]!=':')value++;
  if(value==last)return 0;
  value++;while(value<last&&(b[value]==' '||b[value]=='\t'))value++;
  if(field(b+pos,last-pos,"transfer-encoding")){
   if(last-value!=7)return 0;
   const char *word="chunked";for(unsigned i=0;i<7;i++)if(!eqi(b[value+i],(unsigned char)word[i]))return 0;
   r->chunked=1;
  }else if(field(b+pos,last-pos,"content-length")){
   if(value==last)return 0;
   size_t length=0;for(size_t i=value;i<last;i++){
    if(!digit((char)b[i])||length>(1048576u-(size_t)(b[i]-'0'))/10u)return 0;
    length=length*10+(b[i]-'0');
   }
   if(r->content_length_present&&r->content_length!=length)return 0;
   r->content_length_present=1;r->content_length=length;
  }else if(field(b+pos,last-pos,"location")){
   size_t n=last-value;if(!n||n>=sizeof(r->location))return 0;
   for(size_t i=0;i<n;i++){if(b[value+i]<33||b[value+i]>126)return 0;r->location[i]=(char)b[value+i];}
   r->location[n]=0;
  }
  pos=last+2;
 }
 if(r->chunked&&r->content_length_present)return 0; /* ambiguous message framing */
 return 1;
}
static int hex(unsigned char c){if(c>='0'&&c<='9')return c-'0';if(c>='a'&&c<='f')return c-'a'+10;if(c>='A'&&c<='F')return c-'A'+10;return -1;}
int http_decode_body(const unsigned char*b,size_t len,const struct http_response*r,unsigned char*out,size_t cap){
 if(!b||!r||!out||r->header_bytes>len)return -71;
 size_t pos=r->header_bytes,written=0;
 if(!r->chunked){
  size_t n=len-pos;
  if(r->content_length_present){if(n<r->content_length)return -71;n=r->content_length;}
  if(n>cap)return -90;
  for(size_t i=0;i<n;i++)out[i]=b[pos+i];
  return (int)n;
 }
 /* RFC 7230 chunked body; reject malformed framing and truncated chunks. */
 for(unsigned chunks=0;chunks<4096;chunks++){
  size_t count=0;int digits=0;
  while(pos<len&&hex(b[pos])>=0){int d=hex(b[pos++]);if(count>(1048576u-(size_t)d)/16u)return -90;count=count*16+(unsigned)d;digits++;}
  if(!digits)return -71;
  /* Accept bounded RFC chunk extensions, without interpreting them. */
  if(pos<len&&b[pos]==';'){
   unsigned ext=0;while(pos<len&&b[pos]!='\r'&&ext++<256){if(b[pos]<32||b[pos]>126)return -71;pos++;}
   if(ext>256)return -71;
  }
  if(pos+1>=len||b[pos]!='\r'||b[pos+1]!='\n')return -71;
  pos+=2;
  if(count==0){
   if(pos+1>=len)return -71;
   if(b[pos]=='\r'&&b[pos+1]=='\n')return (int)written;
   /* Trailers are not implemented; rejecting them is safer than accepting malformed data. */
   return -95;
  }
  if(count>len-pos||count>cap-written)return count>cap-written?-90:-71;
  for(size_t i=0;i<count;i++)out[written+i]=b[pos+i];
  written+=count;pos+=count;
  if(pos+1>=len||b[pos]!='\r'||b[pos+1]!='\n')return -71;
  pos+=2;
 }
 return -71;
}
