/* Slopettings — the Slopix preferences app, rebuilt on SlopVG.
 * Ring-3 only: the kernel owns hardware and validates every preference write.
 * Rendering: antialiased rounded cards, pill toggles, slider and swatches via
 * slopvg.h; antialiased glyphs from the existing 8-bit alpha font atlas.
 * Input: mouse clicks, Tab/Up/Down focus, Enter/Space activate, Left/Right adjust. */
#include "slopix.h"
#include "font.h"
#include "slopvg.h"

#define W 512
#define H 320
#define ROWS 7
#define ROW_Y(i) (54 + (i) * 36)
#define ROW_H 32
static uint32_t pixels[W * H];
static svg_surface surf;
static struct sx_prefs prefs;
static const uint32_t palette[] = {0x91dfc0, 0x9bbcff, 0xf5b48c, 0xd5a4ef};
static const char *fit_names[] = {"Fill", "Fit", "Center", "Stretch"};
static const char *wall_names[] = {"Aurora", "Dune", "Slate"};
static int dirty = 1, focus = 0;
static const char *status = "Changes apply live. Save writes them to FAT32.";
enum { R_DARK, R_DOCK, R_VOLUME, R_WALL, R_FIT, R_ACCENT, R_SAVE };

/* Semantic theme tokens, resolved from the live light/dark preference. */
typedef struct { uint32_t bg_top, bg_bottom, card, card_focus, border, text, muted, track, knob, accent, on_accent; } theme;
static theme th;
static void resolve_theme(void) {
    uint32_t acc = prefs.accent ? prefs.accent : palette[0];
    if (prefs.light) { theme t = {0xf4f6f8, 0xe6ebf0, 0xffffff, 0xf3f8fb, 0xd5dde4, 0x1d2a33, 0x60717d, 0xcfd8df, 0xffffff, acc, 0x10202a}; th = t; }
    else { theme t = {0x1b2229, 0x12171c, 0x242d35, 0x2b3641, 0x36424d, 0xe9eef2, 0x93a3af, 0x3a4652, 0xf4f7f9, acc, 0x10202a}; th = t; }
}

static void text(int x, int y, const char *s, uint32_t c) {
    for (; *s && x + 10 <= W; s++, x += 10) {
        unsigned k = (unsigned char)*s;
        if (k < 32 || k > 126) k = '?';
        svg_blit_mask(&surf, x, y, &font[k - 32][0][0], 10, 20, 10, c, 255);
    }
}
static int text_w(const char *s) { int n = 0; while (s[n]) n++; return n * 10; }
static void num(char *out, unsigned n) { char r[12]; int i = 0, j = 0; do { r[i++] = (char)('0' + n % 10); n /= 10; } while (n && i < 12); while (i) out[j++] = r[--i]; out[j] = 0; }

static void toggle(int x, int y, int on) {
    svg_fill_rrect(&surf, x, y, 44, 24, 12, on ? th.accent : th.track, 255);
    svg_shadow(&surf, on ? x + 22 : x + 2, y + 2, 20, 20, 10, 3, 1, 50);
    svg_fill_circle(&surf, on ? x + 32 : x + 12, y + 12, 10, th.knob, 255);
}
static void pill(int x, int y, int w, const char *label, int primary) {
    svg_fill_rrect_grad(&surf, x, y, w, 24, 12, primary ? th.accent : th.card_focus, primary ? svg_lerp(th.accent, 0, 30) : th.card, 255);
    svg_stroke_rrect(&surf, x, y, w, 24, 12, 1, primary ? svg_lerp(th.accent, 0, 60) : th.border, 255);
    text(x + (w - text_w(label)) / 2, y + 2, label, primary ? th.on_accent : th.text);
}

static void row(int i, const char *label) {
    int y = ROW_Y(i), f = focus == i;
    svg_fill_rrect(&surf, 16, y, W - 32, ROW_H, 9, f ? th.card_focus : th.card, 255);
    svg_stroke_rrect(&surf, 16, y, W - 32, ROW_H, 9, f ? 2 : 1, f ? th.accent : th.border, 255);
    text(30, y + 6, label, th.text);
}

static void draw(void) {
    resolve_theme();
    svg_gradient_rect(&surf, 0, 0, W, H, th.bg_top, th.bg_bottom, 0);
    /* Header: accent glyph built from vector primitives + title. */
    svg_fill_circle(&surf, 30, 26, 13, th.accent, 255);
    svg_stroke_circle(&surf, 30, 26, 7, 3, th.on_accent, 200);
    svg_line(&surf, 30, 15, 30, 19, 3, th.on_accent, 200);
    text(52, 10, "Settings", th.text);
    text(52 + text_w("Settings") + 12, 10, "/ Slopix", th.muted);
    svg_line(&surf, 16, 46, W - 17, 46, 1, th.border, 255);

    row(R_DARK, "Dark appearance");      toggle(W - 76, ROW_Y(R_DARK) + 4, !prefs.light);
    row(R_DOCK, "Dock magnification");   toggle(W - 76, ROW_Y(R_DOCK) + 4, prefs.magnify != 0);

    row(R_VOLUME, "Volume");
    { int y = ROW_Y(R_VOLUME) + 16, x0 = 200, x1 = W - 90, v = (int)(prefs.volume > 100 ? 100 : prefs.volume);
      int kx = x0 + (x1 - x0) * v / 100; char n[12];
      svg_fill_rrect(&surf, x0, y - 3, x1 - x0, 6, 3, th.track, 255);
      svg_fill_rrect(&surf, x0, y - 3, kx - x0 + 3, 6, 3, th.accent, 255);
      svg_shadow(&surf, kx - 8, y - 8, 16, 16, 8, 3, 1, 60);
      svg_fill_circle(&surf, kx, y, 8, th.knob, 255);
      svg_stroke_circle(&surf, kx, y, 8, 1, th.border, 255);
      num(n, (unsigned)v); text(W - 76, ROW_Y(R_VOLUME) + 6, n, th.muted); }

    row(R_WALL, "Wallpaper"); pill(W - 156, ROW_Y(R_WALL) + 4, 124, wall_names[prefs.wallpaper % 3], 0);
    row(R_FIT, "Wallpaper fit"); pill(W - 156, ROW_Y(R_FIT) + 4, 124, fit_names[prefs.fit % 4], 0);

    row(R_ACCENT, "Accent color");
    for (int i = 0; i < 4; i++) {
        int cx = W - 160 + i * 34, cy = ROW_Y(R_ACCENT) + 16;
        if (prefs.accent == palette[i]) svg_stroke_circle(&surf, cx, cy, 13, 2, th.text, 255);
        svg_fill_circle(&surf, cx, cy, 9, palette[i], 255);
    }

    row(R_SAVE, "Keep these settings"); pill(W - 156, ROW_Y(R_SAVE) + 4, 124, "Save", 1);
    text(18, H - 22, status, th.muted);
    sx_gui_present(pixels, W * H);
    dirty = 0;
}

static void change(unsigned field, uint32_t value) {
    if (sx_pref_set(field, value) >= 0) { sx_pref_get(&prefs); status = "Applied."; }
    else status = "The system rejected that value.";
    dirty = 1;
}
static void adjust(int dir) {
    if (focus == R_VOLUME) { int v = (int)prefs.volume + dir * 10; change(2, (uint32_t)svg_clampi(v, 0, 100)); }
    else if (focus == R_ACCENT) { int i = 0; while (i < 4 && palette[i] != prefs.accent) i++; i = ((i < 4 ? i : 0) + dir + 4) % 4; change(0, palette[i]); }
    else if (focus == R_WALL) change(4, (prefs.wallpaper + (dir > 0 ? 1u : 2u)) % 3);
    else if (focus == R_FIT) change(5, (prefs.fit + (dir > 0 ? 1u : 3u)) % 4);
}
static void activate(int r) {
    focus = r;
    if (r == R_DARK) change(1, !prefs.light);
    else if (r == R_DOCK) change(3, !prefs.magnify);
    else if (r == R_SAVE) { status = sx_pref_save() >= 0 ? "Saved to FAT32." : "Save failed."; dirty = 1; }
    else adjust(1);
}
static void key(unsigned k) {
    if (k == SXK_TAB || k == SXK_DOWN) { focus = (focus + 1) % ROWS; dirty = 1; }
    else if (k == SXK_UP) { focus = (focus + ROWS - 1) % ROWS; dirty = 1; }
    else if (k == SXK_ENTER || k == ' ') activate(focus);
    else if (k == SXK_LEFT || k == '-') { if (focus != R_VOLUME && focus != R_ACCENT && focus != R_WALL && focus != R_FIT) focus = R_VOLUME; adjust(-1); }
    else if (k == SXK_RIGHT || k == '+') { if (focus != R_VOLUME && focus != R_ACCENT && focus != R_WALL && focus != R_FIT) focus = R_VOLUME; adjust(1); }
    /* Legacy single-key shortcuts from the previous Slopettings remain. */
    else if (k == 'l' || k == 'L') activate(R_DARK);
    else if (k == 'm' || k == 'M') activate(R_DOCK);
    else if (k == 'w' || k == 'W') { focus = R_WALL; adjust(1); }
    else if (k == 'f' || k == 'F') { focus = R_FIT; adjust(1); }
    else if (k == 's' || k == 'S') activate(R_SAVE);
    else if (k >= '1' && k <= '4') { focus = R_ACCENT; change(0, palette[k - '1']); }
}
static void click(int x, int y) {
    for (int r = 0; r < ROWS; r++) {
        int ry = ROW_Y(r);
        if (y < ry || y >= ry + ROW_H || x < 16 || x >= W - 16) continue;
        focus = r; dirty = 1;
        if (r == R_VOLUME) { int x0 = 200, x1 = W - 90; if (x >= x0 - 8 && x <= x1 + 8) change(2, (uint32_t)svg_clampi((x - x0) * 100 / (x1 - x0), 0, 100)); }
        else if (r == R_ACCENT) { for (int i = 0; i < 4; i++) { int cx = W - 160 + i * 34; if (x >= cx - 14 && x <= cx + 14) change(0, palette[i]); } }
        else activate(r);
        return;
    }
}

__attribute__((noreturn)) void _start(void) {
    if (sx_gui_open(W, H) < 0) sx_exit(1);
    svg_init(&surf, pixels, W, H);
    sx_pref_get(&prefs);
    for (;;) {
        uint64_t e;
        while ((e = sx_gui_poll())) {
            unsigned t = sx_gui_event_type(e);
            if (t == SX_GUI_EVENT_KEY) key((unsigned)e);
            else if (t == SX_GUI_EVENT_MOUSE && (sx_gui_mouse_buttons(e) & 1)) click((int)sx_gui_mouse_x(e), (int)sx_gui_mouse_y(e));
            else if (t == SX_GUI_EVENT_VISIBILITY) dirty = 1;
        }
        if (dirty) draw();
        sx_sleep(16000);
    }
}
