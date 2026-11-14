/* Host regression for shared Doom zone-lump leases; real mixer and adapter. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../src/audio/audio.h"
#include "../vendor/doomgeneric/i_sound.h"
extern sound_module_t DG_sound_module;
static unsigned releases;static unsigned char lump[8240];
int sb16_init(void){return 1;}int sb16_start(void){return 1;}
void sb16_stop(void){}uint32_t sb16_blocks(void){return 0;}
void sb16_write_half(unsigned h,const uint8_t*p){(void)h;(void)p;}
void logstr(const char*s){(void)s;}
int W_GetNumForName(char*n){(void)n;return 1;}
int W_LumpLength(unsigned n){assert(n==1);return sizeof(lump);}
void *W_CacheLumpNum(int n,int tag){assert(n==1);(void)tag;return lump;}
void W_ReleaseLumpNum(int n){assert(n==1);releases++;}
int main(void){
 audio_init();memset(lump,128,sizeof(lump));lump[0]=3;lump[1]=0;
 lump[2]=0x11;lump[3]=0x2b; /* 11025 Hz */
 unsigned count=sizeof(lump)-8;for(unsigned i=0;i<4;i++)lump[4+i]=count>>(8*i);
 sfxinfo_t sfx={0};strcpy(sfx.name,"pistol");sfx.lumpnum=1;
 assert(DG_sound_module.Init(1));
 assert(DG_sound_module.StartSound(&sfx,0,127,128)==0);
 assert(DG_sound_module.StartSound(&sfx,1,127,128)==1);
 DG_sound_module.StopSound(0);assert(releases==0);
 DG_sound_module.StopSound(1);assert(releases==1);
 assert(DG_sound_module.StartSound(&sfx,0,127,128)==0);
 assert(DG_sound_module.StartSound(&sfx,1,127,128)==1);
 assert(DG_sound_module.StartSound(&sfx,0,127,128)==0);
 DG_sound_module.StopSound(1);assert(releases==1);
 DG_sound_module.StopSound(0);assert(releases==2);
 audio_stop();puts("PASS: overlapping identical DOOM effects retain their zone lump until the last lease ends");
}
