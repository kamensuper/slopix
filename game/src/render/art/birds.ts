// TEMPORARY STUB - replaced by the real character artwork.
import { BIRDS } from '../../core/config';
import type { BirdType } from '../../core/types';
import type { BirdPose } from './types';

export function paintBird(ctx: CanvasRenderingContext2D, type: BirdType, pose: BirdPose): void {
  ctx.save();
  ctx.fillStyle = BIRDS[type].color;
  ctx.strokeStyle = '#2b1a12';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 100, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(35, -20, 24, 0, Math.PI * 2);
  ctx.fill();
  if (pose.blink < 0.5) {
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(42, -20, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f7b125';
  ctx.beginPath();
  ctx.moveTo(60, 5);
  ctx.lineTo(120, 20);
  ctx.lineTo(60, 40);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function paintEgg(ctx: CanvasRenderingContext2D, _time: number): void {
  ctx.save();
  ctx.fillStyle = '#fffbe9';
  ctx.strokeStyle = '#2b1a12';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(0, 0, 85, 100, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
