/**
 * Static terrain pieces (ledges, hills, pillars). They collide, so the filled silhouette matches
 * the collision shape exactly and gets the gameplay ink outline; only a few grass blades or snow
 * lumps rise a little above the top edges. Each world has its own material:
 *   grasslands - earth with roots and stones under a turf cap,
 *   desert     - banded sandstone under a thin sand drift,
 *   snowlands  - blue-grey rock under a thick snow cap with icicles.
 */
import { Rng, TAU } from '../../core/math';
import type { ThemeId } from '../../core/types';
import { rgba } from './envKit';
import type { TerrainSpec } from './types';

const INK = '#2b1a12';

interface Style {
  light: string;
  base: string;
  dark: string;
  strata: string[];
  stone: [string, string, string];
  cap: { thick: number; shade: string; base: string; light: string; drip: number };
}

const STYLES: Record<ThemeId, Style> = {
  grasslands: {
    light: '#b07a4a', base: '#8a5a34', dark: '#5e3a20',
    strata: ['rgba(98,60,32,0.55)', 'rgba(170,120,75,0.35)'],
    stone: ['#4a301b', '#a08262', '#cdb08c'],
    cap: { thick: 24, shade: '#3f8a35', base: '#5bb33d', light: '#93d957', drip: 10 },
  },
  desert: {
    light: '#f6c887', base: '#e2a463', dark: '#a9622f',
    strata: ['rgba(180,95,45,0.45)', 'rgba(255,225,170,0.45)', 'rgba(205,120,60,0.4)'],
    stone: ['#9c5a31', '#e9b67e', '#fbdcae'],
    cap: { thick: 14, shade: '#d9a45e', base: '#f3cc86', light: '#fde6b0', drip: 6 },
  },
  snowlands: {
    light: '#a9b4d2', base: '#7f8aac', dark: '#4b5372',
    strata: ['rgba(60,68,100,0.45)', 'rgba(190,205,235,0.3)'],
    stone: ['#3e4663', '#9aa5c3', '#ccd4ea'],
    cap: { thick: 30, shade: '#b9cdee', base: '#eef4ff', light: '#ffffff', drip: 12 },
  },
};

type Pt = [number, number];

function outline(spec: TerrainSpec): Pt[] {
  if (spec.shape === 'poly' && spec.points && spec.points.length >= 3) return spec.points.map(([x, y]) => [x, y] as Pt);
  const w = spec.w / 2;
  const h = spec.h / 2;
  return [[-w, -h], [w, -h], [w, h], [-w, h]];
}

function pathOf(pts: Pt[], dx = 0, dy = 0): Path2D {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x + dx, y + dy) : p.lineTo(x + dx, y + dy)));
  p.closePath();
  return p;
}

function inside(pts: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

interface Edge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Outward unit normal. */
  nx: number;
  ny: number;
  len: number;
}

/** Edges whose outward normal points up enough to hold grass / sand / snow. */
function topEdges(pts: Pt[]): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1) continue;
    let nx = (by - ay) / len;
    let ny = -(bx - ax) / len;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    if (inside(pts, mx + nx * 2, my + ny * 2)) {
      nx = -nx;
      ny = -ny;
    }
    if (ny < -0.45) out.push({ ax, ay, bx, by, nx, ny, len });
  }
  return out;
}

export function paintTerrain(ctx: CanvasRenderingContext2D, theme: ThemeId, spec: TerrainSpec, seed: number): void {
  const s = STYLES[theme];
  const rng = new Rng(seed * 977 + 13);
  const pts = outline(spec);
  const sil = pathOf(pts);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const edges = topEdges(pts);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Body: lit top-left rim, shaded lower-right rim, gradient core.
  ctx.save();
  ctx.clip(sil);
  ctx.fillStyle = s.light;
  ctx.fill(sil);
  ctx.fillStyle = s.dark;
  ctx.fill(pathOf(pts, 7, 7));
  ctx.save();
  ctx.clip(pathOf(pts, 7, 7));
  const g = ctx.createLinearGradient(0, minY, 0, maxY);
  g.addColorStop(0, s.base);
  g.addColorStop(1, mix2(s.base, s.dark));
  ctx.fillStyle = g;
  ctx.fill(pathOf(pts, -9, -9));
  ctx.restore();

  // Strata: wavy bands across the body.
  const bands = Math.max(2, Math.round(h / 42));
  for (let i = 0; i < bands; i++) {
    const y = minY + ((i + 0.6) / bands) * h + rng.range(-6, 6);
    const th = rng.range(5, theme === 'desert' ? 14 : 9);
    ctx.fillStyle = s.strata[i % s.strata.length]!;
    ctx.beginPath();
    ctx.moveTo(minX - 10, y);
    for (let x = minX - 10; x <= maxX + 10; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.03 + i * 2 + seed) * 4);
    for (let x = maxX + 10; x >= minX - 10; x -= 24) ctx.lineTo(x, y + th + Math.sin(x * 0.025 + i + seed) * 3);
    ctx.closePath();
    ctx.fill();
  }
  // Embedded stones.
  const stones = Math.round((w * h) / 4200) + 2;
  for (let i = 0; i < stones; i++) {
    const x = rng.range(minX + 10, maxX - 10);
    const y = rng.range(minY + 30, maxY - 8);
    if (!inside(pts, x, y)) continue;
    const rx = rng.range(6, 14);
    const ry = rx * rng.range(0.55, 0.8);
    const rot = rng.range(-0.4, 0.4);
    ctx.fillStyle = s.stone[0];
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + 2, rx, ry, rot, 0, TAU);
    ctx.fill();
    ctx.fillStyle = s.stone[1];
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.9, ry * 0.85, rot, 0, TAU);
    ctx.fill();
    ctx.fillStyle = s.stone[2];
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.25, rot, 0, TAU);
    ctx.fill();
  }
  // Material details.
  if (theme === 'grasslands') {
    ctx.strokeStyle = 'rgba(70,40,20,0.7)';
    ctx.lineWidth = 3;
    for (let i = 0; i < Math.max(2, w / 120); i++) {
      const x = rng.range(minX + 10, maxX - 30);
      const y0 = minY + s.cap.thick;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.bezierCurveTo(x + 6, y0 + 20, x + 20, y0 + 26, x + rng.range(20, 40), y0 + rng.range(36, 60));
      ctx.stroke();
    }
  } else if (theme === 'snowlands') {
    ctx.strokeStyle = 'rgba(170,220,245,0.75)';
    ctx.lineWidth = 3;
    for (let i = 0; i < Math.max(1, w / 160); i++) {
      let x = rng.range(minX + 20, maxX - 40);
      let y = rng.range(minY + 50, maxY - 20);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += rng.range(8, 18);
        y += rng.range(-10, 10);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = 'rgba(140,70,30,0.55)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < Math.max(1, w / 140); i++) {
      let x = rng.range(minX + 20, maxX - 20);
      let y = minY + s.cap.thick + rng.range(4, 20);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += rng.range(-10, 10);
        y += rng.range(10, 20);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // Cap along the upward-facing edges (clipped to the silhouette).
  const c = s.cap;
  const cap = new Path2D();
  const capLight = new Path2D();
  const capShade = new Path2D();
  for (const e of edges) {
    const tx = (e.bx - e.ax) / e.len;
    const ty = (e.by - e.ay) / e.len;
    const ext = c.thick * 1.5;
    const n = Math.max(2, Math.round((e.len + ext * 2) / 12));
    const along: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const d = -ext + ((e.len + ext * 2) * i) / n;
      along.push([e.ax + tx * d, e.ay + ty * d]);
    }
    const strip = (path: Path2D, depth: (i: number) => number, lift: number) => {
      path.moveTo(along[0]![0] + e.nx * lift, along[0]![1] + e.ny * lift);
      for (const [x, y] of along) path.lineTo(x + e.nx * lift, y + e.ny * lift);
      for (let i = n; i >= 0; i--) {
        const [x, y] = along[i]!;
        const d = depth(i);
        path.lineTo(x - e.nx * d, y - e.ny * d);
      }
      path.closePath();
    };
    const drip = (i: number) => c.thick + (i % 2 ? c.drip * rng.range(0.4, 1) : rng.range(-2, 2));
    strip(capShade, (i) => drip(i) + 6, 2);
    strip(cap, drip, 2);
    strip(capLight, () => c.thick * 0.32 + rng.range(-1, 2), 2);
  }
  ctx.fillStyle = rgba(c.shade, 0.9);
  ctx.fill(capShade);
  ctx.fillStyle = c.base;
  ctx.fill(cap);
  ctx.fillStyle = c.light;
  ctx.fill(capLight);
  if (theme === 'snowlands') {
    // Icicles below the snow line.
    ctx.fillStyle = 'rgba(205,238,252,0.95)';
    for (const e of edges) {
      for (let d = 14; d < e.len - 10; d += rng.range(16, 34)) {
        const x = e.ax + ((e.bx - e.ax) * d) / e.len - e.nx * (c.thick + 4);
        const y = e.ay + ((e.by - e.ay) * d) / e.len - e.ny * (c.thick + 4);
        const len = rng.range(10, 24);
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 4);
        ctx.lineTo(x, y + len);
        ctx.lineTo(x + 4, y - 4);
        ctx.closePath();
        ctx.fill();
      }
    }
  } else if (theme === 'desert') {
    ctx.strokeStyle = 'rgba(214,160,90,0.8)';
    ctx.lineWidth = 2;
    for (const e of edges) {
      for (let d = 10; d < e.len - 14; d += rng.range(16, 30)) {
        const x = e.ax + ((e.bx - e.ax) * d) / e.len - e.nx * 6;
        const y = e.ay + ((e.by - e.ay) * d) / e.len - e.ny * 6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 6, y - 2, x + 12, y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  // Ink outline (gameplay object), slightly thinner on the cap side.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.stroke(sil);

  // Above-the-edge accents: grass blades / snow lumps (<= 12 units, purely visual).
  for (const e of edges) {
    const tx = (e.bx - e.ax) / e.len;
    const ty = (e.by - e.ay) / e.len;
    if (theme === 'grasslands') {
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? c.light : c.base;
        ctx.beginPath();
        for (let d = 4; d < e.len - 4; d += rng.range(6, 12)) {
          const bx = e.ax + tx * d;
          const by = e.ay + ty * d;
          const hh = rng.range(5, 12) * (pass ? 0.7 : 1);
          const lean = rng.range(-4, 4);
          ctx.moveTo(bx - tx * 3, by - ty * 3);
          ctx.lineTo(bx + e.nx * hh + tx * lean, by + e.ny * hh + ty * lean);
          ctx.lineTo(bx + tx * 3, by + ty * 3);
          ctx.closePath();
        }
        ctx.fill();
      }
    } else if (theme === 'snowlands') {
      ctx.fillStyle = c.light;
      ctx.beginPath();
      for (let d = 10; d < e.len - 10; d += rng.range(26, 50)) {
        const bx = e.ax + tx * d;
        const by = e.ay + ty * d;
        const r = rng.range(8, 14);
        ctx.moveTo(bx - tx * r, by - ty * r);
        ctx.quadraticCurveTo(bx + e.nx * r * 0.7, by + e.ny * r * 0.7, bx + tx * r, by + ty * r);
        ctx.closePath();
      }
      ctx.fill();
      ctx.strokeStyle = rgba('#7d93bf', 0.55);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function mix2(a: string, b: string): string {
  // Midpoint of two hex colours.
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round((((pa >> shift) & 255) + ((pb >> shift) & 255)) / 2);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
