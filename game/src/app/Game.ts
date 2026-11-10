/**
 * Application: owns the canvas, the frame loop, the active scene, save data, audio and the UI, and
 * implements the actions the UI asks for (play, pause, restart, next level ...).
 */
import { AudioManager } from '../audio/AudioManager';
import type { MusicTrack } from '../audio/types';
import { RENDER } from '../core/config';
import type { GameSettings, LevelResult } from '../core/types';
import { InputManager } from '../input/InputManager';
import { CAMPAIGN, CHAPTERS, LEVELS, levelLabel } from '../levels/campaign';
import { WorldRenderer } from '../render/WorldRenderer';
import { SaveManager } from '../save/SaveManager';
import { PlayScene, type PlayHost } from '../scenes/play/PlayScene';
import { starsFor } from '../sim/scoring';
import type { WinSummary } from '../sim/GameSim';
import type { UIActions } from '../ui/types';
import { UIManager } from '../ui/UIManager';
import { AssetManager } from './AssetManager';
import type { Scene, Viewport } from './Scene';

const HOWTO_FLAG = 'seenHowTo';

export class Game {
  readonly renderer = new WorldRenderer();
  readonly save = new SaveManager(CAMPAIGN);
  readonly audio: AudioManager;
  readonly input: InputManager;
  readonly ui: UIManager;
  private readonly ctx: CanvasRenderingContext2D;
  private scene: Scene | null = null;
  private play: PlayScene | null = null;
  private levelIndex = 0;
  private view: Viewport = { width: 1, height: 1, dpr: 1 };
  private last = 0;
  /** Smoothed frame time in ms, for the debug overlay and tests. */
  frameMs = 16.7;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.audio = new AudioManager(this.save.getSettings());
    this.input = new InputManager(canvas);
    this.input.onFirstGesture = () => this.audio.unlock();
    this.ui = new UIManager(uiRoot, {
      campaign: CAMPAIGN,
      progress: this.save,
      getSettings: () => this.save.getSettings(),
      actions: this.actions,
    });
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', () => setTimeout(this.resize, 150));
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
  }

  async start(onProgress: (f: number) => void): Promise<void> {
    await new AssetManager(this.renderer).load(onProgress);
    this.showMenu('title');
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------------ frame loop

  private readonly frame = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.frameMs += ((now - this.last) - this.frameMs) * 0.05;
    this.last = now;
    if (this.scene) {
      this.scene.update(dt);
      this.ctx.setTransform(this.view.dpr, 0, 0, this.view.dpr, 0, 0);
      this.scene.render(this.ctx);
    }
    requestAnimationFrame(this.frame);
  };

  private readonly resize = (): void => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const dpr = Math.min(RENDER.maxDpr, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.view = { width, height, dpr };
    this.scene?.resize(this.view);
  };

  private readonly onVisibility = (): void => {
    const hidden = document.visibilityState === 'hidden';
    this.audio.setSuspended(hidden);
    if (hidden && this.play && !this.play.paused && !this.play.sim.isOver && this.scene === this.play) this.actions.requestPause();
  };

  private setScene(scene: Scene): void {
    this.scene?.exit();
    this.scene = scene;
    this.input.handler = scene;
    scene.resize(this.view);
    scene.enter();
  }

  // ------------------------------------------------------------------ scenes

  private showMenu(screen: 'title' | 'levels', chapter?: number): void {
    this.play = null;
    const level = LEVELS[chapter !== undefined ? (CAMPAIGN.chapters[chapter]?.levels[0]?.index ?? 0) : 0]!;
    const backdrop = new PlayScene(level, this.makeHost(true));
    backdrop.paused = true;
    backdrop.toggleOverview();
    this.setScene(backdrop);
    this.ui.showMenu(screen, { chapter });
    this.audio.playMusic('menu');
  }

  private startLevel(index: number): void {
    const level = LEVELS[index];
    if (!level) return;
    this.levelIndex = index;
    this.ui.hideMenus();
    this.ui.hideResults();
    this.ui.hidePause();
    const play = new PlayScene(level, this.makeHost(false));
    this.play = play;
    this.setScene(play);
    this.ui.showHud({ levelLabel: levelLabel(index), levelName: level.name, best: this.save.getBest(index) });
    this.ui.setScore(0, true);
    const chapter = CAMPAIGN.levels[index]?.chapter ?? 0;
    this.audio.playMusic((CHAPTERS[chapter]?.theme ?? 'grasslands') as MusicTrack);
    if (!this.save.getFlag(HOWTO_FLAG)) {
      this.save.setFlag(HOWTO_FLAG, true);
      play.paused = true;
      this.ui.showHowTo(() => (play.paused = false));
    }
  }

  private makeHost(backdrop: boolean): PlayHost {
    return {
      renderer: this.renderer,
      audio: backdrop ? silentAudio : this.audio,
      inputBlocked: () => backdrop || this.ui.blocksGameInput,
      onScore: (score) => !backdrop && this.ui.setScore(score),
      onHint: (text, seconds) => !backdrop && this.ui.showHint(text, seconds),
      onFinished: (won, summary, score) => !backdrop && this.finishLevel(won, summary, score),
      onPauseRequest: () => !backdrop && this.actions.requestPause(),
      onRestartRequest: () => !backdrop && this.actions.restart(),
    };
  }

  private finishLevel(won: boolean, summary: WinSummary | null, score: number): void {
    const index = this.levelIndex;
    const level = LEVELS[index]!;
    const stars = starsFor(score, level.stars, won);
    const previousBest = this.save.getBest(index);
    const outcome = won ? this.save.recordResult(index, score, stars) : null;
    const hasNext = index + 1 < LEVELS.length;
    const sim = this.play?.sim;
    const result: LevelResult = {
      won,
      levelIndex: index,
      levelId: level.id,
      levelName: level.name,
      score,
      baseScore: summary?.baseScore ?? score,
      clearBonus: summary?.clearBonus ?? 0,
      unusedBirds: summary?.unusedBirds ?? 0,
      birdBonus: summary?.birdBonus ?? 0,
      stars,
      starThresholds: level.stars,
      previousBest,
      best: outcome?.best ?? previousBest,
      isNewBest: outcome?.isNewBest ?? false,
      pigsDefeated: sim?.pigsDefeated ?? 0,
      pigsTotal: sim?.pigsTotal ?? 0,
      birdsUsed: sim?.birdsUsed ?? 0,
      hasNext,
      nextUnlocked: hasNext && this.save.isLevelUnlocked(index + 1),
    };
    this.ui.showResults(result);
  }

  // ------------------------------------------------------------------ UI actions

  readonly actions: UIActions = {
    playLevel: (index) => this.startLevel(index),
    requestPause: () => {
      if (!this.play || this.play.sim.isOver) return;
      this.play.paused = true;
      this.ui.showPause();
    },
    resume: () => {
      this.ui.hidePause();
      if (this.play) this.play.paused = false;
    },
    restart: () => this.startLevel(this.levelIndex),
    nextLevel: () => {
      const next = this.levelIndex + 1;
      if (next < LEVELS.length && this.save.isLevelUnlocked(next)) this.startLevel(next);
      else this.actions.exitToMenu();
    },
    exitToMenu: () => {
      this.ui.hideHud();
      this.showMenu('levels', CAMPAIGN.levels[this.levelIndex]?.chapter ?? 0);
    },
    toggleOverview: () => this.play?.toggleOverview(),
    openEditor: () => {
      // The level editor is not part of this build.
    },
    changeSettings: (patch: Partial<GameSettings>) => {
      const settings = this.save.updateSettings(patch);
      this.audio.applySettings(settings);
    },
    resetProgress: () => {
      this.save.resetProgress();
      this.ui.refresh();
    },
    sfx: (name, opts) => {
      this.audio.unlock();
      this.audio.play(name, opts);
    },
  };

  debugInfo(): Record<string, unknown> {
    return { frameMs: this.frameMs, level: this.levelIndex, menu: this.ui.currentMenu, play: this.play?.debugInfo() ?? null };
  }

  /** Test hook: the running gameplay scene. */
  get playScene(): PlayScene | null {
    return this.play;
  }
}

const silentAudio = {
  unlocked: false,
  unlock() {},
  play() {},
  setStretch() {},
  setFlight() {},
  playMusic() {},
  applySettings() {},
  setSuspended() {},
};
