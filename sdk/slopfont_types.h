#ifndef SLOPFONT_TYPES_H
#define SLOPFONT_TYPES_H
#include <stdint.h>
/* One baked glyph. Bitmap rows are ceil(w/2) bytes of 4-bit alpha (high nibble first). */
typedef struct {
    uint16_t off;      /* byte offset into the face's bit array */
    uint8_t w, h;      /* bitmap size in pixels */
    int8_t bx, by;     /* bitmap origin relative to pen on the baseline (by is negative above) */
    uint16_t adv16;    /* horizontal advance in 1/16 px */
} sf_glyph;
typedef struct {
    const sf_glyph *glyphs; /* 95 entries, ASCII 0x20..0x7E */
    const uint8_t *bits;
    uint8_t size, ascent, descent, line_height;
} sf_font;
#endif
