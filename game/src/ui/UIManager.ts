/**
 * DOM interface layered over the canvas: title, chapter and level selection, HUD, pause menu,
 * results, settings, controls tutorial and credits.
 */
import { BIRDS, GAME_TAGLINE, GAME_TITLE, GAME_VERSION } from '../core/config';
import type { LevelResult } from '../core/types';
import type { HudInfo, IUIManager, MenuScreen, UIHost } from './types';

type Child = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', children: Child[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const child of children) if (child) node.append(child);
  return node;
}

const STAR = '★';
const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

export class UIManager implements IUIManager {
  currentMenu: MenuScreen | null = null;
  private readonly menu = el('div', 'ui-layer ui-menu');
  private readonly hud = el('div', 'ui-layer ui-hud');
  private readonly overlay = el('div', 'ui-layer ui-overlay');
  private readonly hintEl = el('div', 'ui-hint');
  private readonly scoreEl = el('div', 'hud-score');
  private chapter = 0;
  private overlayKind: 'pause' | 'results' | 'howto' | null = null;
  private shownScore = 0;
  private targetScore = 0;
  private scoreRaf = 0;
  private hintTimer = 0;
  private readonly timers: number[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly host: UIHost,
  ) {
    this.hud.append(this.hintEl);
    this.root.append(this.menu, this.hud, this.overlay);
    this.hud.hidden = true;
    this.overlay.hidden = true;
    this.menu.hidden = true;
  }

  get blocksGameInput(): boolean {
    return this.currentMenu !== null || this.overlayKind !== null;
  }

  // ------------------------------------------------------------------ helpers

  private button(label: string, onClick: () => void, variant = 'orange', opts: { action?: string; disabled?: boolean; sound?: 'ui_click' | 'ui_back' } = {}): HTMLButtonElement {
    const b = el('button', `btn btn-${variant}`, [label]);
    b.type = 'button';
    if (opts.action) b.dataset.action = opts.action;
    b.disabled = opts.disabled === true;
    b.addEventListener('click', () => {
      this.host.actions.sfx(opts.sound ?? 'ui_click');
      onClick();
    });
    return b;
  }

  private iconButton(icon: string, label: string, onClick: () => void, action: string): HTMLButtonElement {
    const b = this.button(icon, onClick, 'round', { action });
    b.setAttribute('aria-label', label);
    b.title = label;
    return b;
  }

  private panel(title: string, body: Child[], cls = ''): HTMLElement {
    return el('div', `panel ${cls}`, [el('h2', 'panel-title', [title]), ...body]);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  // ------------------------------------------------------------------ menus

  showMenu(screen: MenuScreen, opts: { chapter?: number; instant?: boolean } = {}): void {
    if (screen === 'howto') {
      this.showHowTo();
      return;
    }
    this.hideHud();
    this.hidePause();
    this.hideResults();
    if (opts.chapter !== undefined) this.chapter = opts.chapter;
    this.currentMenu = screen;
    this.menu.hidden = false;
    this.menu.replaceChildren(this.buildMenu(screen));
    this.menu.dataset.screen = screen;
  }

  private buildMenu(screen: MenuScreen): HTMLElement {
    const { actions, progress, campaign } = this.host;
    switch (screen) {
      case 'title': {
        const logo = el('div', 'logo', [el('h1', 'logo-title', [GAME_TITLE]), el('p', 'logo-tag', [GAME_TAGLINE])]);
        const stars = el('div', 'star-total', [`${STAR} ${progress.totalStars()} / ${progress.maxStars()}`]);
        return el('div', 'screen screen-title', [
          logo,
          el('div', 'stack', [
            this.button('Play', () => this.showMenu('chapters'), 'green big', { action: 'play' }),
            el('div', 'row', [
              this.button('How to play', () => this.showHowTo(), 'blue', { action: 'howto' }),
              this.button('Settings', () => this.showMenu('settings'), 'blue', { action: 'settings' }),
              this.button('Credits', () => this.showMenu('credits'), 'blue', { action: 'credits' }),
            ]),
          ]),
          stars,
        ]);
      }
      case 'chapters': {
        const cards = campaign.chapters.map((ch) => {
          const unlocked = progress.isChapterUnlocked(ch.index);
          const card = el('button', `chapter-card theme-${ch.theme}`, [
            el('div', 'chapter-num', [`Chapter ${ch.index + 1}`]),
            el('div', 'chapter-name', [ch.title]),
            el('div', 'chapter-sub', [unlocked ? ch.subtitle : 'Locked: finish the previous chapter']),
            el('div', 'chapter-stars', [unlocked ? `${STAR} ${progress.chapterStars(ch.index)} / ${ch.levels.length * 3}` : '🔒']),
          ]);
          card.type = 'button';
          card.dataset.action = `chapter-${ch.index}`;
          card.disabled = !unlocked;
          card.addEventListener('click', () => {
            this.host.actions.sfx('ui_click');
            this.chapter = ch.index;
            this.showMenu('levels');
          });
          return card;
        });
        return el('div', 'screen', [
          el('h2', 'screen-title-text', ['Choose a chapter']),
          el('div', 'chapter-row', cards),
          this.button('Back', () => this.showMenu('title'), 'red', { action: 'back', sound: 'ui_back' }),
        ]);
      }
      case 'levels': {
        const ch = campaign.chapters[this.chapter] ?? campaign.chapters[0]!;
        const tiles = ch.levels.map((lvl) => {
          const unlocked = progress.isLevelUnlocked(lvl.index);
          const stars = progress.getStars(lvl.index);
          const tile = el('button', 'level-tile', [
            el('div', 'level-num', [unlocked ? String(lvl.number) : '🔒']),
            el('div', 'level-stars', [0, 1, 2].map((i) => el('span', i < stars ? 'on' : 'off', [STAR]))),
          ]);
          tile.type = 'button';
          tile.title = lvl.name;
          tile.dataset.action = `level-${lvl.index}`;
          tile.disabled = !unlocked;
          tile.addEventListener('click', () => {
            actions.sfx('ui_click');
            actions.playLevel(lvl.index);
          });
          return tile;
        });
        return el('div', 'screen', [
          el('h2', 'screen-title-text', [`${ch.index + 1}. ${ch.title}`]),
          el('div', 'chapter-stars-line', [`${STAR} ${progress.chapterStars(ch.index)} / ${ch.levels.length * 3}`]),
          el('div', `level-grid theme-${ch.theme}`, tiles),
          this.button('Back', () => this.showMenu('chapters'), 'red', { action: 'back', sound: 'ui_back' }),
        ]);
      }
      case 'settings':
        return el('div', 'screen', [this.panel('Settings', [this.settingsBody(true)]), this.button('Back', () => this.showMenu('title'), 'red', { action: 'back', sound: 'ui_back' })]);
      case 'credits':
        return el('div', 'screen', [
          this.panel('Credits', [
            el('p', '', [`${GAME_TITLE} v${GAME_VERSION}`]),
            el('p', '', ['An original slingshot physics game. All artwork is drawn procedurally with Canvas 2D and every sound is synthesised live with Web Audio.']),
            el('p', '', ['Physics: Planck.js (MIT). Fonts: Lilita One and Fredoka (SIL Open Font License). Built with TypeScript and Vite.']),
            el('p', 'muted', ['Inspired by the classic bird-flinging games of 2009 to 2012. Not affiliated with or endorsed by Rovio.']),
          ]),
          this.button('Back', () => this.showMenu('title'), 'red', { action: 'back', sound: 'ui_back' }),
        ]);
      default:
        return el('div');
    }
  }

  private settingsBody(withReset: boolean): HTMLElement {
    const { actions } = this.host;
    const s = this.host.getSettings();
    const slider = (label: string, value: number, key: 'musicVolume' | 'sfxVolume'): HTMLElement => {
      const input = el('input', 'slider');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.value = String(Math.round(value * 100));
      input.dataset.setting = key;
      input.addEventListener('input', () => actions.changeSettings({ [key]: Number(input.value) / 100 }));
      input.addEventListener('change', () => actions.sfx('ui_toggle'));
      return el('label', 'setting', [el('span', '', [label]), input]);
    };
    const mute = el('input', 'toggle');
    mute.type = 'checkbox';
    mute.checked = s.muted;
    mute.dataset.setting = 'muted';
    mute.addEventListener('change', () => {
      actions.changeSettings({ muted: mute.checked });
      actions.sfx('ui_toggle');
    });
    const body = el('div', 'settings', [slider('Music', s.musicVolume, 'musicVolume'), slider('Sound effects', s.sfxVolume, 'sfxVolume'), el('label', 'setting', [el('span', '', ['Mute all']), mute])]);
    if (withReset) {
      const reset = this.button(
        'Reset progress',
        () => {
          if (window.confirm('Erase all stars and unlocked levels?')) actions.resetProgress();
        },
        'red small',
        { action: 'reset' },
      );
      body.append(reset);
    }
    return body;
  }

  hideMenus(): void {
    this.currentMenu = null;
    this.menu.hidden = true;
    this.menu.replaceChildren();
  }

  // ------------------------------------------------------------------ HUD

  showHud(info: HudInfo): void {
    const { actions } = this.host;
    this.hud.hidden = false;
    this.scoreEl.dataset.ui = 'score';
    const left = el('div', 'hud-left', [
      this.iconButton('❚❚', 'Pause', () => actions.requestPause(), 'pause'),
      this.iconButton('↻', 'Restart', () => actions.restart(), 'restart'),
      this.iconButton('⤢', 'Overview', () => actions.toggleOverview(), 'overview'),
    ]);
    const right = el('div', 'hud-right', [this.scoreEl, el('div', 'hud-best', [`${info.levelLabel} ${info.levelName}  ·  Best ${fmt(info.best)}`])]);
    this.hud.replaceChildren(el('div', 'hud-bar', [left, right]), this.hintEl);
  }

  hideHud(): void {
    this.hud.hidden = true;
    this.showHint(null);
  }

  setScore(score: number, instant = false): void {
    this.targetScore = score;
    if (instant) {
      this.shownScore = score;
      this.scoreEl.textContent = fmt(score);
      return;
    }
    if (this.scoreRaf) return;
    const tick = (): void => {
      const diff = this.targetScore - this.shownScore;
      this.shownScore = Math.abs(diff) < 10 ? this.targetScore : this.shownScore + diff * 0.18;
      this.scoreEl.textContent = fmt(this.shownScore);
      this.scoreRaf = this.shownScore === this.targetScore ? 0 : requestAnimationFrame(tick);
    };
    this.scoreRaf = requestAnimationFrame(tick);
  }

  showHint(text: string | null, seconds = 3): void {
    clearTimeout(this.hintTimer);
    if (!text) {
      this.hintEl.classList.remove('show');
      return;
    }
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('show'), seconds * 1000);
  }

  // ------------------------------------------------------------------ overlays

  private openOverlay(kind: 'pause' | 'results' | 'howto', content: HTMLElement): void {
    this.overlayKind = kind;
    this.overlay.hidden = false;
    this.overlay.dataset.kind = kind;
    this.overlay.replaceChildren(content);
  }

  private closeOverlay(kind: 'pause' | 'results' | 'howto'): void {
    if (this.overlayKind !== kind) return;
    this.overlayKind = null;
    this.overlay.hidden = true;
    this.overlay.replaceChildren();
    this.clearTimers();
  }

  showPause(): void {
    const { actions } = this.host;
    this.openOverlay(
      'pause',
      this.panel('Paused', [
        el('div', 'stack', [
          this.button('Resume', () => actions.resume(), 'green big', { action: 'resume' }),
          this.button('Restart', () => actions.restart(), 'orange', { action: 'restart' }),
          this.button('How to play', () => this.showHowTo(() => this.showPause()), 'blue', { action: 'howto' }),
          this.button('Levels', () => actions.exitToMenu(), 'red', { action: 'levels', sound: 'ui_back' }),
        ]),
        this.settingsBody(false),
      ]),
    );
  }

  hidePause(): void {
    this.closeOverlay('pause');
  }

  showResults(result: LevelResult): void {
    const { actions } = this.host;
    this.clearTimers();
    const stars = el('div', 'result-stars', [0, 1, 2].map(() => el('span', 'star', [STAR])));
    const scoreEl = el('div', 'result-score', ['0']);
    const rows: Child[] = result.won
      ? [
          el('div', 'result-row', [el('span', '', ['Destruction']), el('b', '', [fmt(result.baseScore)])]),
          el('div', 'result-row', [el('span', '', ['Level clear']), el('b', '', [fmt(result.clearBonus)])]),
          el('div', 'result-row', [el('span', '', [`Unused birds × ${result.unusedBirds}`]), el('b', '', [fmt(result.birdBonus)])]),
        ]
      : [el('div', 'result-row', [el('span', '', ['Pigs left']), el('b', '', [String(result.pigsTotal - result.pigsDefeated)])])];
    const best = el('div', 'result-best', [result.isNewBest ? 'New best score!' : `Best: ${fmt(result.best)}`]);
    const panel = this.panel(
      result.won ? 'Level cleared!' : 'The pigs win…',
      [
        el('div', 'result-level', [`${result.levelId}  ${result.levelName}`]),
        result.won && stars,
        scoreEl,
        ...rows,
        best,
        el('div', 'row', [
          this.button('Levels', () => actions.exitToMenu(), 'red', { action: 'levels', sound: 'ui_back' }),
          this.button('Retry', () => actions.restart(), 'orange', { action: 'retry' }),
          this.button('Next', () => actions.nextLevel(), 'green', { action: 'next', disabled: !result.won || !result.hasNext || !result.nextUnlocked }),
        ]),
      ],
      result.won ? 'panel-win' : 'panel-lose',
    );
    this.openOverlay('results', panel);
    // Count the score up, then reveal the stars one by one.
    const start = performance.now();
    const duration = 900;
    const count = (): void => {
      if (this.overlayKind !== 'results') return;
      const t = Math.min(1, (performance.now() - start) / duration);
      scoreEl.textContent = fmt(result.score * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
    for (let i = 0; i < result.stars; i++) {
      this.later(duration + 350 * i, () => {
        stars.children[i]?.classList.add('lit');
        actions.sfx('ui_star', { index: i });
      });
    }
  }

  hideResults(): void {
    this.closeOverlay('results');
  }

  showHowTo(onClose?: () => void): void {
    const birds = (['red', 'chuck', 'bomb', 'blues', 'matilda'] as const).map((type) =>
      el('li', '', [el('span', 'dot', []), el('b', '', [BIRDS[type].name]), ` ${BIRDS[type].blurb}`]),
    );
    birds.forEach((li, i) => ((li.firstChild as HTMLElement).style.background = BIRDS[(['red', 'chuck', 'bomb', 'blues', 'matilda'] as const)[i]!].color));
    const close = (): void => {
      this.closeOverlay('howto');
      onClose?.();
    };
    this.openOverlay(
      'howto',
      this.panel('How to play', [
        el('ul', 'howto', [
          el('li', '', [el('b', '', ['Aim: ']), 'drag the bird in the slingshot backwards, then let go. The dotted line shows its path.']),
          el('li', '', [el('b', '', ['Powers: ']), 'tap or click anywhere while a bird is flying.']),
          el('li', '', [el('b', '', ['Look around: ']), 'drag the background, scroll or pinch to zoom, or use the ⤢ button.']),
          el('li', '', [el('b', '', ['Keyboard: ']), 'arrows aim, Space launches / uses powers, R restarts, O overview, Esc pauses.']),
        ]),
        el('ul', 'howto birds', birds),
        this.button('Got it!', close, 'green big', { action: 'close-howto' }),
      ]),
    );
  }

  refresh(): void {
    if (this.currentMenu) this.showMenu(this.currentMenu);
  }
}
