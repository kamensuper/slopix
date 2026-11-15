/* Slopettings — the Slopix preferences app, built on the shared SlopUI toolkit.
 * Ring-3 only: the kernel owns hardware and validates every preference write.
 * Look: slopui_theme.h tokens (light/dark + accent from live preferences).
 * Controls: slopui.h widgets (toggle, slider, cycler, swatches, button).
 * Layout: slopui_layout.h, recomputed from the surface size every pass.
 * Input: mouse clicks/drags, Tab/Up/Down focus, Enter/Space activate,
 * Left/Right adjust, plus the legacy single-key shortcuts. */
#include "slopui.h"

#define W 512
#define H 320
static uint32_t pixels[W * H];
static svg_surface surf;
static struct sx_prefs prefs;
static sui_theme theme;
static sui_ctx ui;
static const uint32_t palette[] = {0x91dfc0, 0x9bbcff, 0xf5b48c, 0xd5a4ef};
static const char *const fit_names[] = {"Fill", "Fit", "Center", "Stretch"};
static const char *const wall_names[] = {"Aurora", "Dune", "Slate"};
static const char *status = "Changes apply live. Save writes them to FAT32.";
enum { ID_DARK = 1, ID_DOCK, ID_VOLUME, ID_WALL, ID_FIT, ID_ACCENT, ID_SAVE };

static void num(char *out, unsigned n) { char r[12]; int i = 0, j = 0; do { r[i++] = (char)('0' + n % 10); n /= 10; } while (n && i < 12); while (i) out[j++] = r[--i]; out[j] = 0; }
static void refresh_theme(void) { sui_theme_make(&theme, !prefs.light, prefs.accent ? prefs.accent : palette[0]); }
static void change(unsigned field, uint32_t value) {
    if (sx_pref_set(field, value) >= 0) { sx_pref_get(&prefs); status = "Applied."; }
    else status = "The system rejected that value.";
    refresh_theme(); ui.dirty = 1;
}
static void save(void) { status = sx_pref_save() >= 0 ? "Saved to FAT32." : "Save failed."; ui.dirty = 1; }
static int accent_index(void) { for (int i = 0; i < 4; i++) if (palette[i] == prefs.accent) return i; return 0; }

/* One labelled settings row: card + label, returns the control slot on the right. */
static svg_rect row(svg_rect r, const char *label, int focused, int control_w) {
    sui_card(&ui, r, focused);
    svg_rect in = sui_inset(r, theme.space_md + 2, 0, theme.space_md, 0);
    svg_rect ctl = sui_cut_right(&in, control_w);
    sui_label(&ui, in, label, SUI_TEXT_BODY, SF_LEFT);
    return sui_inset(ctl, 0, 4, 0, 4);
}

static void build(int paint) {
    sui_begin(&ui, paint);
    sui_background(&ui);
    svg_rect win = svg_rect_make(0, 0, W, H), body = sui_pad(win, theme.space_lg);
    body.y0 = 6;
    /* header: accent glyph + title + version */
    svg_rect head = sui_cut_top(&body, 40);
    if (paint) {
        int cy = head.y0 + 20, cx = head.x0 + 14;
        svg_fill_circle(&surf, cx, cy, 13, theme.accent, 255);
        svg_stroke_circle(&surf, cx, cy, 7, 3, theme.text_on_accent, 200);
        svg_line(&surf, cx, cy - 11, cx, cy - 7, 3, theme.text_on_accent, 200);
        int x = sf_draw(&surf, theme.font_title, head.x0 + 36, cy - 11, "Settings", theme.text);
        sf_draw(&surf, theme.font_body, x + 10, cy - 8, "Slopix 1.0", theme.text_muted);
    }
    sui_separator(&ui, sui_cut_top(&body, 8), 1);
    svg_rect foot = sui_cut_bottom(&body, 20);

    svg_rect rows[7];
    sui_item items[7];
    for (int i = 0; i < 7; i++) { items[i].min = 26; items[i].flex = 1; }
    sui_linear(body, 0, 4, items, 7, rows);

    /* Each widget covers the whole row so clicking anywhere on it works. */
    int dark = !prefs.light, mag = prefs.magnify != 0, vol = (int)(prefs.volume > 100 ? 100 : prefs.volume);
    int wall = (int)(prefs.wallpaper % 3), fit = (int)(prefs.fit % 4), acc = accent_index();

    row(rows[0], "Dark appearance", ui.focus == ID_DARK, 48);
    if (sui_toggle(&ui, ID_DARK, sui_inset(rows[0], 0, 0, theme.space_md, 0), 0, &dark)) change(1, !dark);
    row(rows[1], "Dock magnification", ui.focus == ID_DOCK, 48);
    if (sui_toggle(&ui, ID_DOCK, sui_inset(rows[1], 0, 0, theme.space_md, 0), 0, &mag)) change(3, (uint32_t)mag);

    svg_rect vs = row(rows[2], "Volume", ui.focus == ID_VOLUME, 300);
    { svg_rect valr = sui_cut_right(&vs, 40); char n[12];
      if (sui_slider(&ui, ID_VOLUME, vs, &vol, 0, 100, 10) && !ui.mdown) change(2, (uint32_t)vol);
      else if (ui.active == ID_VOLUME && ui.mdown && (uint32_t)vol != prefs.volume) change(2, (uint32_t)vol);
      num(n, (unsigned)vol); sui_label(&ui, valr, n, SUI_TEXT_MUTED, SF_RIGHT); }

    svg_rect ws = row(rows[3], "Wallpaper", ui.focus == ID_WALL, 140);
    if (sui_cycler(&ui, ID_WALL, ws, wall_names, 3, &wall)) change(4, (uint32_t)wall);
    svg_rect fs = row(rows[4], "Wallpaper fit", ui.focus == ID_FIT, 140);
    if (sui_cycler(&ui, ID_FIT, fs, fit_names, 4, &fit)) change(5, (uint32_t)fit);

    svg_rect as = row(rows[5], "Accent color", ui.focus == ID_ACCENT, 140);
    if (sui_swatches(&ui, ID_ACCENT, sui_inset(as, 0, -4, 0, -4), palette, 4, &acc)) change(0, palette[acc]);

    svg_rect ss = row(rows[6], "Keep these settings", ui.focus == ID_SAVE, 140);
    if (sui_button(&ui, ID_SAVE, ss, "Save", SUI_BUTTON_PRIMARY)) save();

    sui_label(&ui, foot, status, SUI_TEXT_SMALL, SF_LEFT);
    sui_end(&ui);
}

/* Legacy single-key shortcuts from the previous Slopettings. Returns 1 if handled. */
static int shortcut(unsigned k) {
    if (k == 'l' || k == 'L') { ui.focus = ID_DARK; change(1, !prefs.light); }
    else if (k == 'm' || k == 'M') { ui.focus = ID_DOCK; change(3, !prefs.magnify); }
    else if (k == 'w' || k == 'W') { ui.focus = ID_WALL; change(4, (prefs.wallpaper + 1) % 3); }
    else if (k == 'f' || k == 'F') { ui.focus = ID_FIT; change(5, (prefs.fit + 1) % 4); }
    else if (k == 's' || k == 'S') { ui.focus = ID_SAVE; save(); }
    else if (k >= '1' && k <= '4') { ui.focus = ID_ACCENT; change(0, palette[k - '1']); }
    else return 0;
    return 1;
}

__attribute__((noreturn)) void _start(void) {
    if (sx_gui_open(W, H) < 0) sx_exit(1);
    svg_init(&surf, pixels, W, H);
    sx_pref_get(&prefs);
    refresh_theme();
    sui_init(&ui, &surf, &theme);
    ui.arrow_nav = 1;
    ui.focus = ID_DARK;
    for (;;) {
        uint64_t e;
        while ((e = sx_gui_poll())) {
            if (sx_gui_event_type(e) == SX_GUI_EVENT_CLOSE) { sx_pref_save(); sx_exit(0); }
            if (sx_gui_event_type(e) == SX_GUI_EVENT_KEY && shortcut((unsigned)e)) continue;
            if (sui_feed_sx(&ui, e)) build(0);
        }
        if (ui.dirty) { build(1); sx_gui_present(pixels, W * H); }
        sx_sleep(16000);
    }
}
