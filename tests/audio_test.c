/* Host tests: fake DMA device, real parser/converter/scheduler. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../src/audio/audio.h"
static int device=1,starts,stops,start_ok=1;
static uint32_t done;
static unsigned releases;
static uint8_t halves[AUDIO_BLOCKS][AUDIO_HALF];
int sb16_init(void){return device;}
int sb16_start(void){starts++;done=0;return start_ok;}
void sb16_stop(void){stops++;}
uint32_t sb16_blocks(void){return done;}
void sb16_write_half(unsigned half,const uint8_t *data){assert(half<AUDIO_BLOCKS);memcpy(halves[half],data,AUDIO_HALF);}
static void put16(uint8_t *p,unsigned n){p[0]=n;p[1]=n>>8;}
static void put32(uint8_t *p,unsigned n){put16(p,n);put16(p+2,n>>16);}
static void released(void *context){assert(context==(void*)0x1234);releases++;}
static void wav(uint8_t *p,unsigned bits,unsigned channels,unsigned rate,unsigned frames){
    unsigned bytes=frames*channels*bits/8;memset(p,0,44+bytes+(bytes&1));
    memcpy(p,"RIFF",4);put32(p+4,36+bytes+(bytes&1));memcpy(p+8,"WAVEfmt ",8);
    put32(p+16,16);put16(p+20,1);put16(p+22,channels);put32(p+24,rate);
    put32(p+28,rate*channels*bits/8);put16(p+32,channels*bits/8);put16(p+34,bits);
    memcpy(p+36,"data",4);put32(p+40,bytes);
}
int main(void){
    audio_init();assert(audio_get_status().available);assert(audio_volume(100));
    assert(!audio_volume(101));assert(!audio_tone(0,100));assert(!audio_tone(440,10001));
    assert(audio_tone(440,2000));assert(audio_get_status().playing);
    int nonzero=0;for(unsigned i=0;i<AUDIO_HALF;i++)nonzero|=halves[0][i]!=128;assert(nonzero);
    for(unsigned i=1;i<=87;i++){done=i;audio_step((uint64_t)i*23000);}
    assert(!audio_get_status().playing);assert(audio_get_status().blocks==87);
    assert(audio_tone(440,1000));done=2;audio_step(1000);assert(audio_get_status().underruns==0);assert(audio_get_status().playing);
    done=6;audio_step(2000);assert(audio_get_status().underruns==1);assert(!audio_get_status().playing);
    assert(audio_tone(440,1000));audio_step(1000);audio_step(502000);assert(audio_get_status().faults==1);assert(!audio_get_status().playing);
    uint8_t p[16428];
    for(unsigned bits=8;bits<=16;bits+=8)for(unsigned ch=1;ch<=2;ch++){
        wav(p,bits,ch,22050,4096);unsigned n=44+4096*ch*bits/8;
        if(bits==8)memset(p+44,255,n-44);
        else for(unsigned i=44;i<n;i+=2){p[i]=0xff;p[i+1]=0x7f;}
        assert(audio_play_wav(p,n));assert(halves[0][256]==255);audio_stop();
        assert(audio_volume(0));assert(audio_play_wav(p,n));assert(halves[0][256]==128);assert(audio_volume(100));
        for(unsigned size=0;size<n;size+=17)assert(!audio_play_wav(p,size));
    }
    wav(p,8,1,8000,100);memset(p+44,128,100);assert(audio_play_wav(p,144));
    assert(halves[0][0]==128);assert(halves[0][500]==128);
    put16(p+32,2);assert(!audio_play_wav(p,144));put16(p+32,1);
    put32(p+24,0);assert(!audio_play_wav(p,144));put32(p+24,8000);
    put16(p+20,3);assert(!audio_play_wav(p,144));put16(p+20,1);
    put32(p+40,0xffffffff);assert(!audio_play_wav(p,144));
    wav(p,8,1,22050,1);p[44]=255;assert(audio_play_wav(p,46));assert(halves[0][0]==255&&halves[0][1]==128);
    uint32_t rng=19;for(unsigned i=0;i<12000;i++){
        unsigned n=i%sizeof(p);for(unsigned j=0;j<n;j++){rng=rng*1664525+1013904223;p[j]=rng>>24;}
        if(n>=12&&i%2==0){memcpy(p,"RIFF",4);put32(p+4,n-8);memcpy(p+8,"WAVE",4);}
        assert(!audio_play_wav(p,n));
    }
    audio_stop();uint8_t fx[8192];memset(fx,255,sizeof(fx));
    assert(!audio_sfx_start(8,fx,sizeof(fx),11025,127));
    assert(!audio_sfx_start(0,fx,AUDIO_SFX_MAX+1,11025,127));
    assert(!audio_sfx_start(0,fx,sizeof(fx),0,127));
    assert(audio_sfx_start(0,fx,sizeof(fx),11025,127));
    assert(audio_sfx_playing(0));assert(halves[0][0]==191);
    assert(audio_sfx_start(1,fx,sizeof(fx),11025,127));
    assert(audio_sfx_start(2,fx,sizeof(fx),11025,127));
    done=1;audio_step(1000);assert(halves[0][0]==255); /* saturating mix */
    audio_sfx_volume(0,0);audio_sfx_stop(1);audio_sfx_stop(2);
    done=2;audio_step(94000);assert(halves[1][0]==128);
    audio_sfx_clear();assert(!audio_sfx_playing(0));
    done=3;audio_step(187000);done=4;audio_step(280000);done=5;audio_step(373000);done=6;audio_step(396000);done=7;audio_step(419000);
    assert(!audio_get_status().playing);
    audio_stop();wav(p,8,1,11025,4096);
    for(unsigned i=0;i<4096;i++)p[44+i]=i%2?255:0;
    assert(audio_play_wav(p,4140));
    assert(halves[0][0]==0&&halves[0][1]==0&&halves[0][2]==255&&halves[0][3]==255);
    static uint8_t long_wav[80046];wav(long_wav,8,1,8000,80001);
    assert(!audio_play_wav(long_wav,sizeof(long_wav))); /* >ten-second capacity */
    audio_stop();static uint8_t largest[AUDIO_SFX_MAX];memset(largest,128,sizeof(largest));
    assert(audio_sfx_start(7,largest,sizeof(largest),44100,127));audio_stop();
    static uint8_t borrowed[128];memset(borrowed,255,sizeof(borrowed));
    assert(audio_sfx_start_borrowed(0,borrowed,sizeof(borrowed),22050,127,released,(void*)0x1234));
    assert(releases==1); /* generated PCM is already copied into the DMA ring */
    assert(!audio_sfx_playing(0));
    assert(!audio_sfx_start_borrowed(0,borrowed,sizeof(borrowed),22050,127,NULL,NULL));
    audio_stop();
    static uint8_t leased[4096];memset(leased,255,sizeof(leased));releases=0;
    assert(audio_sfx_start_borrowed(0,leased,sizeof(leased),22050,127,released,(void*)0x1234));
    assert(releases==0&&halves[0][0]>128);
    memset(leased+2048,0,sizeof(leased)-2048);done=1;audio_step(23000);
    assert(halves[0][0]<128); /* later mixer slice reads the leased source directly */
    assert(releases==0);
    assert(audio_sfx_start_borrowed(0,leased,sizeof(leased),22050,127,released,(void*)0x1234));
    assert(releases==1); /* replacing a channel returns the earlier lease */
    audio_sfx_stop(0);assert(releases==2);
    audio_stop();start_ok=0;
    assert(!audio_sfx_start_borrowed(0,leased,sizeof(leased),22050,127,released,(void*)0x1234));
    assert(releases==2); /* failed device start leaves lease with the caller */
    start_ok=1;
    device=0;audio_init();assert(!audio_tone(440,100));assert(!audio_get_status().available);
    assert(starts>8&&stops>8);puts("PASS: PCM formats, resampling, volume, tails, stop, underrun/stall, malformed/truncated WAV corpus, no device");
}
