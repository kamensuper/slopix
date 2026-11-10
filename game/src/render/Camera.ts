import { CAMERA } from '../core/config';
import { clamp, damp } from '../core/math';

export interface CameraBounds {
  minX: number;
  maxX: number;
  /** Highest world y the view may show. The lower limit follows from CAMERA.groundBand. */
  maxY: number;
}

export interface CameraPose {
  x: number;
  y: number;
  zoom: number;
}

/** Longest screen-shake excursion in CSS pixels. */
const SHAKE_PIXELS = 16;
const SHAKE_DECAY = 1.9;
const KICK_STIFFNESS = 140;
const KICK_DAMPING = 16;

/**
 * Smooth 2D camera. World space is metres with y up; `zoom` is CSS pixels per metre.
 * The camera eases towards a target pose, never leaves its bounds, and layers a decaying
 * screen shake plus a spring "kick" (camera impulse) on top.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 30;
  readonly target: CameraPose = { x: 0, y: 0, zoom: 30 };
  viewW = 1;
  viewH = 1;
  /** Time constants of the easing, seconds. */
  smooth: number = CAMERA.followSmooth;
  zoomSmooth: number = CAMERA.zoomSmooth;

  private bounds: CameraBounds = { minX: -4, maxX: 48, maxY: 28 };
  private trauma = 0;
  private clock = 0;
  private shakeX = 0;
  private shakeY = 0;
  private kickX = 0;
  private kickY = 0;
  private kickVx = 0;
  private kickVy = 0;
  private readonly scratch: CameraPose = { x: 0, y: 0, zoom: 30 };

  setView(width: number, height: number): void {
    this.viewW = Math.max(1, width);
    this.viewH = Math.max(1, height);
  }

  setBounds(bounds: CameraBounds): void {
    this.bounds = bounds;
  }

  /** Smallest zoom that still keeps the whole view inside the bounds. */
  get minZoom(): number {
    const b = this.bounds;
    return Math.max(CAMERA.minZoom, this.viewW / (b.maxX - b.minX), (this.viewH * (1 - CAMERA.groundBand)) / b.maxY);
  }

  /** Clamps a pose so the view never shows anything outside the world bounds. */
  constrain(pose: CameraPose): CameraPose {
    const b = this.bounds;
    const zoom = clamp(pose.zoom, this.minZoom, Math.max(this.minZoom, CAMERA.maxZoom));
    const halfW = this.viewW / (2 * zoom);
    const loX = b.minX + halfW;
    const hiX = b.maxX - halfW;
    // Lowest position: the ground line sits `groundBand` of the view height above the bottom edge.
    const loY = ((0.5 - CAMERA.groundBand) * this.viewH) / zoom;
    const hiY = b.maxY - this.viewH / (2 * zoom);
    pose.zoom = zoom;
    pose.x = loX > hiX ? (b.minX + b.maxX) / 2 : clamp(pose.x, loX, hiX);
    pose.y = hiY < loY ? loY : clamp(pose.y, loY, hiY);
    return pose;
  }

  setTarget(x: number, y: number, zoom: number): void {
    this.target.x = x;
    this.target.y = y;
    this.target.zoom = zoom;
    this.constrain(this.target);
  }

  /** Jumps straight to the target pose. */
  snap(): void {
    this.constrain(this.target);
    this.x = this.target.x;
    this.y = this.target.y;
    this.zoom = this.target.zoom;
  }

  update(dt: number): void {
    this.constrain(this.target);
    // Ease zoom in log space so zooming in and out feel symmetric.
    this.zoom = Math.exp(damp(Math.log(this.zoom), Math.log(this.target.zoom), this.zoomSmooth, dt));
    this.x = damp(this.x, this.target.x, this.smooth, dt);
    this.y = damp(this.y, this.target.y, this.smooth, dt);
    const pose = this.scratch;
    pose.x = this.x;
    pose.y = this.y;
    pose.zoom = this.zoom;
    this.constrain(pose);
    this.x = pose.x;
    this.y = pose.y;
    this.zoom = pose.zoom;

    this.clock += dt;
    this.trauma = Math.max(0, this.trauma - SHAKE_DECAY * dt);
    const amount = (this.trauma * this.trauma * SHAKE_PIXELS) / this.zoom;
    const t = this.clock;
    this.shakeX = amount * (Math.sin(t * 61.3) * 0.6 + Math.sin(t * 37.7 + 1.3) * 0.4);
    this.shakeY = amount * (Math.sin(t * 53.1 + 2.1) * 0.6 + Math.sin(t * 41.9 + 0.4) * 0.4);

    this.kickVx += (-KICK_STIFFNESS * this.kickX - KICK_DAMPING * this.kickVx) * dt;
    this.kickVy += (-KICK_STIFFNESS * this.kickY - KICK_DAMPING * this.kickVy) * dt;
    this.kickX += this.kickVx * dt;
    this.kickY += this.kickVy * dt;
  }

  /** Adds screen shake; `amount` 0..1 accumulates and decays on its own. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Camera impulse: knocks the view in a direction (metres per second), it springs back by itself. */
  kick(vx: number, vy: number): void {
    this.kickVx += vx;
    this.kickVy += vy;
  }

  /** Centre of the rendered view including shake and kick. */
  get renderX(): number {
    return this.x + this.shakeX + this.kickX;
  }

  get renderY(): number {
    return this.y + this.shakeY + this.kickY;
  }

  /** Screen y (CSS px) of the ground surface, world y = 0. */
  get groundY(): number {
    return this.viewH / 2 + this.renderY * this.zoom;
  }

  toScreenX(worldX: number): number {
    return (worldX - this.renderX) * this.zoom + this.viewW / 2;
  }

  toScreenY(worldY: number): number {
    return this.viewH / 2 - (worldY - this.renderY) * this.zoom;
  }

  /** Screen position -> world position (ignores shake so input stays steady). */
  toWorldX(screenX: number): number {
    return (screenX - this.viewW / 2) / this.zoom + this.x;
  }

  toWorldY(screenY: number): number {
    return (this.viewH / 2 - screenY) / this.zoom + this.y;
  }

  /** Changes the target zoom while keeping the world point under a screen position fixed. */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.target.zoom;
    const zoom = clamp(before * factor, this.minZoom, CAMERA.maxZoom);
    const wx = (screenX - this.viewW / 2) / before + this.target.x;
    const wy = (this.viewH / 2 - screenY) / before + this.target.y;
    this.setTarget(wx - (screenX - this.viewW / 2) / zoom, wy - (this.viewH / 2 - screenY) / zoom, zoom);
  }

  /** True if a circle in world space is at least partly on screen. */
  sees(worldX: number, worldY: number, radius: number): boolean {
    const sx = this.toScreenX(worldX);
    const sy = this.toScreenY(worldY);
    const r = radius * this.zoom;
    return sx + r >= 0 && sx - r <= this.viewW && sy + r >= 0 && sy - r <= this.viewH;
  }
}
