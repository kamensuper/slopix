/** Floating score numbers and call-outs anchored in the world: they pop, rise and fade. */
import { INK } from '../core/palette';
import { clamp01, ease } from '../core/math';
import type { Camera } from './Camera';

interface Label {
  active: boolean;
  text: string;
  x: number;
  y: number;
  age: number;
  life: number;
  /** Font size in CSS pixels at zoom-independent scale. */
  size: number;
  color: string;
  rise: number;
}

const POOL = 40;
const POP_TIME = 0.16;

export class FloatingText {
  private readonly labels: Label[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < POOL; i++) this.labels.push({ active: false, text: '', x: 0, y: 0, age: 0, life: 1, size: 24, color: '#fff', rise: 1.4 });
  }

  /** `size` is the font size in CSS pixels; `rise` the distance travelled upwards in metres. */
  spawn(text: string, x: number, y: number, color: string, size = 24, life = 1.1, rise = 1.5): void {
    const label = this.labels[this.cursor] as Label;
    this.cursor = (this.cursor + 1) % this.labels.length;
    label.active = true;
    label.text = text;
    label.x = x;
    label.y = y;
    label.age = 0;
    label.life = life;
    label.size = size;
    label.color = color;
    label.rise = rise;
  }

  clear(): void {
    for (const label of this.labels) label.active = false;
  }

  update(dt: number): void {
    for (const label of this.labels) {
      if (!label.active) continue;
      label.age += dt;
      if (label.age >= label.life) label.active = false;
    }
  }

  /** Draws in CSS-pixel screen space. */
  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const label of this.labels) {
      if (!label.active) continue;
      const t = label.age / label.life;
      const pop = label.age < POP_TIME ? ease.outBack(label.age / POP_TIME) : 1;
      const sx = camera.toScreenX(label.x);
      const sy = camera.toScreenY(label.y + label.rise * ease.outCubic(t));
      if (sx < -80 || sx > camera.viewW + 80 || sy < -40 || sy > camera.viewH + 40) continue;
      const size = Math.max(11, label.size * pop);
      ctx.globalAlpha = clamp01((1 - t) / 0.3);
      ctx.font = `${size.toFixed(1)}px "Lilita One", "Fredoka Variable", sans-serif`;
      ctx.lineWidth = Math.max(3, size * 0.22);
      ctx.strokeStyle = INK;
      ctx.strokeText(label.text, sx, sy);
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }
}
