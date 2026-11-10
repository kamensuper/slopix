/**
 * Slingshot controller (presentation side): aiming by pointer or keyboard, the elastic bands and
 * pouch, the waiting flock, the hop of the next bird into the pouch and the trajectory preview.
 * The launch itself is decided by the simulation from the pull vector produced here.
 */
import { BIRDS, PHYSICS, SLING } from '../../core/config';
import { clamp, DEG, ease } from '../../core/math';
import { INK } from '../../core/palette';
import type { BirdType } from '../../core/types';
import type { BirdPose } from '../../render/art/types';
import type { Camera } from '../../render/Camera';
import type { WorldRenderer } from '../../render/WorldRenderer';
import { canLaunch, constrainPull, launchVelocity, predictTrajectory, pullFromAim, pullPower, type Vec } from '../../sim/slingshot';

const HOP_TIME = 0.5;
const HOP_HEIGHT = 1.3;
const PREVIEW_POINTS = 80;
/** Sub-steps between preview dots (6 sub-steps at 120 Hz = 0.05 s). */
const PREVIEW_STRIDE = 6;
const SPRING_STIFFNESS = 520;
const SPRING_DAMPING_EMPTY = 9;
const SPRING_DAMPING_LOADED = 46;
/** Frame follow-through after a release: a stiff, lightly damped sway about the base. */
const SWAY_STIFFNESS = 150;
const SWAY_DAMPING = 5.5;
const SWAY_KICK = 0.55;
/** Rubber band width at rest (m); it thins as it stretches. */
const BAND_REST_WIDTH = 0.13;
const BAND_REST_LENGTH = 0.5;
/** Band colours at rest and under full tension: the rubber pales and warms as it stretches. */
const BAND = { base: '#6a2a16', light: '#b25a3a', strained: '#a8401f', strainedLight: '#ff9d6e' } as const;
const LEATHER = '#7a4a26';
const LEATHER_DARK = '#4a2a14';
const LEATHER_LIGHT = '#b77a45';
const STITCH = '#f1d8a8';
/** Leather pouch thickness (m) and how far it wraps round the bird (radians either side). */
const POUCH_THICK = 0.12;
const POUCH_WRAP = 1.05;
const MIN_ANGLE = -25 * DEG;
const MAX_ANGLE = 88 * DEG;

interface PouchShape {
  cx: number;
  cy: number;
  r: number;
  /** World angle of the middle of the pouch (pointing away from the target). */
  mid: number;
  spread: number;
  /** End tied to the far band and end tied to the near band. */
  backX: number;
  backY: number;
  frontX: number;
  frontY: number;
}

export class SlingView {
  /** Pouch offset from the anchor in world metres. */
  readonly pull: Vec = { x: 0, y: 0 };
  dragging = false;
  /** Keyboard aiming is armed: the preview is shown without a drag. */
  keyboard = false;
  /** Last aim, remembered between shots so keyboard players can refine it. */
  aimAngle = 38 * DEG;
  aimPower = 0.85;
  /** Bird shown in the pouch (or hopping towards it). */
  loaded: BirdType | null = null;

  private hop = 1;
  private readonly hopFrom: Vec = { x: 0, y: 0 };
  private springVx = 0;
  private springVy = 0;
  private readonly preview = new Float32Array(PREVIEW_POINTS * 2);
  private previewCount = 0;
  private readonly velocity: Vec = { x: 0, y: 0 };
  private idleHopIndex = -1;
  private idleHopT = 0;
  private idleHopTimer = 2.5;
  private clock = 0;
  private sway = 0;
  private swayV = 0;
  private readonly shape: PouchShape = { cx: 0, cy: 0, r: 0.3, mid: Math.PI, spread: POUCH_WRAP, backX: 0, backY: 0, frontX: 0, frontY: 0 };
  private readonly pose: BirdPose = { time: 0, state: 'idle', blink: 0, pull: 0, lookX: 0.4, lookY: 0, abilityUsed: false, fuse: 0, flash: 0 };

  constructor(
    readonly baseX: number,
    readonly baseY: number,
  ) {}

  get anchorX(): number {
    return this.baseX + SLING.anchor.x;
  }

  get anchorY(): number {
    return this.baseY + SLING.anchor.y;
  }

  /** A bird sits in the pouch and can be grabbed. */
  get ready(): boolean {
    return this.loaded !== null && this.hop >= 1;
  }

  get aiming(): boolean {
    return this.ready && (this.dragging || this.keyboard);
  }

  get power(): number {
    return pullPower(this.pull.x, this.pull.y);
  }

  slotX(slot: number): number {
    return this.baseX - SLING.queueOffset - slot * SLING.queueSpacing;
  }

  /** Centre of the bird in the pouch. */
  birdX(): number {
    if (this.hop >= 1) return this.anchorX + this.pull.x;
    return this.hopFrom.x + (this.anchorX - this.hopFrom.x) * ease.inOutCubic(this.hop);
  }

  birdY(): number {
    if (this.hop >= 1) return this.anchorY + this.pull.y;
    const t = ease.inOutCubic(this.hop);
    return this.hopFrom.y + (this.anchorY - this.hopFrom.y) * t + Math.sin(Math.PI * this.hop) * HOP_HEIGHT;
  }

  /** The next bird leaves the front of the queue and hops into the pouch. */
  load(type: BirdType): void {
    this.loaded = type;
    this.hop = 0;
    this.hopFrom.x = this.slotX(0);
    this.hopFrom.y = this.baseY + BIRDS[type].radius;
    this.pull.x = 0;
    this.pull.y = 0;
    this.springVx = 0;
    this.springVy = 0;
    this.dragging = false;
    this.keyboard = false;
  }

  /** Is a world position close enough to the loaded bird to grab it? */
  hitTest(worldX: number, worldY: number, zoom: number): boolean {
    if (!this.ready) return false;
    const reach = Math.max(SLING.grabRadius, SLING.grabRadiusPx / zoom);
    return Math.hypot(worldX - this.birdX(), worldY - this.birdY()) <= reach;
  }

  beginDrag(worldX: number, worldY: number): void {
    if (!this.ready) return;
    this.dragging = true;
    this.keyboard = false;
    this.dragTo(worldX, worldY);
  }

  dragTo(worldX: number, worldY: number): void {
    if (!this.dragging || !this.loaded) return;
    constrainPull(worldX - this.anchorX, worldY - this.anchorY, BIRDS[this.loaded].radius, SLING.anchor.y, this.pull);
    this.rememberAim();
  }

  private rememberAim(): void {
    const len = Math.hypot(this.pull.x, this.pull.y);
    if (len < SLING.minPull) return;
    this.aimAngle = Math.atan2(-this.pull.y, -this.pull.x);
    this.aimPower = len / SLING.maxPull;
  }

  /** Keyboard aiming: adjusts angle (radians) and power (0..1) and shows the preview. */
  nudge(deltaAngle: number, deltaPower: number): void {
    if (!this.ready || !this.loaded) return;
    this.keyboard = true;
    this.dragging = false;
    this.aimAngle = clamp(this.aimAngle + deltaAngle, MIN_ANGLE, MAX_ANGLE);
    this.aimPower = clamp(this.aimPower + deltaPower, SLING.minPull / SLING.maxPull + 0.02, 1);
    pullFromAim(this.aimAngle, this.aimPower, this.pull);
    constrainPull(this.pull.x, this.pull.y, BIRDS[this.loaded].radius, SLING.anchor.y, this.pull);
  }

  /**
   * Ends aiming. Returns the pull to launch with, or null when the pull was too short
   * (the bird then eases back to rest).
   */
  release(): Vec | null {
    const wasAiming = this.aiming;
    this.dragging = false;
    this.keyboard = false;
    if (!wasAiming || !canLaunch(this.pull.x, this.pull.y)) return null;
    const shot = { x: this.pull.x, y: this.pull.y };
    // The empty pouch snaps forward and rings out.
    launchVelocity(this.pull.x, this.pull.y, this.velocity);
    this.springVx = this.velocity.x * 1.2;
    this.springVy = this.velocity.y * 1.2;
    // The frame lurches towards the target and rings back.
    this.swayV -= SWAY_KICK * pullPower(shot.x, shot.y);
    this.loaded = null;
    return shot;
  }

  cancel(): void {
    this.dragging = false;
    this.keyboard = false;
  }

  update(dt: number, waiting: number): void {
    this.clock += dt;
    if (this.hop < 1) this.hop = Math.min(1, this.hop + dt / HOP_TIME);
    {
      const steps = Math.max(1, Math.ceil(dt / 0.008));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        this.swayV += (-SWAY_STIFFNESS * this.sway - SWAY_DAMPING * this.swayV) * h;
        this.sway += this.swayV * h;
      }
    }
    if (!this.dragging && !this.keyboard) {
      const damping = this.loaded ? SPRING_DAMPING_LOADED : SPRING_DAMPING_EMPTY;
      // Sub-step the stiff spring so it stays stable at low frame rates.
      const steps = Math.max(1, Math.ceil(dt / 0.004));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        this.springVx += (-SPRING_STIFFNESS * this.pull.x - damping * this.springVx) * h;
        this.springVy += (-SPRING_STIFFNESS * this.pull.y - damping * this.springVy) * h;
        this.pull.x += this.springVx * h;
        this.pull.y += this.springVy * h;
      }
    } else {
      this.springVx = 0;
      this.springVy = 0;
    }
    this.previewCount = 0;
    if (this.aiming && canLaunch(this.pull.x, this.pull.y)) {
      launchVelocity(this.pull.x, this.pull.y, this.velocity);
      this.previewCount = predictTrajectory(
        this.anchorX + this.pull.x,
        this.anchorY + this.pull.y,
        this.velocity.x,
        this.velocity.y,
        this.preview,
        PREVIEW_POINTS,
        PREVIEW_STRIDE,
        0,
      );
    }
    // Now and then a waiting bird hops on the spot.
    if (this.idleHopIndex >= 0) {
      this.idleHopT += dt / 0.42;
      if (this.idleHopT >= 1) this.idleHopIndex = -1;
    } else if (waiting > 0) {
      this.idleHopTimer -= dt;
      if (this.idleHopTimer <= 0) {
        this.idleHopTimer = 1.6 + Math.random() * 3.5;
        this.idleHopIndex = Math.floor(Math.random() * waiting);
        this.idleHopT = 0;
      }
    }
  }

  /** Makes waiting bird `index` hop (victory bonus). */
  cheer(index: number): void {
    this.idleHopIndex = index;
    this.idleHopT = 0;
  }

  // ------------------------------------------------------------------ drawing

  /** Trunk, far arm and the band behind the bird. */
  drawBack(r: WorldRenderer, ctx: CanvasRenderingContext2D, cam: Camera): void {
    r.drawSlingshotBack(this.baseX, this.baseY);
    r.screenSpace();
    this.drawBand(ctx, cam, this.baseX + SLING.forkBack.x, this.baseY + SLING.forkBack.y, 0.8);
  }

  /** Band in front of the bird, the pouch and the near arm. */
  drawFront(r: WorldRenderer, ctx: CanvasRenderingContext2D, cam: Camera): void {
    r.screenSpace();
    this.drawPouch(ctx, cam);
    this.drawBand(ctx, cam, this.baseX + SLING.forkFront.x, this.baseY + SLING.forkFront.y, 1);
    r.drawSlingshotFront(this.baseX, this.baseY);
    r.screenSpace();
  }

  /** Where the bands meet: behind the loaded bird, or the bare pouch. */
  private pouchPoint(out: Vec): Vec {
    const cx = this.hop >= 1 ? this.anchorX + this.pull.x : this.anchorX;
    const cy = this.hop >= 1 ? this.anchorY + this.pull.y : this.anchorY;
    if (!this.loaded || this.hop < 1) {
      out.x = cx;
      out.y = cy;
      return out;
    }
    const len = Math.hypot(this.pull.x, this.pull.y);
    const ux = len > 0.05 ? this.pull.x / len : -1;
    const uy = len > 0.05 ? this.pull.y / len : 0;
    const radius = BIRDS[this.loaded].radius * 0.85;
    out.x = cx + ux * radius;
    out.y = cy + uy * radius;
    return out;
  }

  private drawBand(ctx: CanvasRenderingContext2D, cam: Camera, tipX: number, tipY: number, shade: number): void {
    const end = this.pouchPoint(this.velocity);
    const x0 = cam.toScreenX(tipX);
    const y0 = cam.toScreenY(tipY);
    const x1 = cam.toScreenX(end.x);
    const y1 = cam.toScreenY(end.y);
    const length = Math.hypot(end.x - tipX, end.y - tipY);
    // Rubber thins as it stretches.
    const width = BAND_REST_WIDTH * clamp(Math.sqrt(0.45 / Math.max(0.2, length)), 0.45, 1) * cam.zoom;
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = width + Math.max(1.5, cam.zoom * 0.045);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = shade < 1 ? BAND_DARK : BAND_LIGHT;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  private drawPouch(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const p = this.pouchPoint(this.velocity);
    const len = Math.hypot(this.pull.x, this.pull.y);
    // The pouch lies across the pull direction.
    const nx = len > 0.05 ? -this.pull.y / len : 0;
    const ny = len > 0.05 ? this.pull.x / len : 1;
    const half = 0.24;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cam.toScreenX(p.x - nx * half), cam.toScreenY(p.y - ny * half));
    ctx.lineTo(cam.toScreenX(p.x + nx * half), cam.toScreenY(p.y + ny * half));
    ctx.strokeStyle = INK;
    ctx.lineWidth = cam.zoom * 0.3;
    ctx.stroke();
    ctx.strokeStyle = POUCH;
    ctx.lineWidth = cam.zoom * 0.2;
    ctx.stroke();
  }

  /** The bird in the pouch (or on its way there). */
  drawLoaded(r: WorldRenderer, time: number, blink: number): void {
    const type = this.loaded;
    if (!type) return;
    const pose = this.pose;
    const power = this.power;
    const aiming = this.aiming || power > 0.08;
    pose.time = time;
    pose.blink = blink;
    pose.state = aiming ? 'aiming' : 'idle';
    pose.pull = power;
    pose.lookX = aiming ? Math.cos(this.aimAngle) : 0.5;
    pose.lookY = aiming ? -Math.sin(this.aimAngle) * 0.8 : 0;
    // Tilt towards the launch direction and squash a little as the tension builds (anticipation).
    const angle = aiming ? clamp(Math.atan2(-this.pull.y, -this.pull.x), -0.6, 0.9) * Math.min(1, power * 1.5) : 0;
    const squash = aiming ? 1 - 0.08 * power : 1 + Math.sin(time * 2.6) * 0.02;
    r.drawBird(type, this.birdX(), this.birdY(), angle, BIRDS[type].radius, pose, 2 - squash, squash);
  }

  /**
   * The flock waiting on the ground. `waiting` lists the birds left of the slingshot, nearest first;
   * `shift` is true while the front bird hops to the pouch and the rest shuffle up.
   */
  drawQueue(r: WorldRenderer, waiting: readonly BirdType[], time: number, shift: boolean): void {
    const pose = this.pose;
    const slide = shift && this.hop < 1 ? 1 - ease.inOutCubic(this.hop) : 0;
    for (let i = 0; i < waiting.length; i++) {
      const type = waiting[i] as BirdType;
      const radius = BIRDS[type].radius;
      const phase = i * 1.7;
      const bob = Math.sin(time * 2.4 + phase) * 0.025;
      let y = this.baseY + radius;
      let squash = 1 + bob;
      if (i === this.idleHopIndex) {
        const t = this.idleHopT;
        y += Math.sin(Math.PI * t) * 0.55;
        squash += Math.sin(Math.PI * t) * 0.08;
      }
      const cycle = (time * 0.31 + i * 0.37) % 1;
      pose.time = time + phase;
      pose.state = 'idle';
      pose.blink = cycle > 0.96 ? 1 - Math.abs((cycle - 0.98) / 0.02) : 0;
      pose.pull = 0;
      pose.lookX = 0.5;
      pose.lookY = -0.1;
      r.drawBird(type, this.slotX(i + slide), y, 0, radius, pose, 2 - squash, squash);
    }
  }

  /** World position above waiting bird `index`, for bonus pop-ups. */
  queuePosition(index: number, type: BirdType, out: Vec): Vec {
    out.x = this.slotX(index);
    out.y = this.baseY + BIRDS[type].radius * 2 + 0.3;
    return out;
  }

  /** Dotted predicted flight path. */
  drawPreview(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const count = this.previewCount;
    if (count < 2) return;
    const skip = this.loaded ? BIRDS[this.loaded].radius + 0.15 : 0.5;
    const x0 = this.preview[0] as number;
    const y0 = this.preview[1] as number;
    ctx.strokeStyle = INK;
    for (let i = 1; i < count; i++) {
      const wx = this.preview[i * 2] as number;
      const wy = this.preview[i * 2 + 1] as number;
      if (Math.hypot(wx - x0, wy - y0) < skip) continue;
      const t = i / PREVIEW_POINTS;
      const radius = Math.max(1.6, (0.085 - 0.045 * t) * cam.zoom);
      ctx.globalAlpha = 0.95 - 0.6 * t;
      ctx.beginPath();
      ctx.arc(cam.toScreenX(wx), cam.toScreenY(wy), radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = Math.max(1, radius * 0.45);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Seconds between preview dots (for tests and tooling). */
  static readonly previewInterval = PREVIEW_STRIDE / (PHYSICS.hz * PHYSICS.substeps);
}
