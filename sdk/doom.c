/* True userspace DoomGeneric process. No engine tick executes in Ring 0.
 * WAD: FREEDOM.WAD on FAT32. Syscalls provide event input, PCM and GUI pixels. */
#include "slopix.h"
#include "doomgeneric.h"
#include "doomkeys.h"
#include "doomstat.h"
#include "d_main.h"
#include "m_controls.h"
#include <stddef.h>
#include <stdint.h>

static struct {unsigned char key,down;} keys[256];
static unsigned head,tail;static unsigned char held[256];
static int visible=1;
extern void doomgeneric_Tick(void);
void logstr(const char*s){unsigned n=0;while(s[n]){unsigned chunk=0;while(s[n+chunk]&&chunk<100)chunk++;sx_write(s+n,chunk);n+=chunk;}}
__attribute__((noreturn)) void doom_fail(const char*s){logstr("DOOM_RING3_ERROR: ");logstr(s);logstr("\n");sx_exit(90);}
void DG_Init(void){
 /* DoomGeneric calls this at the top of its endless platform tick loop, after
  * D_DoomMain has initialized graphics, view sizing, and the demo loop. */
 key_up='w';key_down='s';key_strafeleft='a';key_straferight='d';
 logstr("DOOM_RING3_READY\n");
}
void DG_SetWindowTitle(const char*s){(void)s;}
uint32_t DG_GetTicksMs(void){return (uint32_t)(sx_time()/1000);}
void slopix_audio_checkpoint(void){sx_yield();}
void DG_SleepMs(uint32_t ms){if(ms)sx_sleep((uint64_t)ms*1000);}
void DG_DrawFrame(void){if(sx_gui_present(DG_ScreenBuffer,320u*200u)<0)doom_fail("surface present failed");}
int DG_GetKey(int*down,unsigned char*key){if(tail==head)return 0;*down=keys[tail].down;*key=keys[tail].key;tail=(tail+1)%256;return 1;}
static void queue(unsigned char key,int down){if(!key||held[key]==!!down)return;unsigned next=(head+1)%256;if(next==tail)return;
 keys[head].key=key;keys[head].down=(unsigned char)!!down;head=next;held[key]=(unsigned char)!!down;}
static void release(void){for(unsigned i=1;i<256;i++)if(held[i])queue((unsigned char)i,0);}
static void scancode(unsigned code,int ext,int down){
 unsigned char key=0;
 if(code==72)key=KEY_UPARROW;else if(code==80)key=KEY_DOWNARROW;else if(code==75)key=KEY_LEFTARROW;else if(code==77)key=KEY_RIGHTARROW;
 else if(code>=59&&code<=68)key=(unsigned char)(KEY_F1+code-59);
 else if(code==1)key=KEY_ESCAPE;else if(code==28)key=KEY_ENTER;else if(code==14)key=KEY_BACKSPACE;else if(code==15)key=KEY_TAB;
 else if(code==29)key=KEY_FIRE;else if(code==42||code==54)key=KEY_RSHIFT;else if(code==56)key=KEY_RALT;else if(code==57)key=KEY_USE;
 else{static const char map[128]={[2]='1',[3]='2',[4]='3',[5]='4',[6]='5',[7]='6',[8]='7',[9]='8',[10]='9',[11]='0',[12]='-',[13]='=',[16]='q',[17]='w',[18]='e',[19]='r',[20]='t',[21]='y',[22]='u',[23]='i',[24]='o',[25]='p',[30]='a',[31]='s',[32]='d',[33]='f',[34]='g',[35]='h',[36]='j',[37]='k',[38]='l',[44]='z',[45]='x',[46]='c',[47]='v',[48]='b',[49]='n',[50]='m'};if(code<128)key=(unsigned char)map[code];}
 (void)ext;queue(key,down);
}
__attribute__((noreturn)) void _start(void){
 unsigned short cs;__asm__ volatile("mov %%cs,%0":"=r"(cs));if((cs&3)!=3)sx_exit(90);
 if(sx_gui_open(320,200)<0)sx_exit(91);
 logstr("DOOM_RING3_BOOT\n");
 static char *argv[]={"doom","-iwad","FREEDOM.WAD","-nomusic","-nogui","-nomouse"};
 doomgeneric_Create(6,argv);
 doom_fail("DoomGeneric main loop returned unexpectedly");
 uint64_t next=sx_time();for(;;){uint64_t e;while((e=sx_gui_poll())){
  unsigned type=sx_gui_event_type(e);
  if(type==4)scancode((unsigned)(e&255),(int)((e>>8)&1),(int)((e>>9)&1));
  else if(type==3){visible=!!(e&1);if(!visible)release();}
 }
 uint64_t now=sx_time();if(!visible){sx_sleep(25000);next=now;continue;}
 if(now<next){sx_sleep(next-now);continue;}
 doomgeneric_Tick();next=now+28571;
 }
}
/* Vendor's instrumentation calls this symbol even in freestanding builds. */
uint64_t timer_us(void){return sx_time();}

void perf_record(unsigned id, uint64_t us) { (void)id; (void)us; }
