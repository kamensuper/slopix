/* Versioned bounded preferences. Existing FAT COW API, two recovery slots.
 * This does not make FAT directory publication atomic across power loss. */
#include "preferences.h"
#include "storage/storage.h"
#include "audio/audio.h"
struct preferences prefs;
static const char *status="Session defaults; no settings saved";
static unsigned custom_w,custom_h;
static uint8_t custom[FS_MAX_FILE],incoming[FS_MAX_FILE];
static int pending;static uint64_t save_after;
static const char*slots[]={"SLOP0.CFG","SLOP1.CFG"};
static uint32_t checksum(const struct preferences*p){const uint8_t*b=(const uint8_t*)p;uint32_t h=2166136261u;for(unsigned i=0;i<sizeof(*p)-4;i++)h=(h^b[i])*16777619u;return h;}
/* Config schema version 2: SlopDE is the default desktop backend (dwm stays
 * selectable). Version 1 config files are not accepted because they predate
 * the default change and would silently restore dwm; they fall back to these
 * defaults and are replaced by the next save. */
static int valid(const struct preferences*p){return p->magic==0x504f4c53&&p->version>=2&&p->bytes==sizeof(*p)&&p->checksum==checksum(p)&&p->wallpaper<=3&&p->fit<4&&p->accent<=0xffffff&&p->light<2&&p->volume<=100&&p->magnify<2&&p->display_w>=800&&p->display_w<=1920&&!(p->display_w&7)&&p->display_h>=600&&p->display_h<=1080&&p->desktop_backend<2&&p->path[15]==0;}
static int number(const uint8_t*b,uint32_t n,unsigned*at,unsigned*out){while(*at<n&&(b[*at]==' '||b[*at]=='\n'||b[*at]=='\r'||b[*at]=='\t'))(*at)++;unsigned v=0,d=0;while(*at<n&&b[*at]>='0'&&b[*at]<='9'){if(++d>5)return 0;v=v*10+b[(*at)++]-'0';}*out=v;return d!=0;}
int preferences_wallpaper(const char*name){
 if(audio_get_status().playing){status="Stop playback before loading a custom image";return 0;}
 if(length(name)>12){status="Use a FAT32 root 8.3 filename";return 0;}
 uint32_t n=0;if(!fat_read(name,incoming,sizeof(incoming),&n)){status=fat_error();return 0;}
 unsigned at=2,w,h,maxval;if(n<8||incoming[0]!='P'||incoming[1]!='6'||!number(incoming,n,&at,&w)||!number(incoming,n,&at,&h)||!number(incoming,n,&at,&maxval)||maxval!=255||!w||!h||w>1024||h>1024||at>=n){status="Invalid P6 RGB wallpaper";return 0;}
 if(incoming[at]!='\n'&&incoming[at]!=' '&&incoming[at]!='\t'&&incoming[at]!='\r'){status="Invalid PPM separator";return 0;}if(incoming[at++]=='\r'&&at<n&&incoming[at]=='\n')at++;
 uint64_t bytes=(uint64_t)w*h*3;if(bytes!=n-at||bytes>sizeof(custom)){status="Wallpaper size does not match pixels";return 0;}
 for(unsigned i=0;i<bytes;i++)custom[i]=incoming[at+i];custom_w=w;custom_h=h;copystr(prefs.path,name,sizeof(prefs.path));prefs.wallpaper=3;status="Custom wallpaper loaded";return 1;
}
void preferences_init(void){
 prefs=(struct preferences){.magic=0x504f4c53,.version=2,.bytes=sizeof(prefs),.wallpaper=1,.fit=0,.accent=0x91c8e8,.light=1,.volume=65,.magnify=1,.display_w=1280,.display_h=800,.desktop_backend=0};
 struct preferences best=prefs,p;int found=0;uint32_t n;
 for(unsigned i=0;i<2;i++)if(fat_read(slots[i],&p,sizeof(p),&n)&&n==sizeof(p)&&valid(&p)&&(!found||p.generation>best.generation)){best=p;found=1;}
 if(found){prefs=best;status="Settings loaded from FAT32";logstr("PREFERENCES_LOADED\n");if(prefs.wallpaper==3){char name[16];copystr(name,prefs.path,sizeof(name));if(!preferences_wallpaper(name)){prefs.wallpaper=0;status="Saved wallpaper unavailable; default selected";}}}
 else status=fat_info().mounted?"Defaults: no valid settings file":"Session only: no FAT32 disk";
 audio_volume(prefs.volume);
}
const char*preferences_status(void){return status;}
void preferences_changed(int background){audio_volume(prefs.volume);if(background)desktop_background_changed();pending=1;save_after=timer_us()+1500000;status="Applied; save pending";}
int preferences_save(void){
 if(audio_get_status().playing){pending=1;status="Applied; save waits for audio playback to finish";return 0;}
 if(!fat_info().mounted||!fat_info().writable){pending=0;status="Session only: storage unavailable or read-only";return 0;}
 struct preferences p=prefs;if(p.generation==UINT32_MAX){status="Configuration generation exhausted";pending=0;return 0;}p.generation++;p.checksum=checksum(&p);
 if(!fat_write(slots[p.generation&1],&p,sizeof(p))){status=fat_error();pending=0;return 0;}
 struct preferences check;uint32_t n=0;if(!fat_read(slots[p.generation&1],&check,sizeof(check),&n)||n!=sizeof(check)||!valid(&check)||check.generation!=p.generation){status="Configuration readback failed";pending=0;return 0;}
 prefs=p;pending=0;status="Saved and synced to FAT32";logstr("PREFERENCES_SAVED\n");return 1;
}
void preferences_step(uint64_t now){if(pending&&now>=save_after&&!audio_get_status().playing)preferences_save();}
uint32_t preferences_pixel(unsigned x,unsigned y){
 extern const uint8_t wallpaper_rgb[];uint32_t solid=prefs.light?0xd8e0ed:0x16243c;
 if(prefs.wallpaper==2)return prefs.accent;
 if(prefs.wallpaper==1){
  /* Original Azure tide: smooth diagonal light ribbons, rendered only when
   * the desktop background cache is rebuilt, with no floating-point work. */
  unsigned nx=x*1024/(width?width:1),ny=y*1024/(height?height:1);
  uint32_t base=blend(0x073d6c,0x31a3b4,ny*255/1024);
  int d=(int)nx+(int)ny/2-720;if(d<0)d=-d;
  unsigned glow=d<400?(400-(unsigned)d)*105/400:0;
  base=blend(base,0x9de7df,glow);
  int ribbon=(int)ny*3-(int)nx-1350;if(ribbon<0)ribbon=-ribbon;
  if(ribbon<110)base=blend(base,0x8ad8e8,(110-(unsigned)ribbon)*65/110);
  return base;
 }
 unsigned sw=prefs.wallpaper==3?custom_w:1280,sh=prefs.wallpaper==3?custom_h:800;
 const uint8_t*data=prefs.wallpaper==3?custom:wallpaper_rgb;if(!sw||!sh)return solid;
 int sx,sy;
 if(prefs.fit==3){sx=x%sw;sy=y%sh;}
 else if(prefs.fit==2){sx=(int)x-((int)width-(int)sw)/2;sy=(int)y-((int)height-(int)sh)/2;}
 else {unsigned dw=width,dh=(unsigned)((uint64_t)sh*width/sw);if((prefs.fit==0&&dh<height)||(prefs.fit==1&&dh>height)){dh=height;dw=(unsigned)((uint64_t)sw*height/sh);}if(!dw||!dh)return solid;int px=(int)x-((int)width-(int)dw)/2,py=(int)y-((int)height-(int)dh)/2;if(px<0||py<0||(unsigned)px>=dw||(unsigned)py>=dh)return solid;sx=(int)((uint64_t)px*sw/dw);sy=(int)((uint64_t)py*sh/dh);}
 if(sx<0||sy<0||(unsigned)sx>=sw||(unsigned)sy>=sh)return solid;size_t at=((size_t)sy*sw+(unsigned)sx)*3;return (uint32_t)data[at]<<16|(uint32_t)data[at+1]<<8|data[at+2];
}
