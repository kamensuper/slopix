/* SlopTerm — standalone Ring-3 terminal (Genesis CP05 command set preserved).
 * Command parsing and input history live entirely in this ELF. Privileged
 * services use finite, copied syscalls.
 *
 * Rendering: cell-based. Every character occupies one CELL_W x CELL_H cell
 * and is drawn at an integer cell origin with antialiased Liberation Mono 13
 * (SlopFont), so proportional spacing can never leak into terminal text.
 * Colors come from the shared SlopUI theme (follows the light/dark pref).
 * Scrollback: ring of NL logical rows, already wrapped to COLS cells.
 * Input line: SlopUI sui_text editing (Left/Right/Home/End/Delete), Up/Down
 * history, PageUp/PageDown scrollback, click on the scrollbar to page. */
#include "gui_kit.h"
#include "slopui.h"

#define CELL_W 8          /* Liberation Mono 13 advance is 7.81 px: round to 8 */
#define CELL_H 17         /* sf_mono13 line height */
#define TOP 40
#define PAD 8
#define INPUT_H 30
#define SB_W 10
#define AREA_X PAD
#define AREA_Y TOP
#define AREA_W ((int)GW - 2 * PAD)
#define AREA_H ((int)GH - TOP - INPUT_H - 2 * PAD)
#define COLS ((AREA_W - 2 * PAD - SB_W) / CELL_W)
#define ROWS ((AREA_H - PAD) / CELL_H)
#define NL 200
#define LINE_CAP 128
#define HIST 8
_Static_assert(COLS > 0 && COLS < LINE_CAP, "terminal columns must fit a line buffer");
_Static_assert(ROWS > 0, "terminal needs at least one row");

static char lines[NL][LINE_CAP], command[100], history[HIST][100];
static unsigned count, head, scroll, hist_count, hist_pos;
static int dirty = 1, blink = -1;
static svg_surface surf;
static sui_theme theme;
static sui_text edit;
static struct sx_prefs prefs;

/* Append text, splitting at '\n' and wrapping at COLS cells. */
static void output(const char *s) {
    do {
        unsigned n = 0; char *line = lines[head];
        while (s[n] && s[n] != '\n' && n < COLS) { char ch = s[n]; line[n] = (ch >= 32 && ch <= 126) ? ch : '?'; n++; }
        line[n] = 0;
        head = (head + 1) % NL; if (count < NL) count++;
        s += n; if (*s == '\n') s++;
    } while (*s);
    scroll = 0; dirty = 1;
}
static void status(int64_t value) { output(value < 0 ? "Operation failed (kernel returned error)" : "OK"); }
static unsigned max_scroll(void) { return count > ROWS ? count - ROWS : 0; }

static void command_run(void) {
    char full[100]; gc(full, command, sizeof(full));
    { char echo[104] = "> "; gc(echo + 2, command, sizeof(echo) - 2); output(echo); }
    if (*command) { gc(history[hist_count % HIST], command, sizeof(history[0])); hist_count++; }
    hist_pos = hist_count;
    char *args = full; while (*args && *args != ' ') args++; if (*args) *args++ = 0;
    while (*args == ' ') args++;
    if (ge(full, "help")) output("help clear echo ls cat write mkdir rm\nrun slop ps time apps browser files settings");
    else if (ge(full, "clear")) { count = head = scroll = 0; }
    else if (ge(full, "echo")) output(args);
    else if (ge(full, "uname")) output("Slopix Genesis CP05 x86_64 Ring-3");
    else if (ge(full, "time")) { char tmp[16]; gd(tmp, (unsigned)(sx_time() / 1000000)); output(tmp); }
    else if (ge(full, "pwd")) output("/");
    else if (ge(full, "ls")) { struct sx_dirent entries[48]; int64_t n = sx_readdir("/", entries, 48); if (n < 0) status(n); else for (int i = 0; i < n; i++) { entries[i].name[15] = 0; output(entries[i].name); } }
    else if (ge(full, "cat")) { int64_t fd = sx_open(args); if (fd < 0) status(fd); else { char b[256]; int64_t n = sx_read((int)fd, b, sizeof(b) - 1); if (n >= 0) { b[n] = 0; output(b); } else status(n); sx_close((int)fd); } }
    else if (ge(full, "write")) {
        char *body = args; while (*body && *body != ' ') body++; if (*body) *body++ = 0;
        if (!*args || !*body) output("Usage: write FILE.TXT text");
        else { int64_t fd = sx_create(args, 1); if (fd < 0) status(fd); else { int64_t r = sx_fwrite((int)fd, body, gs(body)); sx_close((int)fd); status(r); } }
    }
    else if (ge(full, "rm")) status(sx_remove(args));
    else if (ge(full, "mkdir")) status(sx_mkdir(args));
    else if (ge(full, "run")) {
        /* `run FILE.ELF [mode]` - the mode becomes _start's first argument. */
        char *m = args; while (*m && *m != ' ') m++; uint64_t mode = 0;
        if (*m) { *m++ = 0; while (*m == ' ') m++; while (*m >= '0' && *m <= '9') mode = mode * 10 + (unsigned)(*m++ - '0'); }
        int64_t n = sx_spawn(args, mode); if (n < 0) status(n); else { char b[16]; gd(b, (unsigned)n); output("Started PID:"); output(b); }
    }
    else if (ge(full, "slop")) { char b[2048]; int64_t n = sx_package(args, b, sizeof(b)); if (n < 0) status(n); else if (n) { b[sizeof(b) - 1] = 0; output(b); } else output("slop command completed"); }
    else if (ge(full, "ps")) { char b[2048]; int64_t n = sx_procinfo(b, sizeof(b)); if (n < 0) status(n); else { b[sizeof(b) - 1] = 0; output(b); } }
    else if (ge(full, "apps") || ge(full, "find")) status(sx_desktop_open(3));
    else if (ge(full, "browser")) status(sx_desktop_open(6));
    else if (ge(full, "files")) status(sx_desktop_open(5));
    else if (ge(full, "settings")) status(sx_desktop_open(4));
    else if (ge(full, "doom")) status(sx_desktop_open(2));
    else if (ge(full, "demo")) status(sx_desktop_open(1));
    else if (*full) output("Unknown command. Type help");
    sui_text_init(&edit, command, sizeof(command)); command[0] = 0; edit.len = edit.cursor = 0;
    dirty = 1;
}
static void recall(int dir) {
    unsigned oldest = hist_count > HIST ? hist_count - HIST : 0;
    if (dir < 0 && hist_pos > oldest) hist_pos--;
    else if (dir > 0 && hist_pos < hist_count) hist_pos++;
    else return;
    if (hist_pos == hist_count) command[0] = 0; else gc(command, history[hist_pos % HIST], sizeof(command));
    sui_text_init(&edit, command, sizeof(command)); dirty = 1;
}
static void key(unsigned k) {
    if (k == SXK_ENTER) { command_run(); return; }
    if (k == SXK_PGUP) { scroll = scroll + ROWS / 2 > max_scroll() ? max_scroll() : scroll + ROWS / 2; dirty = 1; return; }
    if (k == SXK_PGDN) { scroll = scroll > ROWS / 2 ? scroll - ROWS / 2 : 0; dirty = 1; return; }
    if (k == SXK_UP) { recall(-1); return; }
    if (k == SXK_DOWN) { recall(1); return; }
    if (sui_text_key(&edit, k)) { scroll = 0; dirty = 1; blink = -1; }
}
static void click(int x, int y) {
    int sx = AREA_X + AREA_W - SB_W - 2;
    if (x < sx || y < AREA_Y || y >= AREA_Y + AREA_H) return;
    key(y < AREA_Y + AREA_H / 2 ? SXK_PGUP : SXK_PGDN);
}

/* Draw one cell row of text at an exact cell grid position. */
static void draw_cells(int x, int y, const char *s, int max, uint32_t c) {
    for (int i = 0; i < max && s[i]; i++) if (s[i] != ' ') sf_draw_n(&surf, &sf_mono13, x + i * CELL_W, y, s + i, 1, c, 255);
}
static void draw(int phase) {
    sx_pref_get(&prefs);
    sui_theme_make(&theme, !prefs.light, prefs.accent);
    surf.clip = svg_rect_make(0, 0, (int)GW, (int)GH);
    svg_gradient_rect(&surf, 0, 0, (int)GW, (int)GH, theme.bg_top, theme.bg_bottom, 0);
    /* header */
    svg_fill_circle(&surf, 20, 20, 9, theme.accent, 255);
    sf_draw(&surf, &sf_mono13, 15, 12, ">", theme.text_on_accent);
    { int x = sf_draw(&surf, theme.font_strong, 36, 11, "SlopTerm", theme.text);
      sf_draw(&surf, theme.font_small, x + 8, 14, "Ring 3 / independent ELF", theme.text_muted); }
    /* scrollback surface: always dark for contrast, like a real console */
    uint32_t term_bg = theme.dark ? 0x11161b : 0x1b242c, term_fg = 0xdfe7ec, term_dim = 0x8fa2b0;
    svg_shadow(&surf, AREA_X, AREA_Y, AREA_W, AREA_H, theme.radius_md, 4, 1, theme.shadow_alpha / 2);
    svg_fill_rrect(&surf, AREA_X, AREA_Y, AREA_W, AREA_H, theme.radius_md, term_bg, 255);
    svg_rect text = svg_rect_make(AREA_X + PAD, AREA_Y + PAD / 2, COLS * CELL_W, ROWS * CELL_H);
    svg_rect old = svg_set_clip(&surf, text);
    unsigned view = count > scroll ? count - scroll : 0; if (view > ROWS) view = ROWS;
    unsigned first = (head + NL - scroll - view) % NL;
    for (unsigned i = 0; i < view; i++) {
        const char *ln = lines[(first + i) % NL];
        draw_cells(text.x0, text.y0 + (int)i * CELL_H, ln, COLS, ln[0] == '>' && ln[1] == ' ' ? theme.accent : term_fg);
    }
    svg_restore_clip(&surf, old);
    /* scrollbar */
    if (count > ROWS) {
        int tx = AREA_X + AREA_W - SB_W, ty = AREA_Y + 6, th = AREA_H - 12;
        int kh = svg_max(16, th * ROWS / (int)count), max = (int)max_scroll();
        int ky = ty + (th - kh) - (int)((int64_t)(th - kh) * (int)scroll / (max ? max : 1));
        svg_fill_rrect(&surf, tx, ky, 5, kh, 2, term_dim, 160);
        if (scroll) { char b[24] = "scrolled "; gd(b + 9, scroll); sf_draw_in(&surf, theme.font_small, AREA_X, AREA_Y + AREA_H - 20, AREA_W - SB_W - 6, 18, b, SF_RIGHT, term_dim); }
    }
    /* input line */
    int iy = (int)GH - INPUT_H - PAD;
    svg_fill_rrect(&surf, AREA_X, iy, AREA_W, INPUT_H, theme.radius_sm, theme.field_bg, 255);
    svg_stroke_rrect(&surf, AREA_X, iy, AREA_W, INPUT_H, theme.radius_sm, 2, theme.focus_ring, 230);
    int cx0 = AREA_X + PAD, cy = iy + (INPUT_H - CELL_H) / 2 + 1, cols = (AREA_W - 2 * PAD) / CELL_W - 2;
    sf_draw_n(&surf, &sf_mono13, cx0, cy, ">", 1, theme.accent, 255);
    int first_col = edit.cursor >= cols ? edit.cursor - cols + 1 : 0;   /* horizontal scroll keeps caret visible */
    old = svg_set_clip(&surf, svg_rect_make(cx0 + 2 * CELL_W, iy, cols * CELL_W, INPUT_H));
    draw_cells(cx0 + 2 * CELL_W, cy, command + first_col, cols, theme.text);
    if (phase) svg_fill_rect(&surf, cx0 + 2 * CELL_W + (edit.cursor - first_col) * CELL_W, cy + 1, 2, CELL_H - 2, theme.accent, 255);
    svg_restore_clip(&surf, old);
    gp(); dirty = 0;
}
__attribute__((noreturn)) void _start(void) {
    if (sx_gui_open(GW, GH) < 0) sx_exit(1);
    svg_init(&surf, gpx, (int)GW, (int)GH);
    sui_text_init(&edit, command, sizeof(command));
    output("Slopix Genesis Terminal / userspace"); output("Type help. PageUp/PageDown scroll, Up/Down history.");
    for (;;) {
        uint64_t e;
        while ((e = sx_gui_poll())) {
            unsigned t = sx_gui_event_type(e);
            if (t == SX_GUI_EVENT_KEY) key((unsigned)e);
            else if (t == SX_GUI_EVENT_MOUSE && (sx_gui_mouse_buttons(e) & 1)) click((int)sx_gui_mouse_x(e), (int)sx_gui_mouse_y(e));
            else if (t == SX_GUI_EVENT_VISIBILITY) dirty = 1;
        }
        for (unsigned i = 0; i < 4; i++) { char line[128]; int64_t got = sx_console_poll(line, sizeof(line) - 1); if (got <= 0) break; line[got] = 0; output(line); }
        int phase = (int)((sx_time() / 530000) & 1);
        if (phase != blink) { blink = phase; dirty = 1; }   /* caret blink: ~2 repaints/s when idle */
        if (dirty) draw(phase);
        sx_sleep(12000);
    }
}
