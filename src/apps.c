/* Kernel-integrated utilities: bounded static registries and no runtime heap. */
#include "apps.h"
#include "apps/files.h"
#include "ui/shell.h"
#include "preferences.h"
#include "perf.h"
#include "memory.h"
#include "audio/audio.h"
#include "fs/vfs.h"
#include "ui/desktop_backend.h"
#include "display/display.h"
static int equal(const char*a,const char*b){while(*a&&*a==*b){a++;b++;}return *a==*b;}
static const struct application_info applications[]={
 {"Terminal","Edit commands, history and kernel tools",360,240,0},
 {"3D Demo","Cube, teapot, circle and torus",400,340,APP_LEGACY_WINDOW},
 {"DOOM","Freedoom gameplay and digital sound",360,308,APP_LEGACY_WINDOW},
 {"SlopFind","Search applications, commands and help",600,450,0},
 {"Slopettings","Appearance, display, audio and preferences",600,450,0},
 {"FileSlop","Browse and safely manage supported files and folders",540,420,0},
 {"SlopBrowse","Local HTML browser in Ring 3",480,330,0},
 {"Installed app","Standalone installed Ring-3 graphical program",400,320,0}};
_Static_assert(sizeof(applications)/sizeof(applications[0])==APP_COUNT,"application registry");
const struct application_info*app_info(unsigned id){return id<APP_COUNT?&applications[id]:0;}
const char*app_name(unsigned id){const struct application_info*a=app_info(id);return a?a->name:"Unknown";}
struct entry{const char*name,*detail;int app;};
static const struct entry commands[]={
 {"help","List built-in commands and shortcuts",-1},{"clear","Clear Terminal scrollback",-1},{"echo","Print text",-1},{"uname","Kernel architecture",-1},{"version","Slopix release",-1},{"uptime","Kernel uptime and clocksource",-1},{"meminfo","Physical page and reserved memory statistics",-1},{"memtest","Allocator exhaustion and boundary self-test",-1},{"reboot","Restart the kernel",-1},{"ls","List FAT32 files and folders",-1},{"cat","Read a FAT32 text file",-1},{"write","Write a root file",-1},{"append","Append text to a root file",-1},{"rm","Remove a FAT32 file",-1},{"sync","Flush storage",-1},{"diskinfo","Filesystem availability and space",-1},{"audio","Sound tests, volume and device status",-1},{"display","Show or change native-pixel resolution",-1},{"slopfetch","Real kernel and backend information",-1},{"slopmon","Measured work and framebuffer pacing",-1},{"history","Recent Terminal commands",-1},{"date","Read the hardware RTC",-1},{"about","About Slopix",-1},{"audioinfo","Mixer and DMA counters",-1},{"settings","Apply, inspect and save preferences",-1},{"slopfind","Open the graphical launcher",-1},
 {"files","Open the FileSlop root file manager",-1},{"slop","Install, verify and remove .SLOP packages",-1},{"run","Load a standalone Ring-3 ELF from disk",-1},{"ps","Actual process state and scheduler counters",-1},{"kill","Terminate a user process",-1},{"sysinfo","Kernel isolation and scheduler information",-1},
 {"Keyboard shortcuts","Alt+Tab switch | Alt+F4 close | F11 maximize",-2},{"Display help","F12 cycles modes; Settings lists supported sizes",-2},{"Wallpaper help","P6 RGB PPM, FAT32 root 8.3 name, maximum 64 KiB",-2}
};
#define COMMAND_COUNT (sizeof(commands)/sizeof(commands[0]))
#define ENTRY_COUNT (APP_COUNT+COMMAND_COUNT)
static struct entry entry_at(unsigned i){if(i<APP_COUNT){const struct application_info*a=app_info(i);return(struct entry){a->name,a->detail,(int)i};}return commands[i-APP_COUNT];}
static char query[64],path[13];static unsigned qlen,plen,selected,tab;
static unsigned matches[ENTRY_COUNT],match_count;
static char status[100]="Type a name, then Enter; command results prefill Terminal";
static char lower(char c){return c>='A'&&c<='Z'?c+32:c;}
static int contains(const char*s,const char*q){if(!*q)return 1;for(;*s;s++){unsigned i=0;while(q[i]&&s[i]&&lower(q[i])==lower(s[i]))i++;if(!q[i])return 1;}return 0;}
static void search(void){match_count=0;for(unsigned i=0;i<ENTRY_COUNT;i++){struct entry e=entry_at(i);if(contains(e.name,query)||contains(e.detail,query))matches[match_count++]=i;}if(selected>=match_count)selected=0;}
static uint32_t ink(void){return prefs.light?0x283447:0xd5def0;}
static uint32_t muted(void){return prefs.light?0x53647a:0x9aabc6;}
static void button(int x,int y,int w,const char*label,int active){roundbox(x,y,w,30,3,active?prefs.accent:(prefs.light?0xd4dceb:0x283650),255);text(x+9,y+5,label,active?0x152039:ink());}
static void launch(void){if(!match_count)return;struct entry chosen=entry_at(matches[selected]);const struct entry*e=&chosen;if(e->app>=0)desktop_open_app((unsigned)e->app);else if(e->app==-1){desktop_open_app(0);terminal_prefill(e->name);}else copystr(status,e->detail,sizeof(status));logstr("FIND_SELECTED: ");logstr(e->name);logstr("\n");}
void app_opened(unsigned id){(void)id; /* all desktop utilities own Ring-3 state */}
void apps_key(unsigned id,unsigned key){
 if(id==5){files_key(key);return;}
 if(id==3){if(key==KEY_UP){if(selected)selected--;}else if(key==KEY_DOWN){if(selected+1<match_count)selected++;}else if(key==KEY_ENTER)launch();else if(key==KEY_BACKSPACE){if(qlen)query[--qlen]=0;selected=0;}else if(key==KEY_ERASE){query[qlen=0]=0;selected=0;}else if(key>=32&&key<=126&&qlen<sizeof(query)-1){query[qlen++]=(char)key;query[qlen]=0;selected=0;}search();}
 if(id==4&&tab==0){if(key==KEY_BACKSPACE){if(plen)path[--plen]=0;}else if(key==KEY_ENTER){if(preferences_wallpaper(path))preferences_changed(1);}else if(key>=33&&key<=126&&plen<sizeof(path)-1){path[plen++]=(char)key;path[plen]=0;}}
}
static const unsigned modes[][2]={{800,600},{1024,600},{1024,768},{1280,720},{1280,800},{1440,900},{1600,900},{1920,1080}};
static void number(char*s,uint64_t n){char b[21];decimal(n,b);copystr(s+length(s),b,128-length(s));}
static void mode_label(char*s,unsigned i){s[0]=0;number(s,modes[i][0]);copystr(s+length(s),"x",128-length(s));number(s,modes[i][1]);}
void apps_draw(unsigned id,int x,int y,int w,int h){
 if(id==5){files_draw(x,y,w,h);return;}
 uint32_t c=ink();
 if(id==3){search();text(x+20,y+57,"Find apps, commands and help",c);roundbox(x+18,y+83,w-36,34,7,prefs.light?0xd4dceb:0x283650,255);text(x+29,y+90,query[0]?query:"Search...",c);
 unsigned start=selected>7?selected-7:0;for(unsigned row=0;row<8&&row+start<match_count&&130+(int)row*32<h-65;row++){unsigned n=row+start;struct entry chosen=entry_at(matches[n]);const struct entry*e=&chosen;if(n==selected)roundbox(x+18,y+125+(int)row*32,w-36,30,5,prefs.accent,255);text(x+28,y+130+(int)row*32,e->name,n==selected?0x152039:c);}
 if(match_count)text(x+20,y+h-57,entry_at(matches[selected]).detail,muted());else text(x+20,y+h-57,"No matches",muted());text(x+20,y+h-30,status,muted());return;}
 if(id!=4)return;
 const char*tabs[]={"Appearance","Display","Audio","Desktop"};for(unsigned i=0;i<4;i++)button(x+18+(int)i*142,y+55,134,tabs[i],tab==i);
 if(tab==0){
 text(x+20,y+100,"Wallpaper",c);const char*bg[]={"Original","Azure tide","Solid"};for(unsigned i=0;i<3;i++)button(x+20+(int)i*150,y+125,142,bg[i],prefs.wallpaper==i);
 const char*fits[]={"Fill","Fit","Center","Tile"};text(x+20,y+172,"Background placement",c);for(unsigned i=0;i<4;i++)button(x+20+(int)i*140,y+198,132,fits[i],prefs.fit==i);
 text(x+20,y+242,"Accent",c);const uint32_t colors[]={0x91dfc0,0x9bbcff,0xf5b48c,0xd5a4ef};for(unsigned i=0;i<4;i++)roundbox(x+110+(int)i*62,y+239,50,26,6,colors[i],255);button(x+382,y+237,190,prefs.light?"Theme: light":"Theme: dark",0);
 text(x+20,y+282,"Custom P6 PPM root filename (type, then Enter):",c);button(x+20,y+309,w-40,path[0]?path:"WALL.PPM",prefs.wallpaper==3);const char*themes[]={"Classic","Aero","Dark","Custom"};for(unsigned i=0;i<4;i++)button(x+20+(int)i*140,y+354,132,themes[i],0);if(h>=464)button(x+20,y+390,132,"Minimal",0);
 }else if(tab==1){char s[128]="Current: ";number(s,width);copystr(s+length(s),"x",128-length(s));number(s,height);text(x+20,y+103,s,c);for(unsigned i=0;i<8;i++){mode_label(s,i);button(x+20+(int)(i%3)*180,y+139+(int)(i/3)*45,170,s,width==modes[i][0]&&height==modes[i][1]);}text(x+20,y+295,display_available()?"Native pixels. F12 also cycles modes.":"Fixed boot framebuffer: mode changes unavailable",muted());
 }else if(tab==2){struct audio_status a=audio_get_status();text(x+20,y+105,a.available?"SB16 / 22050 Hz / mono / 8-bit DMA":"No supported audio device",c);char s[128]="Master volume: ";number(s,prefs.volume);copystr(s+length(s)," percent",128-length(s));text(x+20,y+147,s,c);button(x+20,y+180,130,"- 10",0);button(x+160,y+180,130,"+ 10",0);button(x+300,y+180,130,prefs.volume?"Mute":"Unmute",0);button(x+20,y+226,200,"Test tone",0);s[0]=0;copystr(s,"Underruns: ",128);number(s,a.underruns);text(x+20,y+280,s,c);text(x+20,y+310,audio_error(),muted());
 }else {text(x+20,y+108,"Desktop backend",c);const char*bes[]={"SlopDE 3 (floating)","dwm (tiling)"};for(unsigned i=0;i<2;i++)button(x+20+(int)i*260,y+145,250,bes[i],prefs.desktop_backend==i);text(x+20,y+198,"Panel hover emphasis",c);button(x+20,y+225,250,prefs.magnify?"Hover emphasis: on":"Hover emphasis: off",0);button(x+20,y+275,250,ui_shell_options()&1?"Panel auto-hide: on":"Panel auto-hide: off",0);button(x+290,y+275,250,ui_shell_options()&2?"Panel: top":"Panel: bottom",0);const char*presets[]={"Classic","Dock","Minimal"};for(unsigned i=0;i<3;i++)button(x+20+(int)i*180,y+325,170,presets[i],((ui_shell_options()>>2)&3)==i);text(x+20,y+373,"Alt+Tab switch | Alt+F4 close | F11 restore",c);text(x+20,y+405,ui_shell_status(),muted());}
 button(x+20,y+h-46,180,"Save preferences",0);text(x+211,y+h-39,preferences_status(),muted());
}
void apps_mouse(unsigned id,int x,int y,int w,int h){
 if(id==5){files_mouse(x,y,w,h);return;}
 if(id==3){unsigned start=selected>7?selected-7:0;if(y>=125&&y<h-65&&x>=18&&x<w-18&&(y-125)/32<8&&(y-125)%32<30){unsigned n=(unsigned)(y-125)/32+start;if(n<match_count){selected=n;launch();}}return;}
 if(id!=4)return;
 if(y>=55&&y<85&&x>=18&&x<18+4*142&&(x-18)%142<134){tab=(unsigned)(x-18)/142;return;}
 if(y>=h-46&&y<h-16&&x>=20&&x<200){preferences_save();ui_shell_save();return;}
 if(tab==0){
 if(h>=464&&y>=390&&y<420&&x>=20&&x<152){prefs.light=1;prefs.accent=0x87aaba;prefs.wallpaper=2;prefs.magnify=0;ui_shell_configure((ui_shell_options()&3)|8);preferences_changed(1);return;}
 if(y>=354&&y<384&&x>=20&&x<580&&(x-20)%140<132){unsigned theme=(unsigned)(x-20)/140;if(theme<3){prefs.light=theme!=2;prefs.accent=theme==0?0xeac95c:theme==1?0x91c8e8:0x80b6cd;preferences_changed(1);}else {prefs.light=1;prefs.accent=0x91dfc0;preferences_changed(1);}return;}
 if(y>=125&&y<155&&x>=20&&x<470&&(x-20)%150<142){prefs.wallpaper=(unsigned)(x-20)/150;preferences_changed(1);}
 else if(y>=198&&y<228&&x>=20&&x<580&&(x-20)%140<132){prefs.fit=(unsigned)(x-20)/140;preferences_changed(1);}
 else if(y>=237&&y<267){const uint32_t colors[]={0x91dfc0,0x9bbcff,0xf5b48c,0xd5a4ef};if(x>=110&&x<358&&(x-110)%62<50&&y>=239&&y<265)prefs.accent=colors[(x-110)/62];else if(x>=382&&x<572)prefs.light=!prefs.light;else return;preferences_changed(1);}
 }else if(tab==1&&y>=139&&y<274&&x>=20&&x<560&&(x-20)%180<170&&(y-139)%45<30){unsigned i=(unsigned)(y-139)/45*3+(unsigned)(x-20)/180;if(i<8&&display_set(modes[i][0],modes[i][1])){prefs.display_w=width;prefs.display_h=height;preferences_changed(0);}}
 else if(tab==2){if(y>=180&&y<210){if(x>=20&&x<150)prefs.volume=prefs.volume>=10?prefs.volume-10:0;else if(x>=160&&x<290)prefs.volume=prefs.volume<=90?prefs.volume+10:100;else if(x>=300&&x<430)prefs.volume=prefs.volume?0:65;else return;preferences_changed(0);}else if(y>=226&&y<256&&x>=20&&x<220)audio_tone(440,300);}
 else if(tab==3){
    if(y>=145&&y<195&&x>=20&&x<540){
        unsigned i=(unsigned)(x-20)/260;
        if(i<2&&prefs.desktop_backend!=i){
            prefs.desktop_backend=i;
            preferences_changed(1);
        }
    }else if(y>=225&&y<255&&x>=20&&x<270){prefs.magnify=!prefs.magnify;preferences_changed(0);}
    else if(y>=275&&y<305&&x>=20&&x<270)ui_shell_configure(ui_shell_options()^1);
    else if(y>=275&&y<305&&x>=290&&x<540)ui_shell_configure(ui_shell_options()^2);
    else if(y>=325&&y<355&&x>=20&&x<560&&(x-20)%180<170)ui_shell_configure((ui_shell_options()&3)|((unsigned)(x-20)/180<<2));
}
}
static void info(void(*out)(const char*),const char*label,uint64_t n,const char*unit){char s[128];copystr(s,label,sizeof(s));number(s,n);copystr(s+length(s),unit,sizeof(s)-length(s));out(s);}
static void fetch(void(*out)(const char*)){
 out("   ____  Slopix 0.9");out("  / __/  Original x86_64 kernel");out(" _\\ \\    SlopDE 3 / C + Assembly + Rust");out("/___/    Kernel-integrated applications");
 char cpu[64];extern void arch_cpu_name(char*,unsigned);arch_cpu_name(cpu,sizeof(cpu));out(cpu);
 info(out,"Uptime: ",timer_us()/1000000," seconds");info(out,"Boot-map usable RAM: ",boot_usable/1024," KiB");info(out,"PMM available: ",mr_pmm_stat(0)*4," KiB");info(out,"PMM allocated: ",mr_pmm_stat(1)*4," KiB");info(out,"Display width: ",width," pixels");info(out,"Display height: ",height," pixels");out(display_available()?"Graphics: QEMU std VGA / C software renderer":"Graphics: fixed boot framebuffer / C software renderer");out(audio_get_status().available?"Audio: SB16 / digital PCM":"Audio: unavailable");struct fs_info f=vfs_info();out(f.mounted?(f.writable?"Storage: FAT32 read-write":"Storage: FAT32 read-only"):"Storage: unavailable");out(desktop_backend_name());info(out,"Open desktop applications: ",desktop_open_count(),"");
}
int apps_terminal(const char*name,char*args,void(*out)(const char*)){
 if(equal(name,"slopfetch")){fetch(out);return 1;}
 if(equal(name,"about")){out("Slopix 0.9 / SlopDE - an original x86_64 hobby OS");out("First-party C, Assembly and freestanding Rust. GPLv3+ distribution.");out("DOOM uses DoomGeneric and Freedoom; see THIRD-PARTY.md.");return 1;}
 if(equal(name,"date")){char s[128];extern int arch_date(char*,unsigned);out(arch_date(s,sizeof(s))?s:"Hardware RTC unavailable");return 1;}
 if(equal(name,"files")){desktop_open_app(5);return 1;}
 if(equal(name,"slopfind")){desktop_open_app(3);return 1;}
 if(!equal(name,"settings"))return 0;
 if(!*args){desktop_open_app(4);return 1;}
 if(equal(args,"show")){info(out,"Wallpaper: ",prefs.wallpaper,"");info(out,"Fit: ",prefs.fit,"");info(out,"Volume: ",prefs.volume,"");out(prefs.path);out(preferences_status());return 1;}
 if(equal(args,"save")){preferences_save();out(preferences_status());return 1;}
 if(equal(args,"defaults")){prefs.wallpaper=0;prefs.fit=0;prefs.accent=0x91dfc0;prefs.light=0;prefs.volume=65;prefs.magnify=1;prefs.path[0]=0;preferences_changed(1);return 1;}
 unsigned prefix=0;while(prefix<9&&args[prefix]&&args[prefix]=="wallpaper"[prefix])prefix++;
 if(prefix==9&&args[9]==' '){if(preferences_wallpaper(args+10))preferences_changed(1);out(preferences_status());return 1;}
 /* Strict decimal controls for scripting/tests; each maps to actual preferences. */
 char*value=args;while(*value&&*value!=' ')value++;if(!*value){out("settings show | save | defaults | wallpaper NAME.PPM | bg 0..2 | fit 0..3 | volume 0..100 | theme 0..1 | dock 0..1");return 1;}*value++=0;unsigned v=0,n=0;while(*value>='0'&&*value<='9'&&n<6){v=v*10+(unsigned)(*value++-'0');n++;}int ok=n&&!*value;
 if(ok&&equal(args,"bg")&&v<=2)prefs.wallpaper=v;else if(ok&&equal(args,"fit")&&v<4)prefs.fit=v;else if(ok&&equal(args,"volume")&&v<=100)prefs.volume=v;else if(ok&&equal(args,"theme")&&v<2)prefs.light=v;else if(ok&&equal(args,"dock")&&v<2)prefs.magnify=v;else if(ok&&equal(args,"de")&&v<2)prefs.desktop_backend=v;else {out("Invalid setting or value");return 1;}preferences_changed(!equal(args,"volume")&&!equal(args,"dock")&&!equal(args,"de"));out("Setting applied");return 1;
}

void apps_context(unsigned id,int x,int y,int w,int h){if(id==5)files_context(x,y,w,h);}

int app_allow_close(unsigned id){(void)id;return 1;}
