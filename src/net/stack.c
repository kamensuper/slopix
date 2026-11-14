/* SPDX-License-Identifier: GPL-3.0-or-later
 * Experimental single-connection IPv4 stack for QEMU user networking:
 * Ethernet, ARP, IPv4, UDP/DNS, TCP client with in-order receive/ACK/FIN.
 * Strict limits: unfragmented packets; one active TCP request; no TLS;
 * no server sockets, ICMP or TCP congestion/window scaling. This is NOT a
 * general-purpose production TCP/IP stack. Every blocking wait is bounded.
 */
#include "stack.h"
#include "rtl8139.h"
#include "../../net/http.h"
#include "../kernel.h"
#include "../audio/audio.h"
#define ETH_MAX 1514u
#define IP4(a,b,c,d) ((uint32_t)(a)<<24|(uint32_t)(b)<<16|(uint32_t)(c)<<8|(d))
#define TCP_MSS 1300u
#define HTTP_MAX (32768u+4096u)
#define WAIT_US 1200000ull
static uint32_t ip=IP4(10,0,2,15),mask=IP4(255,255,255,0),gateway=IP4(10,0,2,2),dns=IP4(10,0,2,3);
static uint32_t arp_ip;static uint8_t arp_mac[6];static int arp_valid,online;
static uint16_t ip_id=1,udp_source=41000;
static uint8_t http_data[HTTP_MAX];
static uint8_t http_probe[32768]; /* bounded completion check for keep-alive peers */
static struct {
 uint32_t peer,our_seq,peer_seq;
 uint16_t source,port;
 unsigned state,received; /* 0 idle 1 syn sent 2 established 3 peer closed */
 int bad,overflow;
} tcp;
static struct {uint16_t id;uint32_t address;int done;} query;
static uint8_t broadcast[6]={255,255,255,255,255,255};
static uint16_t rd16(const uint8_t*p){return (uint16_t)((unsigned)p[0]<<8|p[1]);}
static uint32_t rd32(const uint8_t*p){return (uint32_t)p[0]<<24|(uint32_t)p[1]<<16|(uint32_t)p[2]<<8|p[3];}
static void wr16(uint8_t*p,uint16_t n){p[0]=(uint8_t)(n>>8);p[1]=(uint8_t)n;}
static void wr32(uint8_t*p,uint32_t n){p[0]=(uint8_t)(n>>24);p[1]=(uint8_t)(n>>16);p[2]=(uint8_t)(n>>8);p[3]=(uint8_t)n;}
uint16_t net_checksum(const uint8_t*p,unsigned n){
 uint32_t sum=0;for(unsigned j=0;j+1<n;j+=2)sum+=rd16(p+j);
 if(n&1)sum+=(uint16_t)p[n-1]<<8;
 while(sum>>16)sum=(sum&65535)+(sum>>16);
 return (uint16_t)~sum;
}
static uint16_t transport_sum(uint32_t src,uint32_t dst,unsigned protocol,const uint8_t*b,unsigned n){
 uint32_t sum=(src>>16)+(src&65535)+(dst>>16)+(dst&65535)+protocol+n;
 for(unsigned i=0;i+1<n;i+=2)sum+=rd16(b+i);
 if(n&1)sum+=(uint16_t)b[n-1]<<8;
 while(sum>>16)sum=(sum&65535)+(sum>>16);
 return (uint16_t)~sum;
}
static int send_eth(const uint8_t*dest,uint16_t type,const uint8_t*payload,unsigned n){
 if(n+14>ETH_MAX)return 0;
 uint8_t packet[ETH_MAX];for(unsigned i=0;i<6;i++){packet[i]=dest[i];packet[i+6]=rtl8139_mac()[i];}
 wr16(packet+12,type);for(unsigned i=0;i<n;i++)packet[i+14]=payload[i];
 return rtl8139_send(packet,n+14);
}
static void request_arp(uint32_t target){
 uint8_t p[28]={0};wr16(p,1);wr16(p+2,0x800);p[4]=6;p[5]=4;wr16(p+6,1);
 for(unsigned i=0;i<6;i++)p[8+i]=rtl8139_mac()[i];
 wr32(p+14,ip);wr32(p+24,target);
 (void)send_eth(broadcast,0x806,p,28);
}
static uint32_t route(uint32_t dst){return (dst&mask)==(ip&mask)?dst:gateway;}
static void received(const uint8_t*f,unsigned n);
void net_poll(void){if(online)rtl8139_poll(received);}
static int wait_until(int (*pred)(void),uint64_t usec){
 uint64_t start=timer_us();unsigned guard=3000000;
 while(--guard){net_poll();audio_checkpoint();if(pred())return 1;
  if(timer_us()-start>=usec)return 0;
  __asm__ volatile("hlt"); /* PIT wakes at 1 kHz; NIC IRQ intentionally masked */
 }
 return 0;
}
static int arp_pred(void){return arp_valid;}
static int resolve(uint32_t target){
 uint32_t via=route(target);if(arp_valid&&arp_ip==via)return 1;
 arp_valid=0;arp_ip=via;
 for(unsigned tries=0;tries<3;tries++){request_arp(via);if(wait_until(arp_pred,WAIT_US))return 1;}
 return 0;
}
static int ipv4_send(uint32_t peer,unsigned protocol,const uint8_t*data,unsigned size){
 if(size>1480||!resolve(peer))return 0;
 uint8_t p[1500];p[0]=0x45;p[1]=0;wr16(p+2,(uint16_t)(size+20));wr16(p+4,ip_id++);
 wr16(p+6,0x4000);p[8]=64;p[9]=(uint8_t)protocol;wr16(p+10,0);wr32(p+12,ip);wr32(p+16,peer);
 wr16(p+10,net_checksum(p,20));for(unsigned i=0;i<size;i++)p[20+i]=data[i];
 return send_eth(arp_mac,0x800,p,size+20);
}
static int udp_send(uint32_t peer,uint16_t sport,uint16_t dport,const uint8_t*data,unsigned size){
 if(size>1472)return 0;
 uint8_t p[1480];wr16(p,sport);wr16(p+2,dport);wr16(p+4,(uint16_t)(size+8));wr16(p+6,0);
 for(unsigned i=0;i<size;i++)p[8+i]=data[i];
 uint16_t cs=transport_sum(ip,peer,17,p,size+8);wr16(p+6,cs?cs:65535);
 return ipv4_send(peer,17,p,size+8);
}
static int tcp_send(unsigned flags,const uint8_t*data,unsigned bytes){
 if(bytes>TCP_MSS)return 0;
 uint8_t b[TCP_MSS+20];wr16(b,tcp.source);wr16(b+2,tcp.port);
 wr32(b+4,tcp.our_seq);wr32(b+8,tcp.peer_seq);b[12]=0x50;b[13]=(uint8_t)flags;
 wr16(b+14,32768);wr16(b+16,0);wr16(b+18,0);
 for(unsigned i=0;i<bytes;i++)b[20+i]=data[i];
 wr16(b+16,transport_sum(ip,tcp.peer,6,b,bytes+20));
 if(!ipv4_send(tcp.peer,6,b,bytes+20))return 0;
 if(flags&2)tcp.our_seq++;
 if(flags&1)tcp.our_seq++;
 tcp.our_seq+=bytes;return 1;
}
static void received_udp(uint32_t src,const uint8_t*b,unsigned n){
 if(n<8||rd16(b+4)<8||rd16(b+4)>n)return;
 if(rd16(b+2)!=udp_source||rd16(b)!=53||src!=dns||!query.id)return;
 const uint8_t*q=b+8;unsigned size=rd16(b+4)-8;
 if(size<12||rd16(q)!=query.id||!(q[2]&0x80)||(q[3]&15)||rd16(q+6)<1)return;
 unsigned at=12,walks=0;
 while(at<size&&q[at]&&walks++<128){if(q[at]>63||at+1+q[at]>=size)return;at+=1+q[at];}
 if(at+5>size)return;
 at+=5;
 for(unsigned rr=0;rr<rd16(q+6)&&rr<16;rr++){
  if(at+2>size)return;
  if((q[at]&0xc0)==0xc0)at+=2;
  else {unsigned count=0;while(at<size&&q[at]&&count++<128){if(q[at]>63||at+1+q[at]>=size)return;at+=q[at]+1;}if(at>=size)return;at++;}
  if(at+10>size)return;
  unsigned rtype=rd16(q+at),class_=rd16(q+at+2),len=rd16(q+at+8);at+=10;
  if(at+len>size)return;
  if(rtype==1&&class_==1&&len==4){query.address=rd32(q+at);query.done=1;return;}
  at+=len;
 }
}
static void received_tcp(uint32_t src,const uint8_t*b,unsigned n){
 if(n<20||tcp.state==0||src!=tcp.peer||rd16(b)!=tcp.port||rd16(b+2)!=tcp.source)return;
 unsigned hdr=(b[12]>>4)*4;if(hdr<20||hdr>n)return;
 uint8_t flags=b[13];uint32_t seq=rd32(b+4),ack=rd32(b+8);
 if(flags&4){tcp.bad=1;tcp.state=3;return;}
 if(tcp.state==1){if((flags&0x12)!=0x12||ack!=tcp.our_seq)return;
  tcp.peer_seq=seq+1;tcp.state=2;(void)tcp_send(0x10,0,0);return;}
 if(!(flags&0x10))return;
 if((int32_t)(ack-tcp.our_seq)>0)return;
 unsigned size=n-hdr;
 if(seq!=tcp.peer_seq){(void)tcp_send(0x10,0,0);return;}
 if(size){
  if(size>HTTP_MAX-tcp.received){tcp.overflow=1;tcp.state=3;return;}
  for(unsigned i=0;i<size;i++)http_data[tcp.received+i]=b[hdr+i];
  tcp.received+=size;tcp.peer_seq+=size;
  /* Do not require FIN when a server returns a complete framed response.
   * Modern HTTP/1.1 peers may keep the socket open even for HTTP/1.0. */
  struct http_response meta;
  if(http_parse_response(http_data,tcp.received,&meta)){
   if(meta.chunked){
    int complete=http_decode_body(http_data,tcp.received,&meta,http_probe,sizeof(http_probe));
    if(complete>=0)tcp.state=3;
    else if(complete==-90){tcp.overflow=1;tcp.state=3;}
   }else if(meta.content_length_present){
    if(meta.content_length>HTTP_MAX-meta.header_bytes){tcp.overflow=1;tcp.state=3;}
    else if(meta.header_bytes+meta.content_length<=tcp.received)tcp.state=3;
   }
  }
 }
 if(flags&1){tcp.peer_seq++;tcp.state=3;}
 if(size||(flags&1))(void)tcp_send(0x10,0,0);
}
static void received(const uint8_t*f,unsigned n){
 if(n<14)return;
 uint16_t type=rd16(f+12);const uint8_t*p=f+14;unsigned size=n-14;
 if(type==0x806){
  if(size<28||rd16(p)!=1||rd16(p+2)!=0x800||p[4]!=6||p[5]!=4)return;
  if(rd16(p+6)==2&&rd32(p+14)==arp_ip){for(unsigned i=0;i<6;i++)arp_mac[i]=p[8+i];arp_valid=1;}
  else if(rd16(p+6)==1&&rd32(p+24)==ip){
   uint8_t answer[28];for(unsigned i=0;i<28;i++)answer[i]=p[i];wr16(answer+6,2);
   for(unsigned i=0;i<6;i++){answer[8+i]=rtl8139_mac()[i];answer[18+i]=p[8+i];}
   wr32(answer+14,ip);wr32(answer+24,rd32(p+14));(void)send_eth(p+8,0x806,answer,28);
  }
  return;
 }
 if(type!=0x800||size<20||(p[0]>>4)!=4)return;
 unsigned ihl=(p[0]&15)*4,total=rd16(p+2);if(ihl<20||ihl>size||total<ihl||total>size)return;
 if(net_checksum(p,ihl)!=0||(rd16(p+6)&0x3fff))return; /* reject fragmentation */
 uint32_t dst=rd32(p+16);if(dst!=ip&&dst!=0xffffffffu)return;
 uint32_t src=rd32(p+12);const uint8_t*b=p+ihl;unsigned bytes=total-ihl;
 if(p[9]==17){if(bytes<8)return;uint16_t c=rd16(b+6);if(c&&transport_sum(src,dst,17,b,bytes))return;received_udp(src,b,bytes);}
 if(p[9]==6){if(bytes<20||transport_sum(src,dst,6,b,bytes))return;received_tcp(src,b,bytes);}
}
void net_init(void){online=rtl8139_init();if(online)logstr("NET_IPV4: QEMU slirp 10.0.2.15/24 gateway 10.0.2.2 DNS 10.0.2.3 (static)\n");else logstr("NET_OFFLINE: no supported RTL8139 NIC\n");}
int net_ready(void){return online;}
static int dns_pred(void){return query.done;}
static int resolve_hostname(const char*hostname,uint32_t*addr){
 unsigned a=0,b=0,c=0,d=0;const char*p=hostname;unsigned*parts[4]={&a,&b,&c,&d};int numerical=1;
 for(unsigned i=0;i<4;i++){unsigned digits=0;while(*p>='0'&&*p<='9'){*parts[i]=*parts[i]*10u+(unsigned)(*p++-'0');if(*parts[i]>255||++digits>3){numerical=0;break;}}
  if(!numerical||!digits){numerical=0;break;}if(i<3){if(*p++!='.'){numerical=0;break;}}else if(*p)numerical=0;}
 if(numerical){*addr=IP4(a,b,c,d);return 1;}
 uint8_t q[256]={0};unsigned at=12;const char*s=hostname;
 while(*s){unsigned len=0;const char*start=s;while(*s&&*s!='.'){len++;s++;}if(!len||len>63||at+len+6>=sizeof(q))return 0;q[at++]=(uint8_t)len;for(unsigned i=0;i<len;i++)q[at++]=(uint8_t)start[i];if(*s=='.')s++;}
 q[at++]=0;wr16(q+at,1);wr16(q+at+2,1);at+=4;
 query.id=(uint16_t)((timer_us()^0x4567u)&0xffffu);if(!query.id)query.id=1;
 query.done=0;query.address=0;wr16(q,query.id);wr16(q+2,0x100);wr16(q+4,1);
 for(unsigned retry=0;retry<3;retry++){if(!udp_send(dns,udp_source,53,q,at))continue;if(wait_until(dns_pred,WAIT_US)){*addr=query.address;query.id=0;return 1;}}
 query.id=0;return 0;
}
static int connected(void){return tcp.state==2||tcp.state==3||tcp.bad;}
static int finished(void){return tcp.state==3||tcp.bad||tcp.overflow;}
static int net_http_one(const char*url,uint8_t*out,unsigned capacity,char location[256]){
 location[0]=0;
 if(!online)return -19;
 if(!url||!out||capacity<1||capacity>32768)return -22;
 char host[128],path[256],request[512];unsigned port;
 if(!http_parse_url(url,host,sizeof(host),path,sizeof(path),&port))return -22;
 int req=http_make_request(host,path,request,sizeof(request));if(req<=0)return -22;
 logstr("NET_HTTP_BEGIN\n");
 uint32_t peer;if(!resolve_hostname(host,&peer))return -110;
 if(!resolve(peer))return -101;
 tcp.state=0;tcp.received=0;tcp.bad=0;tcp.overflow=0;tcp.peer_seq=0;tcp.peer=peer;tcp.port=(uint16_t)port;
 tcp.source=(uint16_t)(40000+((timer_us()/1000)%20000));
 tcp.our_seq=(uint32_t)(timer_us()^0x5a89315du);tcp.state=1;
 int ok=0;
 for(unsigned tries=0;tries<3;tries++){
  uint32_t old=tcp.our_seq;
  if(!tcp_send(2,0,0))break;
  if(wait_until(connected,WAIT_US)){ok=1;break;}
  tcp.our_seq=old; /* retransmit identical initial SYN */
 }
 if(!ok||tcp.bad){tcp.state=0;logstr("NET_TCP_CONNECT_FAILED\n");return -110;}
 logstr("NET_TCP_CONNECTED\n");
 if(!tcp_send(0x18,(const uint8_t*)request,(unsigned)req)){tcp.state=0;return -101;}
 ok=wait_until(finished,6000000ull);
 int result=-110;
 if(tcp.overflow)result=-90;
 else if(ok&&!tcp.bad){
  struct http_response response;
  if(!http_parse_response(http_data,tcp.received,&response))result=-71;
  else if(response.status==301||response.status==302||response.status==303||response.status==307||response.status==308){
   if(!response.location[0])result=-71;
   else {unsigned i=0;while(response.location[i]&&i<255){location[i]=response.location[i];i++;}location[i]=0;result=-39;}
  }
  else if(response.status!=200)result=-1000-(int)response.status;
  else result=http_decode_body(http_data,tcp.received,&response,out,capacity);
 }
 if(result>=0)logstr("NET_HTTP_OK\n");else logstr("NET_HTTP_FAILED\n");
 tcp.state=0;return result;
}
/* Restrict redirects to explicit plain HTTP: never silently downgrade TLS.
 * Resolve relative Location values against the previous request URI. */
static int http_redirect(const char*current,const char*location,char*result,unsigned cap){
 if(!location[0]||!cap)return 0;
 unsigned start=0;
 if(location[0]=='h'){
  const char*scheme="http://";
  for(unsigned i=0;scheme[i];i++)if(location[i]!=scheme[i])return 0;
 }else{
  if(location[0]=='/'&&location[1]=='/')return 0;
  if(location[0]=='#')return 0;
  unsigned origin=7;
  while(current[origin]&&current[origin]!='/')origin++;
  if(origin+1>=cap)return 0;
  if(location[0]=='/')start=origin;
  else if(location[0]=='?'){
   start=origin;
   while(current[start]&&current[start]!='?'&&current[start]!='#')start++;
   if(start==origin)result[start++]='/';
  }else{
   start=origin;
   unsigned dir=origin;
   while(current[start]&&current[start]!='?'&&current[start]!='#'){
    if(current[start]=='/')dir=start+1;
    start++;
   }
   start=dir;
   if(start==origin){result[start++]='/';}
  }
  for(unsigned i=0;i<origin;i++)result[i]=current[i];
  if(start>origin){
   if(location[0]=='?'){
    for(unsigned i=origin;i<start;i++)result[i]=current[i];
   }else if(current[origin]=='/'){
    for(unsigned i=origin;i<start;i++)result[i]=current[i];
   }
  }
 }
 unsigned n=0;
 while(location[n]&&start+n+1<cap){
  unsigned char c=(unsigned char)location[n];
  if(c<33||c>=127||c=='#'||c=='\\')return 0;
  if(location[0]!='h'&&c==':')return 0;
  result[start+n]=(char)c;n++;
 }
 if(location[n])return 0;
 result[start+n]=0;
 return 1;
}
int net_http_get(const char*url,uint8_t*out,unsigned capacity){
 if(!url||!out)return -22;
 char current[128];unsigned n=0;
 while(url[n]&&n+1<sizeof(current)){current[n]=url[n];n++;}
 if(url[n])return -22;
 current[n]=0;
 for(unsigned redirects=0;redirects<5;redirects++){
  char location[256];int rc=net_http_one(current,out,capacity,location);
  if(rc!=-39)return rc;
  char next[128];if(!http_redirect(current,location,next,sizeof(next)))return -95;
  for(unsigned i=0;i<sizeof(current);i++){current[i]=next[i];if(!next[i])break;}
 }
 return -40;
}
void net_report(void(*line)(const char*)){
 if(!online){line("Network: offline (QEMU RTL8139 missing)");return;}
 line("NIC: RTL8139 polling; IP 10.0.2.15 gateway 10.0.2.2");
 line("DNS 10.0.2.3; HTTP GET, chunked, redirects; no HTTPS");
 line("Network config static for QEMU user-mode (DHCP pending)");
}
