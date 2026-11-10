import type { StarThresholds } from '../core/types';

/** One star for clearing the level, more for beating the level's score thresholds. */
export function starsFor(score: number, thresholds: StarThresholds, won: boolean): 0 | 1 | 2 | 3 {
  if (!won) return 0;
  if (score >= thresholds.three) return 3;
  if (score >= thresholds.two) return 2;
  return 1;
}

/** Rounds a raw score down to the game's 10-point granularity. */
export function roundScore(points: number): number {
  return Math.floor(points / 10) * 10;
}
