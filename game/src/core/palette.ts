/** Colours shared between gameplay rendering, particles and the interface. */
import type { BirdType, BlockMaterial, ThemeId } from './types';

/** Universal outline colour of gameplay objects (characters, blocks, props). */
export const INK = '#2b1a12';

export const BIRD_COLORS: Record<BirdType, { body: string; dark: string; light: string }> = {
  pip: { body: '#1fa7b8', dark: '#0f7c96', light: '#7fe8ee' },
  zip: { body: '#d6409f', dark: '#9c2378', light: '#ffc8ea' },
  ember: { body: '#f2672a', dark: '#c2361b', light: '#ffd45e' },
  sprig: { body: '#8fc93a', dark: '#5f9a22', light: '#eeffc4' },
  brawn: { body: '#8a6a4a', dark: '#5c432c', light: '#ead5b0' },
  rime: { body: '#e6f6ff', dark: '#a6d6f1', light: '#ffffff' },
  jolt: { body: '#5b5fe0', dark: '#3838a6', light: '#ffe24d' },
  nova: { body: '#7d4bd1', dark: '#472890', light: '#ffe9a3' },
};

/** The Burrowers: slate-grey fur, pink noses. */
export const FOE_COLORS = { body: '#7b8ba3', dark: '#55647c', light: '#b3c2d6', snout: '#f7b3bf', nostril: '#8a3550' } as const;

export const MATERIAL_COLORS: Record<BlockMaterial, { base: string; dark: string; light: string }> = {
  wood: { base: '#d9a05b', dark: '#a8682f', light: '#f2c98a' },
  glass: { base: '#aee3f5', dark: '#6fb9d8', light: '#f1fcff' },
  stone: { base: '#9aa0a6', dark: '#6c727a', light: '#c9ced3' },
  metal: { base: '#8d9bab', dark: '#55616f', light: '#dfe7ef' },
  ice: { base: '#bfe9fb', dark: '#7fc4e6', light: '#f3fcff' },
  ironwood: { base: '#8a5a34', dark: '#573620', light: '#c08a56' },
  crystal: { base: '#c58cf2', dark: '#8a4fc4', light: '#f0dcff' },
  rubber: { base: '#3f4654', dark: '#252a34', light: '#6f7a8c' },
  tnt: { base: '#c0392b', dark: '#8c2318', light: '#f2e2b0' },
};

/** Dust kicked up from the ground of each environment. */
export const DUST_COLORS: Record<ThemeId, string> = {
  grasslands: '#d8c9a3',
  desert: '#ecc98b',
  snowlands: '#ffffff',
  storm: '#b9c4d6',
  ironworks: '#b7a394',
  celestial: '#d9ccf5',
};

export const SCORE_COLORS = {
  block: '#fff6d6',
  damage: '#ffffff',
  foe: '#ffb3c4',
  bird: '#ffd84a',
  clear: '#ffd84a',
} as const;
