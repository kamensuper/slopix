/**
 * Hand-built inline SVG illustrations for the menus: slingshot, feathers, bird and foe portraits,
 * miniature world scenes and the how-to-play diagrams. Gradients come from the shared sprite.
 */
import { BIRDS } from '../core/config';
import type { BirdType, FoeVariant, ThemeId } from '../core/types';
import { paintBird } from '../render/art/birds';
import { paintFoe } from '../render/art/foes';
import { fromHtml } from './dom';

const INK = '#2b1a12';
const svg = (markup: string): SVGElement => fromHtml(markup) as SVGElement;

export function slingshotArt(cls = ''): SVGElement {
  return svg(`<svg class="art-sling ${cls}" viewBox="0 0 64 96" aria-hidden="true">
    <path d="M32 92V52M32 54L15 14M32 54L50 14" fill="none" stroke="${INK}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M32 92V52M32 54L15 14M32 54L50 14" fill="none" stroke="url(#ff-wood)" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M29.5 88V56M28.4 50L13.4 16M46.8 16" fill="none" stroke="#f6d49b" stroke-opacity=".7" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M15 14Q32 40 50 14" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M15 14Q32 40 50 14" fill="none" stroke="#8a2a2a" stroke-width="3" stroke-linecap="round"/>
    <path d="M26 53h12M26.5 59h11" stroke="#4a2c17" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>
    <circle cx="15" cy="14" r="4.4" fill="#c9854a" stroke="${INK}" stroke-width="2.4"/>
    <circle cx="50" cy="14" r="4.4" fill="#c9854a" stroke="${INK}" stroke-width="2.4"/>
  </svg>`);
}

export function featherArt(color: string, cls = ''): SVGElement {
  return svg(`<svg class="art-feather ${cls}" viewBox="0 0 24 56" aria-hidden="true">
    <path d="M12 2C21 14 22 32 12 54 2 32 3 14 12 2z" fill="${color}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M12 6V52" stroke="${INK}" stroke-opacity=".55" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12 20l6-6M12 30l6-6M12 20l-5-5M12 30l-6-6" stroke="${INK}" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`);
}

/** Square canvas holding a piece of character art, drawn with the same painters as the game. */
function portrait(cls: string, extent: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const size = 192;
  canvas.width = size;
  canvas.height = size;
  canvas.className = cls;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.translate(size / 2, size / 2 + size * 0.04);
    ctx.scale(size / (extent * 2), size / (extent * 2));
    paint(ctx);
  }
  return canvas;
}

/** Bird portrait, the bird's real in-game artwork. */
export function birdFace(type: BirdType, cls = ''): HTMLElement {
  return portrait(`art-bird art-bird-${type} ${cls}`, 172, (ctx) => paintBird(ctx, type, { time: 0.6, state: 'idle', blink: 0, lookX: 0.3, lookY: 0 }));
}

/** Foe portrait. `smug` = laughing (used on the fail screen). */
export function foeFace(smug = false, cls = '', variant: FoeVariant = 'medium'): HTMLElement {
  return portrait(`art-foe ${smug ? 'art-foe-smug' : ''} ${cls}`, 150, (ctx) =>
    paintFoe(ctx, variant, { time: 0.4, expression: smug ? 'laugh' : 'idle', blink: 0, damage: 0, armorOn: true }),
  );
}

// ------------------------------------------------------------------ world scenes

const cloud = (x: number, y: number, s: number, fill = '#fff', op = 0.9): string =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}" opacity="${op}"><ellipse cx="0" cy="0" rx="16" ry="6"/><ellipse cx="-8" cy="-5" rx="9" ry="7"/><ellipse cx="6" cy="-7" rx="10" ry="8"/></g>`;

const tree = (x: number, y: number, s: number, leaf = '#3f9a3a', dark = '#2c7a33'): string =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-3" y="-4" width="6" height="16" rx="2" fill="#7a4a24"/><circle cx="0" cy="-14" r="14" fill="${leaf}"/><circle cx="-6" cy="-10" r="9" fill="${dark}" opacity=".5"/><circle cx="5" cy="-20" r="7" fill="#7fcf4a" opacity=".55"/></g>`;

const pine = (x: number, y: number, s: number): string =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2" y="-2" width="4" height="9" fill="#5a3a24"/><path d="M0-34L12-12H-12z" fill="#2f6f6a"/><path d="M0-24L15 0H-15z" fill="#2a625e"/><path d="M0-34L12-12H4L0-20z" fill="#e8f6ff" opacity=".9"/><path d="M0-24l15 24H6z" fill="#e8f6ff" opacity=".7"/></g>`;

const SCENES: Record<ThemeId, string> = {
  grasslands: `
    <rect width="240" height="150" fill="url(#ff-sky-grass)"/>
    <circle cx="188" cy="34" r="30" fill="#fff6b0" opacity=".45"/><circle cx="188" cy="34" r="16" fill="#fff3a0"/>
    ${cloud(52, 30, 1.1)}${cloud(138, 50, 0.8, '#fff', 0.8)}
    <path d="M-5 100L40 60 70 84 110 50 160 96 200 66 245 98V150H-5z" fill="#8fb6d9" opacity=".75"/>
    <path d="M118 52v34" stroke="#e9f8ff" stroke-width="5" stroke-linecap="round" opacity=".8"/>
    <path d="M-5 112Q50 86 110 106T245 100V150H-5z" fill="url(#ff-hill-2)"/>
    ${tree(36, 106, 0.9, '#2f8a38', '#1f6d2c')}${tree(206, 104, 0.75, '#2f8a38', '#1f6d2c')}
    <path d="M-5 128Q70 106 140 124T245 118V150H-5z" fill="url(#ff-hill-1)"/>
    ${tree(168, 126, 1.2)}
    <circle cx="60" cy="134" r="2.6" fill="#ff7aa8"/><circle cx="80" cy="140" r="2.6" fill="#fff"/><circle cx="104" cy="133" r="2.6" fill="#ffd23f"/><circle cx="30" cy="142" r="2.6" fill="#fff"/>`,
  desert: `
    <rect width="240" height="150" fill="url(#ff-sky-desert)"/>
    <circle cx="70" cy="62" r="34" fill="#ffd27a" opacity=".5"/><circle cx="70" cy="62" r="20" fill="#fff0b8"/>
    <path d="M110 112V78l6-6h28l5 6v34zM176 112V60l8-8h18l6 8v52z" fill="#c9774a" opacity=".8"/>
    <path d="M-5 112V92h34l6-10h30l4 10h24v20z" fill="url(#ff-mesa)"/>
    <path d="M150 116V86l8-14h22l6 14v30z" fill="url(#ff-mesa)"/>
    <path d="M-5 124Q60 106 120 122T245 114V150H-5z" fill="url(#ff-sand)"/>
    <g fill="#8a4a2b"><rect x="96" y="92" width="10" height="34" rx="2"/><rect x="126" y="92" width="10" height="34" rx="2"/><rect x="92" y="84" width="48" height="10" rx="3"/></g>
    <g fill="#e8a65e" opacity=".9"><rect x="96" y="92" width="4" height="34"/><rect x="126" y="92" width="4" height="34"/><rect x="92" y="84" width="48" height="4"/></g>
    <path d="M-5 138Q70 120 150 136T245 130V150H-5z" fill="#e4a257"/>
    <g fill="#4d8a3a" stroke="#2f5f2a" stroke-width="1.5"><rect x="200" y="112" width="8" height="26" rx="4"/><rect x="193" y="119" width="6" height="12" rx="3"/><rect x="209" y="116" width="6" height="12" rx="3"/></g>`,
  snowlands: `
    <rect width="240" height="150" fill="url(#ff-sky-snow)"/>
    <circle cx="190" cy="30" r="13" fill="#fff" opacity=".85"/><circle cx="190" cy="30" r="22" fill="#fff" opacity=".18"/>
    <path d="M-5 100L48 36 86 78 130 22 190 90 245 50V150H-5z" fill="#8c9fdc" opacity=".8"/>
    <path d="M48 36l-14 20 10-5 8 8 6-9zM130 22l-18 26 11-5 8 9 8-9 8 7z" fill="#fff" opacity=".95"/>
    <path d="M-5 112L40 84 90 108 150 80 245 112V150H-5z" fill="url(#ff-berg)"/>
    <path d="M-5 128Q70 104 150 124T245 116V150H-5z" fill="url(#ff-snow)"/>
    ${pine(40, 120, 1)}${pine(62, 124, 0.7)}${pine(196, 116, 1.1)}${pine(218, 124, 0.7)}
    <path d="M96 132h60l8 8H88z" fill="#9fd3ee" opacity=".75"/>
    <rect x="120" y="106" width="8" height="12" rx="2" fill="#3a2d3f"/><rect x="121" y="108" width="6" height="7" fill="#ffc45a"/><circle cx="124" cy="112" r="14" fill="#ffc45a" opacity=".25"/>
    <g fill="#fff"><circle cx="30" cy="30" r="1.6"/><circle cx="78" cy="18" r="1.4"/><circle cx="108" cy="58" r="1.6"/><circle cx="160" cy="40" r="1.4"/><circle cx="220" cy="80" r="1.6"/><circle cx="14" cy="76" r="1.4"/></g>`,
  storm: `
    <defs><linearGradient id="ffs-storm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f3f63"/><stop offset=".6" stop-color="#6f86a8"/><stop offset="1" stop-color="#c6d6e4"/></linearGradient></defs>
    <rect width="240" height="150" fill="url(#ffs-storm)"/>
    ${cloud(60, 34, 1.5, '#3a4868', 0.95)}${cloud(150, 26, 1.8, '#465678', 0.95)}${cloud(205, 50, 1.1, '#56688a', 0.9)}
    <path d="M150 40l-10 22h9l-8 20 20-28h-9l7-14z" fill="#ffe24d" stroke="#fff7c2" stroke-width="1.2"/>
    <path d="M-5 118Q30 104 60 118T120 116 180 120 245 112V150H-5z" fill="#3e6f8f"/>
    <path d="M-5 128Q40 118 80 130T160 128 245 126V150H-5z" fill="#2f5a78"/>
    <path d="M30 96h56l-10 22H40z" fill="#5b6a56" stroke="#2b1a12" stroke-width="2"/><path d="M28 96h60" stroke="#8fc45a" stroke-width="5" stroke-linecap="round"/>
    <path d="M150 84h60l-12 26h-36z" fill="#5b6a56" stroke="#2b1a12" stroke-width="2"/><path d="M148 84h64" stroke="#8fc45a" stroke-width="5" stroke-linecap="round"/>
    <path d="M10 70l34-8M70 52l40-9M170 66l44-10" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>`,
  ironworks: `
    <defs><linearGradient id="ffs-iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a34"/><stop offset=".55" stop-color="#a0523a"/><stop offset="1" stop-color="#f0a856"/></linearGradient></defs>
    <rect width="240" height="150" fill="url(#ffs-iron)"/>
    <path d="M20 150V70h18v80zM60 150V48h14v102zM150 150V60h20v90zM200 150V84h16v66z" fill="#2a2028"/>
    ${cloud(66, 40, 1.0, '#6a5560', 0.8)}${cloud(160, 50, 1.2, '#6a5560', 0.75)}${cloud(46, 60, 0.7, '#7d6670', 0.7)}
    <path d="M-5 110h250v40H-5z" fill="#3b2c30"/>
    <circle cx="110" cy="104" r="26" fill="#6f7a86" stroke="#2b1a12" stroke-width="3"/><circle cx="110" cy="104" r="9" fill="#2b1a12"/>
    <path d="M110 74v-8M110 142v-8M80 104h-8M148 104h-8M89 83l-6-6M137 131l-6-6M131 83l6-6M83 131l6-6" stroke="#2b1a12" stroke-width="7" stroke-linecap="round"/>
    <path d="M-5 124h250" stroke="#f0a856" stroke-width="3" stroke-dasharray="10 8" opacity=".8"/>
    <path d="M-5 132h250v18H-5z" fill="#241a1e"/>`,
  celestial: `
    <defs><linearGradient id="ffs-cel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140f3a"/><stop offset=".6" stop-color="#4a2f8f"/><stop offset="1" stop-color="#c58cf2"/></linearGradient></defs>
    <rect width="240" height="150" fill="url(#ffs-cel)"/>
    <circle cx="186" cy="38" r="24" fill="#f6e6ff" opacity=".95"/><circle cx="176" cy="32" r="22" fill="#2a1a66" opacity=".55"/>
    <g fill="#fff"><circle cx="30" cy="24" r="1.6"/><circle cx="70" cy="44" r="1.2"/><circle cx="110" cy="18" r="1.8"/><circle cx="140" cy="60" r="1.2"/><circle cx="46" cy="70" r="1.4"/><circle cx="220" cy="80" r="1.4"/><circle cx="96" cy="64" r="1"/></g>
    <path d="M40 92h44l-8 18H50z" fill="#8f7fc0" stroke="#2b1a12" stroke-width="2"/><path d="M52 92V70h6v22M68 92V64h6v28" stroke="#d9ccf5" stroke-width="5"/>
    <path d="M150 104h56l-10 22h-34z" fill="#8f7fc0" stroke="#2b1a12" stroke-width="2"/><path d="M160 104q18-34 36 0" fill="none" stroke="#d9ccf5" stroke-width="6"/>
    <path d="M118 96l8 14-8 14-8-14z" fill="#f0dcff" stroke="#8a4fc4" stroke-width="2"/>
    <path d="M-5 138Q60 126 120 138T245 134V150H-5z" fill="#2a1a66"/>`,
};

export function worldScene(theme: ThemeId, cls = ''): SVGElement {
  return svg(`<svg class="art-world art-world-${theme} ${cls}" viewBox="0 0 240 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${SCENES[theme]}</svg>`);
}

// ------------------------------------------------------------------ how-to diagrams

export type HowToStep = 'drag' | 'release' | 'tap';

const hand = (x: number, y: number): string =>
  `<g transform="translate(${x} ${y})"><path d="M0 0c-2 0-3 1-3 3v14l-3-3c-2-2-5 0-3 3l7 12c2 3 5 4 9 4h5c5 0 8-3 8-8V13c0-3-4-3-4 0v-3c0-3-4-3-4 0V8c0-3-4-3-4 0v-5c0-2-1-3-3-3z" fill="#ffe0bd" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/></g>`;

const miniBird = (x: number, y: number, r = 9): string =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#e23b2e" stroke="${INK}" stroke-width="2.4"/><circle cx="${x + r * 0.2}" cy="${y - r * 0.15}" r="${r * 0.32}" fill="#fff"/><circle cx="${x + r * 0.3}" cy="${y - r * 0.1}" r="${r * 0.14}" fill="${INK}"/><path d="M${x + r * 0.6} ${y + r * 0.1}l${r * 0.7} ${r * 0.2}-${r * 0.6} ${r * 0.4}z" fill="#f7b125" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;

export function howToArt(step: HowToStep): SVGElement {
  const sling = `<path d="M88 78V52M88 54L78 30M88 54L98 30" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><path d="M88 78V52M88 54L78 30M88 54L98 30" fill="none" stroke="url(#ff-wood)" stroke-width="6" stroke-linecap="round"/>`;
  const ground = `<path d="M0 82h120v8H0z" fill="#58b83a"/><path d="M0 82h120" stroke="${INK}" stroke-width="2.4"/>`;
  let body = '';
  if (step === 'drag') {
    body = `${sling}<path d="M78 30L54 50 98 30" fill="none" stroke="#8a2a2a" stroke-width="3" stroke-linecap="round"/>
      ${miniBird(52, 52)}
      <path d="M72 62Q60 74 40 66" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="1 6" stroke-linecap="round"/>
      <path d="M38 58l-8 9 12 2z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      ${hand(44, 56)}`;
  } else if (step === 'release') {
    body = `${sling}<path d="M78 30Q88 36 98 30" fill="none" stroke="#8a2a2a" stroke-width="3" stroke-linecap="round"/>
      ${miniBird(88, 38, 8)}
      <path d="M88 38Q44 -10 14 66" fill="none" stroke="#fff" stroke-width="3.2" stroke-dasharray="1 7" stroke-linecap="round" transform="translate(0 4)"/>
      <circle cx="20" cy="64" r="9" fill="#8fd14f" stroke="${INK}" stroke-width="2.4"/><circle cx="17" cy="62" r="2" fill="${INK}"/><circle cx="23" cy="62" r="2" fill="${INK}"/><ellipse cx="20" cy="67" rx="4" ry="2.8" fill="#a6e36a" stroke="${INK}" stroke-width="1.4"/>
      <path d="M96 40l12 10M92 44l8 12" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>`;
  } else {
    body = `${miniBird(52, 36, 11)}
      <path d="M36 28l-14-4M38 38l-16 2M40 46l-14 8" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"/>
      <path d="M70 26l12-10M72 36l16-2" stroke="#ffd23f" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M62 44l36 14" stroke="#ffd23f" stroke-width="3" stroke-dasharray="1 6" stroke-linecap="round"/>
      <circle cx="70" cy="64" r="14" fill="#fff" opacity=".35"/><circle cx="70" cy="64" r="8" fill="#fff" opacity=".45"/>
      ${hand(62, 58)}`;
  }
  return svg(`<svg class="art-howto art-howto-${step}" viewBox="0 0 120 90" aria-hidden="true">${step === 'tap' ? '' : ground}${body}</svg>`);
}

export const birdColor = (type: BirdType): string => BIRDS[type].color;
