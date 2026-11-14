/* SlopDE 3 regression test: window-id validation.
 *
 * Guards the invariant behind the GCC 14/15 -Warray-bounds failure in
 * slopde_mouse(): a window id may index the window table only after
 * slopde_win_valid() succeeded on the same path, and the pressed-control
 * slot only ever yields -1 or a valid id. The press/release model below
 * mirrors desktop.c so close and minimize keep their release semantics. */
#include <limits.h>
#include <stdio.h>
#include "../src/ui/winid.h"
#define APPS 8
static int failures;
#define CHECK(c) do{if(!(c)){printf("FAIL %s:%d %s\n",__FILE__,__LINE__,#c);failures++;}}while(0)
struct window {int open,minimized;};
static struct window windows[APPS];
static int press_slot=-1,press_part,closed_count;
enum {NONE,CLOSE,MINIMIZE};
static void press(int id,int part){if(slopde_win_valid(id,APPS)){press_slot=id;press_part=part;}}
/* Same shape as the release branch in slopde_mouse(). */
static int release(int over_id,int over_part){
    int part=press_part;press_part=NONE;
    int id=slopde_slot_take(&press_slot,APPS);
    if(!slopde_win_valid(id,APPS))return -1;
    if(windows[id].open&&over_id==id&&over_part==part){
        windows[id].open=0;windows[id].minimized=part==MINIMIZE;closed_count++;
    }
    return id;
}
int main(void){
    /* Boundaries, including the exact out-of-range index GCC reported. */
    CHECK(slopde_win_valid(0,APPS));
    CHECK(slopde_win_valid(APPS-1,APPS));
    CHECK(!slopde_win_valid(APPS,APPS));
    CHECK(!slopde_win_valid(-1,APPS));
    CHECK(!slopde_win_valid(INT_MIN,APPS));
    CHECK(!slopde_win_valid(INT_MAX,APPS));
    /* A huge unsigned id converted to int must not wrap into range. */
    CHECK(!slopde_win_valid((int)(unsigned)UINT_MAX,APPS));
    CHECK(!slopde_win_valid(0,0));
    /* slot_take always clears the slot and never returns an invalid id. */
    int values[]={-1,0,3,APPS-1,APPS,APPS+1,-7,INT_MAX,INT_MIN};
    for(unsigned i=0;i<sizeof values/sizeof values[0];i++){
        int slot=values[i],got=slopde_slot_take(&slot,APPS);
        CHECK(slot==-1);
        CHECK(got==-1||slopde_win_valid(got,APPS));
        CHECK(got==(slopde_win_valid(values[i],APPS)?values[i]:-1));
    }
    /* Close on release over the same control. */
    for(int i=0;i<APPS;i++)windows[i].open=1;
    press(2,CLOSE);CHECK(release(2,CLOSE)==2);CHECK(!windows[2].open&&!windows[2].minimized);
    /* Minimize on release; moving off cancels. */
    press(5,MINIMIZE);CHECK(release(4,MINIMIZE)==5);CHECK(windows[5].open);
    press(5,MINIMIZE);CHECK(release(5,MINIMIZE)==5);CHECK(!windows[5].open&&windows[5].minimized);
    /* Invalid presses are never stored; a release without press is inert. */
    press(APPS,CLOSE);press(-1,CLOSE);CHECK(press_slot==-1);
    int before=closed_count;CHECK(release(APPS-1,CLOSE)==-1);CHECK(closed_count==before);
    /* A corrupted slot (stale sentinel) is rejected and cleared. */
    press_slot=APPS;press_part=CLOSE;CHECK(release(APPS,CLOSE)==-1);CHECK(press_slot==-1);
    /* Double release does not act twice. */
    windows[1].open=1;press(1,CLOSE);release(1,CLOSE);before=closed_count;CHECK(release(1,CLOSE)==-1);CHECK(closed_count==before);
    if(failures){printf("slopde-window-test: %d failure(s)\n",failures);return 1;}
    printf("slopde-window-test: ok\n");return 0;
}
