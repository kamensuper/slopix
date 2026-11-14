/* Account record + PBKDF2-HMAC-SHA256. Note: FAT32 is not encrypted,
 * the firmware isn't verified, and physical disk access defeats this gate.
 * This is an early hobby OS login feature, NOT a secure user isolation boundary. */
#include "account.h"
#include "storage/storage.h"
#include <stdint.h>
#include <stddef.h>
#define ACCOUNT_MAGIC 0x41504f53u
#define ACCOUNT_ROUNDS 12000u
struct account_disk {
 uint32_t magic,version,size,rounds;
 char name[32];
 uint8_t salt[16];
 uint8_t key[32];
 uint32_t checksum;
};
static struct account_disk saved;
static int configured,persisted;
static const uint32_t k[64]={
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
 0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
 0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
 0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
 0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
static uint32_t rotr(uint32_t n,unsigned c){return (n>>c)|(n<<(32-c));}
static uint32_t be32(const uint8_t*p){return (uint32_t)p[0]<<24|(uint32_t)p[1]<<16|(uint32_t)p[2]<<8|p[3];}
static void put32(uint8_t*p,uint32_t n){p[0]=(uint8_t)(n>>24);p[1]=(uint8_t)(n>>16);p[2]=(uint8_t)(n>>8);p[3]=(uint8_t)n;}
struct sha {uint32_t h[8];uint8_t buf[64];uint64_t bits;unsigned used;};
void account_scrub(void*p,unsigned n){volatile uint8_t*b=p;while(n--)*b++=0;}
static void sha_init(struct sha*s){*s=(struct sha){.h={0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19}};}
static void sha_block(struct sha*s,const uint8_t*b){
 uint32_t w[64];for(unsigned i=0;i<16;i++)w[i]=be32(b+i*4);
 for(unsigned i=16;i<64;i++){uint32_t a=w[i-15],z=w[i-2];w[i]=(rotr(z,17)^rotr(z,19)^(z>>10))+w[i-7]+(rotr(a,7)^rotr(a,18)^(a>>3))+w[i-16];}
 uint32_t a=s->h[0],bb=s->h[1],c=s->h[2],d=s->h[3],e=s->h[4],f=s->h[5],g=s->h[6],h=s->h[7];
 for(unsigned i=0;i<64;i++){uint32_t z=h+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i];uint32_t v=(rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&bb)^(a&c)^(bb&c));h=g;g=f;f=e;e=d+z;d=c;c=bb;bb=a;a=z+v;}
 s->h[0]+=a;s->h[1]+=bb;s->h[2]+=c;s->h[3]+=d;s->h[4]+=e;s->h[5]+=f;s->h[6]+=g;s->h[7]+=h;
 account_scrub(w,sizeof(w));
}
static void sha_update(struct sha*s,const void*data,unsigned n){const uint8_t*b=data;s->bits+=(uint64_t)n*8;while(n--){s->buf[s->used++]=*b++;if(s->used==64){sha_block(s,s->buf);s->used=0;}}}
static void sha_final(struct sha*s,uint8_t out[32]){uint64_t bits=s->bits;uint8_t one=0x80,zero=0;sha_update(s,&one,1);while(s->used!=56)sha_update(s,&zero,1);uint8_t tail[8];for(unsigned i=0;i<8;i++)tail[i]=(uint8_t)(bits>>(56-8*i));sha_update(s,tail,8);for(unsigned i=0;i<8;i++)put32(out+i*4,s->h[i]);account_scrub(s,sizeof(*s));}
static unsigned strnlen64(const char*s){unsigned i=0;while(i<64&&s[i])i++;return i;}
static void hmac(const uint8_t*key,unsigned n,const uint8_t*data,unsigned bytes,uint8_t out[32]){
 uint8_t pad[64],inner[32];for(unsigned i=0;i<64;i++)pad[i]=(i<n?key[i]:0)^0x36;
 struct sha s;sha_init(&s);sha_update(&s,pad,64);sha_update(&s,data,bytes);sha_final(&s,inner);
 for(unsigned i=0;i<64;i++)pad[i]^=0x36^0x5c;
 sha_init(&s);sha_update(&s,pad,64);sha_update(&s,inner,32);sha_final(&s,out);
 account_scrub(pad,sizeof(pad));account_scrub(inner,sizeof(inner));
}
static void derive(const char*password,const uint8_t salt[16],uint32_t rounds,uint8_t out[32]){
 uint8_t seed[20],u[32];for(unsigned i=0;i<16;i++)seed[i]=salt[i];put32(seed+16,1);
 unsigned n=strnlen64(password);hmac((const uint8_t*)password,n,seed,20,u);
 for(unsigned i=0;i<32;i++)out[i]=u[i];
 for(uint32_t j=1;j<rounds;j++){uint8_t next[32];hmac((const uint8_t*)password,n,u,32,next);for(unsigned i=0;i<32;i++){out[i]^=next[i];u[i]=next[i];}account_scrub(next,32);}
 account_scrub(u,32);account_scrub(seed,20);
}
static uint32_t checksum(const struct account_disk*a){const uint8_t*p=(const uint8_t*)a;uint32_t h=2166136261u;for(unsigned i=0;i<offsetof(struct account_disk,checksum);i++)h=(h^p[i])*16777619u;return h;}
int account_name_valid(const char*name){unsigned i=0;for(;i<sizeof(saved.name)-1&&name[i];i++){char c=name[i];if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c==' '||c=='_'||c=='-'||c=='.'))return 0;}return i>0&&i<=24&&!name[i]&&name[0]!=' '&&name[i-1]!=' ';}
static int record_valid(const struct account_disk*a){if(a->magic!=ACCOUNT_MAGIC||a->version!=1||a->size!=sizeof(*a)||a->rounds!=ACCOUNT_ROUNDS||a->checksum!=checksum(a)||a->name[31])return 0;return account_name_valid(a->name);}
int account_load(void){
 configured=0;persisted=0;account_scrub(&saved,sizeof(saved));
 uint32_t size=0;int directory=0;
 if(!fat_stat("ACCOUNT.DAT",&size,&directory))return 0;
 if(directory||size!=sizeof(saved))return -1;
 uint32_t got=0;if(!fat_read("ACCOUNT.DAT",&saved,sizeof(saved),&got)||got!=sizeof(saved)||!record_valid(&saved)){account_scrub(&saved,sizeof(saved));return -1;}
 configured=1;persisted=1;return 1;
}
int account_create(const char*name,const char*password,uint64_t entropy){
 if(configured||!account_name_valid(name))return 0;
 unsigned len=strnlen64(password);if(len<6||len>=64)return 0;
 struct account_disk a={.magic=ACCOUNT_MAGIC,.version=1,.size=sizeof(a),.rounds=ACCOUNT_ROUNDS};
 for(unsigned i=0;name[i];i++)a.name[i]=name[i];
 uint64_t x=entropy^0x9e3779b97f4a7c15ULL;for(unsigned i=0;i<16;i++){x^=x>>12;x^=x<<25;x^=x>>27;x*=0x2545f4914f6cdd1dULL;a.salt[i]=(uint8_t)(x>>((i&7)*8));}
 derive(password,a.salt,a.rounds,a.key);a.checksum=checksum(&a);
 int result=2;
 if(fat_info().mounted&&fat_info().writable){
  if(!fat_write("ACCOUNT.DAT",&a,sizeof(a))){account_scrub(&a,sizeof(a));return 0;}
  struct account_disk check;uint32_t got=0;
  if(!fat_read("ACCOUNT.DAT",&check,sizeof(check),&got)||got!=sizeof(check)||!record_valid(&check)) {account_scrub(&check,sizeof(check));account_scrub(&a,sizeof(a));return 0;}
  account_scrub(&check,sizeof(check));result=1;
 }
 saved=a;configured=1;persisted=result==1;account_scrub(&a,sizeof(a));return result;
}
int account_check(const char*password){
 if(!configured||strnlen64(password)>=64)return 0;
 uint8_t key[32];derive(password,saved.salt,saved.rounds,key);
 unsigned mismatch=0;for(unsigned i=0;i<32;i++)mismatch|=key[i]^saved.key[i];account_scrub(key,sizeof(key));return mismatch==0;
}
const char*account_name(void){return configured?saved.name:"";}
int account_persistent(void){return persisted;}
