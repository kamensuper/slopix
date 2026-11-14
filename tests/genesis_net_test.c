/* Host tests verify core packet checksum and reject unsupported schemes.
 * No NIC simulation here: these tests do not prove live TCP or QEMU success. */
#include "../src/net/stack.h"
#include "../src/net/rtl8139.h"
#include <assert.h>
#include <string.h>
#include <stdint.h>
int rtl8139_init(void){return 0;}
int rtl8139_ready(void){return 0;}
const uint8_t* rtl8139_mac(void){static uint8_t m[6];return m;}
int rtl8139_send(const uint8_t*a,unsigned b){(void)a;(void)b;return 0;}
void rtl8139_poll(void(*r)(const uint8_t*,unsigned)){(void)r;}
uint64_t timer_us(void){return 0;}
void audio_checkpoint(void){}
void logstr(const char*s){(void)s;}
int main(void){
 static const uint8_t ipv4[]={0x45,0,0,0x54,0xa6,0xf2,0x40,0,0x40,1,0,0,0xc0,0,2,0x01,0xc0,0,2,0x02};
 uint16_t cs=net_checksum(ipv4,sizeof ipv4);
 uint8_t buf[sizeof ipv4];memcpy(buf,ipv4,sizeof buf);buf[10]=(uint8_t)(cs>>8);buf[11]=(uint8_t)cs;
 assert(net_checksum(buf,sizeof buf)==0);
 buf[13]^=1;assert(net_checksum(buf,sizeof buf)!=0);
 net_init();assert(!net_ready());uint8_t response[64];
 assert(net_http_get("http://example.com",response,sizeof response)==-19);
 return 0;
}
