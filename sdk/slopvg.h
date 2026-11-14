#ifndef SLOPVG_H
#define SLOPVG_H
/* SlopVG — the Slopix antialiased software vector renderer (Ring-3, header-only).
 *
 * Pixel format: XRGB8888 (0x00RRGGBB), exactly what sx_gui_present() takes.
 * Image sources for alpha blits are ARGB8888 (alpha in bits 24..31).
 *
 * Layers kept apart inside this header:
 *   [framebuffer] svg_surface: pointer, size, stride and the active clip
 *   [clip]        svg_rect intersection and clip save/restore
 *   [blend]       per-channel source-over compositing with /255 rounding
 *   [geom]        integer sqrt and fixed-point signed-distance functions
 *   [raster]      coverage rasterizers (SDF shapes, supersampled ellipse,
 *                 scanline polygon with 4 sub-rows x 1/16 px coverage)
 *   [api]         rects, rounded rects, circles, ellipses, strokes, gradients,
 *                 soft shadows, AA lines, Bezier curves, polygons, blits
 *
 * No heap, no libc, no floating point (safe with -ffreestanding and without
 * libm). Subpixel coordinates use SVG_Q units per pixel; *_q functions take
 * subpixel coordinates.
 */
#include <stdint.h>

#define SVG_Q 16            /* subpixel units per pixel */
#define SVG_MAX_W 2048      /* widest surface the polygon rasterizer supports */
#define SVG_POLY_MAX_X 64   /* maximum edge crossings per polygon sub-row */

/* ---------------------------------------------------------------- clip */
typedef struct { int x0, y0, x1, y1; } svg_rect; /* half-open [x0,x1) x [y0,y1) */

static inline svg_rect svg_rect_make(int x, int y, int w, int h) { svg_rect r = { x, y, x + w, y + h }; return r; }
static inline int svg_min(int a, int b) { return a < b ? a : b; }
static inline int svg_max(int a, int b) { return a > b ? a : b; }
static inline int svg_clampi(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }
static inline svg_rect svg_intersect(svg_rect a, svg_rect b) {
    svg_rect r = { svg_max(a.x0, b.x0), svg_max(a.y0, b.y0), svg_min(a.x1, b.x1), svg_min(a.y1, b.y1) };
    if (r.x1 < r.x0) r.x1 = r.x0;
    if (r.y1 < r.y0) r.y1 = r.y0;
    return r;
}
static inline int svg_rect_empty(svg_rect r) { return r.x0 >= r.x1 || r.y0 >= r.y1; }
static inline int svg_rect_contains(svg_rect r, int x, int y) { return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1; }
static inline svg_rect svg_rect_union(svg_rect a, svg_rect b) {
    if (svg_rect_empty(a)) return b;
    if (svg_rect_empty(b)) return a;
    svg_rect r = { svg_min(a.x0, b.x0), svg_min(a.y0, b.y0), svg_max(a.x1, b.x1), svg_max(a.y1, b.y1) };
    return r;
}

/* --------------------------------------------------------- framebuffer */
typedef struct {
    uint32_t *px;
    int w, h, stride;   /* stride in pixels */
    svg_rect clip;      /* always inside [0,w)x[0,h) */
} svg_surface;

static inline void svg_init(svg_surface *s, uint32_t *px, int w, int h) {
    s->px = px; s->w = w; s->h = h; s->stride = w; s->clip = svg_rect_make(0, 0, w, h);
}
/* Sets a new clip (intersected with the surface) and returns the previous one. */
static inline svg_rect svg_set_clip(svg_surface *s, svg_rect r) {
    svg_rect old = s->clip;
    s->clip = svg_intersect(r, svg_rect_make(0, 0, s->w, s->h));
    return old;
}
static inline void svg_restore_clip(svg_surface *s, svg_rect old) { s->clip = old; }

/* --------------------------------------------------------------- blend */
static inline uint32_t svg_rgb(unsigned r, unsigned g, unsigned b) { return ((r & 255u) << 16) | ((g & 255u) << 8) | (b & 255u); }
static inline unsigned svg_div255(unsigned x) { return (x + 1u + (x >> 8)) >> 8; }
/* Source-over: result = c*a + d*(255-a), a in 0..255. */
static inline uint32_t svg_mix(uint32_t d, uint32_t c, unsigned a) {
    if (a >= 255u) return c & 0xffffffu;
    if (!a) return d;
    unsigned ia = 255u - a;
    unsigned r = svg_div255(((c >> 16) & 255u) * a + ((d >> 16) & 255u) * ia);
    unsigned g = svg_div255(((c >> 8) & 255u) * a + ((d >> 8) & 255u) * ia);
    unsigned b = svg_div255((c & 255u) * a + (d & 255u) * ia);
    return (r << 16) | (g << 8) | b;
}
/* Linear interpolation between two colors, t in 0..255. */
static inline uint32_t svg_lerp(uint32_t c0, uint32_t c1, unsigned t) { return svg_mix(c0, c1, t > 255u ? 255u : t); }
static inline unsigned svg_mul_alpha(unsigned a, unsigned b) { return svg_div255(a * b); }

static inline void svg_blend_px(svg_surface *s, int x, int y, uint32_t c, unsigned a) {
    if (!a || !svg_rect_contains(s->clip, x, y)) return;
    uint32_t *p = &s->px[y * s->stride + x];
    *p = svg_mix(*p, c, a);
}
/* Clipped horizontal span [x0,x1) on row y. */
static inline void svg_span(svg_surface *s, int x0, int x1, int y, uint32_t c, unsigned a) {
    if (!a || y < s->clip.y0 || y >= s->clip.y1) return;
    x0 = svg_max(x0, s->clip.x0); x1 = svg_min(x1, s->clip.x1);
    uint32_t *p = &s->px[y * s->stride];
    if (a >= 255u) { c &= 0xffffffu; for (int x = x0; x < x1; x++) p[x] = c; }
    else for (int x = x0; x < x1; x++) p[x] = svg_mix(p[x], c, a);
}

/* ---------------------------------------------------------------- geom */
static inline uint32_t svg_isqrt(uint64_t v) {
    uint64_t r = 0, bit = (uint64_t)1 << 62;
    while (bit > v) bit >>= 2;
    while (bit) {
        if (v >= r + bit) { v -= r + bit; r = (r >> 1) + bit; }
        else r >>= 1;
        bit >>= 2;
    }
    return (uint32_t)r;
}
/* Signed distance (Q units) from point p to a rounded box; negative inside. */
static inline int svg_sdf_rrect(int px, int py, int x0, int y0, int x1, int y1, int r) {
    int dx = svg_max(x0 + r - px, px - (x1 - r));
    int dy = svg_max(y0 + r - py, py - (y1 - r));
    int ox = svg_max(dx, 0), oy = svg_max(dy, 0);
    int outside = (ox && oy) ? (int)svg_isqrt((uint64_t)ox * (uint64_t)ox + (uint64_t)oy * (uint64_t)oy) : svg_max(ox, oy);
    int inside = svg_min(svg_max(dx, dy), 0);
    return outside + inside - r;
}
/* Distance (Q units) from point p to segment ab. */
static inline int svg_dist_segment(int px, int py, int ax, int ay, int bx, int by) {
    int64_t vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
    int64_t len2 = vx * vx + vy * vy, dot = wx * vx + wy * vy;
    int64_t cx, cy;
    if (len2 <= 0 || dot <= 0) { cx = ax; cy = ay; }
    else if (dot >= len2) { cx = bx; cy = by; }
    else { cx = ax + vx * dot / len2; cy = ay + vy * dot / len2; }
    int64_t ex = px - cx, ey = py - cy;
    return (int)svg_isqrt((uint64_t)(ex * ex + ey * ey));
}
/* Coverage for a signed distance with a one-pixel antialiasing ramp. */
static inline unsigned svg_cov(int d) {
    int v = (SVG_Q / 2 - d) * 255 / SVG_Q;
    return (unsigned)svg_clampi(v, 0, 255);
}

/* ------------------------------------------------------------- raster */
/* Rounded-rect coverage rasterizer. Pixel rectangle (x,y,w,h), radius r,
 * optional stroke thickness t (0 = filled), vertical gradient c0 -> c1.
 * Interior runs are filled directly; only edge pixels evaluate the SDF and
 * only corner pixels pay for a square root. */
static inline void svg__rrect(svg_surface *s, int x, int y, int w, int h, int r, int t,
                              uint32_t c0, uint32_t c1, unsigned alpha) {
    if (w <= 0 || h <= 0 || !alpha) return;
    r = svg_clampi(r, 0, svg_min(w, h) / 2);
    svg_rect b = svg_intersect(svg_rect_make(x, y, w, h), s->clip);
    if (svg_rect_empty(b)) return;
    const int Q = SVG_Q;
    int X0 = x * Q, Y0 = y * Q, X1 = (x + w) * Q, Y1 = (y + h) * Q, R = r * Q;
    int T = t * Q, IR = svg_max(R - T, 0);
    for (int yy = b.y0; yy < b.y1; yy++) {
        uint32_t c = (c0 == c1 || h < 2) ? c0 : svg_lerp(c0, c1, (unsigned)((yy - y) * 255 / (h - 1)));
        int py = yy * Q + Q / 2;
        uint32_t *row = &s->px[yy * s->stride];
        int solid0 = b.x1, solid1 = b.x1;
        if (!t && py - Y0 >= R + Q && Y1 - py >= R + Q) { solid0 = svg_max(b.x0, x + 1); solid1 = svg_min(b.x1, x + w - 1); }
        for (int xx = b.x0; xx < b.x1; xx++) {
            if (xx == solid0 && solid0 < solid1) {
                if (alpha >= 255u) for (; xx < solid1; xx++) row[xx] = c;
                else for (; xx < solid1; xx++) row[xx] = svg_mix(row[xx], c, alpha);
                if (xx >= b.x1) break;
            }
            int px = xx * Q + Q / 2;
            unsigned cov = svg_cov(svg_sdf_rrect(px, py, X0, Y0, X1, Y1, R));
            if (t && cov) {
                unsigned inner = (X1 - X0 > 2 * T && Y1 - Y0 > 2 * T)
                    ? svg_cov(svg_sdf_rrect(px, py, X0 + T, Y0 + T, X1 - T, Y1 - T, IR)) : 0u;
                cov = cov > inner ? cov - inner : 0u;
            }
            if (cov) row[xx] = svg_mix(row[xx], c, svg_mul_alpha(cov, alpha));
        }
    }
}

/* ---------------------------------------------------------------- api */
static inline void svg_clear(svg_surface *s, uint32_t c) {
    for (int y = s->clip.y0; y < s->clip.y1; y++) svg_span(s, s->clip.x0, s->clip.x1, y, c, 255u);
}
static inline void svg_fill_rect(svg_surface *s, int x, int y, int w, int h, uint32_t c, unsigned alpha) {
    svg_rect b = svg_intersect(svg_rect_make(x, y, w, h), s->clip);
    for (int yy = b.y0; yy < b.y1; yy++) svg_span(s, b.x0, b.x1, yy, c, alpha);
}
/* Vertical (top->bottom) or horizontal (left->right) linear gradient. */
static inline void svg_gradient_rect(svg_surface *s, int x, int y, int w, int h, uint32_t c0, uint32_t c1, int horizontal) {
    svg_rect b = svg_intersect(svg_rect_make(x, y, w, h), s->clip);
    if (svg_rect_empty(b)) return;
    if (!horizontal) {
        for (int yy = b.y0; yy < b.y1; yy++)
            svg_span(s, b.x0, b.x1, yy, h > 1 ? svg_lerp(c0, c1, (unsigned)((yy - y) * 255 / (h - 1))) : c0, 255u);
    } else {
        for (int yy = b.y0; yy < b.y1; yy++) {
            uint32_t *row = &s->px[yy * s->stride];
            for (int xx = b.x0; xx < b.x1; xx++) row[xx] = w > 1 ? svg_lerp(c0, c1, (unsigned)((xx - x) * 255 / (w - 1))) : c0;
        }
    }
}
static inline void svg_fill_rrect(svg_surface *s, int x, int y, int w, int h, int r, uint32_t c, unsigned alpha) { svg__rrect(s, x, y, w, h, r, 0, c, c, alpha); }
static inline void svg_fill_rrect_grad(svg_surface *s, int x, int y, int w, int h, int r, uint32_t top, uint32_t bottom, unsigned alpha) { svg__rrect(s, x, y, w, h, r, 0, top, bottom, alpha); }
static inline void svg_stroke_rrect(svg_surface *s, int x, int y, int w, int h, int r, int thickness, uint32_t c, unsigned alpha) { svg__rrect(s, x, y, w, h, r, thickness < 1 ? 1 : thickness, c, c, alpha); }
static inline void svg_fill_circle(svg_surface *s, int cx, int cy, int r, uint32_t c, unsigned alpha) { svg__rrect(s, cx - r, cy - r, 2 * r, 2 * r, r, 0, c, c, alpha); }
static inline void svg_stroke_circle(svg_surface *s, int cx, int cy, int r, int thickness, uint32_t c, unsigned alpha) { svg__rrect(s, cx - r, cy - r, 2 * r, 2 * r, r, thickness < 1 ? 1 : thickness, c, c, alpha); }

/* Soft drop shadow around a rounded rect: quadratic falloff over `spread` px,
 * offset vertically by dy. One pass, no blur buffer. */
static inline void svg_shadow(svg_surface *s, int x, int y, int w, int h, int r, int spread, int dy, unsigned alpha) {
    if (spread < 1) spread = 1;
    y += dy;
    svg_rect b = svg_intersect(svg_rect_make(x - spread, y - spread, w + 2 * spread, h + 2 * spread), s->clip);
    const int Q = SVG_Q;
    int X0 = x * Q, Y0 = y * Q, X1 = (x + w) * Q, Y1 = (y + h) * Q, R = svg_clampi(r, 0, svg_min(w, h) / 2) * Q, S = spread * Q;
    for (int yy = b.y0; yy < b.y1; yy++) {
        uint32_t *row = &s->px[yy * s->stride];
        for (int xx = b.x0; xx < b.x1; xx++) {
            int d = svg_sdf_rrect(xx * Q + Q / 2, yy * Q + Q / 2, X0, Y0, X1, Y1, R);
            if (d >= S) continue;
            unsigned a = alpha;
            if (d > 0) { int64_t f = (int64_t)(S - d) * (S - d); a = (unsigned)((int64_t)alpha * f / ((int64_t)S * S)); }
            row[xx] = svg_mix(row[xx], 0, a);
        }
    }
}

/* Filled ellipse, 4x4 supersampled (16 samples/pixel), exact integer test. */
static inline void svg_fill_ellipse(svg_surface *s, int cx, int cy, int rx, int ry, uint32_t c, unsigned alpha) {
    if (rx <= 0 || ry <= 0) return;
    svg_rect b = svg_intersect(svg_rect_make(cx - rx - 1, cy - ry - 1, 2 * rx + 2, 2 * ry + 2), s->clip);
    const int Q = SVG_Q;
    int64_t lim = (int64_t)rx * ry * Q; lim *= lim;
    for (int yy = b.y0; yy < b.y1; yy++) for (int xx = b.x0; xx < b.x1; xx++) {
        unsigned hits = 0;
        for (int sy = 2; sy < Q; sy += 4) for (int sx = 2; sx < Q; sx += 4) {
            int64_t dx = (int64_t)(xx - cx) * Q + sx, dy = (int64_t)(yy - cy) * Q + sy;
            int64_t a = dx * ry, bb = dy * rx;
            if (a * a + bb * bb <= lim) hits++;
        }
        if (hits) svg_blend_px(s, xx, yy, c, svg_mul_alpha(hits * 255u / 16u, alpha));
    }
}

/* Antialiased line with round caps; endpoints and width in Q units. */
static inline void svg_line_q(svg_surface *s, int ax, int ay, int bx, int by, int width_q, uint32_t c, unsigned alpha) {
    const int Q = SVG_Q;
    int hw = svg_max(width_q, Q / 2) / 2;
    int minx = (svg_min(ax, bx) - hw) / Q - 1, maxx = (svg_max(ax, bx) + hw) / Q + 1;
    int miny = (svg_min(ay, by) - hw) / Q - 1, maxy = (svg_max(ay, by) + hw) / Q + 1;
    svg_rect b = svg_intersect(svg_rect_make(minx, miny, maxx - minx + 1, maxy - miny + 1), s->clip);
    for (int yy = b.y0; yy < b.y1; yy++) for (int xx = b.x0; xx < b.x1; xx++) {
        int d = svg_dist_segment(xx * Q + Q / 2, yy * Q + Q / 2, ax, ay, bx, by) - hw;
        unsigned cov = svg_cov(d);
        if (cov) svg_blend_px(s, xx, yy, c, svg_mul_alpha(cov, alpha));
    }
}
static inline void svg_line(svg_surface *s, int x0, int y0, int x1, int y1, int width, uint32_t c, unsigned alpha) {
    const int Q = SVG_Q;
    svg_line_q(s, x0 * Q + Q / 2, y0 * Q + Q / 2, x1 * Q + Q / 2, y1 * Q + Q / 2, width * Q, c, alpha);
}

/* Bezier strokes, flattened into `segments` capsules (Q-unit control points).
 * Joints overlap slightly, which is invisible for opaque strokes. */
static inline void svg_quad_q(svg_surface *s, int x0, int y0, int x1, int y1, int x2, int y2, int segments, int width_q, uint32_t c, unsigned alpha) {
    if (segments < 1) segments = 1;
    int px = x0, py = y0;
    for (int i = 1; i <= segments; i++) {
        int64_t t = i, u = segments - i, n = (int64_t)segments * segments;
        int qx = (int)((u * u * x0 + 2 * u * t * x1 + t * t * x2) / n);
        int qy = (int)((u * u * y0 + 2 * u * t * y1 + t * t * y2) / n);
        svg_line_q(s, px, py, qx, qy, width_q, c, alpha); px = qx; py = qy;
    }
}
static inline void svg_cubic_q(svg_surface *s, int x0, int y0, int x1, int y1, int x2, int y2, int x3, int y3, int segments, int width_q, uint32_t c, unsigned alpha) {
    if (segments < 1) segments = 1;
    int px = x0, py = y0;
    for (int i = 1; i <= segments; i++) {
        int64_t t = i, u = segments - i, n = (int64_t)segments * segments * segments;
        int qx = (int)((u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3) / n);
        int qy = (int)((u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3) / n);
        svg_line_q(s, px, py, qx, qy, width_q, c, alpha); px = qx; py = qy;
    }
}

/* Filled polygon (closed path of n points, interleaved x,y in Q units).
 * Nonzero winding when nonzero_rule != 0, else even-odd. Antialiased by
 * accumulating 4 sub-rows of exact 1/16-pixel horizontal coverage. */
static inline void svg_fill_poly_q(svg_surface *s, const int *xy, int n, int nonzero_rule, uint32_t c, unsigned alpha) {
    static uint16_t acc[SVG_MAX_W + 1];
    const int Q = SVG_Q;
    if (n < 3 || s->clip.x1 > SVG_MAX_W) return;
    int miny = xy[1], maxy = xy[1];
    for (int i = 1; i < n; i++) { miny = svg_min(miny, xy[2 * i + 1]); maxy = svg_max(maxy, xy[2 * i + 1]); }
    int r0 = svg_max(miny / Q, s->clip.y0), r1 = svg_min(maxy / Q + 1, s->clip.y1);
    int cx0 = s->clip.x0 * Q, cx1 = s->clip.x1 * Q;
    for (int row = r0; row < r1; row++) {
        int lo = SVG_MAX_W, hi = -1;
        for (int sub = 0; sub < 4; sub++) {
            int sy = row * Q + sub * (Q / 4) + Q / 8;
            int xs[SVG_POLY_MAX_X], ws[SVG_POLY_MAX_X], k = 0;
            for (int i = 0; i < n && k < SVG_POLY_MAX_X; i++) {
                int j = (i + 1) % n;
                int x0 = xy[2 * i], y0 = xy[2 * i + 1], x1 = xy[2 * j], y1 = xy[2 * j + 1];
                if (y0 == y1) continue;
                int dir = 1;
                if (y0 > y1) { int tx = x0, ty = y0; x0 = x1; y0 = y1; x1 = tx; y1 = ty; dir = -1; }
                if (sy < y0 || sy >= y1) continue;
                int x = x0 + (int)((int64_t)(sy - y0) * (x1 - x0) / (y1 - y0));
                int m = k++;
                while (m > 0 && xs[m - 1] > x) { xs[m] = xs[m - 1]; ws[m] = ws[m - 1]; m--; }
                xs[m] = x; ws[m] = dir;
            }
            int wind = 0;
            for (int i = 0; i + 1 < k; i++) {
                wind += nonzero_rule ? ws[i] : 1;
                int inside = nonzero_rule ? wind != 0 : (wind & 1);
                if (!inside) continue;
                int xa = svg_clampi(xs[i], cx0, cx1), xb = svg_clampi(xs[i + 1], cx0, cx1);
                if (xb <= xa) continue;
                int ia = xa / Q, ib = xb / Q;
                lo = svg_min(lo, ia); hi = svg_max(hi, ib);
                if (ia == ib) { acc[ia] = (uint16_t)(acc[ia] + (xb - xa)); continue; }
                acc[ia] = (uint16_t)(acc[ia] + (Q - (xa - ia * Q)));
                for (int p = ia + 1; p < ib; p++) acc[p] = (uint16_t)(acc[p] + Q);
                acc[ib] = (uint16_t)(acc[ib] + (xb - ib * Q));
            }
        }
        for (int p = lo; p <= hi; p++) {
            unsigned cov = acc[p] * 255u / (unsigned)(4 * Q);
            acc[p] = 0;
            if (cov) svg_blend_px(s, p, row, c, svg_mul_alpha(cov > 255u ? 255u : cov, alpha));
        }
    }
}

/* Image blits. Opaque sources are XRGB; alpha sources are ARGB. */
static inline void svg_blit(svg_surface *s, int x, int y, const uint32_t *src, int w, int h, int src_stride, int use_alpha, unsigned alpha) {
    svg_rect b = svg_intersect(svg_rect_make(x, y, w, h), s->clip);
    for (int yy = b.y0; yy < b.y1; yy++) {
        const uint32_t *sr = &src[(yy - y) * src_stride];
        uint32_t *dr = &s->px[yy * s->stride];
        for (int xx = b.x0; xx < b.x1; xx++) {
            uint32_t p = sr[xx - x];
            unsigned a = use_alpha ? svg_mul_alpha(p >> 24, alpha) : alpha;
            dr[xx] = svg_mix(dr[xx], p, a);
        }
    }
}
/* Nearest-neighbour scaled blit using 16.16 stepping. */
static inline void svg_blit_scaled(svg_surface *s, int x, int y, int dw, int dh, const uint32_t *src, int sw, int sh, int src_stride, int use_alpha, unsigned alpha) {
    if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return;
    svg_rect b = svg_intersect(svg_rect_make(x, y, dw, dh), s->clip);
    uint32_t sx_step = (uint32_t)(((uint64_t)sw << 16) / (uint32_t)dw), sy_step = (uint32_t)(((uint64_t)sh << 16) / (uint32_t)dh);
    for (int yy = b.y0; yy < b.y1; yy++) {
        const uint32_t *sr = &src[(int)(((uint64_t)(yy - y) * sy_step) >> 16) * src_stride];
        uint32_t *dr = &s->px[yy * s->stride];
        for (int xx = b.x0; xx < b.x1; xx++) {
            uint32_t p = sr[((uint64_t)(xx - x) * sx_step) >> 16];
            unsigned a = use_alpha ? svg_mul_alpha(p >> 24, alpha) : alpha;
            dr[xx] = svg_mix(dr[xx], p, a);
        }
    }
}
/* 8-bit alpha mask (glyphs, icons) tinted with a color. */
static inline void svg_blit_mask(svg_surface *s, int x, int y, const uint8_t *mask, int w, int h, int mask_stride, uint32_t c, unsigned alpha) {
    svg_rect b = svg_intersect(svg_rect_make(x, y, w, h), s->clip);
    for (int yy = b.y0; yy < b.y1; yy++) {
        const uint8_t *mr = &mask[(yy - y) * mask_stride];
        uint32_t *dr = &s->px[yy * s->stride];
        for (int xx = b.x0; xx < b.x1; xx++) { unsigned m = mr[xx - x]; if (m) dr[xx] = svg_mix(dr[xx], c, svg_mul_alpha(m, alpha)); }
    }
}

#endif
