#ifndef SLOPUI_H
#define SLOPUI_H
/* SlopUI widgets — reusable native controls for Slopix ring-3 applications.
 *
 * Built on SlopVG (drawing), SlopFont (text), slopui_theme.h (tokens) and
 * slopui_layout.h (geometry). Immediate-mode with explicit per-window state:
 * every bit of interaction state lives in a caller-owned sui_ctx, so several
 * windows/processes never share hidden globals. No heap, no floating point.
 *
 * Frame model (one pass per input event, then one painted pass):
 *     sui_ctx ui; sui_init(&ui, &surface, &theme);
 *     while ((e = sx_gui_poll())) { sui_feed_sx(&ui, e); build(&ui, 0); }
 *     if (ui.dirty) { build(&ui, 1); present(); }
 * build() calls sui_begin(), the widgets, then sui_end(). In a non-painting
 * pass widgets only handle input, so many events cost one redraw.
 *
 * Ids: any non-zero uint32 chosen by the app, unique within its window.
 * Focus: Tab (and optionally Up/Down) cycles focusable widgets in call order;
 * Enter/Space activates, Left/Right adjusts sliders, typing edits text fields.
 * Mouse: press captures the widget under the pointer (active), release over
 * the same widget is a click; sliders and scrollbars track drags while held.
 * Hover is drawn whenever the kernel reports pointer motion events. */
#include "slopix.h"
#include "slopui_theme.h"
#include "slopui_layout.h"

#define SUI_MAX_TEXT 1024

typedef struct {
    svg_surface *s;
    const sui_theme *t;
    /* input for the current pass */
    int mx, my;             /* pointer position (client pixels) */
    int mdown;              /* left button currently held */
    int pressed, released;  /* left button edges during this pass */
    unsigned key;           /* pending key code (0 = none / consumed) */
    /* persistent interaction state */
    uint32_t hot, active, focus;
    uint32_t first_focusable, last_focusable, prev_focusable;
    int nav;                /* +1 next, -1 previous, 0 none (consumed when applied) */
    int nav_take;           /* next focusable widget takes focus */
    int arrow_nav;          /* Up/Down also move focus */
    int paint;              /* this pass draws */
    int disabled;           /* widgets created while set ignore input */
    int dirty;              /* something changed: repaint required */
    int drag_off;           /* scrollbar thumb grab offset */
} sui_ctx;

static inline void sui_init(sui_ctx *c, svg_surface *s, const sui_theme *t) {
    sui_ctx z = {0}; *c = z; c->s = s; c->t = t; c->mx = c->my = -1; c->dirty = 1;
}

/* ---------- input ---------- */
static inline void sui_feed_mouse(sui_ctx *c, int x, int y, unsigned buttons) {
    int down = (buttons & 1u) != 0;
    if (x != c->mx || y != c->my) c->dirty = 1;
    c->mx = x; c->my = y;
    c->pressed = down && !c->mdown;
    c->released = !down && c->mdown;
    c->mdown = down;
    c->key = 0;
}
static inline void sui_feed_key(sui_ctx *c, unsigned k) {
    c->pressed = c->released = 0; c->key = k;
    if (k == SXK_TAB || (c->arrow_nav && k == SXK_DOWN)) { c->nav = 1; c->key = 0; c->dirty = 1; }
    else if (c->arrow_nav && k == SXK_UP) { c->nav = -1; c->key = 0; c->dirty = 1; }
}
/* Decode a native GUI event. Returns its type (0 for unknown). */
static inline unsigned sui_feed_sx(sui_ctx *c, uint64_t e) {
    unsigned t = sx_gui_event_type(e);
    if (t == SX_GUI_EVENT_KEY) sui_feed_key(c, (unsigned)(e & 0xffffffffu));
    else if (t == SX_GUI_EVENT_MOUSE) sui_feed_mouse(c, (int)sx_gui_mouse_x(e), (int)sx_gui_mouse_y(e), sx_gui_mouse_buttons(e));
    else if (t == SX_GUI_EVENT_VISIBILITY) { c->pressed = c->released = 0; c->key = 0; c->dirty = 1; }
    else return 0;
    return t;
}

/* ---------- frame ---------- */
static inline void sui_begin(sui_ctx *c, int paint) {
    c->paint = paint; c->hot = 0; c->disabled = 0;
    c->first_focusable = c->last_focusable = c->prev_focusable = 0;
    c->nav_take = 0;
    if (paint) c->s->clip = svg_rect_make(0, 0, c->s->w, c->s->h);
}
static inline void sui_end(sui_ctx *c) {
    if (c->nav > 0 && (c->nav_take || !c->focus || c->focus == c->last_focusable)) c->focus = c->first_focusable;
    else if (c->nav < 0 && (!c->focus || c->focus == c->first_focusable)) c->focus = c->last_focusable;
    else if (c->nav && c->focus) {
        /* focused widget vanished this pass: restart at the first one */
        c->focus = c->first_focusable;
    }
    c->nav = 0; c->nav_take = 0;
    if (c->released) c->active = 0;
    c->pressed = c->released = 0; c->key = 0;
    if (c->paint) c->dirty = 0;
}

/* Register a focusable widget in traversal order and resolve Tab movement.
 * Returns 1 if the widget currently owns keyboard focus. */
static inline int sui__focusable(sui_ctx *c, uint32_t id) {
    if (c->disabled || !id) return 0;
    if (!c->first_focusable) c->first_focusable = id;
    if (c->nav_take) { c->focus = id; c->nav = 0; c->nav_take = 0; }
    else if (c->nav > 0 && c->focus == id) { c->nav_take = 1; }
    else if (c->nav < 0 && c->focus == id && c->prev_focusable) { c->focus = c->prev_focusable; c->nav = 0; }
    c->prev_focusable = id; c->last_focusable = id;
    return c->focus == id && !c->nav_take;
}
/* Shared pointer logic. Returns 1 on click (press+release on the widget). */
static inline int sui__pointer(sui_ctx *c, uint32_t id, svg_rect r) {
    if (c->disabled) return 0;
    int over = svg_rect_contains(svg_intersect(r, c->s->clip), c->mx, c->my);
    if (over) c->hot = id;
    if (over && c->pressed) { c->active = id; c->focus = id; c->dirty = 1; }
    if (c->released && c->active == id) { c->dirty = 1; return over; }
    return 0;
}
/* Consume an activation key (Enter/Space) for the focused widget. */
static inline int sui__activate_key(sui_ctx *c, int focused) {
    if (focused && (c->key == SXK_ENTER || c->key == ' ')) { c->key = 0; c->dirty = 1; return 1; }
    return 0;
}
static inline uint32_t sui__surface_for(const sui_ctx *c, uint32_t id, uint32_t base) {
    if (c->disabled) return base;
    if (c->active == id && c->mdown) return c->t->surface_press;
    if (c->hot == id) return c->t->surface_hover;
    return base;
}

/* ---------- decorations ---------- */
static inline void sui_focus_ring(sui_ctx *c, svg_rect r, int radius) {
    if (!c->paint || svg_rect_empty(r)) return;
    svg_stroke_rrect(c->s, r.x0 - 2, r.y0 - 2, sui_rw(r) + 4, sui_rh(r) + 4, radius + 2, 2, c->t->focus_ring, 230);
}
static inline void sui_separator(sui_ctx *c, svg_rect r, int horizontal) {
    if (!c->paint || svg_rect_empty(r)) return;
    if (horizontal) svg_fill_rect(c->s, r.x0, r.y0 + sui_rh(r) / 2, sui_rw(r), 1, c->t->divider, 255);
    else svg_fill_rect(c->s, r.x0 + sui_rw(r) / 2, r.y0, 1, sui_rh(r), c->t->divider, 255);
}
/* Card / panel: soft shadow, rounded surface, hairline border. */
static inline void sui_card(sui_ctx *c, svg_rect r, int highlighted) {
    if (!c->paint || svg_rect_empty(r)) return;
    const sui_theme *t = c->t; int w = sui_rw(r), h = sui_rh(r);
    svg_shadow(c->s, r.x0, r.y0, w, h, t->radius_md, 4, 1, t->shadow_alpha / 2);
    svg_fill_rrect(c->s, r.x0, r.y0, w, h, t->radius_md, highlighted ? t->surface_hover : t->surface, 255);
    svg_stroke_rrect(c->s, r.x0, r.y0, w, h, t->radius_md, 1, t->border, 255);
}
static inline void sui_panel(sui_ctx *c, svg_rect r) {
    if (!c->paint || svg_rect_empty(r)) return;
    svg_fill_rrect(c->s, r.x0, r.y0, sui_rw(r), sui_rh(r), c->t->radius_sm, c->t->surface_alt, 255);
}
static inline void sui_background(sui_ctx *c) {
    if (!c->paint) return;
    svg_gradient_rect(c->s, 0, 0, c->s->w, c->s->h, c->t->bg_top, c->t->bg_bottom, 0);
}

/* ---------- labels ---------- */
enum { SUI_TEXT_BODY, SUI_TEXT_MUTED, SUI_TEXT_TITLE, SUI_TEXT_STRONG, SUI_TEXT_SMALL };
static inline const sf_font *sui__font(const sui_theme *t, int style) {
    return style == SUI_TEXT_TITLE ? t->font_title : style == SUI_TEXT_STRONG ? t->font_strong : style == SUI_TEXT_SMALL ? t->font_small : t->font_body;
}
static inline void sui_label(sui_ctx *c, svg_rect r, const char *s, int style, int align) {
    if (!c->paint || svg_rect_empty(r) || !s) return;
    uint32_t col = c->disabled ? c->t->text_disabled : (style == SUI_TEXT_MUTED || style == SUI_TEXT_SMALL) ? c->t->text_muted : c->t->text;
    sf_draw_in(c->s, sui__font(c->t, style), r.x0, r.y0, sui_rw(r), sui_rh(r), s, align, col);
}
static inline int sui_label_wrapped(sui_ctx *c, svg_rect r, const char *s, int style) {
    if (svg_rect_empty(r) || !s) return 0;
    const sf_font *f = sui__font(c->t, style);
    if (!c->paint) return 0;
    svg_rect old = svg_set_clip(c->s, svg_intersect(c->s->clip, r));
    int h = sf_draw_wrapped(c->s, f, r.x0, r.y0, sui_rw(r), s, style == SUI_TEXT_MUTED ? c->t->text_muted : c->t->text);
    svg_restore_clip(c->s, old);
    return h;
}

/* ---------- buttons ---------- */
enum { SUI_BUTTON_NORMAL = 0, SUI_BUTTON_PRIMARY = 1, SUI_BUTTON_DANGER = 2 };
/* Preferred width of a text button, so layouts can reserve it. */
static inline int sui_button_width(const sui_ctx *c, const char *label) { return sf_measure(c->t->font_body, label) + 2 * c->t->space_lg; }
static inline int sui_button(sui_ctx *c, uint32_t id, svg_rect r, const char *label, int kind) {
    int focused = sui__focusable(c, id);
    int hit = sui__pointer(c, id, r) | sui__activate_key(c, focused);
    if (c->paint && !svg_rect_empty(r)) {
        const sui_theme *t = c->t; int w = sui_rw(r), h = sui_rh(r), rad = svg_min(t->radius_sm + 2, h / 2);
        int down = c->active == id && c->mdown && c->hot == id;
        uint32_t bg, fg, bd;
        if (kind == SUI_BUTTON_PRIMARY || kind == SUI_BUTTON_DANGER) {
            uint32_t base = kind == SUI_BUTTON_DANGER ? t->danger : t->accent;
            bg = down ? svg_lerp(base, 0, 45) : c->hot == id ? svg_lerp(base, 0xffffff, 30) : base;
            fg = kind == SUI_BUTTON_DANGER ? 0xffffff : t->text_on_accent; bd = svg_lerp(base, 0, 60);
        } else { bg = sui__surface_for(c, id, t->surface); fg = t->text; bd = t->border_strong; }
        if (c->disabled) { bg = t->surface_alt; fg = t->text_disabled; bd = t->border; }
        svg_fill_rrect_grad(c->s, r.x0, r.y0 + down, w, h, rad, bg, svg_lerp(bg, 0, 14), 255);
        svg_stroke_rrect(c->s, r.x0, r.y0 + down, w, h, rad, 1, bd, 255);
        sf_draw_in(c->s, t->font_body, r.x0, r.y0 + down, w, h, label, SF_CENTER, fg);
        if (focused) sui_focus_ring(c, r, rad);
    }
    return hit;
}
/* Icon button: draws an XRGB32 icon (alpha in the high byte) centred in r. */
static inline int sui_icon_button(sui_ctx *c, uint32_t id, svg_rect r, const uint32_t *icon, int iw, int ih) {
    int focused = sui__focusable(c, id);
    int hit = sui__pointer(c, id, r) | sui__activate_key(c, focused);
    if (c->paint && !svg_rect_empty(r)) {
        int rad = svg_min(c->t->radius_sm, sui_rh(r) / 2);
        if (c->hot == id || c->active == id) svg_fill_rrect(c->s, r.x0, r.y0, sui_rw(r), sui_rh(r), rad, sui__surface_for(c, id, c->t->surface), 255);
        if (icon && iw > 0 && ih > 0) { svg_rect a = sui_align(r, iw, ih, 1, 1); svg_blit(c->s, a.x0, a.y0, icon, iw, ih, iw, 1, c->disabled ? 110 : 255); }
        if (focused) sui_focus_ring(c, r, rad);
    }
    return hit;
}

/* ---------- boolean controls ---------- */
static inline void sui__draw_switch(sui_ctx *c, svg_rect r, int on, int hot) {
    const sui_theme *t = c->t; int h = svg_min(sui_rh(r), 24), w = svg_min(sui_rw(r), h * 2 - 4);
    if (h < 8 || w < h) return;
    svg_rect a = sui_align(r, w, h, 2, 1); int k = h / 2 - 2;
    uint32_t track = on ? (hot ? t->accent_hover : t->accent) : (hot ? t->border_strong : t->track);
    if (c->disabled) track = t->surface_alt;
    svg_fill_rrect(c->s, a.x0, a.y0, w, h, h / 2, track, 255);
    int cx = on ? a.x1 - h / 2 : a.x0 + h / 2;
    svg_shadow(c->s, cx - k, a.y0 + 2, 2 * k, 2 * k, k, 3, 1, 50);
    svg_fill_circle(c->s, cx, a.y0 + h / 2, k, c->disabled ? t->text_disabled : t->knob, 255);
}
/* Toggle switch row: label on the left, switch on the right. Returns 1 when *on flipped. */
static inline int sui_toggle(sui_ctx *c, uint32_t id, svg_rect r, const char *label, int *on) {
    int focused = sui__focusable(c, id);
    int hit = sui__pointer(c, id, r) | sui__activate_key(c, focused);
    if (hit && on) *on = !*on;
    if (c->paint && !svg_rect_empty(r)) {
        svg_rect rr = r, sw = sui_cut_right(&rr, 48);
        if (label) sui_label(c, rr, label, SUI_TEXT_BODY, SF_LEFT);
        sui__draw_switch(c, sw, on && *on, c->hot == id);
        if (focused) sui_focus_ring(c, r, c->t->radius_sm);
    }
    return hit;
}
static inline int sui_checkbox(sui_ctx *c, uint32_t id, svg_rect r, const char *label, int *on) {
    int focused = sui__focusable(c, id);
    int hit = sui__pointer(c, id, r) | sui__activate_key(c, focused);
    if (hit && on) *on = !*on;
    if (c->paint && !svg_rect_empty(r)) {
        const sui_theme *t = c->t; int sz = svg_min(18, sui_rh(r)), checked = on && *on;
        svg_rect rr = r, box = sui_align(sui_cut_left(&rr, sz + t->space_sm), sz, sz, 0, 1);
        uint32_t fill = checked ? (c->disabled ? t->text_disabled : t->accent) : t->field_bg;
        svg_fill_rrect(c->s, box.x0, box.y0, sz, sz, 4, fill, 255);
        svg_stroke_rrect(c->s, box.x0, box.y0, sz, sz, 4, 1, checked ? svg_lerp(fill, 0, 50) : (c->hot == id ? t->accent : t->border_strong), 255);
        if (checked) {
            int x = box.x0, y = box.y0, q = SVG_Q;
            svg_line_q(c->s, (x + sz * 4 / 18) * q, (y + sz * 9 / 18) * q, (x + sz * 7 / 18) * q, (y + sz * 13 / 18) * q, 2 * q, t->text_on_accent, 255);
            svg_line_q(c->s, (x + sz * 7 / 18) * q, (y + sz * 13 / 18) * q, (x + sz * 14 / 18) * q, (y + sz * 5 / 18) * q, 2 * q, t->text_on_accent, 255);
        }
        if (label) sui_label(c, rr, label, SUI_TEXT_BODY, SF_LEFT);
        if (focused) sui_focus_ring(c, box, 4);
    }
    return hit;
}

/* ---------- slider ---------- */
/* Pure mapping helpers (exported for tests). */
static inline int sui_slider_value_at(int x, int x0, int x1, int lo, int hi) {
    if (hi <= lo || x1 <= x0) return lo;
    if (x <= x0) return lo;
    if (x >= x1) return hi;
    int64_t span = (int64_t)hi - lo;
    return lo + (int)(((int64_t)(x - x0) * span + (x1 - x0) / 2) / (x1 - x0));
}
static inline int sui_slider_pos_of(int v, int x0, int x1, int lo, int hi) {
    if (hi <= lo) return x0;
    v = svg_clampi(v, lo, hi);
    return x0 + (int)((int64_t)(v - lo) * (x1 - x0) / ((int64_t)hi - lo));
}
/* Horizontal slider. Click/drag or Left/Right/Home/End when focused. Returns 1 on change. */
static inline int sui_slider(sui_ctx *c, uint32_t id, svg_rect r, int *value, int lo, int hi, int step) {
    if (!value) return 0;
    int focused = sui__focusable(c, id), old = *value, knob = 8;
    int x0 = r.x0 + knob, x1 = r.x1 - knob; if (x1 < x0) x1 = x0;
    if (step < 1) step = 1;
    sui__pointer(c, id, r);
    if (!c->disabled && c->active == id && (c->mdown || c->released)) *value = sui_slider_value_at(c->mx, x0, x1, lo, hi);
    if (focused) {
        if (c->key == SXK_LEFT || c->key == '-') { *value -= step; c->key = 0; }
        else if (c->key == SXK_RIGHT || c->key == '+') { *value += step; c->key = 0; }
        else if (c->key == SXK_HOME) { *value = lo; c->key = 0; }
        else if (c->key == SXK_END) { *value = hi; c->key = 0; }
    }
    *value = svg_clampi(*value, lo, hi);
    if (c->paint && !svg_rect_empty(r)) {
        const sui_theme *t = c->t; int cy = r.y0 + sui_rh(r) / 2, kx = sui_slider_pos_of(*value, x0, x1, lo, hi);
        svg_fill_rrect(c->s, x0 - 3, cy - 3, x1 - x0 + 6, 6, 3, t->track, 255);
        svg_fill_rrect(c->s, x0 - 3, cy - 3, kx - x0 + 6, 6, 3, c->disabled ? t->text_disabled : t->accent, 255);
        svg_shadow(c->s, kx - knob, cy - knob, 2 * knob, 2 * knob, knob, 3, 1, 60);
        svg_fill_circle(c->s, kx, cy, knob + (c->active == id && c->mdown), t->knob, 255);
        svg_stroke_circle(c->s, kx, cy, knob, 1, c->hot == id ? t->accent : t->border_strong, 255);
        if (focused) svg_stroke_circle(c->s, kx, cy, knob + 3, 2, t->focus_ring, 230);
    }
    if (*value != old) { c->dirty = 1; return 1; }
    return 0;
}

/* ---------- segmented choice / swatches ---------- */
/* Cycler: shows the current option; click/Enter/Right = next, Left = previous. */
static inline int sui_cycler(sui_ctx *c, uint32_t id, svg_rect r, const char *const *names, int count, int *index) {
    if (!index || count <= 0) return 0;
    int focused = sui__focusable(c, id), old = *index;
    if (sui__pointer(c, id, r)) {
        /* left third steps back, rest steps forward */
        *index += c->mx < r.x0 + sui_rw(r) / 3 ? -1 : 1;
    }
    if (focused) {
        if (c->key == SXK_RIGHT || c->key == SXK_ENTER || c->key == ' ') { (*index)++; c->key = 0; }
        else if (c->key == SXK_LEFT) { (*index)--; c->key = 0; }
    }
    *index = ((*index % count) + count) % count;
    if (c->paint && !svg_rect_empty(r)) {
        const sui_theme *t = c->t; int w = sui_rw(r), h = sui_rh(r), rad = svg_min(t->radius_sm + 2, h / 2);
        uint32_t bg = sui__surface_for(c, id, t->surface_alt);
        svg_fill_rrect(c->s, r.x0, r.y0, w, h, rad, bg, 255);
        svg_stroke_rrect(c->s, r.x0, r.y0, w, h, rad, 1, t->border, 255);
        sf_draw_in(c->s, t->font_body, r.x0, r.y0, w, h, names[*index], SF_CENTER, c->disabled ? t->text_disabled : t->text);
        int cy = r.y0 + h / 2, q = SVG_Q;
        svg_line_q(c->s, (r.x0 + 14) * q, (cy - 4) * q, (r.x0 + 10) * q, cy * q, 3 * q / 2, t->text_muted, 255);
        svg_line_q(c->s, (r.x0 + 10) * q, cy * q, (r.x0 + 14) * q, (cy + 4) * q, 3 * q / 2, t->text_muted, 255);
        svg_line_q(c->s, (r.x1 - 14) * q, (cy - 4) * q, (r.x1 - 10) * q, cy * q, 3 * q / 2, t->text_muted, 255);
        svg_line_q(c->s, (r.x1 - 10) * q, cy * q, (r.x1 - 14) * q, (cy + 4) * q, 3 * q / 2, t->text_muted, 255);
        if (focused) sui_focus_ring(c, r, rad);
    }
    if (*index != old) { c->dirty = 1; return 1; }
    return 0;
}
/* Color swatch row. Returns 1 when *selected changed. */
static inline int sui_swatches(sui_ctx *c, uint32_t id, svg_rect r, const uint32_t *colors, int count, int *selected) {
    if (!selected || count <= 0 || count > 16) return 0;
    int focused = sui__focusable(c, id), old = *selected, d = svg_min(sui_rh(r), 30);
    svg_rect cell[16];
    sui_item it[16];
    for (int i = 0; i < count; i++) { it[i].min = d; it[i].flex = 0; }
    svg_rect strip = sui_align(r, svg_min(sui_rw(r), count * d + (count - 1) * 4), sui_rh(r), 2, 1);
    sui_linear(strip, 1, 4, it, count, cell);
    if (sui__pointer(c, id, r)) for (int i = 0; i < count; i++) if (svg_rect_contains(cell[i], c->mx, c->my)) *selected = i;
    if (focused) {
        if (c->key == SXK_RIGHT || c->key == SXK_ENTER || c->key == ' ') { *selected = (*selected + 1) % count; c->key = 0; }
        else if (c->key == SXK_LEFT) { *selected = (*selected + count - 1) % count; c->key = 0; }
    }
    if (*selected < 0 || *selected >= count) *selected = 0;
    if (c->paint) for (int i = 0; i < count; i++) {
        if (svg_rect_empty(cell[i])) continue;
        int cx = cell[i].x0 + sui_rw(cell[i]) / 2, cy = cell[i].y0 + sui_rh(cell[i]) / 2, rad = svg_min(sui_rw(cell[i]), sui_rh(cell[i])) / 2 - 4;
        if (rad < 2) continue;
        if (i == *selected) svg_stroke_circle(c->s, cx, cy, rad + 3, 2, focused ? c->t->focus_ring : c->t->text, 255);
        svg_fill_circle(c->s, cx, cy, rad, colors[i], 255);
    }
    if (*selected != old) { c->dirty = 1; return 1; }
    return 0;
}

/* ---------- list item ---------- */
static inline int sui_list_item(sui_ctx *c, uint32_t id, svg_rect r, const char *label, const char *detail, int selected) {
    int focused = sui__focusable(c, id);
    int hit = sui__pointer(c, id, r) | sui__activate_key(c, focused);
    if (c->paint && !svg_rect_empty(r)) {
        const sui_theme *t = c->t;
        uint32_t bg = selected ? t->selection : sui__surface_for(c, id, 0);
        if (selected || c->hot == id || c->active == id) svg_fill_rrect(c->s, r.x0, r.y0, sui_rw(r), sui_rh(r), t->radius_sm, bg, 255);
        svg_rect in = sui_inset(r, t->space_md, 0, t->space_md, 0);
        if (detail) { int dw = sf_measure(t->font_small, detail) + t->space_sm; svg_rect dr = sui_cut_right(&in, dw); sui_label(c, dr, detail, SUI_TEXT_SMALL, SF_RIGHT); }
        sui_label(c, in, label, SUI_TEXT_BODY, SF_LEFT);
        if (focused) sui_focus_ring(c, r, t->radius_sm);
    }
    return hit;
}

/* ---------- scroll region ---------- */
typedef struct { int offset; int content_h; svg_rect view; svg_rect saved_clip; } sui_scroll;
static inline int sui_scroll_max(const sui_scroll *sc) { int m = sc->content_h - sui_rh(sc->view); return m > 0 ? m : 0; }
static inline void sui_scroll_clamp(sui_scroll *sc) { sc->offset = svg_clampi(sc->offset, 0, sui_scroll_max(sc)); }
/* Begins a clipped region. Content is laid out from the returned origin y
 * (already shifted by the scroll offset); report its height to sui_scroll_end. */
static inline int sui_scroll_begin(sui_ctx *c, sui_scroll *sc, svg_rect view) {
    sc->view = view; sui_scroll_clamp(sc);
    sc->saved_clip = c->s->clip;
    c->s->clip = svg_intersect(c->s->clip, view);
    return view.y0 - sc->offset;
}
static inline void sui_scroll_end(sui_ctx *c, uint32_t id, sui_scroll *sc, int content_h) {
    c->s->clip = sc->saved_clip;
    sc->content_h = content_h < 0 ? 0 : content_h;
    int vh = sui_rh(sc->view), max = sui_scroll_max(sc), old = sc->offset;
    if (max > 0 && vh > 0) {
        svg_rect bar = svg_rect_make(sc->view.x1 - 8, sc->view.y0 + 2, 6, vh - 4);
        int th = svg_max(24, (int)((int64_t)sui_rh(bar) * vh / sc->content_h)); th = svg_min(th, sui_rh(bar));
        int ty = bar.y0 + (int)((int64_t)(sui_rh(bar) - th) * sc->offset / max);
        svg_rect thumb = svg_rect_make(bar.x0, ty, 6, th), grab = sui_inset(bar, -4, 0, 0, 0);
        if (!c->disabled && c->pressed && svg_rect_contains(grab, c->mx, c->my)) {
            c->active = id; c->drag_off = svg_rect_contains(thumb, c->mx, c->my) ? c->my - ty : th / 2;
        }
        if (c->active == id && (c->mdown || c->released) && sui_rh(bar) > th)
            sc->offset = (int)((int64_t)(c->my - c->drag_off - bar.y0) * max / (sui_rh(bar) - th));
        if (svg_rect_contains(sc->view, c->mx, c->my) || c->focus == id) {
            if (c->key == SXK_PGDN) { sc->offset += vh - 20; c->key = 0; }
            else if (c->key == SXK_PGUP) { sc->offset -= vh - 20; c->key = 0; }
        }
        sui_scroll_clamp(sc);
        if (c->paint) {
            ty = bar.y0 + (int)((int64_t)(sui_rh(bar) - th) * sc->offset / max);
            svg_fill_rrect(c->s, bar.x0, ty, 6, th, 3, c->active == id ? c->t->text_muted : c->t->border_strong, 200);
        }
    } else sc->offset = 0;
    if (sc->offset != old) c->dirty = 1;
}

/* ---------- text input ---------- */
typedef struct { char *buf; int cap; int len; int cursor; int scroll_px; } sui_text;
static inline void sui_text_init(sui_text *t, char *buf, int cap) {
    t->buf = buf; t->cap = cap > SUI_MAX_TEXT ? SUI_MAX_TEXT : cap; t->len = 0; t->cursor = 0; t->scroll_px = 0;
    while (t->cap > 0 && t->len < t->cap - 1 && buf[t->len]) t->len++;
    if (t->cap > 0) buf[t->len] = 0;
    t->cursor = t->len;
}
/* Apply one key to an edit buffer. Returns 1 if text changed, 2 if only the cursor moved. */
static inline int sui_text_key(sui_text *t, unsigned k) {
    if (!t->buf || t->cap <= 0) return 0;
    t->cursor = svg_clampi(t->cursor, 0, t->len);
    if (k >= 32 && k <= 126) {
        if (t->len >= t->cap - 1) return 0;
        for (int i = t->len; i > t->cursor; i--) t->buf[i] = t->buf[i - 1];
        t->buf[t->cursor++] = (char)k; t->buf[++t->len] = 0; return 1;
    }
    if (k == SXK_BACKSPACE) { if (!t->cursor) return 0; for (int i = t->cursor - 1; i < t->len; i++) t->buf[i] = t->buf[i + 1]; t->cursor--; t->len--; return 1; }
    if (k == SXK_DELETE) { if (t->cursor >= t->len) return 0; for (int i = t->cursor; i < t->len; i++) t->buf[i] = t->buf[i + 1]; t->len--; return 1; }
    if (k == SXK_CLEAR || k == SXK_ERASE) { if (!t->len) return 0; t->len = t->cursor = 0; t->buf[0] = 0; return 1; }
    if (k == SXK_LEFT) { if (t->cursor) { t->cursor--; return 2; } return 0; }
    if (k == SXK_RIGHT) { if (t->cursor < t->len) { t->cursor++; return 2; } return 0; }
    if (k == SXK_HOME) { t->cursor = 0; return 2; }
    if (k == SXK_END) { t->cursor = t->len; return 2; }
    return 0;
}
/* Single-line text field. Returns 1 when edited, 2 when Enter was pressed. */
static inline int sui_text_field(sui_ctx *c, uint32_t id, svg_rect r, sui_text *t, const char *placeholder) {
    int focused = sui__focusable(c, id), res = 0;
    const sf_font *f = c->t->font_body;
    svg_rect in = sui_inset(r, c->t->space_sm, 0, c->t->space_sm, 0);
    if (sui__pointer(c, id, r) && t->buf) {
        /* place caret nearest to the click */
        int x = c->mx - in.x0 + t->scroll_px, best = 0;
        for (int i = 0; i <= t->len; i++) { if (sf_measure_n(f, t->buf, i) <= x) best = i; else break; }
        t->cursor = best;
    }
    if (focused && c->key) {
        if (c->key == SXK_ENTER) { res = 2; c->key = 0; }
        else { int k = sui_text_key(t, c->key); if (k) { c->key = 0; c->dirty = 1; if (k == 1) res = 1; } }
    }
    /* keep caret visible */
    if (t->buf) {
        int cx = sf_measure_n(f, t->buf, t->cursor), vw = sui_rw(in);
        if (cx - t->scroll_px > vw - 2) t->scroll_px = cx - vw + 2;
        if (cx - t->scroll_px < 0) t->scroll_px = cx;
        if (t->scroll_px < 0) t->scroll_px = 0;
    }
    if (c->paint && !svg_rect_empty(r)) {
        const sui_theme *th = c->t; int w = sui_rw(r), h = sui_rh(r);
        svg_fill_rrect(c->s, r.x0, r.y0, w, h, th->radius_sm, th->field_bg, 255);
        svg_stroke_rrect(c->s, r.x0, r.y0, w, h, th->radius_sm, focused ? 2 : 1, focused ? th->focus_ring : (c->hot == id ? th->border_strong : th->border), 255);
        svg_rect old = svg_set_clip(c->s, svg_intersect(c->s->clip, in));
        int ty = in.y0 + (h - (f->ascent + f->descent)) / 2;
        if (t->buf && t->len) sf_draw(c->s, f, in.x0 - t->scroll_px, ty, t->buf, c->disabled ? th->text_disabled : th->text);
        else if (placeholder) sf_draw(c->s, f, in.x0, ty, placeholder, th->text_disabled);
        if (focused && t->buf) { int cx = in.x0 + sf_measure_n(f, t->buf, t->cursor) - t->scroll_px; svg_fill_rect(c->s, cx, ty, 1, f->ascent + f->descent, th->accent, 255); }
        svg_restore_clip(c->s, old);
    }
    return res;
}
#endif
