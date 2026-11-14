#ifndef SLOPUI_THEME_H
#define SLOPUI_THEME_H
/* SlopUI semantic theme tokens. Applications read colors, spacing, radii and
 * fonts from here instead of hardcoding constants. The active theme is
 * resolved from the live system preferences (light flag + accent color). */
#include <stdint.h>
#include "slopfont.h"

typedef struct {
    /* surfaces */
    uint32_t bg_top, bg_bottom;      /* window background gradient */
    uint32_t surface, surface_alt;   /* cards / panels, alternating rows */
    uint32_t surface_hover, surface_press;
    uint32_t border, border_strong, divider;
    /* content */
    uint32_t text, text_muted, text_disabled, text_on_accent;
    /* interaction */
    uint32_t accent, accent_hover, accent_press, accent_soft;
    uint32_t focus_ring, selection;
    uint32_t track, knob;
    uint32_t danger, success;
    uint32_t field_bg;
    unsigned shadow_alpha;
    /* geometry */
    int radius_sm, radius_md, radius_lg;
    int space_xs, space_sm, space_md, space_lg;
    int control_h, row_h;
    /* typography */
    const sf_font *font_body, *font_small, *font_title, *font_strong, *font_mono;
    int dark;
} sui_theme;

static inline uint32_t sui__shade(uint32_t c, int toward_white, unsigned amt) { return svg_lerp(c, toward_white ? 0xffffffu : 0, amt); }

static inline void sui_theme_make(sui_theme *t, int dark, uint32_t accent) {
    if (!accent) accent = 0x5b9cf0;
    if (dark) {
        t->bg_top = 0x1c232a; t->bg_bottom = 0x13181d;
        t->surface = 0x242d35; t->surface_alt = 0x28323b;
        t->surface_hover = 0x2d3842; t->surface_press = 0x34414c;
        t->border = 0x37434e; t->border_strong = 0x4a5865; t->divider = 0x2f3a44;
        t->text = 0xe9eef2; t->text_muted = 0x95a5b1; t->text_disabled = 0x5d6b76;
        t->track = 0x3b4753; t->knob = 0xf4f7f9; t->field_bg = 0x1a2026;
        t->shadow_alpha = 110;
    } else {
        t->bg_top = 0xf5f7f9; t->bg_bottom = 0xe7ecf1;
        t->surface = 0xffffff; t->surface_alt = 0xf7f9fb;
        t->surface_hover = 0xf0f5f9; t->surface_press = 0xe3ebf2;
        t->border = 0xd6dee5; t->border_strong = 0xb7c3cd; t->divider = 0xe6ebef;
        t->text = 0x1c2932; t->text_muted = 0x5f707c; t->text_disabled = 0xa5b1ba;
        t->track = 0xd0d9e0; t->knob = 0xffffff; t->field_bg = 0xffffff;
        t->shadow_alpha = 60;
    }
    t->accent = accent;
    t->accent_hover = sui__shade(accent, dark, 30);
    t->accent_press = sui__shade(accent, 0, 45);
    t->accent_soft = svg_lerp(dark ? t->surface : 0xffffffu, accent, dark ? 70 : 55);
    t->focus_ring = accent;
    t->selection = svg_lerp(t->surface, accent, dark ? 110 : 80);
    t->danger = dark ? 0xf0766e : 0xc8463d;
    t->success = dark ? 0x7bd4a0 : 0x2e8f5a;
    /* accent colors in the system palette are pastel: dark text reads best */
    t->text_on_accent = 0x10202a;
    t->radius_sm = 6; t->radius_md = 9; t->radius_lg = 14;
    t->space_xs = 4; t->space_sm = 8; t->space_md = 12; t->space_lg = 16;
    t->control_h = 26; t->row_h = 30;
    t->font_body = &sf_ui14; t->font_small = &sf_ui12; t->font_title = &sf_ui18b;
    t->font_strong = &sf_ui14b; t->font_mono = &sf_mono13;
    t->dark = dark;
}
#endif
