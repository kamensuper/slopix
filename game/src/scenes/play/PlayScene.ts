/**
 * Gameplay scene: steps the simulation at a fixed rate, routes input to the slingshot, abilities and
 * camera, and renders the level with interpolated transforms.
 */
import type { IAudioManager } from '../../audio/types';
import { BIRDS, CAMERA, PHYSICS, SCORE, TICK } from '../../core/config';
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
import { ActorViews } from './ActorViews';
import { Feedback } from './Feedback';
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
}

type CamMode = 'intro' | 'sling' | 'follow' | 'free' | 'overview';

const MAX_TICKS_PER_FRAME = 5;
const INTRO_HOLD = 1.4;
const SLOW_SCALE = 0.35;
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
  private mode: CamMode = 'intro';
  private modeTime = 0;
  private dragId: number | null = null;
  private panId: number | null = null;
  private panLast = { x: 0, y: 0 };
  private pinchDist = 0;
  private endTimer = -1;
  private finished = false;
  private readonly bonusQueue: { at: number; index: number; bird: BirdType }[] = [];

  constructor(
    readonly level: LevelDef,
    private readonly host: PlayHost,
  ) {
    this.sim = new GameSim(level);
    this.sling = new SlingView(level.slingshot.x, level.slingshot.y);
    this.feedback = new Feedback({
      renderer: host.renderer,
      particles: this.particles,
      texts: this.texts,
      camera: this.camera,
      audio: host.audio,
      actors: this.actors,
      theme: level.theme,
      slowMotion: (s) => (this.slowLeft = Math.max(this.slowLeft, s)),
      now: () => this.time,
    });
    this.camera.setBounds({ minX: Math.min(-2, level.slingshot.x - 8), maxX: level.world.width + 4, maxY: level.world.height });
  }

  // ------------------------------------------------------------------ lifecycle

  enter(): void {
    this.drainEvents();
    this.host.audio.play('level_start');
    if (this.level.hint) this.host.onHint(this.level.hint, 4);
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

  private updateCamera(dt: number): void {
    this.modeTime += dt;
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
        if (bird && bird.alive) {
          const zoom = this.slingZoom() * 0.85;
          const lead = clamp(bird.vx * 0.25, -3, 4);
          this.camera.setTarget(bird.x + lead, bird.y, zoom);
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

  private onEvent(event: SimEvent): void {
    this.feedback.handle(event);
    switch (event.type) {
      case 'birdReady':
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
        if (event.pigsLeft > 0 && event.birdsLeft > 0 && this.sim.pigsDefeated === 0) this.actors.laughUntil = this.time + 1.2;
        break;
      case 'levelWon': {
        this.host.audio.play('level_win');
        // Unused birds pay out one after the other.
        const waiting = this.sim.queue;
        waiting.forEach((bird, index) => this.bonusQueue.push({ at: this.time + 0.4 + index * 0.45, index, bird }));
        this.endTimer = 1 + waiting.length * 0.45;
        break;
      }
      case 'levelLost':
        this.host.audio.play('level_fail');
        this.host.audio.play('pig_oink', { intensity: 1 });
        this.actors.laughUntil = this.time + 10;
        this.endTimer = 1.6;
        break;
      default:
        break;
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.paused) {
      const scale = this.slowLeft > 0 ? SLOW_SCALE : 1;
      this.slowLeft = Math.max(0, this.slowLeft - dt);
      this.acc += dt * scale;
      let ticks = 0;
      while (this.acc >= TICK && ticks < MAX_TICKS_PER_FRAME) {
        this.sim.step();
        this.drainEvents();
        this.acc -= TICK;
        ticks++;
      }
      if (ticks === MAX_TICKS_PER_FRAME) this.acc = 0;
      this.updateBirdEffects();
      this.updateEnd(dt);
    }
    const scaled = this.paused ? 0 : dt * (this.slowLeft > 0 ? SLOW_SCALE : 1);
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
      if (bird.type === 'chuck' && bird.abilityUsed && !bird.impacted) this.feedback.boostTrail(bird.x, bird.y, bird.vx, bird.vy);
      if (bird.fuseEndTick >= 0 && this.sim.tick % 3 === 0) this.feedback.fuseSmoke(bird.x, bird.y + bird.radius);
      if (!bird.impacted && !bird.spawned) flight = Math.hypot(bird.vx, bird.vy);
    }
    this.host.audio.setFlight(flight);
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
    this.actors.drawPigs(r, sim, alpha, this.time);
    this.actors.drawGhosts(r, this.time);
    this.sling.drawQueue(r, this.waiting(), this.time, this.sim.phase === 'aiming');
    this.actors.drawBirds(r, sim, alpha, this.time);
    this.sling.drawLoaded(r, this.time, 0);
    this.sling.drawFront(r, ctx, cam);
    this.particles.draw(r, ctx, cam, this.view.dpr);
    r.screenSpace();
    this.sling.drawPreview(ctx, cam);
    (level.decor ?? []).forEach((d, i) => d.layer === 'front' && r.drawDecor(d, i));
    r.drawForeground(level.theme);
    r.screenSpace();
    this.texts.draw(ctx, cam);
    r.end();
  }

  /** Debug / test helpers exposed through window.__game. */
  debugInfo(): Record<string, unknown> {
    return {
      phase: this.sim.phase,
      score: this.sim.score,
      pigs: this.sim.pigsAlive,
      queue: [...this.sim.queue],
      tick: this.sim.tick,
      mode: this.mode,
      fps: PHYSICS.hz,
      anchor: { ...this.sim.anchor },
      camera: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom },
    };
  }
}
