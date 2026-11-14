/* Host unit tests for SlopUI (layout, widgets, input state, clipping).
 * Build: cc -std=c11 -Wall -Wextra -Werror -fsanitize=address,undefined -I.. slopui_test.c
 * The SDK headers are freestanding; the int 0x80 wrappers are never called. */
#include <stdio.h>
#include <string.h>
#include "../slopui.h"

static int failures;
#define CHECK(c) do { if (!(c)) { printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #c); failures++; } } while (0)

enum { TW = 96, TH = 64, GUARD = 64 };
static uint32_t mem[GUARD + TW * TH + GUARD];
static svg_surface surf;
static sui_theme theme;

static void test_layout(void) {
    svg_rect r = svg_rect_make(0, 0, 100, 50), out[3];
    sui_item it[3] = {{10, 0}, {0, 1}, {20, 0}};
    sui_linear(r, 1, 5, it, 3, out);
    CHECK(out[0].x0 == 0 && out[0].x1 == 10);
    CHECK(out[1].x0 == 15 && out[1].x1 == 75);
    CHECK(out[2].x0 == 80 && out[2].x1 == 100);
    /* too small: minimums kept in order, later ones shrink, never negative */
    sui_item big[3] = {{40, 0}, {40, 1}, {40, 0}};
    sui_linear(svg_rect_make(0, 0, 60, 10), 1, 5, big, 3, out);
    for (int i = 0; i < 3; i++) { CHECK(out[i].x1 >= out[i].x0); CHECK(out[i].x1 <= 60); }
    CHECK(sui_rw(out[0]) == 40 && sui_rw(out[2]) == 0);
    svg_rect p = sui_pad(svg_rect_make(0, 0, 6, 6), 10);
    CHECK(sui_rw(p) == 0 && sui_rh(p) == 0);
    svg_rect rem = svg_rect_make(0, 0, 10, 10), top = sui_cut_top(&rem, 50);
    CHECK(sui_rh(top) == 10 && sui_rh(rem) == 0);
}

static void test_slider_math(void) {
    CHECK(sui_slider_value_at(-5, 0, 100, 0, 100) == 0);
    CHECK(sui_slider_value_at(500, 0, 100, 0, 100) == 100);
    CHECK(sui_slider_value_at(50, 0, 100, 0, 100) == 50);
    CHECK(sui_slider_value_at(10, 10, 10, 3, 9) == 3);       /* zero-width track */
    CHECK(sui_slider_value_at(50, 0, 100, 0, 2000000000) == 1000000000); /* no overflow */
    CHECK(sui_slider_pos_of(200, 0, 100, 0, 100) == 100);
    CHECK(sui_slider_pos_of(5, 0, 100, 5, 5) == 0);
}

static void test_text(void) {
    char buf[6] = "ab"; sui_text t; sui_text_init(&t, buf, sizeof buf);
    CHECK(t.len == 2 && t.cursor == 2);
    CHECK(sui_text_key(&t, 'c') == 1 && !strcmp(buf, "abc"));
    CHECK(sui_text_key(&t, SXK_HOME) == 2);
    CHECK(sui_text_key(&t, 'X') == 1 && !strcmp(buf, "Xabc"));
    CHECK(sui_text_key(&t, 'Y') == 1 && !strcmp(buf, "XYabc"));
    CHECK(sui_text_key(&t, 'Z') == 0 && !strcmp(buf, "XYabc")); /* capacity respected */
    CHECK(sui_text_key(&t, SXK_BACKSPACE) == 1 && !strcmp(buf, "Xabc"));
    CHECK(sui_text_key(&t, SXK_DELETE) == 1 && !strcmp(buf, "Xbc"));
    t.cursor = 0; CHECK(sui_text_key(&t, SXK_BACKSPACE) == 0);
    CHECK(sui_text_key(&t, SXK_LEFT) == 0);
    CHECK(sui_text_key(&t, SXK_CLEAR) == 1 && buf[0] == 0 && t.len == 0);
}

/* A tiny window: three focusable widgets. */
static int clicks, on, vol = 50;
static void build(sui_ctx *c, int paint) {
    sui_begin(c, paint);
    if (sui_button(c, 1, svg_rect_make(0, 0, 40, 20), "Go", SUI_BUTTON_PRIMARY)) clicks++;
    sui_toggle(c, 2, svg_rect_make(0, 22, 90, 20), "T", &on);
    sui_slider(c, 3, svg_rect_make(0, 44, 96, 20), &vol, 0, 100, 10);
    sui_end(c);
}
static void test_interaction(void) {
    sui_ctx c; sui_init(&c, &surf, &theme);
    build(&c, 1);
    /* Tab traversal wraps around */
    sui_feed_key(&c, SXK_TAB); build(&c, 0); CHECK(c.focus == 1);
    sui_feed_key(&c, SXK_TAB); build(&c, 0); CHECK(c.focus == 2);
    sui_feed_key(&c, SXK_TAB); build(&c, 0); CHECK(c.focus == 3);
    sui_feed_key(&c, SXK_TAB); build(&c, 0); CHECK(c.focus == 1);
    c.arrow_nav = 1;
    sui_feed_key(&c, SXK_UP); build(&c, 0); CHECK(c.focus == 3);
    sui_feed_key(&c, SXK_UP); build(&c, 0); CHECK(c.focus == 2);
    /* Space toggles the focused toggle */
    sui_feed_key(&c, ' '); build(&c, 0); CHECK(on == 1);
    /* click = press + release on the same widget */
    sui_feed_mouse(&c, 10, 10, 1); build(&c, 0); CHECK(clicks == 0 && c.active == 1 && c.focus == 1);
    sui_feed_mouse(&c, 10, 10, 0); build(&c, 0); CHECK(clicks == 1 && c.active == 0);
    /* press then release elsewhere cancels */
    sui_feed_mouse(&c, 10, 10, 1); build(&c, 0);
    sui_feed_mouse(&c, 80, 60, 0); build(&c, 0); CHECK(clicks == 1);
    /* Enter activates the focused button */
    c.focus = 1; sui_feed_key(&c, SXK_ENTER); build(&c, 0); CHECK(clicks == 2);
    /* slider drag clamps to the range */
    sui_feed_mouse(&c, 50, 54, 1); build(&c, 0); CHECK(c.active == 3);
    sui_feed_mouse(&c, 2000, 54, 1); build(&c, 0); CHECK(vol == 100);
    sui_feed_mouse(&c, 0, 54, 0); build(&c, 0); CHECK(vol == 0 && c.active == 0);
    c.focus = 3; sui_feed_key(&c, SXK_RIGHT); build(&c, 0); CHECK(vol == 10);
    sui_feed_key(&c, SXK_END); build(&c, 0); CHECK(vol == 100);
    /* disabled widgets ignore input and are skipped by Tab */
    sui_begin(&c, 0); c.disabled = 1; sui_feed_mouse(&c, 10, 10, 1);
    CHECK(!sui_button(&c, 9, svg_rect_make(0, 0, 40, 20), "x", 0) && c.active != 9); sui_end(&c);
}

static void test_clipping(void) {
    sui_ctx c; sui_init(&c, &surf, &theme);
    for (int i = 0; i < GUARD; i++) mem[i] = mem[GUARD + TW * TH + i] = 0xdeadbeef;
    sui_begin(&c, 1);
    /* widgets far outside, straddling edges and degenerate sizes */
    sui_card(&c, svg_rect_make(-50, -50, 300, 300), 1);
    sui_button(&c, 1, svg_rect_make(80, 50, 60, 30), "Overflowing label text", 0);
    sui_toggle(&c, 2, svg_rect_make(-30, 10, 40, 4), "T", &on);
    sui_slider(&c, 3, svg_rect_make(90, -10, 2, 2), &vol, 0, 100, 1);
    sui_checkbox(&c, 4, svg_rect_make(-5, 55, 20, 30), "Check", &on);
    char b[8] = "hello"; sui_text t; sui_text_init(&t, b, 8);
    c.focus = 5; sui_text_field(&c, 5, svg_rect_make(60, -5, 50, 20), &t, "");
    sui_scroll sc = {0};
    int y = sui_scroll_begin(&c, &sc, svg_rect_make(10, 10, 40, 30));
    for (int i = 0; i < 10; i++) sui_list_item(&c, (uint32_t)(10 + i), svg_rect_make(10, y + i * 20, 40, 20), "item", "d", i == 2);
    sui_scroll_end(&c, 99, &sc, 200);
    CHECK(sui_scroll_max(&sc) == 170);
    sc.offset = 100000; sui_scroll_clamp(&sc); CHECK(sc.offset == 170);
    sui_end(&c);
    int ok = 1;
    for (int i = 0; i < GUARD; i++) if (mem[i] != 0xdeadbeef || mem[GUARD + TW * TH + i] != 0xdeadbeef) ok = 0;
    CHECK(ok);
    CHECK(c.s->clip.x0 == 0 && c.s->clip.x1 == TW); /* scroll restored the clip */
}

static void test_measure(void) {
    CHECK(sf_measure(&sf_ui14, "") == 0);
    CHECK(sf_measure(&sf_ui14, "WWW") > sf_measure(&sf_ui14, "iii"));
    CHECK(sf_measure(&sf_mono13, "WWW") == sf_measure(&sf_mono13, "iii")); /* monospace */
    CHECK(sf_measure_n(&sf_ui14, "abc", 1) <= sf_measure(&sf_ui14, "abc"));
}

int main(void) {
    svg_init(&surf, mem + GUARD, TW, TH);
    sui_theme_make(&theme, 1, 0);
    test_layout(); test_slider_math(); test_text(); test_interaction(); test_clipping(); test_measure();
    sui_theme_make(&theme, 0, 0x9bbcff); test_clipping();
    if (failures) { printf("slopui_test: %d failure(s)\n", failures); return 1; }
    printf("slopui_test: all checks passed\n");
    return 0;
}
