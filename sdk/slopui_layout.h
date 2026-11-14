#ifndef SLOPUI_LAYOUT_H
#define SLOPUI_LAYOUT_H
/* SlopUI layout: rectangle cutting plus a flexible linear (row/column) solver.
 * No allocation; every function works on svg_rect values so layouts are
 * recomputed from the current window size each frame (dynamic resizing). */
#include "slopvg.h"

static inline int sui_rw(svg_rect r) { return r.x1 - r.x0; }
static inline int sui_rh(svg_rect r) { return r.y1 - r.y0; }
/* Padding / margins. */
static inline svg_rect sui_inset(svg_rect r, int l, int t, int rr, int b) {
    svg_rect o = { r.x0 + l, r.y0 + t, r.x1 - rr, r.y1 - b };
    if (o.x1 < o.x0) o.x1 = o.x0;
    if (o.y1 < o.y0) o.y1 = o.y0;
    return o;
}
static inline svg_rect sui_pad(svg_rect r, int p) { return sui_inset(r, p, p, p, p); }
/* Cut a strip off one side; the remainder stays in *r. */
static inline svg_rect sui_cut_top(svg_rect *r, int h) { h = svg_clampi(h, 0, sui_rh(*r)); svg_rect o = { r->x0, r->y0, r->x1, r->y0 + h }; r->y0 += h; return o; }
static inline svg_rect sui_cut_bottom(svg_rect *r, int h) { h = svg_clampi(h, 0, sui_rh(*r)); svg_rect o = { r->x0, r->y1 - h, r->x1, r->y1 }; r->y1 -= h; return o; }
static inline svg_rect sui_cut_left(svg_rect *r, int w) { w = svg_clampi(w, 0, sui_rw(*r)); svg_rect o = { r->x0, r->y0, r->x0 + w, r->y1 }; r->x0 += w; return o; }
static inline svg_rect sui_cut_right(svg_rect *r, int w) { w = svg_clampi(w, 0, sui_rw(*r)); svg_rect o = { r->x1 - w, r->y0, r->x1, r->y1 }; r->x1 -= w; return o; }
/* Alignment of a (w,h) box inside r: ax/ay 0=start 1=center 2=end. */
static inline svg_rect sui_align(svg_rect r, int w, int h, int ax, int ay) {
    int x = ax == 1 ? r.x0 + (sui_rw(r) - w) / 2 : ax == 2 ? r.x1 - w : r.x0;
    int y = ay == 1 ? r.y0 + (sui_rh(r) - h) / 2 : ay == 2 ? r.y1 - h : r.y0;
    return svg_rect_make(x, y, w, h);
}

/* Linear layout: each item has a minimum size and a flex weight (0 = fixed).
 * Remaining space after minimums and gaps is shared by weight. If space is
 * short, items keep their minimums in order and later items shrink to 0. */
typedef struct { int min; int flex; } sui_item;
static inline void sui_linear(svg_rect r, int horizontal, int gap, const sui_item *items, int n, svg_rect *out) {
    int total = horizontal ? sui_rw(r) : sui_rh(r), fixed = gap * (n > 0 ? n - 1 : 0), weights = 0;
    for (int i = 0; i < n; i++) { fixed += items[i].min; weights += items[i].flex; }
    int extra = total - fixed; if (extra < 0) extra = 0;
    int pos = horizontal ? r.x0 : r.y0, end = horizontal ? r.x1 : r.y1, given = 0, wseen = 0;
    for (int i = 0; i < n; i++) {
        int sz = items[i].min;
        if (weights && items[i].flex) { wseen += items[i].flex; int upto = extra * wseen / weights; sz += upto - given; given = upto; }
        if (pos + sz > end) sz = end - pos;
        if (sz < 0) sz = 0;
        out[i] = horizontal ? (svg_rect){ pos, r.y0, pos + sz, r.y1 } : (svg_rect){ r.x0, pos, r.x1, pos + sz };
        pos += sz + gap;
        if (pos > end) pos = end;
    }
}
/* Convenience: n equal flexible cells. */
static inline void sui_split(svg_rect r, int horizontal, int gap, int n, svg_rect *out) {
    sui_item it[16]; if (n > 16) n = 16;
    for (int i = 0; i < n; i++) { it[i].min = 0; it[i].flex = 1; }
    sui_linear(r, horizontal, gap, it, n, out);
}
/* Grid cell (col,row) of a cols x rows grid with gaps. */
static inline svg_rect sui_grid_cell(svg_rect r, int cols, int rows, int gap, int col, int row) {
    int cw = (sui_rw(r) - gap * (cols - 1)) / cols, ch = (sui_rh(r) - gap * (rows - 1)) / rows;
    return svg_rect_make(r.x0 + col * (cw + gap), r.y0 + row * (ch + gap), cw, ch);
}
#endif
