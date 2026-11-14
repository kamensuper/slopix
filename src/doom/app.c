/* Doom adapter. Called only by the main thread; never from IRQ handlers.
 * Engine errors return through a GCC builtin recovery point to a window error
 * state. This is not memory isolation: CPU faults still affect the kernel. */
#include "../kernel.h"
#include "../perf.h"
#include "../audio/audio.h"
#include <stdio.h>
#include <string.h>
#include "doomgeneric.h"
#include "doomkeys.h"
#include "doomstat.h"
#include "d_loop.h"
#include "d_main.h"
#include "d_player.h"
#include "m_controls.h"
#include "m_menu.h"
#include "g_game.h"
extern boolean advancedemo;
static intptr_t recovery[5];
static int guarded,initialized,failed,quit_requested,focused,session_open;
static char error[256];
static uint32_t surface[320*200];
static uint64_t virtual_us,host_last,next_tick,stats_epoch,frame_count,stats_frames,work_total;
static unsigned fps10,work_avg;
static int was_visible;
static struct {unsigned char key,down;} keys[512];
static unsigned head,tail;
static unsigned char held[256],delivered[256];
extern size_t doom_heap_used(void);
void doom_fail(const char*s){audio_sfx_clear();copystr(error,s,sizeof(error));failed=1;logstr("DOOM_ERROR: ");logstr(error);logstr("\n");if(guarded)__builtin_longjmp(recovery,1);panic("DOOM error outside guarded call");}
void doom_request_quit(void){audio_sfx_clear();quit_requested=1;M_ClearMenus();if(guarded)__builtin_longjmp(recovery,1);doom_fail("DOOM exit outside update");}
void DG_Init(void){}
void DG_SetWindowTitle(const char*s){logstr("DOOM_TITLE: ");logstr(s);logstr("\n");}
uint32_t DG_GetTicksMs(void){return (uint32_t)(virtual_us/1000);}
void slopix_audio_checkpoint(void){audio_checkpoint();}
void DG_SleepMs(uint32_t ms){(void)ms;slopix_audio_checkpoint(); /* never spin */}
void DG_DrawFrame(void){
 if(native_color(0x123456)==0x123456)memcpy(surface,DG_ScreenBuffer,sizeof(surface));
 else for(unsigned i=0;i<320*200;i++)surface[i]=native_color(DG_ScreenBuffer[i]);
 frame_count++;
}
int DG_GetKey(int*down,unsigned char*key){if(tail==head)return 0;*down=keys[tail].down;*key=keys[tail].key;delivered[*key]=(unsigned char)*down;tail=(tail+1)%512;return 1;}
static void queue_key(unsigned char key,int down){if(!key||held[key]==!!down)return;unsigned n=(head+1)%512;if(n==tail){/* At most 256 distinct held keys, drain releases on next tick. */doom_release_keys();return;}keys[head].key=key;keys[head].down=(unsigned char)!!down;head=n;held[key]=(unsigned char)!!down;}
void doom_release_keys(void){head=tail=0;for(unsigned i=1;i<256;i++)if(held[i]||delivered[i]){keys[head].key=(unsigned char)i;keys[head].down=0;head++;held[i]=0;}}
void doom_focus(int on){focused=on;if(!on)doom_release_keys();}
void doom_scancode(unsigned code,int ext,int down){if(!focused||!initialized||!session_open||failed)return;unsigned char key=0;
 if(code==72)key=KEY_UPARROW;else if(code==80)key=KEY_DOWNARROW;else if(code==75)key=KEY_LEFTARROW;else if(code==77)key=KEY_RIGHTARROW;
 else if(code>=59&&code<=68)key=(unsigned char)(KEY_F1+code-59);
 else if(code==1)key=KEY_ESCAPE;else if(code==28)key=KEY_ENTER;else if(code==14)key=KEY_BACKSPACE;else if(code==15)key=KEY_TAB;
 else if(code==29)key=KEY_FIRE;else if(code==42||code==54)key=KEY_RSHIFT;else if(code==56)key=KEY_RALT;else if(code==57)key=KEY_USE;
 else {static const char map[128]={[2]='1',[3]='2',[4]='3',[5]='4',[6]='5',[7]='6',[8]='7',[9]='8',[10]='9',[11]='0',[12]='-',[13]='=',[16]='q',[17]='w',[18]='e',[19]='r',[20]='t',[21]='y',[22]='u',[23]='i',[24]='o',[25]='p',[30]='a',[31]='s',[32]='d',[33]='f',[34]='g',[35]='h',[36]='j',[37]='k',[38]='l',[44]='z',[45]='x',[46]='c',[47]='v',[48]='b',[49]='n',[50]='m'};if(code<128)key=(unsigned char)map[code];}
 (void)ext;queue_key(key,down);
}
/* LEGACY temporary workaround until the engine runs as an independent ELF:
 * its process-lifetime statics and zone allocation still live in Ring 0.
 * Reopening goes through Doom's real title/demo state rather than forcing
 * the first map using G_DeferedInitNew; this is NOT a process restart. */
void doom_close(void){
 session_open=0;focused=0;quit_requested=0;was_visible=0;
 audio_sfx_clear();doom_release_keys();
 logstr("DOOM_SESSION_CLOSED\n");
}
void doom_open(void){
 if(session_open||failed)return;
 if(initialized){
  M_ClearMenus();
  D_StartTitle(); /* Doom title screen, not a hardcoded episode/map reload. */
  M_StartControlPanel(); /* Present the actual Doom main menu on reopen. */
  /* Drop adapter events too: G_DoLoadLevel clears the engine key state. */
  head=tail=0;memset(held,0,sizeof(held));memset(delivered,0,sizeof(delivered));
  quit_requested=0;session_open=1;was_visible=0;
  host_last=timer_us();next_tick=host_last;stats_epoch=host_last;
  fps10=work_avg=0;memset(surface,0,sizeof(surface));
  logstr("DOOM_TITLE_REENTERED_LEGACY_RING0\n");return;
 }
 logstr("DOOM: initializing\n");guarded=1;
 if(!__builtin_setjmp(recovery)){
  static char *argv[]={"slopix-doom","-iwad","freedoom1.wad","-nomusic","-nogui","-nomouse"};
  virtual_us=1000000;slopix_audio_checkpoint();doomgeneric_Create(6,argv);slopix_audio_checkpoint();
  key_up='w';key_down='s';key_strafeleft='a';key_straferight='d';
  initialized=1;session_open=1;logstr("DOOM_READY\n");
 }guarded=0;host_last=timer_us();next_tick=host_last;stats_epoch=host_last;
}
int doom_update(uint64_t now,int visible){
 uint64_t elapsed=host_last?now-host_last:0;host_last=now;
 if(!initialized||!session_open||quit_requested||failed||!visible){audio_sfx_clear();next_tick=now;was_visible=0;return 0;}
 if(!was_visible){was_visible=1;stats_epoch=now;stats_frames=work_total=0;elapsed=0;}
 /* Hidden windows freeze engine time, preventing huge catch-up bursts. */
 if(elapsed>100000)elapsed=100000;virtual_us+=elapsed;
 if(now<next_tick)return 0;
 /* Keep phase across normal lateness, skip missed presentation deadlines. Simulation still follows virtual_us. */
 next_tick+=1000000/35;if(now>=next_tick)next_tick=now+1000000/35;
 uint64_t start=timer_us();guarded=1;if(!__builtin_setjmp(recovery))doomgeneric_Tick();guarded=0;
 uint64_t work=timer_us()-start;perf_add(P_DOOM,work);work_total+=work;stats_frames++;
 if(now-stats_epoch>=1000000){uint64_t dt=now-stats_epoch;fps10=(unsigned)(stats_frames*10000000/dt);work_avg=(unsigned)(work_total/stats_frames);
  char s[256];int x=0,y=0,health=0,angle=0;if(players[consoleplayer].mo){x=players[consoleplayer].mo->x>>16;y=players[consoleplayer].mo->y>>16;health=players[consoleplayer].health;angle=(int)(players[consoleplayer].mo->angle>>16);}
  snprintf(s,sizeof(s),"DOOM_STATS fps10=%u work_us=%u frames=%lu state=%d tic=%d x=%d y=%d health=%d angle=%d ammo=%d heap=%lu\n",fps10,work_avg,(unsigned long)frame_count,gamestate,gametic,x,y,health,angle,players[consoleplayer].ammo[0],(unsigned long)doom_heap_used());logstr(s);
  stats_epoch=now;stats_frames=work_total=0;
 }return 1;
}
int doom_take_quit(void){int q=quit_requested;quit_requested=0;return q;}
void doom_damage(int x,int y,int w,int h){
 if(failed){damage(x,y+43,w,h-43);return;}
 int scale=(w-24)/320;if(scale>(h-108)/200)scale=(h-108)/200;if(scale<1)scale=1;
 damage(x+(w-320*scale)/2,y+50,320*scale,200*scale);
 damage(x+16,y+50+200*scale+7,w-32,20);
}
void doom_draw(int x,int y,int w,int h){
 if(failed){text(x+24,y+65,"DOOM stopped safely:",0xf87579);text(x+24,y+95,error,0xe8e7ee);text(x+24,y+125,"Other desktop apps remain available",0x8295b8);return;}
 int scale=(w-24)/320;if(scale>(h-108)/200)scale=(h-108)/200;if(scale<1)scale=1;
 int vx=x+(w-320*scale)/2,vy=y+50;
 scaled_blit(surface,320,200,vx,vy,320*scale,200*scale);
 char s[160];snprintf(s,sizeof(s),"Freedoom | %u.%u FPS | work %u.%u ms | digital SFX",fps10/10,fps10%10,work_avg/1000,work_avg%1000/100);text(x+16,vy+200*scale+7,s,0xd5def0);
 text(x+16,vy+200*scale+29,"WASD / arrows | Ctrl fire | Space use | Esc menu",0x8295b8);
}
