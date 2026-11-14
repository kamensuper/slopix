/* Userspace preferences editor. The kernel owns hardware and validates writes. */
#include "gui_kit.h"
static struct sx_prefs prefs;
static const uint32_t palette[]={0x91dfc0,0x9bbcff,0xf5b48c,0xd5a4ef};
static int dirty=1;
static void change(unsigned field,uint32_t value){if(sx_pref_set(field,value)>=0)sx_pref_get(&prefs);dirty=1;}
static void key(unsigned k){
 if(k=='l'||k=='L')change(1,!prefs.light);
 else if(k=='+')change(2,prefs.volume<90?prefs.volume+10:100);
 else if(k=='-')change(2,prefs.volume>10?prefs.volume-10:0);
 else if(k=='m'||k=='M')change(3,!prefs.magnify);
 else if(k=='w'||k=='W')change(4,(prefs.wallpaper+1)%3);
 else if(k=='f'||k=='F')change(5,(prefs.fit+1)%4);
 else if(k=='s'||k=='S'){sx_pref_save();dirty=1;}
 else if(k>='1'&&k<='4')change(0,palette[k-'1']);
}
static void draw(void){gbase("Slopettings / Ring 3");gt(15,49,"Live desktop preferences",0x274d64);
 gbutton(15,82,480,prefs.light?"L: switch to dark":"L: switch to light",0);
 char n[16];gd(n,prefs.volume);gt(16,117,"Master volume: (-/+) ",0x294e62);gt(270,117,n,0x22667b);
 gbutton(15,148,480,prefs.magnify?"M: dock hover enabled":"M: dock hover disabled",0);
 gbutton(15,182,480,"W: next wallpaper | F: fit mode",0);
 gt(20,222,"Accent color: 1   2   3   4",0x23475b);
 for(unsigned i=0;i<4;i++)gf(171+i*61,246,48,22,palette[i]);
 gt(16,281,"S: save preferences to FAT32",0x2d6479);
 gp();dirty=0;}
__attribute__((noreturn)) void _start(void){if(sx_gui_open(GW,GH)<0)sx_exit(1);sx_pref_get(&prefs);
 for(;;){uint64_t e;while((e=sx_gui_poll()))if(sx_gui_event_type(e)==SX_GUI_EVENT_KEY)key((unsigned)e);
 if(dirty){draw();}sx_sleep(16000);}}
