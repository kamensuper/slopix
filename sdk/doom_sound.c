/* Ring-3 Doom audio uses syscalls that copy DMX PCM to kernel-owned buffers.
 * Game lump memory stays owned by the Doom process and is never DMA-visible. */
#include "slopix.h"
#include "doomtype.h"
#include "i_sound.h"
#include "w_wad.h"
#include "z_zone.h"
static boolean use_prefix;
static snddevice_t devices[]={SNDDEVICE_SB};
static unsigned le16(const byte*p){return p[0]|(unsigned)p[1]<<8;}
static uint32_t le32(const byte*p){return le16(p)|(uint32_t)le16(p+2)<<16;}
static boolean init(boolean p){use_prefix=p;return true;}
static void shutdown(void){for(unsigned i=0;i<8;i++)sx_pcm_stop(i);}
static int lumpnum(sfxinfo_t*sfx){char name[12];unsigned n=0;if(use_prefix){name[n++]='d';name[n++]='s';}
 for(unsigned i=0;i<8&&sfx->name[i]&&n<sizeof(name)-1;i++)name[n++]=sfx->name[i];name[n]=0;
 return W_GetNumForName(name);}
static void update(void){}
static void params(int ch,int volume,int sep){(void)sep;if(ch>=0&&ch<8)sx_pcm_volume((unsigned)ch,(unsigned)(volume<0?0:volume));}
static int play(sfxinfo_t*sfx,int ch,int volume,int sep){
 (void)sep;if(ch<0||ch>=8)return -1;
 int lump=sfx->lumpnum;if(lump<0)lump=lumpnum(sfx);
 int size=W_LumpLength(lump);if(size<40)return -1;
 const byte*data=W_CacheLumpNum(lump,PU_STATIC);
 uint32_t length=le32(data+4);unsigned rate=le16(data+2);int okay=0;
 if(le16(data)==3&&length>32&&length<=(uint32_t)size-8){
  struct sx_pcm_request request={(uintptr_t)(data+24),length-32,(unsigned)ch,rate,(unsigned)(volume<0?0:volume)};
  okay=sx_pcm_start(&request)>=0;
 }
 W_ReleaseLumpNum(lump);
 return okay?ch:-1;
}
static void stop(int ch){if(ch>=0&&ch<8)sx_pcm_stop((unsigned)ch);}
static boolean playing(int ch){return ch>=0&&ch<8&&sx_pcm_playing((unsigned)ch)>0;}
sound_module_t DG_sound_module={devices,1,init,shutdown,lumpnum,update,params,play,stop,playing,0};
