/* Actual preference parser/storage policy under ASan+UBSan, fake FAT device. */
#include <assert.h>
#include <string.h>
#include <stdio.h>
#include "../src/preferences.h"
#include "../src/audio/audio.h"
#include "../src/storage/storage.h"
uint32_t width=1280,height=800,pitch=5120;
const uint8_t wallpaper_rgb[1280*800*3]={0};
static uint8_t files[3][65536];static uint32_t sizes[3];static int fail_write,playing;static unsigned bg,volume;
uint64_t timer_us(void){return 1;}
void desktop_background_changed(void){bg++;}
void logstr(const char*s){(void)s;}
size_t length(const char*s){return strlen(s);}
void copystr(char*d,const char*s,size_t cap){if(cap){snprintf(d,cap,"%s",s);}}
uint32_t blend(uint32_t a,uint32_t b,unsigned t){(void)a;(void)t;return b;}
struct audio_status audio_get_status(void){return(struct audio_status){.playing=playing};}
int audio_volume(unsigned n){volume=n;return 1;}
struct fs_info fat_info(void){return(struct fs_info){.mounted=1,.writable=1};}
const char*fat_error(void){return "Mock storage failure";}
static int slot(const char*s){return !strcmp(s,"SLOP0.CFG")?0:!strcmp(s,"SLOP1.CFG")?1:!strcmp(s,"WALL.PPM")?2:-1;}
int fat_read(const char*s,void*p,uint32_t cap,uint32_t*n){int i=slot(s);if(i<0||!sizes[i]||sizes[i]>cap)return 0;*n=sizes[i];memcpy(p,files[i],*n);return 1;}
int fat_write(const char*s,const void*p,uint32_t n){int i=slot(s);if(fail_write||i<0||n>65536)return 0;sizes[i]=n;memcpy(files[i],p,n);return 1;}
int main(void){
 preferences_init();assert(prefs.volume==65&&volume==65);
 prefs.volume=37;prefs.wallpaper=1;assert(preferences_save());assert(prefs.generation==1);
 prefs.volume=22;assert(preferences_save());assert(prefs.generation==2);
 files[0][0]^=1;preferences_init();assert(prefs.generation==1&&prefs.volume==37);
 fail_write=1;prefs.volume=9;assert(!preferences_save());preferences_init();assert(prefs.volume==37);fail_write=0;
 playing=1;assert(!preferences_save());playing=0;
 const char header[]="P6\n2 2\n255\n";memcpy(files[2],header,sizeof(header)-1);memset(files[2]+sizeof(header)-1,255,12);sizes[2]=sizeof(header)-1+12;
 assert(preferences_wallpaper("WALL.PPM"));assert(prefs.wallpaper==3);for(unsigned fit=0;fit<4;fit++){prefs.fit=fit;for(unsigned y=0;y<800;y+=17)for(unsigned x=0;x<1280;x+=17)(void)preferences_pixel(x,y);}
 sizes[2]--;assert(!preferences_wallpaper("WALL.PPM"));assert(!preferences_wallpaper("TOO_LONG_FILENAME.PPM"));
 const char bad[]="P6\n99999 99999\n255\n";memcpy(files[2],bad,sizeof(bad));sizes[2]=sizeof(bad);assert(!preferences_wallpaper("WALL.PPM"));
 sizes[0]=sizes[1]=0;preferences_init();assert(prefs.volume==65);
 puts("PASS: version/checksum/slot recovery, readback, failed writes, pending audio, bounded PPM/fit modes");
}
