/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "audio.h"
#include "device.h"
#include "../perf.h"
extern uint64_t timer_us(void) __attribute__((weak));
static int16_t pcm[AUDIO_MAX_SAMPLES];
static uint32_t samples,position,seen,target;
static struct voice {uint8_t owned[AUDIO_SFX_MAX];const uint8_t *data;uint32_t count,step;uint64_t phase;unsigned volume;audio_sfx_release_fn release;void *context;} voices[AUDIO_VOICES];
static int voices_active(void){for(unsigned i=0;i<AUDIO_VOICES;i++)if((voices[i].phase>>16)<voices[i].count)return 1;return 0;}
void audio_sfx_stop(unsigned ch){if(ch<AUDIO_VOICES){struct voice*v=&voices[ch];audio_sfx_release_fn release=v->release;void*context=v->context;v->count=0;v->data=0;v->release=0;v->context=0;if(release)release(context);}}
void audio_sfx_clear(void){for(unsigned ch=0;ch<AUDIO_VOICES;ch++)audio_sfx_stop(ch);}
int audio_sfx_playing(unsigned ch){if(ch>=AUDIO_VOICES)return 0;struct voice*v=&voices[ch];if((v->phase>>16)<v->count)return 1;audio_sfx_stop(ch);return 0;}
void audio_sfx_volume(unsigned ch,unsigned volume){if(ch<AUDIO_VOICES)voices[ch].volume=volume>127?127:volume;}

static uint64_t last_progress,last_service;
static struct audio_diagnostics diagnostics;
struct audio_diagnostics audio_diagnostics(void){return diagnostics;}
static struct audio_status status={0,0,65,0,0,0};
static const char *error="Audio not initialized";
static uint16_t u16(const uint8_t *p){return p[0]|(uint16_t)p[1]<<8;}
static uint32_t u32(const uint8_t *p){return u16(p)|(uint32_t)u16(p+2)<<16;}
static int tag(const uint8_t *p,const char *s){return p[0]==s[0]&&p[1]==s[1]&&p[2]==s[2]&&p[3]==s[3];}
const char *audio_error(void){return error;}
struct audio_status audio_get_status(void){return status;}
void audio_init(void){status.available=sb16_init();error=status.available?"SB16 ready: 22050 Hz, mono, unsigned 8-bit DMA":"No SB16 at 0x220; audio disabled";}
void audio_stop(void){if(status.available)sb16_stop();status.playing=0;audio_sfx_clear();samples=position=0;}
int audio_volume(unsigned percent){if(percent>100){error="Volume must be 0..100";return 0;}status.volume=percent;return 1;}
static void fill(unsigned half){
    uint64_t begin=perf_record?timer_us():0;uint8_t block[AUDIO_HALF];
    for(unsigned i=0;i<AUDIO_HALF;i++){
        int value=position<samples?pcm[position++]:0;
        for(unsigned ch=0;ch<AUDIO_VOICES;ch++){
            struct voice *v=&voices[ch];uint64_t at=v->phase>>16;
            if(at<v->count){value+=((int)v->data[at]-128)*256*(int)v->volume/(127*2);v->phase+=v->step;}
        }
        value=value*(int)status.volume/100;
        if(value>32767)value=32767;
        if(value< -32768)value= -32768;
        block[i]=(uint8_t)((value+32768)/256);
    }
    sb16_write_half(half,block);if(perf_record)perf_add(P_AUDIO,timer_us()-begin);
}
static void retire_finished(void){for(unsigned ch=0;ch<AUDIO_VOICES;ch++)if(voices[ch].count&&(voices[ch].phase>>16)>=voices[ch].count)audio_sfx_stop(ch);}
static int start(void){
    if(!status.available){error="No audio device available";return 0;}
    uint64_t start_time=timer_us?timer_us():0;
    position=seen=0;target=voices_active()?0:(samples+AUDIO_HALF-1)/AUDIO_HALF;
    for(unsigned i=0;i<AUDIO_BLOCKS;i++){fill(i);}
    last_progress=0;
    if(!target&&!voices_active()&&position>=samples)target=AUDIO_BLOCKS;
    if(!sb16_start()){status.faults++;error="SB16 command timeout";return 0;}
    last_service=timer_us?timer_us():0;if(timer_us){uint64_t elapsed=last_service-start_time;if(elapsed>diagnostics.start_max_us)diagnostics.start_max_us=elapsed;}
    status.playing=1;retire_finished();error="Playing";return 1;
}
int audio_tone(unsigned hz,unsigned ms){
    if(hz<40||hz>8000||ms<20||ms>10000){error="Tone: 40..8000 Hz, 20..10000 ms";return 0;}
    audio_stop();samples=(uint32_t)((uint64_t)ms*AUDIO_RATE/1000);
    uint32_t phase=0,step=(uint32_t)(((uint64_t)hz<<32)/AUDIO_RATE);
    for(uint32_t i=0;i<samples;i++){
        /* Triangle oscillator, with 5ms edge ramps to avoid abrupt clicks. */
        unsigned p=phase>>16;int value=p<32768?(int)p*2-32768:98303-(int)p*2;
        unsigned edge=i<samples-1-i?i:samples-1-i;if(edge>110)edge=110;
        pcm[i]=(int16_t)((int64_t)value*edge/(110*2));phase+=step;
    }
    return start();
}
int audio_play_wav(const uint8_t *data,size_t size){
    if(!data||size<12||!tag(data,"RIFF")||!tag(data+8,"WAVE")){error="Invalid RIFF/WAVE header";return 0;}
    uint64_t end=(uint64_t)u32(data+4)+8;
    if(end>size||end<12){error="Truncated RIFF";return 0;}
    const uint8_t *fmt=0,*wave=0;uint32_t bytes=0;
    for(uint64_t off=12;off<end;){
        if(end-off<8){error="Truncated WAV chunk";return 0;}
        uint32_t n=u32(data+off+4);uint64_t next=off+8+(uint64_t)n+(n&1u);
        if(next>end){error="WAV chunk outside RIFF";return 0;}
        if(tag(data+off,"fmt ")){if(fmt||n<16){error="Invalid WAV format chunk";return 0;}fmt=data+off+8;}
        if(tag(data+off,"data")){if(wave){error="Duplicate WAV data";return 0;}wave=data+off+8;bytes=n;}
        off=next;
    }
    if(!fmt||!wave){error="Missing WAV format/data";return 0;}
    unsigned channels=u16(fmt+2),bits=u16(fmt+14),align=u16(fmt+12);uint32_t rate=u32(fmt+4);
    if(u16(fmt)!=1||(channels!=1&&channels!=2)||(bits!=8&&bits!=16)||rate<8000||rate>48000||align!=channels*(bits/8)||u32(fmt+8)!=rate*align||!bytes||bytes%align){error="WAV requires PCM mono/stereo 8/16-bit, 8000..48000 Hz";return 0;}
    uint32_t frames=bytes/align;
    uint64_t count=(uint64_t)frames*AUDIO_RATE/rate;
    if(!count||count>AUDIO_MAX_SAMPLES){error="WAV duration exceeds ten seconds or is empty";return 0;}
    audio_stop();samples=(uint32_t)count;
    for(uint32_t i=0;i<samples;i++){
        uint32_t frame=(uint32_t)((uint64_t)i*rate/AUDIO_RATE);int sum=0;
        for(unsigned c=0;c<channels;c++){
            const uint8_t *p=wave+(size_t)frame*align+c*(bits/8);
            sum+=bits==8?((int)*p-128)*256:(int16_t)u16(p);
        }
        pcm[i]=(int16_t)(sum/(int)channels);
    }
    return start();
}
void audio_step(uint64_t now){
    retire_finished();
    if(!status.playing)return;
    if(last_service&&now>=last_service){uint64_t gap=now-last_service;diagnostics.services++;diagnostics.total_gap_us+=gap;if(gap>diagnostics.max_gap_us)diagnostics.max_gap_us=gap;}last_service=now;
    if(!last_progress)last_progress=now;
    uint32_t done=sb16_blocks(),delta=done-seen;
    if(delta>diagnostics.max_pending)diagnostics.max_pending=delta;
    if(delta>=AUDIO_BLOCKS){status.underruns++;audio_stop();error="Audio underrun: playback stopped";return;}
    if(delta){
        status.blocks+=delta;last_progress=now;
        if(target&&done>=target){audio_stop();error="Playback complete";return;}
        while(seen!=done){fill(seen%AUDIO_BLOCKS);seen++;}
        if(!target&&position>=samples&&!voices_active())target=done+AUDIO_BLOCKS;
    }else if(now-last_progress>500000){status.faults++;audio_stop();error="Audio IRQ stalled: playback stopped";}
}

void audio_checkpoint(void){if(status.playing&&sb16_blocks()!=seen&&timer_us)audio_step(timer_us());}

int audio_sfx_start(unsigned ch,const uint8_t *data,uint32_t count,unsigned rate,unsigned volume){
    if(!status.available||ch>=AUDIO_VOICES||!data||!count||count>AUDIO_SFX_MAX||rate<4000||rate>48000||volume>127)return 0;
    audio_sfx_stop(ch);struct voice *v=&voices[ch];
    for(uint32_t i=0;i<count;i++)v->owned[i]=data[i];
    v->data=v->owned;v->phase=0;v->step=(uint32_t)(((uint64_t)rate<<16)/AUDIO_RATE);v->volume=volume;v->count=count;
    target=0;
    if(!status.playing){samples=0;if(!start()){v->count=0;v->data=0;return 0;}}
    return 1;
}
int audio_sfx_start_borrowed(unsigned ch,const uint8_t *data,uint32_t count,unsigned rate,unsigned volume,audio_sfx_release_fn release,void *context){
    if(!status.available||ch>=AUDIO_VOICES||!data||!count||count>AUDIO_SFX_MAX||rate<4000||rate>48000||volume>127||!release)return 0;
    audio_sfx_stop(ch);struct voice*v=&voices[ch];v->data=data;v->phase=0;v->step=(uint32_t)(((uint64_t)rate<<16)/AUDIO_RATE);v->volume=volume;v->release=release;v->context=context;v->count=count;
    target=0;if(!status.playing){samples=0;if(!start()){v->count=0;v->data=0;v->release=0;v->context=0;return 0;}}return 1;
}
