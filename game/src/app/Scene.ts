import type { InputHandler } from '../input/InputManager';

export interface Viewport {
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  /** Device pixel ratio the canvas is rendered at (already capped). */
  dpr: number;
}

/** A screen-filling state of the game (menu backdrop, gameplay, level editor). */
export interface Scene extends InputHandler {
  enter(): void;
  exit(): void;
  /** `dt` is the real time since the previous frame in seconds, clamped to a sane maximum. */
  update(dt: number): void;
  /** The context arrives scaled to CSS pixels. */
  render(ctx: CanvasRenderingContext2D): void;
  resize(view: Viewport): void;
}
