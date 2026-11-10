/**
 * Slingshot controller (presentation side): aiming by pointer or keyboard, the elastic bands and
 * pouch, the waiting flock, the hop of the next bird into the pouch and the trajectory preview.
 * The launch itself is decided by the simulation from the pull vector produced here.
 */
import { BIRDS, PHYSICS, SLING } from '../../core/config';
import { clamp, DEG, ease } from '../../core/math';
import { INK } from '../../core/palette';
import { mixHex } from '../../render/art/materialUtil';
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
/** Preview dots drift along the path at this many samples per second. */
const PREVIEW_DRIFT = 2.2;
const SPRING_STIFFNESS = 520;
const SPRING_DAMPING_EMPTY = 9;
const SPRING_DAMPING_LOADED = 46;
/** Frame follow-through after a release: a stiff, lightly damped sway about the base. */
const SWAY_STIFFNESS = 150;
const SWAY_DAMPING = 5.5;
const SWAY_KICK = 0.4;
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

  /** Trunk, far arm, the leather pouch cradling the bird from behind and the far band. */
  drawBack(r: WorldRenderer, ctx: CanvasRenderingContext2D, cam: Camera): void {
    r.drawSlingshotBack(this.baseX, this.baseY, this.sway);
    r.screenSpace();
    const s = this.pouchShape();
    this.drawPouchCup(ctx, cam, s);
    const [tx, ty] = this.forkTip(SLING.forkBack);
    this.drawBand(ctx, cam, tx, ty, s.backX, s.backY, true);
  }

  /** Near band, the pouch ends wrapping round the bird, and the near arm. */
  drawFront(r: WorldRenderer, ctx: CanvasRenderingContext2D, cam: Camera): void {
    r.screenSpace();
    const s = this.shape;
    const [tx, ty] = this.forkTip(SLING.forkFront);
    this.drawPouchTabs(ctx, cam, s);
    this.drawBand(ctx, cam, tx, ty, s.frontX, s.frontY, false);
    r.drawSlingshotFront(this.baseX, this.baseY, this.sway);
    r.screenSpace();
  }

  /** World position of a fork tip, following the sway of the frame. */
  private forkTip(tip: { x: number; y: number }): [number, number] {
    const c = Math.cos(this.sway);
    const s = Math.sin(this.sway);
    return [this.baseX + tip.x * c - tip.y * s, this.baseY + tip.x * s + tip.y * c];
  }

  /** Tension 0..1 while aiming (drives colour, tremble and the bird's anticipation). */
  private tension(): number {
    return this.aiming ? this.power : 0;
  }

  /** Small fast shiver once the pull is nearly maxed out (world metres). */
  private tremble(phase: number): number {
    const t = this.tension();
    if (t < 0.82) return 0;
    return Math.sin(this.clock * 71 + phase) * 0.014 * ((t - 0.82) / 0.18);
  }

  /** Where the pouch sits: wrapped round the back of the loaded bird, or hanging empty. */
  private pouchShape(): PouchShape {
    const s = this.shape;
    const len = Math.hypot(this.pull.x, this.pull.y);
    const ux = len > 0.05 ? this.pull.x / len : -1;
    const uy = len > 0.05 ? this.pull.y / len : 0;
    s.mid = Math.atan2(uy, ux);
    if (this.loaded && this.hop >= 1) {
      s.cx = this.anchorX + this.pull.x + this.tremble(1.3);
      s.cy = this.anchorY + this.pull.y + this.tremble(2.1);
      s.r = BIRDS[this.loaded].radius * 1.02;
      s.spread = POUCH_WRAP;
    } else {
      // Empty: a short curved strap whose middle sits on the band junction.
      s.r = 0.26;
      s.spread = 0.85;
      const px = this.hop >= 1 ? this.anchorX + this.pull.x : this.anchorX;
      const py = this.hop >= 1 ? this.anchorY + this.pull.y : this.anchorY;
      s.cx = px - ux * s.r;
      s.cy = py - uy * s.r;
    }
    const ax = s.cx + Math.cos(s.mid + s.spread) * s.r;
    const ay = s.cy + Math.sin(s.mid + s.spread) * s.r;
    const bx = s.cx + Math.cos(s.mid - s.spread) * s.r;
    const by = s.cy + Math.sin(s.mid - s.spread) * s.r;
    // Tie each band to the end that keeps the pair shortest, so they never cross needlessly.
    const [fbx, fby] = this.forkTip(SLING.forkBack);
    const [ffx, ffy] = this.forkTip(SLING.forkFront);
    const straight = Math.hypot(ax - fbx, ay - fby) + Math.hypot(bx - ffx, by - ffy);
    const swapped = Math.hypot(bx - fbx, by - fby) + Math.hypot(ax - ffx, ay - ffy);
    if (straight <= swapped) {
      s.backX = ax;
      s.backY = ay;
      s.frontX = bx;
      s.frontY = by;
    } else {
      s.backX = bx;
      s.backY = by;
      s.frontX = ax;
      s.frontY = ay;
    }
    return s;
  }

  /** A rubber band with real thickness: ink edge, body, and a highlight along the lit side. */
  private drawBand(ctx: CanvasRenderingContext2D, cam: Camera, tipX: number, tipY: number, endX: number, endY: number, far: boolean): void {
    const dx = endX - tipX;
    const dy = endY - tipY;
    const length = Math.hypot(dx, dy) || 1e-3;
    const nx = -dy / length;
    const ny = dx / length;
    const tension = this.tension();
    // Slack bands sag a little; taut ones shiver.
    const sag = Math.max(0, BAND_REST_LENGTH * 0.8 - length) * 0.35;
    const shiver = this.tremble(far ? 0 : 2.4) * 1.6;
    const mx = (tipX + endX) / 2 + nx * shiver;
    const my = (tipY + endY) / 2 + ny * shiver - sag;
    const width = BAND_REST_WIDTH * clamp(Math.sqrt(BAND_REST_LENGTH / Math.max(0.15, length)), 0.42, 1.05) * cam.zoom;
    const x0 = cam.toScreenX(tipX);
    const y0 = cam.toScreenY(tipY);
    const xm = cam.toScreenX(mx);
    const ym = cam.toScreenY(my);
    const x1 = cam.toScreenX(endX);
    const y1 = cam.toScreenY(endY);
    const strain = clamp((tension - 0.35) / 0.65, 0, 1);
    const shade = far ? 0.32 : 0;
    const base = mixHex(mixHex(BAND.base, BAND.strained, strain), '#1a0a04', shade);
    const light = mixHex(mixHex(BAND.light, BAND.strainedLight, strain), '#1a0a04', shade);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(xm * 2 - (x0 + x1) / 2, ym * 2 - (y0 + y1) / 2, x1, y1);
    ctx.strokeStyle = INK;
    ctx.lineWidth = width + Math.max(2, cam.zoom * 0.05);
    ctx.stroke();
    ctx.strokeStyle = base;
    ctx.lineWidth = width;
    ctx.stroke();
    // Highlight: a thin streak shifted towards the light.
    const off = width * 0.22;
    const ox = (ny > 0 ? -1 : 1) * off * Math.abs(nx) * 0.3;
    const oy = -off;
    ctx.beginPath();
    ctx.moveTo(x0 + ox, y0 + oy);
    ctx.quadraticCurveTo(xm * 2 - (x0 + x1) / 2 + ox, ym * 2 - (y0 + y1) / 2 + oy, x1 + ox, y1 + oy);
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(1, width * 0.28);
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Knot where the band is tied round the fork.
    const knot = Math.max(2, width * 0.75);
    ctx.beginPath();
    ctx.arc(x0, y0, knot, 0, Math.PI * 2);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, cam.zoom * 0.025);
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  /** Leather cup behind the bird with a stitched seam and inner shading. */
  private drawPouchCup(ctx: CanvasRenderingContext2D, cam: Camera, s: PouchShape): void {
    const x = cam.toScreenX(s.cx);
    const y = cam.toScreenY(s.cy);
    const r = s.r * cam.zoom;
    const thick = POUCH_THICK * cam.zoom;
    // Screen angles run clockwise, world angles counter-clockwise.
    const a0 = -(s.mid + s.spread);
    const a1 = -(s.mid - s.spread);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a1);
    ctx.strokeStyle = INK;
    ctx.lineWidth = thick + Math.max(2.5, cam.zoom * 0.06);
    ctx.stroke();
    ctx.strokeStyle = LEATHER;
    ctx.lineWidth = thick;
    ctx.stroke();
    // Darker inner face where the bird presses in, lighter outer rim.
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(x, y, r - thick * 0.25, a0 + 0.08, a1 - 0.08);
    ctx.strokeStyle = LEATHER_DARK;
    ctx.lineWidth = thick * 0.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r + thick * 0.3, a0 + 0.12, a1 - 0.12);
    ctx.strokeStyle = LEATHER_LIGHT;
    ctx.lineWidth = Math.max(1, thick * 0.16);
    ctx.stroke();
    if (thick > 4) {
      ctx.setLineDash([Math.max(1.5, thick * 0.35), Math.max(1.5, thick * 0.3)]);
      ctx.beginPath();
      ctx.arc(x, y, r + thick * 0.05, a0 + 0.15, a1 - 0.15);
      ctx.strokeStyle = STITCH;
      ctx.lineWidth = Math.max(1, thick * 0.12);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** The two pouch ends fold round the front of the bird where the bands are tied. */
  private drawPouchTabs(ctx: CanvasRenderingContext2D, cam: Camera, s: PouchShape): void {
    const size = POUCH_THICK * 0.62 * cam.zoom;
    for (const [wx, wy] of [
      [s.backX, s.backY],
      [s.frontX, s.frontY],
    ] as const) {
      const x = cam.toScreenX(wx);
      const y = cam.toScreenY(wy);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = LEATHER;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, cam.zoom * 0.04);
      ctx.strokeStyle = INK;
      ctx.stroke();
      // Brass eyelet.
      ctx.beginPath();
      ctx.arc(x - size * 0.1, y - size * 0.1, size * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = '#e0b04a';
      ctx.fill();
      ctx.lineWidth = Math.max(0.8, size * 0.14);
      ctx.strokeStyle = '#6b4a10';
      ctx.stroke();
    }
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
    // Same shiver as the pouch, so bird and leather move as one.
    const ready = this.hop >= 1;
    const x = this.birdX() + (ready ? this.tremble(1.3) : 0);
    const y = this.birdY() + (ready ? this.tremble(2.1) : 0);
    r.drawBird(type, x, y, angle, BIRDS[type].radius, pose, 2 - squash, squash);
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

  /**
   * Predicted flight path and the power gauge. The dots drift slowly along the path; each dot is
   * interpolated between two consecutive predicted samples, so it always lies on the trajectory.
   */
  drawPreview(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const count = this.previewCount;
    if (count < 2) return;
    this.drawPowerArc(ctx, cam);
    const skip = this.loaded ? BIRDS[this.loaded].radius + 0.2 : 0.5;
    const x0 = this.preview[0] as number;
    const y0 = this.preview[1] as number;
    const drift = (this.clock * PREVIEW_DRIFT) % 1;
    let shown = 0;
    for (let i = 0; i < count - 1; i++) {
      const ax = this.preview[i * 2] as number;
      const ay = this.preview[i * 2 + 1] as number;
      const wx = ax + ((this.preview[i * 2 + 2] as number) - ax) * drift;
      const wy = ay + ((this.preview[i * 2 + 3] as number) - ay) * drift;
      if (Math.hypot(wx - x0, wy - y0) < skip) continue;
      const t = (i + drift) / PREVIEW_POINTS;
      // The first dots fade in so the path grows out of the bird instead of starting abruptly.
      const intro = Math.min(1, (shown + drift) / 2.5);
      shown++;
      const radius = Math.max(1.6, (0.092 - 0.05 * t) * cam.zoom) * (0.7 + 0.3 * intro);
      const alpha = (0.95 - 0.65 * t) * intro;
      const x = cam.toScreenX(wx);
      const y = cam.toScreenY(wy);
      ctx.globalAlpha = alpha * 0.35;
      ctx.beginPath();
      ctx.arc(x + radius * 0.25, y + radius * 0.35, radius * 1.05, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = Math.max(0.8, radius * 0.32);
      ctx.strokeStyle = 'rgba(43, 26, 18, 0.7)';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** A slim arc behind the bird, centred on the pull direction, that grows and warms with power. */
  private drawPowerArc(ctx: CanvasRenderingContext2D, cam: Camera): void {
    if (!this.loaded || this.hop < 1) return;
    const power = this.power;
    if (power < 0.05) return;
    const x = cam.toScreenX(this.birdX());
    const y = cam.toScreenY(this.birdY());
    const r = (BIRDS[this.loaded].radius + 0.3) * cam.zoom;
    const dir = -Math.atan2(this.pull.y, this.pull.x);
    const half = 0.12 + power * 0.62;
    const color = power < 0.5 ? mixHex('#ffffff', '#ffd84a', power / 0.5) : mixHex('#ffd84a', '#ff6a2a', (power - 0.5) / 0.5);
    const full = power > 0.985;
    const width = Math.max(3, cam.zoom * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r, dir - half, dir + half);
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = INK;
    ctx.lineWidth = width + 3;
    ctx.stroke();
    ctx.globalAlpha = full ? 0.75 + 0.25 * Math.sin(this.clock * 14) : 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    // A bright bead marks the aim direction.
    ctx.beginPath();
    ctx.arc(x + Math.cos(dir) * r, y + Math.sin(dir) * r, width * (full ? 0.95 : 0.75), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Seconds between preview dots (for tests and tooling). */
  static readonly previewInterval = PREVIEW_STRIDE / (PHYSICS.hz * PHYSICS.substeps);
}
