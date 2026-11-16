/** Contact sheet of every character and material, for visual review: /dev/roster.html */
import { BIRDS, FOES, MATERIALS } from '../src/core/config';
import { BIRD_TYPES, BLOCK_MATERIALS, FOE_VARIANTS } from '../src/core/types';
import { paintBird } from '../src/render/art/birds';
import { paintBlock } from '../src/render/art/blocks';
import { paintFoe } from '../src/render/art/foes';
import type { BirdState, DamageStage, FoeExpression } from '../src/render/art/types';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const time = Number(new URLSearchParams(location.search).get('t') ?? 0.8);

function label(text: string, x: number, y: number): void {
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#12202c';
  ctx.fillText(text, x, y);
}

function at(x: number, y: number, scale: number, paint: () => void): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  paint();
  ctx.restore();
}

const birdStates: BirdState[] = ['idle', 'flying', 'ability', 'dazed'];
birdStates.forEach((state, row) => {
  BIRD_TYPES.forEach((type, i) => {
    const x = 110 + i * 196;
    const y = 110 + row * 190;
    const size = 0.55 * (BIRDS[type].radius / 0.42) ** 0.6;
    at(x, y, size, () => paintBird(ctx, type, { time, state, blink: 0, pull: 0.6, fuse: state === 'ability' ? 0.7 : 0, abilityUsed: state === 'dazed' }));
    if (row === 0) label(`${BIRDS[type].name} - ${BIRDS[type].role}`, x, y + 92);
  });
});

const expressions: FoeExpression[] = ['idle', 'surprised'];
expressions.forEach((expression, row) => {
  FOE_VARIANTS.forEach((variant, i) => {
    const x = 100 + i * 175;
    const y = 880 - 0 + row * 0;
    if (row === 1) return;
    at(x, y, 0.5 * (FOES[variant].radius / 0.55) ** 0.6, () => paintFoe(ctx, variant, { time, expression, blink: 0, damage: 0, armorOn: true }));
    label(FOES[variant].name, x, y + 96);
  });
});

BLOCK_MATERIALS.forEach((material, i) => {
  const x = 100 + i * 175;
  ([0, 2] as DamageStage[]).forEach((stage, row) => {
    at(x - 30 + row * 70, 1070, 0.5, () => paintBlock(ctx, { shape: 'rect', material, w: 110, h: 150, flip: false }, stage, 3));
  });
  at(x + 4, 1140, 0.5, () => paintBlock(ctx, { shape: 'rect', material, w: 260, h: 40, flip: false }, 1, 5));
  label(MATERIALS[material].name, x, 1015);
});
