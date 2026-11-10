// TEMPORARY STUB - replaced by the real character artwork.
import type { PigVariant } from '../../core/types';
import type { PigAccessory, PigPose } from './types';

export function paintPig(ctx: CanvasRenderingContext2D, variant: PigVariant, pose: PigPose): void {
  ctx.save();
  ctx.fillStyle = pose.expression === 'hurt' ? '#b6e37a' : '#8fd14f';
  ctx.strokeStyle = '#2b1a12';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 100, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const sx of [-45, 45]) {
    ctx.beginPath();
    ctx.arc(sx, -25, 20, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#a6e36a';
  ctx.beginPath();
  ctx.ellipse(0, 20, 38, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (pose.armorOn && (variant === 'helmet' || variant === 'armored')) {
    ctx.fillStyle = '#9aa0a6';
    ctx.beginPath();
    ctx.arc(0, -10, 104, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (variant === 'king') paintPigAccessory(ctx, 'crown');
  ctx.restore();
}

export function paintPigAccessory(ctx: CanvasRenderingContext2D, kind: PigAccessory): void {
  ctx.save();
  ctx.fillStyle = kind === 'crown' ? '#f7c531' : '#9aa0a6';
  ctx.strokeStyle = '#2b1a12';
  ctx.lineWidth = 8;
  ctx.beginPath();
  if (kind === 'crown') {
    ctx.rect(-50, -140, 100, 45);
  } else {
    ctx.arc(0, -10, 104, Math.PI, 0);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
