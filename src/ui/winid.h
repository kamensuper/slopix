/* SlopDE window-id invariants, shared by desktop.c and host tests.
 *
 * Window ids are ints because -1 is the "no window" sentinel used by focus,
 * drag, resize, hover and pressed-control state. An id may index the window
 * table only after slopde_win_valid() succeeded on the same path.
 *
 * Why this matters for GCC 14/15 -Warray-bounds: when a helper containing
 * its own "if(id>=count) return;" is inlined into a caller that keeps going
 * and indexes the array, jump threading produces a path on which the
 * compiler knows id>=count, and it reports that index as out of bounds.
 * Validate once where an id leaves shared sentinel state, then pass only
 * valid ids to helpers. */
#ifndef SLOPIX_UI_WINID_H
#define SLOPIX_UI_WINID_H

static inline int slopde_win_valid(int id,int count){return id>=0&&id<count;}

/* Take an id out of a sentinel slot (pressed control, drag, ...). The slot
 * is always cleared; the result is a valid id or -1. */
static inline int slopde_slot_take(int*slot,int count){
    int id=*slot;*slot=-1;
    return slopde_win_valid(id,count)?id:-1;
}
#endif
