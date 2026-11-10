// TEMPORARY STUB - replaced by the real interface. Bare-bones DOM so the game is testable meanwhile.
import type { LevelResult } from '../core/types';
import type { HudInfo, IUIManager, MenuScreen, UIHost } from './types';

export class UIManager implements IUIManager {
  currentMenu: MenuScreen | null = null;
  private menu = document.createElement('div');
  private hud = document.createElement('div');
  private overlay = document.createElement('div');
  private scoreEl = document.createElement('span');

  constructor(
    private root: HTMLElement,
    private host: UIHost,
  ) {
    for (const el of [this.menu, this.hud, this.overlay]) {
      el.style.cssText = 'position:absolute;inset:0;display:none;pointer-events:none;font:20px sans-serif;color:#fff;';
      this.root.appendChild(el);
    }
    this.hud.dataset.ui = 'hud';
    this.menu.dataset.ui = 'menu';
    this.overlay.dataset.ui = 'overlay';
  }

  get blocksGameInput(): boolean {
    return this.currentMenu !== null || this.overlay.style.display !== 'none';
  }

  private button(label: string, onClick: () => void, id?: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    if (id) b.dataset.action = id;
    b.style.cssText = 'pointer-events:auto;font:20px sans-serif;margin:6px;padding:10px 18px;';
    b.addEventListener('click', onClick);
    return b;
  }

  showMenu(screen: MenuScreen, _opts?: { chapter?: number; instant?: boolean }): void {
    this.hideHud();
    this.hidePause();
    this.hideResults();
    this.currentMenu = screen;
    this.menu.replaceChildren();
    this.menu.style.display = 'block';
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;max-width:90vw;';
    const title = document.createElement('h1');
    title.textContent = screen === 'title' ? 'Flock Fury (stub UI)' : screen;
    box.appendChild(title);
    const { progress, campaign, actions } = this.host;
    if (screen === 'title') {
      box.appendChild(this.button('Play', () => this.showMenu('levels'), 'play'));
      box.appendChild(this.button('Editor', () => actions.openEditor(), 'editor'));
    } else {
      for (const level of campaign.levels) {
        const b = this.button(`${level.id} ${'*'.repeat(progress.getStars(level.index))}`, () => actions.playLevel(level.index), `level-${level.index}`);
        b.disabled = !progress.isLevelUnlocked(level.index);
        box.appendChild(b);
      }
      box.appendChild(this.button('Back', () => this.showMenu('title'), 'back'));
    }
    this.menu.appendChild(box);
  }

  hideMenus(): void {
    this.currentMenu = null;
    this.menu.style.display = 'none';
  }

  showHud(info: HudInfo): void {
    this.hud.replaceChildren();
    this.hud.style.display = 'block';
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:0;right:0;top:0;display:flex;align-items:center;justify-content:space-between;padding:6px;';
    const left = document.createElement('div');
    left.appendChild(this.button('Pause', () => this.host.actions.requestPause(), 'pause'));
    left.appendChild(this.button('Restart', () => this.host.actions.restart(), 'restart'));
    left.appendChild(this.button('View', () => this.host.actions.toggleOverview(), 'overview'));
    const right = document.createElement('div');
    right.style.cssText = 'text-shadow:0 2px 0 #000;padding-right:10px;';
    right.append(`${info.levelLabel} ${info.levelName} | best ${info.best} | `);
    this.scoreEl.dataset.ui = 'score';
    this.scoreEl.textContent = '0';
    right.appendChild(this.scoreEl);
    bar.append(left, right);
    this.hud.appendChild(bar);
  }

  hideHud(): void {
    this.hud.style.display = 'none';
  }

  setScore(score: number): void {
    this.scoreEl.textContent = String(score);
  }

  showHint(_text: string | null): void {}

  private showOverlay(title: string, buttons: HTMLButtonElement[], kind: string): void {
    this.overlay.replaceChildren();
    this.overlay.style.display = 'block';
    this.overlay.dataset.kind = kind;
    const box = document.createElement('div');
    box.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;background:rgba(0,0,0,.6);padding:20px;border-radius:12px;pointer-events:auto;';
    const h = document.createElement('h2');
    h.textContent = title;
    box.appendChild(h);
    box.append(...buttons);
    this.overlay.appendChild(box);
  }

  showPause(): void {
    const a = this.host.actions;
    this.showOverlay(
      'Paused',
      [this.button('Resume', () => a.resume(), 'resume'), this.button('Restart', () => a.restart(), 'restart'), this.button('Levels', () => a.exitToMenu(), 'exit')],
      'pause',
    );
  }

  hidePause(): void {
    if (this.overlay.dataset.kind === 'pause') this.overlay.style.display = 'none';
  }

  showResults(r: LevelResult): void {
    const a = this.host.actions;
    const buttons = [this.button('Retry', () => a.restart(), 'restart'), this.button('Levels', () => a.exitToMenu(), 'exit')];
    if (r.won && r.hasNext) buttons.unshift(this.button('Next', () => a.nextLevel(), 'next'));
    this.showOverlay(
      r.won ? `Cleared! ${'*'.repeat(r.stars)} score ${r.score} (best ${r.best}, birds +${r.birdBonus})` : `Failed. Score ${r.score}`,
      buttons,
      'results',
    );
  }

  hideResults(): void {
    if (this.overlay.dataset.kind === 'results') this.overlay.style.display = 'none';
  }

  showHowTo(onClose?: () => void): void {
    onClose?.();
  }

  refresh(): void {
    if (this.currentMenu) this.showMenu(this.currentMenu);
  }
}
