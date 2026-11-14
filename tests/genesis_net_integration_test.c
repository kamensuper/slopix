/* Deterministic mock RTL8139 wire-level integration test.
 * Transmits and checks actual outbound packets produced by stack.c;
 * responds with serialized ARP, UDP/DNS, and TCP Ethernet frames. It proves
 * stack logic without pretending hardware/QEMU is verified. */
#include "../src/net/stack.h"
#include "../src/net/rtl8139.h"
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define IP4(a,b,c,d) ((uint32_t)(a)<<24|(uint32_t)(b)<<16|(uint32_t)(c)<<8|(d))
#define CLIENT_IP IP4(10,0,2,15)
#define SERVER_IP IP4(10,0,2,2)
#define DNS_IP IP4(10,0,2,3)
static uint8_t cmac[6]={0x52,0x54,0,0x12,0x34,0x56},smac[6]={0x52,0x54,0,0xab,0xcd,0xef};
static uint8_t queue[16][1514];static unsigned sizes[16],head,tail,arp_count,dns_count,syn_count,get_count;
static uint64_t now;
static uint16_t r16(const uint8_t*p){return (uint16_t)((unsigned)p[0]<<8|p[1]);}
static uint32_t r32(const uint8_t*p){return (uint32_t)p[0]<<24|(uint32_t)p[1]<<16|(uint32_t)p[2]<<8|p[3];}
static void w16(uint8_t*p,uint16_t n){p[0]=(uint8_t)(n>>8);p[1]=(uint8_t)n;}
static void w32(uint8_t*p,uint32_t n){p[0]=(uint8_t)(n>>24);p[1]=(uint8_t)(n>>16);p[2]=(uint8_t)(n>>8);p[3]=(uint8_t)n;}
static uint16_t pseudo(uint32_t src,uint32_t dst,uint8_t proto,const uint8_t*p,unsigned n){
 uint32_t sum=(src>>16)+(src&65535)+(dst>>16)+(dst&65535)+proto+n;
 for(unsigned i=0;i+1<n;i+=2)sum+=r16(p+i);
 if(n&1)sum+=(uint16_t)p[n-1]<<8;
 while(sum>>16)sum=(sum&65535)+(sum>>16);
 return (uint16_t)~sum;
}
static void schedule(uint16_t etype,uint32_t source,unsigned protocol,const uint8_t*data,unsigned count){
 assert(tail<head+16);
 uint8_t*e=queue[tail%16];
 memcpy(e,cmac,6);memcpy(e+6,smac,6);w16(e+12,etype);
 unsigned size=count+14;
 if(etype==0x800){
  uint8_t*h=e+14;h[0]=0x45;h[1]=0;w16(h+2,(uint16_t)(20+count));w16(h+4,3);w16(h+6,0x4000);
  h[8]=64;h[9]=(uint8_t)protocol;w16(h+10,0);w32(h+12,source);w32(h+16,CLIENT_IP);
  w16(h+10,net_checksum(h,20));memcpy(h+20,data,count);size+=20;
 }else memcpy(e+14,data,count);
 sizes[tail%16]=size;tail++;
}
static void reply_tcp(const uint8_t*out,uint32_t src,unsigned flags,const uint8_t*data,unsigned size){
 assert(size<512);uint8_t p[532]={0};
 w16(p,r16(out+2));w16(p+2,r16(out));w32(p+4,src);
 w32(p+8,r32(out+4)+(unsigned)((out[13]&2)!=0)+(unsigned)((out[13]&1)!=0)+((out[12]>>4)==5?0:0));
 p[12]=0x50;p[13]=(uint8_t)flags;w16(p+14,32768);
 for(unsigned i=0;i<size;i++)p[i+20]=data[i];
 /* RFC 793: ACK after SYN or payload bytes. */
 if(size==0){};
 w16(p+16,pseudo(SERVER_IP,CLIENT_IP,6,p,size+20));schedule(0x800,SERVER_IP,6,p,size+20);
}
int rtl8139_init(void){return 1;}
int rtl8139_ready(void){return 1;}
const uint8_t*rtl8139_mac(void){return cmac;}
void rtl8139_poll(void(*cb)(const uint8_t*,unsigned)){
 if(head!=tail){unsigned i=head%16;head++;cb(queue[i],sizes[i]);}
}
int rtl8139_send(const uint8_t*p,unsigned n){
 assert(n>=14&&n<=1514);
 uint16_t type=r16(p+12);
 if(type==0x806){
  assert(n>=42&&r16(p+20)==1);arp_count++;
  uint8_t a[28]={0};w16(a,1);w16(a+2,0x800);a[4]=6;a[5]=4;w16(a+6,2);
  memcpy(a+8,smac,6);w32(a+14,r32(p+38));memcpy(a+18,cmac,6);w32(a+24,CLIENT_IP);
  schedule(0x806,0,0,a,sizeof a);return 1;
 }
 assert(type==0x800&&n>=14+20);const uint8_t*ip=p+14;
 assert(net_checksum(ip,20)==0&&r32(ip+12)==CLIENT_IP);
 unsigned proto=ip[9];const uint8_t*b=ip+20;
 if(proto==17){
  assert(r16(b+2)==53&&r32(ip+16)==DNS_IP);dns_count++;
  unsigned len=r16(b+4);assert(len>20&&len<500);
  uint8_t packet[512]={0};w16(packet,53);w16(packet+2,r16(b));
  memcpy(packet+8,b+8,len-8);
  unsigned dnslen=len-8;packet[8+2]=0x81;packet[8+3]=0x80;
  w16(packet+8+6,1); /* answers */
  unsigned off=8+dnslen;w16(packet+off,0xc00c);w16(packet+off+2,1);w16(packet+off+4,1);
  w32(packet+off+6,30);w16(packet+off+10,4);w32(packet+off+12,SERVER_IP);
  schedule(0x800,DNS_IP,17,packet,off+16); /* fix UDP total length */
  w16(queue[(tail-1)%16]+14+20+4,(uint16_t)(off+16));
  return 1;
 }
 if(proto==6){
  assert(r16(b+2)==8000||r16(b+2)==80);
  assert(!pseudo(CLIENT_IP,SERVER_IP,6,b,r16(ip+2)-20));
  if(b[13]&2){syn_count++;reply_tcp(b,1000,0x12,0,0);return 1;}
  if(b[13]&8){
   get_count++;
   unsigned count=r16(ip+2)-40;
   assert(count>=4&&!memcmp(b+20,"GET ",4));
   static const char ordinary[]="HTTP/1.0 200 OK\r\nContent-Type: text/html\r\n\r\n<h1>Slopix on HTTP</h1>";
   static const char chunked[]="HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n";
   static const char redirect[]="HTTP/1.0 302 Found\r\nLocation: /demo\r\nContent-Length: 0\r\n\r\n";
   const char *response=ordinary;
   if(count>strlen("GET /chunk ")&&!memcmp(b+20,"GET /chunk ",strlen("GET /chunk ")))response=chunked;
   if(count>strlen("GET /redirect ")&&!memcmp(b+20,"GET /redirect ",strlen("GET /redirect ")))response=redirect;
   unsigned length=(unsigned)strlen(response);
   uint8_t packet[512]={0};w16(packet,r16(b+2));w16(packet+2,r16(b));w32(packet+4,1001);
   w32(packet+8,r32(b+4)+count);packet[12]=0x50;packet[13]=(response==ordinary)?0x19:0x18;w16(packet+14,32768);
   memcpy(packet+20,response,length);
   w16(packet+16,pseudo(SERVER_IP,CLIENT_IP,6,packet,20+length));
   schedule(0x800,SERVER_IP,6,packet,20+length);return 1;
  }
  return 1;
 }
 assert(!"unexpected network packet");return 0;
}
uint64_t timer_us(void){now+=250;return now;}
void audio_checkpoint(void){}
void logstr(const char*s){(void)s;}
int main(void){
 net_init();assert(net_ready());uint8_t body[1024]={0};
 int n=net_http_get("http://slopix.test:8000/demo",body,sizeof(body));
 assert(n==(int)strlen("<h1>Slopix on HTTP</h1>"));
 assert(!memcmp(body,"<h1>Slopix on HTTP</h1>",(unsigned)n));
 assert(arp_count>=2&&dns_count>=1&&syn_count==1&&get_count==1);
 n=net_http_get("http://slopix.test:8000/chunk",body,sizeof(body));
 assert(n==9&&!memcmp(body,"Wikipedia",9));
 n=net_http_get("http://slopix.test:8000/redirect",body,sizeof(body));
 assert(n==(int)strlen("<h1>Slopix on HTTP</h1>"));
 assert(!memcmp(body,"<h1>Slopix on HTTP</h1>",(unsigned)n));
 assert(get_count==4 && syn_count==4);
 printf("PASS: simulated ARP + IPv4 + DNS + TCP handshake + HTTP, chunked body, redirect (%d bytes)\n",n);
 return 0;
}
