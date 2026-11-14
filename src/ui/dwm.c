/* dwm-like tiling window manager for Slopix.
 * - Master/stack layout with adjustable master area
 * - 9 tags (workspaces), each with its own layout
 * - Keyboard-driven: Mod=Alt, Mod+Shift for window ops
 * - Minimal borders, no titlebars, status bar with quick launch
 * - Vector aesthetic: clean lines, solid colors
 */
#include "../kernel.h"
#include "desktop_backend.h"
#include "../apps.h"
#include "../preferences.h"
#include "shell.h"
#include "../user/process.h"
#include "../user/gui.h"
#include "../perf.h"

#define TAG_COUNT 9
#define MAX_WINDOWS 32
#define BAR_HEIGHT 24
#define BORDER_WIDTH 2
#define GAP 8

struct bounds { int x, y, w, h; };
enum layout_mode { LAYOUT_TILE, LAYOUT_MONOCLE, LAYOUT_FLOAT };
struct win {
    unsigned pid;
    int id;                 /* app index (TERM, DEMO, etc.) or -1 for external */
    int tag;                /* bitmask of tags this window is on */
    struct bounds box;      /* current geometry */
    struct bounds saved;    /* floating geometry */
    int floating;
    int urgent;
    int mapped;
};

struct tag_state {
    enum layout_mode layout;
    int mfact;              /* master area factor [50, 950] = 0.05..0.95 * 1000 */
    int nmaster;            /* number of master windows */
    int showbar;
};

static struct win wins[MAX_WINDOWS];
static int win_count;
static int sel;             /* selected window index */
static int seltag;          /* current tag (0-8) */
static struct tag_state tags[TAG_COUNT];
static int bar_y;
static int show_bar = 1;
static int mx, my, cursor_dirty = 1;
static uint64_t last_status_update;
static char status_text[128] = "Slopix dwm";

static int clamp(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

/* ─── color scheme (vector/flat, no gradients) ─── */
static uint32_t C_BG        = 0x1a1b26;  /* background */
static uint32_t C_FG        = 0xc0caf5;  /* foreground */
static uint32_t C_BORDER    = 0x444b6a;  /* unfocused border */
static uint32_t C_BORDER_F  = 0x7aa2f7;  /* focused border */
static uint32_t C_BAR_BG    = 0x16161e;  /* bar background */
static uint32_t C_BAR_FG    = 0xa9b1d6;  /* bar foreground */
static uint32_t C_BAR_SEL   = 0x7aa2f7;  /* bar selected tag */
static uint32_t C_BAR_URG   = 0xf7768e;  /* bar urgent tag */
static uint32_t C_BAR_OCC   = 0x565f89;  /* bar occupied tag */
static uint32_t C_ACCENT    = 0x7aa2f7;  /* accent */

void apply_theme(void) {
    if (prefs.light) {
        C_BG       = 0xfafafa;
        C_FG       = 0x24283b;
        C_BORDER   = 0xd0d0d0;
        C_BORDER_F = 0x2e7de9;
        C_BAR_BG   = 0xffffff;
        C_BAR_FG   = 0x414868;
        C_BAR_SEL  = 0x2e7de9;
        C_BAR_URG  = 0xc53b53;
        C_BAR_OCC  = 0x9aa5ce;
        C_ACCENT   = 0x2e7de9;
    } else {
        C_BG       = 0x1a1b26;
        C_FG       = 0xc0caf5;
        C_BORDER   = 0x444b6a;
        C_BORDER_F = 0x7aa2f7;
        C_BAR_BG   = 0x16161e;
        C_BAR_FG   = 0xa9b1d6;
        C_BAR_SEL  = 0x7aa2f7;
        C_BAR_URG  = 0xf7768e;
        C_BAR_OCC  = 0x565f89;
        C_ACCENT   = 0x7aa2f7;
    }
}

static struct region workarea(void) {
    int y = show_bar ? BAR_HEIGHT : 0;
    int h = (int)height - (show_bar ? BAR_HEIGHT : 0);
    return (struct region){GAP, y + GAP, (int)width - 2 * GAP, h - 2 * GAP};
}

static void draw_border(int idx, int focused) {
    struct bounds b = wins[idx].box;
    uint32_t c = focused ? C_BORDER_F : C_BORDER;
    rect(b.x - BORDER_WIDTH, b.y - BORDER_WIDTH, b.w + 2 * BORDER_WIDTH, BORDER_WIDTH, c);
    rect(b.x - BORDER_WIDTH, b.y + b.h, b.w + 2 * BORDER_WIDTH, BORDER_WIDTH, c);
    rect(b.x - BORDER_WIDTH, b.y, BORDER_WIDTH, b.h, c);
    rect(b.x + b.w, b.y, BORDER_WIDTH, b.h, c);
}

static void dwm_open_app(unsigned id);

static void draw_bar(void) {
    int bar_h = BAR_HEIGHT;
    int y = show_bar ? 0 : (int)height - bar_h;
    bar_y = y;

    /* bar background */
    rect(0, y, (int)width, bar_h, C_BAR_BG);
    rect(0, y + bar_h - 1, (int)width, 1, C_BORDER);

    /* tags */
    int tx = GAP;
    for (int i = 0; i < TAG_COUNT; i++) {
        int occupied = 0, urgent = 0, selected = 0;
        for (int w = 0; w < win_count; w++) {
            if (wins[w].tag & (1 << i)) {
                occupied = 1;
                if (wins[w].urgent) urgent = 1;
                if (w == sel) selected = 1;
            }
        }
        uint32_t bg = C_BAR_BG, fg = C_BAR_FG;
        if (selected) { bg = C_BAR_SEL; fg = C_BG; }
        else if (urgent) { bg = C_BAR_URG; fg = C_BG; }
        else if (occupied) { bg = C_BAR_OCC; fg = C_BG; }

        int tag_w = 28;
        rect(tx, y + 2, tag_w, bar_h - 4, bg);
        char label[3] = { (char)('1' + i), 0 };
        int tw = length(label) * 10;
        text(tx + (tag_w - tw) / 2, y + (bar_h - 20) / 2 + 4, label, fg);
        tx += tag_w + 2;
    }

    /* layout symbol */
    static const char *symbols[] = { "[]=", "[M]", "><>" };
    int lx = tx + 10;
    rect(lx - 5, y + 2, 40, bar_h - 4, C_BAR_BG);
    text(lx, y + (bar_h - 20) / 2 + 4, symbols[tags[seltag].layout], C_BAR_FG);

    /* app launch buttons: Term, Demo, Doom, Files, Settings */
    static const char *const app_labels[] = { "Term", "Demo", "Doom", "Files", "Set" };
    int bx = lx + 50;
    for (int a = 0; a < 5; a++) {
        rect(bx, y + 2, 52, bar_h - 4, C_BAR_OCC);
        text(bx + 6, y + (bar_h - 20) / 2 + 4, app_labels[a], C_BG);
        bx += 58;
    }

    /* window title / focused window name */
    int title_x = bx + 12;
    if (sel >= 0 && sel < win_count && (wins[sel].tag & (1 << seltag))) {
        const char *name = wins[sel].id >= 0 ? app_name(wins[sel].id) : "external";
        text(title_x, y + (bar_h - 20) / 2 + 4, name, C_BAR_SEL);
    }

    /* status text (right aligned) */
    int status_w = length(status_text) * 10;
    text((int)width - status_w - GAP, y + (bar_h - 20) / 2 + 4, status_text, C_BAR_FG);
}

static void focus_win(int idx);

static void arrange(void) {
    struct region wa = workarea();
    if (wa.w <= 0 || wa.h <= 0) return;

    struct tag_state *ts = &tags[seltag];
    int master_count = 0, stack_count = 0;
    int master_indices[MAX_WINDOWS], stack_indices[MAX_WINDOWS];

    for (int i = 0; i < win_count; i++) {
        if (!(wins[i].tag & (1 << seltag)) || wins[i].floating) continue;
        if (master_count < ts->nmaster) master_indices[master_count++] = i;
        else stack_indices[stack_count++] = i;
    }

    if (ts->layout == LAYOUT_MONOCLE) {
        for (int i = 0; i < master_count; i++) {
            int idx = master_indices[i];
            wins[idx].box = (struct bounds){wa.x, wa.y, wa.w, wa.h};
        }
        for (int i = 0; i < stack_count; i++) {
            int idx = stack_indices[i];
            wins[idx].box = (struct bounds){wa.x, wa.y, wa.w, wa.h};
        }
        return;
    }

    if (ts->layout == LAYOUT_FLOAT) return;

    /* tile layout: if no stack, master fills full width wa.w */
    int mw = stack_count > 0 ? (wa.w * ts->mfact) / 1000 : wa.w;
    if (master_count > 0) {
        int mh = wa.h / master_count;
        for (int i = 0; i < master_count; i++) {
            int idx = master_indices[i];
            int y = wa.y + i * mh;
            int h = (i == master_count - 1) ? wa.h - i * mh : mh;
            wins[idx].box = (struct bounds){wa.x, y, stack_count > 0 ? (mw - GAP) : wa.w, h - GAP};
        }
    }
    if (stack_count > 0) {
        int sw = wa.w - mw - GAP;
        int sh = wa.h / stack_count;
        for (int i = 0; i < stack_count; i++) {
            int idx = stack_indices[i];
            int y = wa.y + i * sh;
            int h = (i == stack_count - 1) ? wa.h - i * sh : sh;
            wins[idx].box = (struct bounds){wa.x + mw + GAP, y, sw - GAP, h - GAP};
        }
    }
}

static void focus_win(int idx) {
    if (idx < 0 || idx >= win_count) return;
    if (!(wins[idx].tag & (1 << seltag))) return;
    if (sel >= 0) draw_border(sel, 0);
    sel = idx;
    draw_border(sel, 1);
    if (wins[sel].pid) gui_send_visibility(wins[sel].pid, 1);
    wins[sel].urgent = 0;
}

__attribute__((unused)) static int find_win_by_pid(unsigned pid) {
    for (int i = 0; i < win_count; i++) if (wins[i].pid == pid) return i;
    return -1;
}

static int add_win(unsigned pid, int app_id) {
    if (win_count >= MAX_WINDOWS) return -1;
    int idx = win_count++;
    wins[idx] = (struct win){.pid = pid, .id = app_id, .tag = 1 << seltag, .floating = 0, .urgent = 0, .mapped = 1};
    wins[idx].saved = (struct bounds){0, 0, 640, 480};
    arrange();
    focus_win(idx);
    damage(0, 0, (int)width, (int)height);
    return idx;
}

static void remove_win(int idx) {
    if (idx < 0 || idx >= win_count) return;
    if (wins[idx].pid) { process_kill(wins[idx].pid); wins[idx].pid = 0; }
    for (int i = idx; i < win_count - 1; i++) wins[i] = wins[i + 1];
    win_count--;
    if (sel >= win_count) sel = win_count - 1;
    if (sel >= 0) focus_win(sel);
    arrange();
    damage(0, 0, (int)width, (int)height);
}

static void toggle_floating(int idx) {
    if (idx < 0 || idx >= win_count) return;
    wins[idx].floating = !wins[idx].floating;
    if (!wins[idx].floating) wins[idx].saved = wins[idx].box;
    arrange();
    damage(0, 0, (int)width, (int)height);
}

static void set_layout(enum layout_mode l) {
    tags[seltag].layout = l;
    arrange();
    damage(0, 0, (int)width, (int)height);
}

static void set_mfact(int delta) {
    struct tag_state *ts = &tags[seltag];
    ts->mfact = clamp(ts->mfact + delta, 50, 950);
    arrange();
    damage(0, 0, (int)width, (int)height);
}

static void set_nmaster(int delta) {
    struct tag_state *ts = &tags[seltag];
    ts->nmaster = clamp(ts->nmaster + delta, 1, 3);
    arrange();
    damage(0, 0, (int)width, (int)height);
}

static void toggle_bar(void) {
    show_bar = !show_bar;
    tags[seltag].showbar = show_bar;
    arrange();
    damage(0, 0, (int)width, (int)height);
}

static void view_tag(int tag) {
    if (tag < 0 || tag >= TAG_COUNT) return;
    if (sel >= 0) draw_border(sel, 0);
    seltag = tag;
    sel = -1;
    for (int i = win_count - 1; i >= 0; i--) {
        if (wins[i].tag & (1 << seltag)) { focus_win(i); break; }
    }
    arrange();
    damage(0, 0, (int)width, (int)height);
}

static void tag_win(int idx, int tag) {
    if (idx < 0 || idx >= win_count || tag < 0 || tag >= TAG_COUNT) return;
    wins[idx].tag = 1 << tag;
    arrange();
    view_tag(tag);
}

static void spawn_term(void) {
    int pid = process_spawn("TERM.ELF", 0);
    if (pid > 0 && gui_authorize((unsigned)pid)) add_win((unsigned)pid, 0);
}

static void spawn_dmenu(void) {
    int pid = process_spawn("FILES.ELF", 0);
    if (pid > 0 && gui_authorize((unsigned)pid)) add_win((unsigned)pid, 5);
}

static void kill_focused(void) {
    if (sel >= 0) remove_win(sel);
}

static void cycle_focus(int dir) {
    int count = 0, indices[MAX_WINDOWS];
    for (int i = 0; i < win_count; i++)
        if (wins[i].tag & (1 << seltag) && !wins[i].floating)
            indices[count++] = i;
    if (count == 0) return;
    int cur = 0;
    for (int i = 0; i < count; i++) if (indices[i] == sel) { cur = i; break; }
    int next = (cur + dir + count) % count;
    focus_win(indices[next]);
}

/* ─── backend entry points ─── */

static void dwm_init(void) {
    apply_theme();
    ui_shell_init();

    for (int i = 0; i < TAG_COUNT; i++) {
        tags[i] = (struct tag_state){
            .layout = LAYOUT_TILE,
            .mfact = 550,
            .nmaster = 1,
            .showbar = 1
        };
    }
    show_bar = 1;
    sel = -1;
    seltag = 0;
    win_count = 0;
    last_status_update = timer_us();

    /* auto-spawn terminal */
    spawn_term();
    logstr("TERM_RING3_LAUNCHED\n");

    damage(0, 0, (int)width, (int)height);
}

static void dwm_render(void) {
    graphics_reset_clip();

    /* clear background */
    rect(0, 0, (int)width, (int)height, C_BG);

    /* draw windows bottom-up */
    for (int i = 0; i < win_count; i++) {
        if (!(wins[i].tag & (1 << seltag)) || !wins[i].mapped) continue;
        struct bounds b = wins[i].box;

        /* window background */
        rect(b.x, b.y, b.w, b.h, i == 0 ? (prefs.light ? 0xf5f5f5 : 0x1e1e2e) : (prefs.light ? 0xeeeeee : 0x24283b));

        /* draw client content */
        if (wins[i].pid) {
            graphics_clip((struct region){b.x, b.y, b.w, b.h});
            gui_draw(wins[i].pid, b.x, b.y, b.w, b.h);
            graphics_reset_clip();
        }

        /* border */
        draw_border(i, i == sel);
    }

    /* bar on top */
    graphics_reset_clip();
    if (show_bar) draw_bar();

    present();
    cursor_present(mx, my);
    cursor_dirty = 0;
}

static void dwm_step(uint64_t now) {
    /* update status text periodically */
    if (now - last_status_update > 1000000) {
        last_status_update = now;
        char date[48];
        extern int arch_date(char*, unsigned);
        if (arch_date(date, sizeof(date))) {
            int h = (date[15]-'0')*10 + (date[16]-'0');
            int m = (date[18]-'0')*10 + (date[19]-'0');
            int s = (date[21]-'0')*10 + (date[22]-'0');
            char buf[32];
            int len = 0;
            buf[len++] = '0' + h/10; buf[len++] = '0' + h%10; buf[len++] = ':';
            buf[len++] = '0' + m/10; buf[len++] = '0' + m%10; buf[len++] = ':';
            buf[len++] = '0' + s/10; buf[len++] = '0' + s%10; buf[len] = 0;
            copystr(status_text, buf, sizeof(status_text));
        }
        if (show_bar) damage(0, 0, (int)width, BAR_HEIGHT);
    }

    /* check process liveness */
    for (int i = 0; i < win_count; i++) {
        if (wins[i].pid && !process_alive(wins[i].pid)) {
            if (i == sel) sel = -1;
            for (int j = i; j < win_count - 1; j++) wins[j] = wins[j + 1];
            win_count--; i--;
            arrange();
        } else if (wins[i].pid && gui_take_dirty(wins[i].pid) && (wins[i].tag & (1 << seltag))) {
            damage(wins[i].box.x - BORDER_WIDTH, wins[i].box.y - BORDER_WIDTH,
                   wins[i].box.w + 2*BORDER_WIDTH, wins[i].box.h + 2*BORDER_WIDTH);
        }
    }

    if (damage_pending()) dwm_render();
    else if (cursor_dirty) { cursor_present(mx, my); cursor_dirty = 0; }
}

static void dwm_mouse(int x, int y, int buttons) {
    if (x != mx || y != my) cursor_dirty = 1;
    mx = x; my = y;
    static int drag_win = -1, drag_x, drag_y, drag_btn;
    static int resize_win = -1;

    if (buttons & 1) { /* left click */
        if (drag_win < 0) {
            /* click on bar? */
            if (show_bar && y >= bar_y && y < bar_y + BAR_HEIGHT) {
                int tx = GAP;
                for (int i = 0; i < TAG_COUNT; i++) {
                    if (x >= tx && x < tx + 28) { view_tag(i); return; }
                    tx += 30;
                }
                int lx = tx + 10;
                if (x >= lx - 5 && x < lx + 45) {
                    set_layout((tags[seltag].layout + 1) % 3);
                    return;
                }
                static const int bar_apps[] = {0, 1, 2, 5, 4};
                int bx = lx + 50;
                for (int a = 0; a < 5; a++) {
                    if (x >= bx && x < bx + 55) {
                        dwm_open_app(bar_apps[a]);
                        return;
                    }
                    bx += 58;
                }
                return;
            }

            for (int i = win_count - 1; i >= 0; i--) {
                if (!(wins[i].tag & (1 << seltag)) || !wins[i].mapped) continue;
                struct bounds b = wins[i].box;
                if (x >= b.x - BORDER_WIDTH && x < b.x + b.w + BORDER_WIDTH &&
                    y >= b.y - BORDER_WIDTH && y < b.y + b.h + BORDER_WIDTH) {
                    focus_win(i);
                    if (wins[i].pid && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
                        gui_send_mouse(wins[i].pid, (unsigned)(x - b.x), (unsigned)(y - b.y), 1);
                    }
                    if (wins[i].floating || tags[seltag].layout == LAYOUT_FLOAT) {
                        drag_win = i;
                        drag_x = x - b.x;
                        drag_y = y - b.y;
                        drag_btn = 1;
                    } else if (x >= b.x + b.w - 16 && y >= b.y + b.h - 16) {
                        resize_win = i;
                        drag_x = x;
                        drag_y = y;
                    }
                    break;
                }
            }
        } else {
            /* dragging floating window */
            struct bounds *b = &wins[drag_win].box;
            int nx = x - drag_x, ny = y - drag_y;
            struct region wa = workarea();
            nx = clamp(nx, wa.x, wa.x + wa.w - b->w);
            ny = clamp(ny, wa.y, wa.y + wa.h - b->h);
            if (nx != b->x || ny != b->y) {
                draw_border(drag_win, 1);
                b->x = nx; b->y = ny;
                wins[drag_win].saved = *b;
                draw_border(drag_win, 1);
            }
        }
    } else if (drag_win >= 0) {
        drag_win = -1;
    }

    if (buttons & 4) { /* right click - resize floating */
        if (resize_win >= 0) {
            struct bounds *b = &wins[resize_win].box;
            int nw = b->w + x - drag_x, nh = b->h + y - drag_y;
            nw = clamp(nw, 200, (int)width);
            nh = clamp(nh, 150, (int)height);
            if (nw != b->w || nh != b->h) {
                draw_border(resize_win, 1);
                b->w = nw; b->h = nh;
                wins[resize_win].saved = *b;
                draw_border(resize_win, 1);
            }
            drag_x = x; drag_y = y;
        }
    } else {
        resize_win = -1;
    }

    /* middle click on bar -> spawn term */
    if ((buttons & 2) && !(drag_btn & 2) && show_bar && y >= bar_y && y < bar_y + BAR_HEIGHT) {
        spawn_term();
    }
    drag_btn = buttons;
}

static void dwm_key(unsigned key) {
    int alt = input_alt_down();
    if (!alt) {
        if (sel >= 0 && wins[sel].pid) gui_send_key(wins[sel].pid, key);
        return;
    }

    int shift = input_shift_down();
    switch (key) {
        case 'q': case 'Q': kill_focused(); break;
        case KEY_ENTER: spawn_term(); break;
        case 'd': case 'D': spawn_dmenu(); break;
        case 'b': case 'B': toggle_bar(); break;
        case 't': case 'T': set_layout(LAYOUT_TILE); break;
        case 'm': case 'M': set_layout(LAYOUT_MONOCLE); break;
        case 'f': case 'F': set_layout(LAYOUT_FLOAT); break;
        case ' ': /* toggle floating */
            if (sel >= 0) { toggle_floating(sel); focus_win(sel); }
            break;
        case 'h': case 'H': case KEY_LEFT:
            if (sel >= 0 && wins[sel].floating) {
                wins[sel].box.x -= 20; wins[sel].saved = wins[sel].box; draw_border(sel, 1);
            } else { set_mfact(-50); }
            break;
        case 'l': case 'L': case KEY_RIGHT:
            if (sel >= 0 && wins[sel].floating) {
                wins[sel].box.x += 20; wins[sel].saved = wins[sel].box; draw_border(sel, 1);
            } else { set_mfact(50); }
            break;
        case 'k': case 'K': case KEY_UP:
            if (sel >= 0 && wins[sel].floating) {
                wins[sel].box.y -= 20; wins[sel].saved = wins[sel].box; draw_border(sel, 1);
            } else { cycle_focus(-1); }
            break;
        case 'j': case 'J': case KEY_DOWN:
            if (sel >= 0 && wins[sel].floating) {
                wins[sel].box.y += 20; wins[sel].saved = wins[sel].box; draw_border(sel, 1);
            } else { cycle_focus(1); }
            break;
        case ',': case '<': set_nmaster(-1); break;
        case '.': case '>': set_nmaster(1); break;
        case KEY_TAB:
            view_tag((seltag + 1) % TAG_COUNT);
            break;
        default:
            if (key >= '1' && key <= '9') {
                int tag = key - '1';
                if (shift) tag_win(sel, tag);
                else view_tag(tag);
            }
            break;
    }
}

static void dwm_shortcut(unsigned action) {
    if (action == 1) cycle_focus(1);
    else if (action == 2) kill_focused();
    else if (action == 6) set_mfact(-50);
    else if (action == 7) set_mfact(50);
}

static void dwm_resized(unsigned w, unsigned h) {
    (void)w; (void)h;
    arrange();
    damage(0, 0, (int)width, (int)height);
}

static void dwm_background_changed(void) {
    apply_theme();
    if (sel < 0 && win_count > 0) {
        for (int i = 0; i < win_count; i++) {
            if (wins[i].tag & (1 << seltag)) {
                focus_win(i);
                break;
            }
        }
    }
    damage(0, 0, (int)width, (int)height);
}

static void dwm_scancode(unsigned code, int ext, int down) {
    if (sel >= 0 && wins[sel].pid && wins[sel].id == 2 /* DOOM */)
        gui_send_scancode(wins[sel].pid, code, ext, down);
}

static void dwm_open_app(unsigned id) {
    static const char *const elf_names[APP_COUNT] = {
        "TERM.ELF", "DEMO.ELF", "DOOM.ELF", "FIND.ELF", "SET.ELF", "FILES.ELF", "BROWSE.ELF", 0
    };
    if (id >= APP_COUNT || !elf_names[id]) return;
    for (int i = 0; i < win_count; i++) {
        if (wins[i].id == (int)id) {
            focus_win(i);
            return;
        }
    }
    int pid = process_spawn(elf_names[id], 0);
    if (pid > 0 && gui_authorize((unsigned)pid)) {
        add_win((unsigned)pid, (int)id);
        logstr(id == 2 ? "DOOM_RING3_LAUNCHED\n" : id == 1 ? "DEMO_RING3_LAUNCHED\n" : "GENESIS_CP05_RING3_LAUNCHED\n");
    }
}

static unsigned dwm_open_count(void) {
    unsigned n = 0;
    for (int i = 0; i < win_count; i++) if (wins[i].mapped) n++;
    return n;
}

static unsigned dwm_app_state(unsigned id) {
    for (int i = 0; i < win_count; i++)
        if (wins[i].id == (int)id) return wins[i].mapped ? 1 : 0;
    return 0;
}

static int dwm_wants_escape(void) { return 0; }
static int dwm_game_focused(void) { return sel >= 0 && wins[sel].id == 2; }

const struct desktop_backend dwm_backend = {
    .name = "dwm",
    .init = dwm_init,
    .render = dwm_render,
    .step = dwm_step,
    .mouse = dwm_mouse,
    .key = dwm_key,
    .shortcut = dwm_shortcut,
    .resized = dwm_resized,
    .background_changed = dwm_background_changed,
    .scancode = dwm_scancode,
    .open_app = dwm_open_app,
    .open_count = dwm_open_count,
    .app_state = dwm_app_state,
    .wants_escape = dwm_wants_escape,
    .game_focused = dwm_game_focused
};
