/* SPDX-License-Identifier: GPL-3.0-or-later
 * DoomGeneric digital effects adapter. No SDL, music synth, filesystem or heap.
 * Cached lumps stay pinned until the last borrowing voice has consumed them.
 */
#include "../audio/audio.h"
#include "../kernel.h"
#include "doomtype.h"
#include "i_sound.h"
#include "w_wad.h"
#include "z_zone.h"
static boolean prefix;
static snddevice_t devices[]={SNDDEVICE_SB};
static unsigned started;
static struct lease {int lump,active;} leases[AUDIO_VOICES];
static void release_lump(void *context){
    struct lease *lease=context;int lump=lease->lump;lease->active=0;
    for(unsigned i=0;i<AUDIO_VOICES;i++)if(leases[i].active&&leases[i].lump==lump)return;
    W_ReleaseLumpNum(lump);
}
static unsigned le16(const byte *p){return p[0]|(unsigned)p[1]<<8;}
static uint32_t le32(const byte *p){return le16(p)|(uint32_t)le16(p+2)<<16;}
static boolean init(boolean use_prefix){prefix=use_prefix;return audio_get_status().available;}
static void shutdown(void){audio_sfx_clear();}
static int lumpnum(sfxinfo_t *sfx){
    char name[12];unsigned n=0;if(prefix){name[n++]='d';name[n++]='s';}
    for(unsigned i=0;i<8&&sfx->name[i]&&n<sizeof(name)-1;i++)name[n++]=sfx->name[i];
    name[n]=0;return W_GetNumForName(name);
}
static void update(void){}
static void params(int ch,int volume,int sep){(void)sep;if(ch>=0)audio_sfx_volume((unsigned)ch,(unsigned)(volume<0?0:volume));}
static int play(sfxinfo_t *sfx,int ch,int volume,int sep){
    (void)sep;if(ch<0||ch>=(int)AUDIO_VOICES)return -1;
    int lump=sfx->lumpnum;if(lump<0)lump=lumpnum(sfx);
    int size=W_LumpLength((unsigned)lump);if(size<40)return -1;
    audio_sfx_stop((unsigned)ch);
    const byte *data=W_CacheLumpNum(lump,PU_STATIC);
    struct lease *lease=&leases[ch];lease->lump=lump;lease->active=1;
    uint32_t count=le32(data+4);unsigned rate=le16(data+2);
    /* Doom DMX format: 03 00, LE rate/length, 16-byte padding each end. */
    int ok=0;if(le16(data)==3&&count>32&&count<=(uint32_t)size-8)
        ok=audio_sfx_start_borrowed((unsigned)ch,data+24,count-32,rate,(unsigned)(volume<0?0:volume),release_lump,lease);
    if(!ok)release_lump(lease);
    if(ok){started++;if(started<=4)logstr("DOOM_SFX_STARTED\n");return ch;}return -1;
}
static void stop(int ch){if(ch>=0)audio_sfx_stop((unsigned)ch);}
static boolean playing(int ch){return ch>=0&&audio_sfx_playing((unsigned)ch);}
sound_module_t DG_sound_module={devices,1,init,shutdown,lumpnum,update,params,play,stop,playing,0};
