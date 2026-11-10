import type { DecorInfo } from './types';
export const DECOR: Record<string, DecorInfo> = {};
export function envSeed(worldWidth: number): number {
  return Math.round(worldWidth * 10) + 1;
}
export function paintDecor(_ctx: CanvasRenderingContext2D, _kind: string, _seed: number): void {}
export function paintDecorGlow(_ctx: CanvasRenderingContext2D, _kind: string): boolean {
  return false;
}
