/**
 * UI CONTRACT - menus, HUD and overlays are plain DOM + CSS layered over the game canvas.
 * The application owns game state and scenes; the UI owns everything inside the #ui element.
 */
import type { SfxName, SfxOptions } from '../audio/types';
import type { CampaignMeta, GameSettings, LevelResult, ProgressReader, StarThresholds } from '../core/types';

export type MenuScreen = 'title' | 'chapters' | 'levels' | 'settings' | 'howto' | 'credits';

/** Things the UI asks the application to do. */
export interface UIActions {
  /** Start a campaign level by global index (0-based). */
  playLevel(levelIndex: number): void;
  /** HUD pause button: the app pauses the simulation and then calls ui.showPause(). */
  requestPause(): void;
  /** Pause menu "Resume": the app resumes and calls ui.hidePause(). */
  resume(): void;
  /** Restart the current level (HUD button, pause menu, results screen). */
  restart(): void;
  /** Results screen "Next". */
  nextLevel(): void;
  /** Leave the current level; the app then calls ui.showMenu('levels', { chapter }). */
  exitToMenu(): void;
  /** HUD button: toggle between the slingshot view and an overview of the whole level. */
  toggleOverview(): void;
  /** Title screen "Level Editor". */
  openEditor(): void;
  /** Persist and apply new settings (volumes, mute). */
  changeSettings(patch: Partial<GameSettings>): void;
  /** Wipe campaign progress (settings screen, after confirmation). */
  resetProgress(): void;
  /** Play an interface sound. */
  sfx(name: SfxName, opts?: SfxOptions): void;
}

/** Everything the UI may read from the application. */
export interface UIHost {
  campaign: CampaignMeta;
  progress: ProgressReader;
  getSettings(): GameSettings;
  actions: UIActions;
}

export interface HudInfo {
  /** e.g. "1-4" */
  levelLabel: string;
  levelName: string;
  /** Best score so far for this level (0 if never completed). */
  best: number;
  /** Optional: when given, the HUD score plaque shows a progress meter towards two and three stars. */
  starThresholds?: StarThresholds;
}

export interface IUIManager {
  /** Shows a full-screen menu (hides HUD, pause and results). `chapter` selects the page of the level grid. */
  showMenu(screen: MenuScreen, opts?: { chapter?: number; instant?: boolean }): void;
  hideMenus(): void;
  readonly currentMenu: MenuScreen | null;

  showHud(info: HudInfo): void;
  hideHud(): void;
  /** Updates the HUD score; the number animates towards the new value unless `instant`. */
  setScore(score: number, instant?: boolean): void;
  /** Small contextual toast near the top of the HUD, e.g. "Tap to boost!". null hides it. */
  showHint(text: string | null, seconds?: number): void;

  showPause(): void;
  hidePause(): void;

  /** Win or lose summary with stars, score, best score, bonuses and Retry / Next / Levels buttons. */
  showResults(result: LevelResult): void;
  hideResults(): void;

  /** Controls tutorial as an overlay on top of whatever is showing (also used in-game on first play). */
  showHowTo(onClose?: () => void): void;

  /** True while a menu, the pause menu, the results or the tutorial covers the playfield. */
  readonly blocksGameInput: boolean;

  /** Re-reads progress and settings from the host and updates whatever is visible. */
  refresh(): void;
}
