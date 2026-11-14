#ifndef SLOPFONT_H
#define SLOPFONT_H
/* SlopFont — antialiased proportional + monospace text on top of SlopVG.
 * Faces: Noto Sans 12/14/18 (+ SemiBold 14/18) for UI, Liberation Mono 13/15 for
 * terminals. ASCII only: bytes outside 0x20..0x7E render as '?'. No kerning.
 * Positions use the top of the line box (y), baseline = y + ascent.
 * Subpixel pen advance (1/16 px) keeps proportional spacing accurate. */
#include "slopvg.h"
#include "slopfont_data.h"

static inline const sf_glyph *sf_glyph_for(const sf_font *f, unsigned char c) {
    if (c < 32 || c > 126) c = '?';
    return &f->glyphs[c - 32];
}
/* Width of the first n bytes of s, in whole pixels (rounded up). */
static inline int sf_measure_n(const sf_font *f, const char *s, int n) {
    int a = 0;
    for (int i = 0; i < n && s[i]; i++) a += sf_glyph_for(f, (unsigned char)s[i])->adv16;
    return (a + 15) >> 4;
}
static inline int sf_measure(const sf_font *f, const char *s) { return sf_measure_n(f, s, 0x7fffffff); }

static inline void sf__glyph(svg_surface *sf, const sf_font *f, const sf_glyph *g, int ox, int base, uint32_t c, unsigned alpha) {
    int x0 = ox + g->bx, y0 = base + g->by, stride = (g->w + 1) / 2;
    svg_rect b = svg_intersect(svg_rect_make(x0, y0, g->w, g->h), sf->clip);
    const uint8_t *bits = f->bits + g->off;
    for (int y = b.y0; y < b.y1; y++) {
        const uint8_t *row = bits + (y - y0) * stride;
        uint32_t *dst = &sf->px[y * sf->stride];
        for (int x = b.x0; x < b.x1; x++) {
            int gx = x - x0;
            unsigned n = (row[gx >> 1] >> ((gx & 1) ? 0 : 4)) & 15u;
            if (n) dst[x] = svg_mix(dst[x], c, svg_mul_alpha(n * 17u, alpha));
        }
    }
}
/* Draw n bytes; returns pen x after the text. Respects the surface clip. */
static inline int sf_draw_n(svg_surface *s, const sf_font *f, int x, int y, const char *t, int n, uint32_t c, unsigned alpha) {
    int pen16 = x << 4, base = y + f->ascent;
    for (int i = 0; i < n && t[i]; i++) {
        const sf_glyph *g = sf_glyph_for(f, (unsigned char)t[i]);
        if ((pen16 >> 4) >= s->clip.x1) break;
        if (g->w) sf__glyph(s, f, g, (pen16 + 8) >> 4, base, c, alpha);
        pen16 += g->adv16;
    }
    return (pen16 + 15) >> 4;
}
static inline int sf_draw(svg_surface *s, const sf_font *f, int x, int y, const char *t, uint32_t c) { return sf_draw_n(s, f, x, y, t, 0x7fffffff, c, 255); }

enum { SF_LEFT = 0, SF_CENTER = 1, SF_RIGHT = 2 };
/* Single line aligned within a box, vertically centred, clipped to the box. */
static inline void sf_draw_in(svg_surface *s, const sf_font *f, int x, int y, int w, int h, const char *t, int align, uint32_t c) {
    int tw = sf_measure(f, t), tx = x;
    if (align == SF_CENTER) tx = x + (w - tw) / 2; else if (align == SF_RIGHT) tx = x + w - tw;
    svg_rect old = svg_set_clip(s, svg_intersect(s->clip, svg_rect_make(x, y, w, h)));
    sf_draw(s, f, tx, y + (h - (f->ascent + f->descent)) / 2, t, c);
    svg_restore_clip(s, old);
}
/* Word-wrapped paragraph. Breaks at spaces, hard-breaks words wider than w,
 * honours '\n'. Returns the height consumed (lines * line_height). */
static inline int sf_draw_wrapped(svg_surface *s, const sf_font *f, int x, int y, int w, const char *t, uint32_t c) {
    int lines = 0;
    while (*t) {
        int n = 0, fit = 0, last_space = -1;
        while (t[n] && t[n] != '\n') {
            if (sf_measure_n(f, t, n + 1) > w) break;
            if (t[n] == ' ') last_space = n;
            n++;
        }
        fit = n;
        if (t[n] && t[n] != '\n' && last_space > 0) fit = last_space;
        if (!fit && t[0] && t[0] != '\n') fit = 1;
        sf_draw_n(s, f, x, y + lines * f->line_height, t, fit, c, 255);
        lines++;
        t += fit;
        while (*t == ' ') t++;
        if (*t == '\n') t++;
    }
    return lines * f->line_height;
}
#endif
