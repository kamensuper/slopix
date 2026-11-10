/**
 * Hand-built inline SVG illustrations for the menus: slingshot, feathers, bird and pig portraits,
 * miniature world scenes and the how-to-play diagrams. Gradients come from the shared sprite.
 */
import { BIRDS } from '../core/config';
import type { BirdType, ThemeId } from '../core/types';
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

interface BirdPalette {
  body: string;
  shade: string;
  belly: string;
  beak: string;
}
const BIRD_PALETTE: Record<BirdType, BirdPalette> = {
  red: { body: '#e23b2e', shade: '#a81f22', belly: '#f2d9b6', beak: '#f7b125' },
  chuck: { body: '#f8cf1c', shade: '#d9960b', belly: '#fff3c2', beak: '#f08a1c' },
  bomb: { body: '#34343d', shade: '#17171c', belly: '#8e8e9c', beak: '#f7b125' },
  blues: { body: '#58b7ee', shade: '#2b7fc4', belly: '#e8f7ff', beak: '#f7b125' },
  matilda: { body: '#f5f0e6', shade: '#cfc5b3', belly: '#ffffff', beak: '#f7b125' },
};

/** Round bird portrait, tinted per bird type, with a type-specific crest. */
export function birdFace(type: BirdType, cls = ''): SVGElement {
  const p = BIRD_PALETTE[type];
  const crest =
    type === 'bomb'
      ? `<path d="M32 12q2-7 8-7" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><circle cx="41" cy="5" r="3.4" fill="#ffb629" stroke="${INK}" stroke-width="1.8"/>`
      : type === 'chuck'
        ? `<path d="M22 14l10-12 10 12z" fill="${p.body}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
        : type === 'matilda'
          ? `<path d="M24 13q8-10 16 0" fill="${p.body}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
          : `<path d="M25 13q-2-9 5-9M33 11q1-9 7-8M38 14q5-6 10-3" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`;
  const cheeks = type === 'matilda' ? `<circle cx="18" cy="42" r="4" fill="#f6b7a6"/><circle cx="46" cy="42" r="4" fill="#f6b7a6"/>` : '';
  const brow = type === 'matilda' ? '' : `<path d="M17 21l12 5M47 21l-12 5" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
  return svg(`<svg class="art-bird art-bird-${type} ${cls}" viewBox="0 0 64 64" aria-hidden="true">
    ${crest}
    <circle cx="32" cy="35" r="25" fill="${p.body}" stroke="${INK}" stroke-width="3.4"/>
    <path d="M10 42a25 25 0 0 0 44 0c-6 9-38 9-44 0z" fill="${p.shade}" opacity=".55"/>
    <ellipse cx="32" cy="49" rx="14" ry="9" fill="${p.belly}"/>
    ${cheeks}
    <circle cx="23" cy="32" r="7" fill="#fff" stroke="${INK}" stroke-width="2.4"/>
    <circle cx="41" cy="32" r="7" fill="#fff" stroke="${INK}" stroke-width="2.4"/>
    <circle cx="25" cy="33" r="3" fill="${INK}"/><circle cx="39" cy="33" r="3" fill="${INK}"/>
    <circle cx="26" cy="32" r="1" fill="#fff"/><circle cx="40" cy="32" r="1" fill="#fff"/>
    ${brow}
    <path d="M25 41l7-3 7 3-7 8z" fill="${p.beak}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M13 22q4-8 12-11" stroke="#fff" stroke-opacity=".45" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`);
}

/** Pig portrait. `smug` = half-lidded eyes and a smirk (used on the fail screen). */
export function pigFace(smug = false, cls = ''): SVGElement {
  const eyes = smug
    ? `<ellipse cx="29" cy="34" rx="7" ry="6.4" fill="#fff" stroke="${INK}" stroke-width="2.4"/><ellipse cx="51" cy="34" rx="7" ry="6.4" fill="#fff" stroke="${INK}" stroke-width="2.4"/>
       <circle cx="31" cy="36" r="2.8" fill="${INK}"/><circle cx="49" cy="36" r="2.8" fill="${INK}"/>
       <path d="M21 33.5h16M43 33.5h16" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
       <path d="M22 28q7-3 14 0" fill="#5fae2e" stroke="${INK}" stroke-width="2" /><path d="M44 28q7-3 14 0" fill="#5fae2e" stroke="${INK}" stroke-width="2"/>
       <path d="M42 23l17 -3" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`
    : `<circle cx="29" cy="33" r="7" fill="#fff" stroke="${INK}" stroke-width="2.4"/><circle cx="51" cy="33" r="7" fill="#fff" stroke="${INK}" stroke-width="2.4"/>
       <circle cx="30" cy="34" r="3" fill="${INK}"/><circle cx="50" cy="34" r="3" fill="${INK}"/>`;
  const mouth = smug
    ? `<path d="M30 61q12 6 24-4" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M52 56l4-3" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`
    : '';
  return svg(`<svg class="art-pig ${smug ? 'art-pig-smug' : ''} ${cls}" viewBox="0 0 80 76" aria-hidden="true">
    <path d="M14 26L9 6l20 10zM66 26l5-20-20 10z" fill="#6fbd38" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
    <ellipse cx="40" cy="42" rx="33" ry="29" fill="#8fd14f" stroke="${INK}" stroke-width="3.6"/>
    <path d="M10 50c6 18 54 18 60 0-4 22-56 22-60 0z" fill="#5fae2e" opacity=".6"/>
    <path d="M16 28q6-12 20-14" stroke="#c3ee8b" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>
    ${eyes}
    <ellipse cx="40" cy="50" rx="13" ry="9.5" fill="#a6e36a" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="35" cy="50" rx="2.6" ry="3.6" fill="#2f6b1b"/><ellipse cx="45" cy="50" rx="2.6" ry="3.6" fill="#2f6b1b"/>
    ${mouth}
  </svg>`);
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
