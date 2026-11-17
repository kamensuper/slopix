/**
 * Gameplay scene: steps the simulation at a fixed rate, routes input to the slingshot, abilities and
 * camera, and renders the level with interpolated transforms.
 */
import type { IAudioManager } from '../../audio/types';
import { BIRDS, CAMERA, FOES, PHYSICS, SCORE, SHOT, TICK } from '../../core/config';
import type { SimEvent } from '../../core/events';
import { clamp, clamp01 } from '../../core/math';
import type { BirdType, LevelDef } from '../../core/types';
import type { Scene, Viewport } from '../../app/Scene';
import type { PointerInfo } from '../../input/InputManager';
import { Camera } from '../../render/Camera';
import { FloatingText } from '../../render/FloatingText';
import { ParticleSystem } from '../../render/ParticleSystem';
import type { WorldRenderer } from '../../render/WorldRenderer';
import { GameSim, type WinSummary } from '../../sim/GameSim';
import { solveAim } from '../../sim/aim';
import { pullFromAim } from '../../sim/slingshot';
import { ActorViews } from './ActorViews';
import { Feedback } from './Feedback';
import { drawBalloons, drawConditions, drawJoints, drawSurfaces, drawWind } from './Overlays';
import { SlingView } from './SlingView';

export interface PlayHost {
  renderer: WorldRenderer;
  audio: IAudioManager;
  /** True while menus / overlays cover the playfield. */
  inputBlocked(): boolean;
  onScore(score: number): void;
  onHint(text: string | null, seconds?: number): void;
  /** Called once when the level is decided and its end animation has played. */
  onFinished(won: boolean, summary: WinSummary | null, score: number): void;
  onPauseRequest(): void;
  onRestartRequest(): void;
  /** Player asked for reduced motion (less shake, no slow motion). */
  reducedMotion(): boolean;
  /** Aim assist setting: show the whole predicted flight. */
  aimAssist(): boolean;
  /** Every simulation event, for statistics and achievements. */
  onSimEvent?(event: SimEvent, sim: GameSim): void;
  /** Fast-forward was switched on or off (the HUD button mirrors it). */
  onFastForward?(on: boolean): void;
}

type CamMode = 'intro' | 'sling' | 'follow' | 'free' | 'overview';

const MAX_TICKS_PER_FRAME = 5;
const INTRO_HOLD = 1.4;

/** A short cinematic: letterbox bars, the camera pushed in on a point and a title that punches in. */
interface Cine {
  kind: 'boss' | 'finisher';
  /** Seconds of real time it has run, and how long it lasts. */
  age: number;
  hold: number;
  x: number;
  y: number;
  /** Zoom relative to the normal sling framing. */
  zoom: number;
  title: string;
  sub: string;
}
const SLOW_SCALE = 0.35;
/** A hard first impact freezes the action for this long: it reads as weight. */
const HIT_STOP = 0.05;
const HIT_STOP_SPEED = 13;
const TAP_SLOP = 12;
const KEY_ANGLE = 0.035;
const KEY_POWER = 0.04;

export class PlayScene implements Scene {
  readonly sim: GameSim;
  readonly camera = new Camera();
  private readonly sling: SlingView;
  private readonly actors = new ActorViews();
  private readonly particles = new ParticleSystem();
  private readonly texts = new FloatingText();
  private readonly feedback: Feedback;
  private view: Viewport = { width: 1, height: 1, dpr: 1 };

  paused = false;
  private acc = 0;
  private time = 0;
  private slowLeft = 0;
  private hitStop = 0;
  /** Fast-forward: the rest of the shot plays at SHOT.fastForward speed. */
  fast = false;
  /** Seconds of play so far, not counting pauses (time trials). */
  playTime = 0;
  private mode: CamMode = 'intro';
  private modeTime = 0;
  private dragId: number | null = null;
  private panId: number | null = null;
  private panLast = { x: 0, y: 0 };
  private pinchDist = 0;
  private endTimer = -1;
  private finished = false;
  private cine: Cine | null = null;
  private readonly bonusQueue: { at: number; index: number; bird: BirdType }[] = [];

  constructor(
    readonly level: LevelDef,
    private readonly host: PlayHost,
  ) {
    this.sim = new GameSim(level);
    this.sling = new SlingView(level.slingshot.x, level.slingshot.y);
    this.sling.gravityScale = this.sim.gravityScale;
    this.sling.wind = this.sim.wind;
    this.feedback = new Feedback({
      renderer: host.renderer,
      particles: this.particles,
      texts: this.texts,
      camera: this.camera,
      audio: host.audio,
      actors: this.actors,
      theme: level.theme,
      slowMotion: (s) => {
        if (!this.host.reducedMotion()) this.slowLeft = Math.max(this.slowLeft, s);
      },
      now: () => this.time,
    });
    this.camera.setBounds({ minX: Math.min(-2, level.slingshot.x - 8), maxX: level.world.width + 4, maxY: level.world.height });
  }

  // ------------------------------------------------------------------ lifecycle

  enter(): void {
    this.drainEvents();
    this.host.audio.play('level_start');
    if (this.level.hint) this.host.onHint(this.level.hint, 4);
    // Boss levels open on the boss: the camera pushes in while he has a good laugh.
    const boss = this.sim.foes.find((f) => f.variant === 'king');
    if (boss && !this.host.inputBlocked() && !this.host.reducedMotion()) {
      this.cine = { kind: 'boss', age: 0, hold: 2.8, x: boss.x, y: boss.y + 0.5, zoom: 1.9, title: FOES.king.name.toUpperCase(), sub: FOES.king.trait };
      this.actors.laughUntil = this.time + 2.6;
      this.host.audio.play('foe_grunt');
    }
  }

  exit(): void {
    this.host.audio.setStretch(null);
    this.host.audio.setFlight(null);
  }

  resize(view: Viewport): void {
    const first = this.view.width <= 1;
    this.view = view;
    this.camera.setView(view.width, view.height);
    if (first) {
      this.applyOverviewTarget();
      this.camera.snap();
    }
  }

  // ------------------------------------------------------------------ camera targets

  private slingZoom(): number {
    // Show roughly 13 m of height or 26 m of width, whichever is tighter.
    return clamp(Math.min(this.view.height / 13, this.view.width / 26), CAMERA.minZoom, CAMERA.maxZoom);
  }

  private applySlingTarget(): void {
    const zoom = this.slingZoom();
    const x = this.level.slingshot.x + (this.view.width / zoom) * 0.3;
    this.camera.setTarget(x, this.level.slingshot.y + 3, zoom);
  }

  private applyOverviewTarget(): void {
    this.camera.setTarget(this.level.world.width / 2, this.level.world.height / 2, 0);
  }

  private setMode(mode: CamMode): void {
    this.mode = mode;
    this.modeTime = 0;
    this.camera.smooth = mode === 'follow' ? CAMERA.followSmooth : CAMERA.returnSmooth;
  }

  toggleOverview(): void {
    this.setMode(this.mode === 'overview' ? 'sling' : 'overview');
  }

  private foeFocusX(): number | null {
    let sum = 0;
    let n = 0;
    for (const foe of this.sim.foes) {
      sum += foe.x;
      n++;
    }
    return n > 0 ? sum / n : null;
  }

  private updateCamera(dt: number): void {
    this.modeTime += dt;
    const cine = this.cine;
    if (cine) {
      cine.age += dt;
      if (cine.age >= cine.hold || this.sling.aiming) {
        this.cine = null;
        this.setMode(cine.kind === 'boss' ? 'sling' : 'follow');
      } else {
        this.camera.smooth = 0.3;
        this.camera.setTarget(cine.x, cine.y, this.slingZoom() * cine.zoom);
        this.camera.update(dt);
        return;
      }
    }
    const bird = this.sim.activeBird;
    switch (this.mode) {
      case 'intro':
        this.applyOverviewTarget();
        if (this.modeTime > INTRO_HOLD) this.setMode('sling');
        break;
      case 'sling':
        this.applySlingTarget();
        break;
      case 'overview':
        this.applyOverviewTarget();
        break;
      case 'follow': {
        if (bird && bird.alive && !bird.impacted) {
          // Zoom out on high arcs so the bird and the ground stay in frame.
          const fit = this.view.height / (bird.y + 7);
          const zoom = Math.min(this.slingZoom() * 0.85, fit);
          const lead = clamp(bird.vx * 0.25, -3, 4);
          this.camera.setTarget(bird.x + lead, bird.y * 0.6 + 2, zoom);
        } else if (bird && bird.alive) {
          // After impact, frame the action between the bird and the remaining foes instead of chasing a rolling bird.
          this.camera.smooth = 0.45;
          const focus = this.foeFocusX();
          this.camera.setTarget(focus === null ? bird.x : (bird.x + focus) / 2, Math.max(4, bird.y), this.slingZoom() * 0.8);
        } else if (this.sim.phase === 'aiming') {
          this.setMode('sling');
        }
        break;
      }
      case 'free':
        break;
    }
    this.camera.update(dt);
  }

  // ------------------------------------------------------------------ simulation

  private drainEvents(): void {
    const events = this.sim.events;
    for (let i = 0; i < events.length; i++) this.onEvent(events[i] as SimEvent);
    events.length = 0;
  }

  /** Switches fast-forward; it only has an effect while a shot is playing out. */
  setFast(on: boolean): void {
    const next = on && this.sim.phase === 'flying';
    if (next === this.fast) return;
    this.fast = next;
    this.host.onFastForward?.(next);
  }

  private onEvent(event: SimEvent): void {
    this.feedback.handle(event);
    this.host.onSimEvent?.(event, this.sim);
    if (event.type === 'foeDefeated' && event.remaining === 0 && !this.host.reducedMotion() && !this.fast) {
      // The finisher: slow motion, the camera on the last Burrower and a title for how it was won.
      const spare = this.waiting().length;
      const title = spare >= 2 ? 'FLOCK FURY!' : spare === 1 ? 'CLEAN SWEEP!' : 'JUST IN TIME!';
      this.cine = { kind: 'finisher', age: 0, hold: 1.5, x: event.x, y: Math.max(2, event.y + 0.4), zoom: 1.45, title, sub: '' };
      this.slowLeft = Math.max(this.slowLeft, 1.1);
    }
    switch (event.type) {
      case 'birdImpact':
        if (event.first && event.speed > HIT_STOP_SPEED && !this.host.reducedMotion() && !this.fast) this.hitStop = HIT_STOP;
        break;
      case 'birdReady':
        this.setFast(false);
        this.sling.load(event.bird);
        this.host.audio.play('bird_ready', { bird: event.bird });
        if (this.mode === 'follow') this.setMode('sling');
        break;
      case 'birdLaunched': {
        this.setMode('follow');
        const hint = BIRDS[event.bird].abilityHint;
        if (hint) this.host.onHint(hint, 1.6);
        break;
      }
      case 'score':
        this.host.onScore(this.sim.score);
        break;
      case 'shotResolved':
        if (event.foesLeft > 0 && event.birdsLeft > 0 && this.sim.foesDefeated === 0) this.actors.laughUntil = this.time + 1.2;
        break;
      case 'levelWon': {
        this.setFast(false);
        this.host.audio.play('level_win');
        // Unused birds pay out one after the other.
        const waiting = this.sim.queue;
        waiting.forEach((bird, index) => this.bonusQueue.push({ at: this.time + 0.4 + index * 0.45, index, bird }));
        this.endTimer = 1 + waiting.length * 0.45;
        break;
      }
      case 'levelLost':
        this.host.audio.play('level_fail');
        this.host.audio.play('foe_grunt', { intensity: 1 });
        this.actors.laughUntil = this.time + 10;
        this.endTimer = 1.6;
        break;
      default:
        break;
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.camera.motionScale = this.host.reducedMotion() ? 0.25 : 1;
    this.sling.assist = this.host.aimAssist();
    let scale = 0;
    if (!this.paused) {
      if (!this.sim.isOver) this.playTime += dt;
      if (this.hitStop > 0) {
        this.hitStop -= dt;
      } else {
        // Fast-forward overrides slow motion; both only change how quickly the same ticks are played.
        scale = this.fast ? SHOT.fastForward : this.slowLeft > 0 ? SLOW_SCALE : 1;
        this.slowLeft = Math.max(0, this.slowLeft - dt);
        this.acc += dt * scale;
        const limit = MAX_TICKS_PER_FRAME * (this.fast ? SHOT.fastForward : 1);
        let ticks = 0;
        while (this.acc >= TICK && ticks < limit) {
          this.sim.step();
          this.drainEvents();
          this.acc -= TICK;
          ticks++;
        }
        // After a long stall (tab switch, slow frame) carry at most one tick over instead of racing to catch up.
        if (ticks === limit) this.acc = Math.min(this.acc, TICK);
      }
      this.updateBirdEffects();
      this.updateEnd(dt);
    }
    const scaled = this.paused ? 0 : dt * scale;
    this.sling.update(dt, this.waiting().length);
    this.actors.update(scaled);
    this.particles.update(scaled);
    this.texts.update(dt);
    this.updateCamera(dt);
    this.host.audio.setStretch(this.sling.aiming ? this.sling.power : null);
  }

  private updateBirdEffects(): void {
    let flight: number | null = null;
    for (const bird of this.sim.birds) {
      if (((bird.type === 'zip' && bird.abilityUsed) || bird.slamming) && !bird.impacted) this.feedback.boostTrail(bird.x, bird.y, bird.vx, bird.vy);
      if (bird.fuseEndTick >= 0 && this.sim.tick % 3 === 0) this.feedback.fuseSmoke(bird.x, bird.y + bird.radius);
      if (!bird.impacted && !bird.spawned) flight = Math.hypot(bird.vx, bird.vy);
      if (!bird.impacted && bird.alive) this.feedback.flightDot(bird.id, bird.x, bird.y);
    }
    this.host.audio.setFlight(flight);
    this.feedback.wellDust();
  }

  private updateEnd(dt: number): void {
    for (let i = this.bonusQueue.length - 1; i >= 0; i--) {
      const item = this.bonusQueue[i]!;
      if (this.time < item.at) continue;
      this.bonusQueue.splice(i, 1);
      const pos = this.sling.queuePosition(item.index, item.bird, { x: 0, y: 0 });
      this.sling.cheer(item.index);
      this.feedback.bonus(SCORE.unusedBird, pos.x, pos.y);
    }
    if (this.endTimer < 0 || this.finished) return;
    this.endTimer -= dt;
    if (this.endTimer <= 0) {
      this.finished = true;
      this.host.audio.setFlight(null);
      this.host.onScore(this.sim.score);
      this.host.onFinished(this.sim.phase === 'won', this.sim.summary, this.sim.score);
    }
  }

  /** Birds standing on the ground next to the slingshot. */
  /** Letterbox bars, speed lines and the title of the running cinematic (screen space). */
  private drawCine(ctx: CanvasRenderingContext2D): void {
    const c = this.cine;
    if (!c) return;
    const { width: w, height: h, dpr } = this.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = Math.min(clamp01(c.age / 0.25), clamp01((c.hold - c.age) / 0.25));
    const ease = k * k * (3 - 2 * k);
    if (c.kind === 'finisher') {
      const cx = this.camera.toScreenX(c.x);
      const cy = this.camera.toScreenY(c.y);
      const reach = Math.hypot(w, h);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * ease})`;
      ctx.beginPath();
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.2 + c.age * 0.15;
        const inner = reach * (0.24 + 0.08 * Math.abs(Math.sin(i * 7.3 + c.age * 9)));
        const half = 0.012 + 0.01 * Math.abs(Math.sin(i * 3.7));
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a - half) * reach, cy + Math.sin(a - half) * reach);
        ctx.lineTo(cx + Math.cos(a + half) * reach, cy + Math.sin(a + half) * reach);
        ctx.closePath();
      }
      ctx.fill();
    }
    const bar = h * 0.11 * ease;
    ctx.fillStyle = '#120a06';
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar, w, bar);
    const pop = c.age < 0.35 ? 1 + (1 - c.age / 0.35) ** 2 * 0.9 : 1;
    const size = Math.round(Math.min(w * 0.085, h * 0.16));
    ctx.save();
    ctx.translate(w / 2, c.kind === 'boss' ? h * 0.74 : h * 0.27);
    ctx.rotate(c.kind === 'boss' ? 0 : -0.05);
    ctx.scale(pop, pop);
    ctx.globalAlpha = ease;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = `${size}px "Lilita One", "Fredoka Variable", sans-serif`;
    ctx.strokeStyle = '#2b1a12';
    ctx.lineWidth = size * 0.22;
    ctx.strokeText(c.title, 0, size * 0.07);
    ctx.strokeText(c.title, 0, 0);
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, c.kind === 'boss' ? '#ffd9d0' : '#fff7c2');
    g.addColorStop(1, c.kind === 'boss' ? '#ff5a3c' : '#ffb629');
    ctx.fillStyle = g;
    ctx.fillText(c.title, 0, 0);
    if (c.sub) {
      const small = Math.round(size * 0.34);
      ctx.font = `${small}px "Fredoka Variable", sans-serif`;
      ctx.lineWidth = small * 0.3;
      ctx.strokeText(c.sub, 0, size * 0.8);
      ctx.fillStyle = '#fff3d6';
      ctx.fillText(c.sub, 0, size * 0.8);
    }
    ctx.restore();
  }

  private waiting(): readonly BirdType[] {
    return this.sim.phase === 'aiming' ? this.sim.queue.slice(1) : this.sim.queue;
  }

  // ------------------------------------------------------------------ input

  private tryAbility(): boolean {
    if (!this.sim.canUseAbility()) return false;
    return this.sim.activateAbility();
  }

  private launch(): void {
    const shot = this.sling.release();
    if (shot && this.sim.launch(shot.x, shot.y)) return;
    if (shot) this.sling.load(this.sim.queue[0] as BirdType);
  }

  pointerDown(p: PointerInfo, all: ReadonlyMap<number, PointerInfo>): void {
    if (this.host.inputBlocked() || this.paused || this.sim.isOver) return;
    if (all.size === 2) {
      // Second finger: pinch zoom (cancels any drag in progress).
      if (this.dragId !== null) this.sling.cancel();
      this.dragId = null;
      const [a, b] = [...all.values()] as [PointerInfo, PointerInfo];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.panId = null;
      this.setMode('free');
      return;
    }
    if (this.tryAbility()) return;
    const wx = this.camera.toWorldX(p.x);
    const wy = this.camera.toWorldY(p.y);
    if (this.sim.phase === 'aiming' && this.sling.hitTest(wx, wy, this.camera.zoom)) {
      this.dragId = p.id;
      this.sling.beginDrag(wx, wy);
      if (this.mode !== 'sling') this.setMode('sling');
      this.host.audio.play('ui_toggle', { volume: 0.4 });
      return;
    }
    this.panId = p.id;
    this.panLast.x = p.x;
    this.panLast.y = p.y;
  }

  pointerMove(p: PointerInfo, all: ReadonlyMap<number, PointerInfo>): void {
    if (all.size === 2 && this.pinchDist > 0) {
      const [a, b] = [...all.values()] as [PointerInfo, PointerInfo];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      this.camera.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / this.pinchDist);
      this.pinchDist = dist;
      return;
    }
    if (p.id === this.dragId) {
      this.sling.dragTo(this.camera.toWorldX(p.x), this.camera.toWorldY(p.y));
      return;
    }
    if (p.id === this.panId && Math.hypot(p.x - p.startX, p.y - p.startY) > TAP_SLOP) {
      if (this.mode !== 'free') {
        this.camera.target.x = this.camera.x;
        this.camera.target.y = this.camera.y;
        this.setMode('free');
        this.camera.smooth = 0.06;
      }
      const z = this.camera.target.zoom;
      this.camera.setTarget(this.camera.target.x - (p.x - this.panLast.x) / z, this.camera.target.y + (p.y - this.panLast.y) / z, z);
      this.panLast.x = p.x;
      this.panLast.y = p.y;
    }
  }

  pointerUp(p: PointerInfo, all: ReadonlyMap<number, PointerInfo>): void {
    if (all.size < 2) this.pinchDist = 0;
    if (p.id === this.dragId) {
      this.dragId = null;
      this.launch();
    }
    if (p.id === this.panId) this.panId = null;
  }

  pointerCancel(p: PointerInfo): void {
    if (p.id === this.dragId) {
      this.dragId = null;
      this.sling.cancel();
    }
    if (p.id === this.panId) this.panId = null;
    this.pinchDist = 0;
  }

  wheel(x: number, y: number, deltaY: number): void {
    if (this.host.inputBlocked()) return;
    if (this.mode !== 'free') {
      this.camera.target.x = this.camera.x;
      this.camera.target.y = this.camera.y;
      this.setMode('free');
      this.camera.smooth = 0.12;
    }
    this.camera.zoomAt(x, y, Math.exp(-deltaY * 0.0015));
  }

  keyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      this.host.onPauseRequest();
      return true;
    }
    if (this.host.inputBlocked() || this.paused) return false;
    switch (e.key) {
      case 'r':
      case 'R':
        this.host.onRestartRequest();
        return true;
      case 'o':
      case 'O':
        this.toggleOverview();
        return true;
      case 'f':
      case 'F':
        this.setFast(!this.fast);
        return true;
      case 'ArrowUp':
        this.sling.nudge(KEY_ANGLE, 0);
        return true;
      case 'ArrowDown':
        this.sling.nudge(-KEY_ANGLE, 0);
        return true;
      case 'ArrowRight':
        this.sling.nudge(0, KEY_POWER);
        return true;
      case 'ArrowLeft':
        this.sling.nudge(0, -KEY_POWER);
        return true;
      case ' ':
      case 'Enter':
        if (this.tryAbility()) return true;
        if (this.sling.aiming) this.launch();
        else this.sling.nudge(0, 0);
        return true;
      default:
        return false;
    }
  }

  // ------------------------------------------------------------------ rendering

  render(ctx: CanvasRenderingContext2D): void {
    const r = this.host.renderer;
    const cam = this.camera;
    const sim = this.sim;
    const level = this.level;
    const alpha = this.paused ? 1 : clamp01(this.acc / TICK);
    r.begin(ctx, cam, this.view.dpr, this.time, level.world.width);
    r.drawSky(level.theme);
    (level.decor ?? []).forEach((d, i) => d.layer !== 'front' && r.drawDecor(d, i));
    r.drawGround(level.theme);
    level.terrain.forEach((t, i) => r.drawTerrain(level.theme, t, i));
    r.screenSpace();
    drawSurfaces(ctx, cam, level, this.paused ? 0 : this.time);
    this.feedback.drawUnder(ctx, cam, this.view.dpr);
    this.sling.drawBack(r, ctx, cam);
    for (const block of sim.blocks) {
      const flash = block.hitTick >= 0 ? clamp01(1 - (sim.tick - block.hitTick) / 6) : 0;
      r.drawBlock(
        block,
        block.stage,
        block.px + (block.x - block.px) * alpha,
        block.py + (block.y - block.py) * alpha,
        block.pangle + (block.angle - block.pangle) * alpha,
        flash,
      );
    }
    r.screenSpace();
    drawBalloons(ctx, cam, sim.foes, alpha, this.time);
    this.actors.drawFoes(r, sim, alpha, this.time);
    r.screenSpace();
    drawJoints(ctx, cam, sim, alpha, this.time);
    drawConditions(ctx, cam, sim, alpha, this.time);
    this.actors.drawGhosts(r, this.time);
    this.sling.drawQueue(r, this.waiting(), this.time, this.sim.phase === 'aiming');
    this.feedback.drawTrail(ctx, cam, this.view.dpr);
    this.actors.drawBirds(r, sim, alpha, this.time);
    this.sling.drawLoaded(r, this.time, 0);
    this.sling.drawFront(r, ctx, cam);
    this.particles.draw(r, ctx, cam, this.view.dpr);
    r.screenSpace();
    this.feedback.drawOverlays(ctx, cam);
    drawWind(ctx, this.view.width, this.view.height, sim.wind, this.time, this.host.reducedMotion() ? 0.3 : 1);
    this.sling.drawPreview(ctx, cam);
    (level.decor ?? []).forEach((d, i) => d.layer === 'front' && r.drawDecor(d, i));
    r.drawForeground(level.theme);
    r.screenSpace();
    this.texts.draw(ctx, cam);
    this.drawCine(ctx);
    r.end();
  }

  /** Test helper: the pouch offset that sends the loaded bird through a world point (low arc). */
  aimPull(targetX: number, targetY: number, power: number): { x: number; y: number } | null {
    const bird = this.sim.queue[0];
    const angle = solveAim(this.sim.anchor, targetX, targetY, power, bird ? BIRDS[bird].launch : 1, this.sim.gravityScale, this.sim.wind).low;
    return angle === null ? null : pullFromAim(angle, power, { x: 0, y: 0 });
  }

  /** Debug / test helpers exposed through window.__game. */
  debugInfo(): Record<string, unknown> {
    return {
      phase: this.sim.phase,
      score: this.sim.score,
      foes: this.sim.foesAlive,
      queue: [...this.sim.queue],
      tick: this.sim.tick,
      mode: this.mode,
      fast: this.fast,
      playTime: this.playTime,
      fps: PHYSICS.hz,
      anchor: { ...this.sim.anchor },
      camera: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom },
    };
  }
}
