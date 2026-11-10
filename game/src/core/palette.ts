/** Colours shared between gameplay rendering, particles and the interface. */
import type { BirdType, BlockMaterial, ThemeId } from './types';

/** Universal outline colour of gameplay objects (characters, blocks, props). */
export const INK = '#2b1a12';

export const BIRD_COLORS: Record<BirdType, { body: string; dark: string; light: string }> = {
  red: { body: '#e23b2e', dark: '#a81f22', light: '#ff7a5c' },
  chuck: { body: '#f8cf1c', dark: '#d9960b', light: '#fff07a' },
  bomb: { body: '#34343d', dark: '#17171c', light: '#6b6b7a' },
  blues: { body: '#58b7ee', dark: '#2b7fc4', light: '#a8e1ff' },
  matilda: { body: '#f5f0e6', dark: '#cfc5b3', light: '#ffffff' },
};

export const PIG_COLORS = { body: '#8fd14f', dark: '#5fae2e', light: '#c3ee8b', snout: '#a6e36a', nostril: '#2f6b1b' } as const;

export const MATERIAL_COLORS: Record<BlockMaterial, { base: string; dark: string; light: string }> = {
  wood: { base: '#d9a05b', dark: '#a8682f', light: '#f2c98a' },
  glass: { base: '#aee3f5', dark: '#6fb9d8', light: '#f1fcff' },
  stone: { base: '#9aa0a6', dark: '#6c727a', light: '#c9ced3' },
  tnt: { base: '#c0392b', dark: '#8c2318', light: '#f2e2b0' },
};

/** Dust kicked up from the ground of each environment. */
export const DUST_COLORS: Record<ThemeId, string> = {
  grasslands: '#d8c9a3',
  desert: '#ecc98b',
  snowlands: '#ffffff',
};

export const SCORE_COLORS = {
  block: '#fff6d6',
  damage: '#ffffff',
  pig: '#b6f36a',
  bird: '#ffd84a',
  clear: '#ffd84a',
} as const;
