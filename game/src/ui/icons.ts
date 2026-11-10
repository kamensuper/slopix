/**
 * Inline SVG icon set. Every icon sits on a 24x24 grid and is drawn "sticker style": a white glyph
 * with a dark ink outline, so it reads on bright scenery as well as on coloured buttons.
 * `fill` parts are solid shapes, `line` parts are strokes (drawn twice: ink underlay + glyph).
 */
import { fromHtml } from './dom';

type Part = { d: string; mode: 'fill' | 'line'; evenodd?: boolean; fill?: string };

const circle = (cx: number, cy: number, r: number): string => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

function gearPath(): string {
  const teeth = 8;
  const cx = 12;
  const cy = 12;
  const rIn = 6.6;
  const rOut = 9.4;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const w = Math.PI / teeth;
    const p = (r: number, ang: number): string => `${(cx + Math.cos(ang) * r).toFixed(2)} ${(cy + Math.sin(ang) * r).toFixed(2)}`;
    pts.push(`${i === 0 ? 'M' : 'L'}${p(rIn, a - w * 0.9)}L${p(rOut, a - w * 0.45)}L${p(rOut, a + w * 0.45)}L${p(rIn, a + w * 0.9)}`);
  }
  return `${pts.join('')}z${circle(cx, cy, 2.9)}`;
}

const STAR_D = 'M12 2.4l2.9 6.2 6.7.8-5 4.6 1.4 6.7L12 17.4 6 20.7l1.4-6.7-5-4.6 6.7-.8z';

const ICONS: Record<string, Part[]> = {
  play: [{ d: 'M7.2 4.6L19.6 12 7.2 19.4z', mode: 'fill' }],
  pause: [{ d: 'M6.2 4.6h4.3v14.8H6.2zM13.5 4.6h4.3v14.8h-4.3z', mode: 'fill' }],
  restart: [{ d: 'M20 4.5v5.5h-5.5M19.2 14.2a8 8 0 1 1-2-8.3L20 10', mode: 'line' }],
  overview: [{ d: 'M8.5 3.5h-3a2 2 0 0 0-2 2v3M20.5 8.5v-3a2 2 0 0 0-2-2h-3M3.5 15.5v3a2 2 0 0 0 2 2h3M15.5 20.5h3a2 2 0 0 0 2-2v-3', mode: 'line' }],
  back: [{ d: 'M19.5 12h-14M11.5 5.5L5 12l6.5 6.5', mode: 'line' }],
  next: [{ d: 'M4.5 12h14M12.5 5.5L19 12l-6.5 6.5', mode: 'line' }],
  levels: [{ d: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', mode: 'fill' }],
  gear: [{ d: gearPath(), mode: 'fill', evenodd: true }],
  help: [
    { d: 'M8.6 9.2a3.5 3.5 0 1 1 5.3 3c-1.2.8-1.9 1.4-1.9 2.6', mode: 'line' },
    { d: 'M12 19v.2', mode: 'line' },
  ],
  heart: [{ d: 'M12 20.6S3.6 15.6 3.6 9.6A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 8.4 2.4c0 6-8.4 11-8.4 11z', mode: 'fill' }],
  lock: [
    { d: 'M8 11V8a4 4 0 0 1 8 0v3', mode: 'line' },
    { d: 'M6.4 10.6h11.2a1.4 1.4 0 0 1 1.4 1.4v7a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 19v-7a1.4 1.4 0 0 1 1.4-1.4z', mode: 'fill' },
    { d: 'M12 14.2v2.6', mode: 'line' },
  ],
  star: [{ d: STAR_D, mode: 'fill', fill: 'url(#ff-gold)' }],
  starEmpty: [{ d: STAR_D, mode: 'fill', fill: 'rgba(43,26,18,0.35)' }],
  music: [
    { d: 'M9.5 17V5.5l10-2V15', mode: 'line' },
    { d: circle(7, 17.5, 2.7), mode: 'fill' },
    { d: circle(17.5, 15.5, 2.7), mode: 'fill' },
  ],
  speaker: [
    { d: 'M3.6 9.4h3.8l5-4v13.2l-5-4H3.6z', mode: 'fill' },
    { d: 'M16 9.2a4 4 0 0 1 0 5.6M18.6 6.6a7.6 7.6 0 0 1 0 10.8', mode: 'line' },
  ],
  mute: [
    { d: 'M3.6 9.4h3.8l5-4v13.2l-5-4H3.6z', mode: 'fill' },
    { d: 'M16.4 9.4l5 5.2M21.4 9.4l-5 5.2', mode: 'line' },
  ],
  wind: [{ d: 'M3.5 9h10.5a2.6 2.6 0 1 0-2.6-2.6M3.5 15h14a2.6 2.6 0 1 1-2.6 2.6M3.5 12h7', mode: 'line' }],
  check: [{ d: 'M5 12.5l4.5 4.5L19 7', mode: 'line' }],
  close: [{ d: 'M6 6l12 12M18 6L6 18', mode: 'line' }],
  trash: [
    { d: 'M4.5 7h15M9.5 7V4.2h5V7', mode: 'line' },
    { d: 'M6.5 8.5l.9 11.2h9.2l.9-11.2z', mode: 'fill' },
  ],
  sparkle: [{ d: 'M12 1.5c.6 5.2 2.4 7.8 8.5 10.5-6.1 2.7-7.9 5.3-8.5 10.5-.6-5.2-2.4-7.8-8.5-10.5C9.6 9.3 11.4 6.7 12 1.5z', mode: 'fill', fill: '#fff' }],
  trophy: [
    { d: 'M7 4h10v5a5 5 0 0 1-10 0z', mode: 'fill', fill: 'url(#ff-gold)' },
    { d: 'M7 5.5H4.2c0 3.2 1.2 4.7 3.2 5M17 5.5h2.8c0 3.2-1.2 4.7-3.2 5M12 14v3.6M8 20.5h8', mode: 'line' },
  ],
  feather: [{ d: 'M5 20C5 11 11 4 20 4c0 9-6 16-15 16zM5 20l9-9', mode: 'line' }],
};

/** Gradients and filters referenced by the icons and illustrations; mounted once inside #ui. */
export const SVG_SPRITE = `
<svg class="svg-sprite" width="0" height="0" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="ff-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7a8"/><stop offset=".45" stop-color="#ffcf2e"/><stop offset="1" stop-color="#f08a00"/></linearGradient>
    <linearGradient id="ff-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0aa63"/><stop offset="1" stop-color="#a8682f"/></linearGradient>
    <linearGradient id="ff-sky-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb6f2"/><stop offset="1" stop-color="#d4f3ff"/></linearGradient>
    <linearGradient id="ff-sky-desert" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f58a4b"/><stop offset=".6" stop-color="#ffc774"/><stop offset="1" stop-color="#ffecc6"/></linearGradient>
    <linearGradient id="ff-sky-snow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c7fe0"/><stop offset=".55" stop-color="#a9c6f2"/><stop offset="1" stop-color="#eaf5ff"/></linearGradient>
    <linearGradient id="ff-hill-1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fdc55"/><stop offset="1" stop-color="#4aa63a"/></linearGradient>
    <linearGradient id="ff-hill-2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fb73f"/><stop offset="1" stop-color="#2f8a38"/></linearGradient>
    <linearGradient id="ff-sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3c377"/><stop offset="1" stop-color="#d58b45"/></linearGradient>
    <linearGradient id="ff-mesa" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9824a"/><stop offset="1" stop-color="#a24f2b"/></linearGradient>
    <linearGradient id="ff-snow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#bcd8f2"/></linearGradient>
    <linearGradient id="ff-berg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6f2ff"/><stop offset="1" stop-color="#8fb3de"/></linearGradient>
  </defs>
</svg>`;

/** Returns a fresh <svg> element for the named icon. */
export function icon(name: keyof typeof ICONS | string, cls = ''): SVGElement {
  const parts = ICONS[name] ?? [];
  const body = parts
    .map((p) => {
      const rule = p.evenodd ? ' fill-rule="evenodd"' : '';
      if (p.mode === 'fill') return `<path class="i-fill" d="${p.d}"${rule}${p.fill ? ` style="fill:${p.fill}"` : ''}/>`;
      return `<path class="i-line-under" d="${p.d}"/><path class="i-line" d="${p.d}"/>`;
    })
    .join('');
  const svg = fromHtml(`<svg class="icon icon-${name} ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`) as SVGElement;
  return svg;
}
