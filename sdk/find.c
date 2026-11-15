/* Standalone search/launcher app, not the old kernel-integrated UI. */
#include "gui_kit.h"
static unsigned mouse_held;
static const char *names[]={"Terminal","3D Demo","DOOM","SlopFind","Settings","FileSlop","SlopBrowse"};
static char query[48];static unsigned qlen,selection;static int dirty=1;
static unsigned matches[7],found;
static int match(const char *a,const char*b){if(!*b)return 1;for(;*a;a++){unsigned i=0;while(a[i]&&b[i]){char x=a[i],y=b[i];if(x>='A'&&x<='Z')x+=32;if(y>='A'&&y<='Z')y+=32;if(x!=y)break;i++;}if(!b[i])return 1;}return 0;}
static void refresh(void){found=0;for(unsigned i=0;i<7;i++)if(match(names[i],query))matches[found++]=i;if(selection>=found)selection=0;dirty=1;}
static void open(void){if(found)sx_desktop_open(matches[selection]);}
static void key(unsigned k){
 if(k==SXK_ENTER)open();else if(k==SXK_UP){if(selection)selection--;dirty=1;}
 else if(k==SXK_DOWN){if(selection+1<found)selection++;dirty=1;}
 else if(k==SXK_BACKSPACE){if(qlen)query[--qlen]=0;refresh();}
 else if(k>=32&&k<=126&&qlen<sizeof(query)-1){query[qlen++]=(char)k;query[qlen]=0;refresh();}
}
static void draw(void){gbase("SlopFind / Ring 3");gt(16,52,"Search installed desktop applications",0x304a60);
 gbutton(15,83,480,query[0]?query:"Type to search...",0);
 for(unsigned i=0;i<found;i++)gbutton(15,121+i*28,480,names[matches[i]],i==selection);
 gt(18,284,"Enter launch | arrows select",0x466577);gp();dirty=0;}
__attribute__((noreturn)) void _start(void){if(sx_gui_open(GW,GH)<0)sx_exit(1);refresh();for(;;){
 uint64_t e;while((e=sx_gui_poll())){if(sx_gui_event_type(e)==SX_GUI_EVENT_CLOSE)sx_exit(0);
 if(sx_gui_event_type(e)==SX_GUI_EVENT_KEY)key((unsigned)e);
 else if(sx_gui_event_type(e)==SX_GUI_EVENT_MOUSE&&sx_gui_left_pressed(e,&mouse_held)){unsigned y=sx_gui_mouse_y(e);if(y>=121&&y<121+found*28){selection=(y-121)/28;open();}}}
 if(dirty){draw();}sx_sleep(14000);}}
