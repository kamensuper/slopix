/**
 * DOM interface layered over the canvas: title, chapter and level selection, HUD, pause menu,
 * results, settings, controls tutorial and credits. Plain DOM + CSS + inline SVG, no images.
 */
import { BIRDS, GAME_TAGLINE, GAME_TITLE, GAME_VERSION } from '../core/config';
import type { BirdType, LevelResult, StarThresholds } from '../core/types';
import { el, fmt, prefersReducedMotion, type Child } from './dom';
import { confettiBurst, sparkleBurst } from './effects';
import { SVG_SPRITE, icon } from './icons';
import { birdFace, featherArt, howToArt, pigFace, slingshotArt, worldScene } from './illustrations';
import { arrowNav, focusables, trapTab } from './nav';
import type { HudInfo, IUIManager, MenuScreen, UIHost } from './types';

type OverlayKind = 'pause' | 'results' | 'howto';
type SoundKind = 'ui_click' | 'ui_back';
interface ButtonOpts {
  action?: string;
  disabled?: boolean;
  sound?: SoundKind;
  icon?: string;
  cls?: string;
  primary?: boolean;
  label?: string;
}

const SCREEN_DEPTH: Record<MenuScreen, number> = { title: 0, chapters: 1, settings: 1, credits: 1, howto: 1, levels: 2 };
const BACK_TARGET: Partial<Record<MenuScreen, MenuScreen>> = { chapters: 'title', levels: 'chapters', settings: 'title', credits: 'title' };
const ROSTER: readonly BirdType[] = ['red', 'chuck', 'bomb', 'blues', 'matilda'];
const FAIL_LINES = [
  'The pigs are snorting with laughter. Show them who is boss!',
  'Tip: wood and glass crumble first. Hit the supports, not the top.',
  'Pig 1, flock 0. Try a different angle or a stronger pull.',
  'That smirk will not last. One more try!',
  'Chuck loves wood, Bomb loves stone. Pick the right tool.',
  'Even the best slingshot pilots miss. Go again!',
];

export class UIManager implements IUIManager {
  currentMenu: MenuScreen | null = null;
  private readonly menu = el('div', 'ui-layer ui-menu');
  private readonly hud = el('div', 'ui-layer ui-hud');
  private readonly overlay = el('div', 'ui-layer ui-overlay');
  private readonly dialog = el('div', 'ui-layer ui-dialog');
  private readonly hintEl = el('div', 'ui-hint');
  private readonly scoreEl = el('div', 'hud-score');
  private meterEl: HTMLElement | null = null;
  private thresholds: StarThresholds | null = null;
  private chapter = 0;
  private overlayKind: OverlayKind | null = null;
  private overlayClose: (() => void) | null = null;
  private dialogCancel: (() => void) | null = null;
  private returnFocus: HTMLElement | null = null;
  private shownScore = 0;
  private targetScore = 0;
  private scoreRaf = 0;
  private hintTimer = 0;
  private introTimer = 0;
  private menuToken = 0;
  private countRaf = 0;
  private readonly timers: number[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly host: UIHost,
  ) {
    this.hintEl.setAttribute('role', 'status');
    this.hintEl.setAttribute('aria-live', 'polite');
    this.scoreEl.dataset.ui = 'score';
    this.scoreEl.textContent = '0';
    const sprite = el('div', 'svg-sprite-host');
    sprite.innerHTML = SVG_SPRITE;
    sprite.setAttribute('aria-hidden', 'true');
    this.hud.append(this.hintEl);
    this.root.append(sprite, this.menu, this.hud, this.overlay, this.dialog);
    for (const layer of [this.menu, this.hud, this.overlay, this.dialog]) layer.hidden = true;
    this.root.classList.add('ui-root');
    this.applyMotion();
    document.addEventListener('keydown', this.onKey);
    if (typeof matchMedia === 'function') matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => this.applyMotion());
  }

  get blocksGameInput(): boolean {
    return this.currentMenu !== null || this.overlayKind !== null;
  }

  private get reduced(): boolean {
    return this.host.getSettings().reducedMotion || prefersReducedMotion();
  }

  private applyMotion(): void {
    this.root.classList.toggle('reduce-motion', this.reduced);
  }

  // ------------------------------------------------------------------ helpers

  private button(label: string, onClick: () => void, variant = 'orange', opts: ButtonOpts = {}): HTMLButtonElement {
    const b = el('button', `btn btn-${variant}${opts.cls ? ` ${opts.cls}` : ''}`);
    b.type = 'button';
    if (opts.icon) b.append(icon(opts.icon, 'btn-icon'));
    if (label) b.append(el('span', 'btn-label', [label]));
    if (opts.label) b.setAttribute('aria-label', opts.label);
    if (opts.action) b.dataset.action = opts.action;
    if (opts.primary) b.dataset.primary = '1';
    b.disabled = opts.disabled === true;
    b.addEventListener('click', () => {
      this.host.actions.sfx(opts.sound ?? 'ui_click');
      onClick();
    });
    return b;
  }

  private iconButton(name: string, label: string, onClick: () => void, action: string, cls = ''): HTMLButtonElement {
    const b = this.button('', onClick, 'round', { action, icon: name, cls, label });
    b.title = label;
    return b;
  }

  /** Round HUD buttons keep focus away from the game's Space / Enter shortcuts. */
  private hudButton(name: string, label: string, onClick: () => void, action: string): HTMLButtonElement {
    const b = this.iconButton(name, label, onClick, action, 'hud-btn');
    b.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') e.stopPropagation();
    });
    b.addEventListener('click', (e) => {
      if (e.detail > 0) b.blur();
    });
    return b;
  }

  private ribbon(text: string, tone = 'orange', id?: string): HTMLElement {
    const r = el('h2', `ribbon ribbon-${tone}`, [el('span', 'ribbon-text', [text])]);
    if (id) r.id = id;
    return r;
  }

  private panel(title: string, body: Child[], cls = '', tone = 'orange'): HTMLElement {
    const id = `ff-t-${Math.floor(Math.random() * 1e6)}`;
    const p = el('div', `panel ${cls}`, [this.ribbon(title, tone, id), ...body]);
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-labelledby', id);
    return p;
  }

  private backButton(target: MenuScreen): HTMLButtonElement {
    return this.button('Back', () => this.showMenu(target), 'red', { action: 'back', sound: 'ui_back', icon: 'back', cls: 'btn-back', label: 'Back' });
  }

  private starChip(have: number, total: number, cls = ''): HTMLElement {
    return el('div', `star-chip ${cls}`, [icon('star'), el('span', '', [`${have} / ${total}`])]);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
    cancelAnimationFrame(this.countRaf);
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, this.reduced ? Math.min(ms, 250) : ms));
  }

  private focusPrimary(root: HTMLElement): void {
    requestAnimationFrame(() => {
      if (!root.isConnected || root.closest('[inert]')) return;
      const target = root.querySelector<HTMLElement>('[data-primary]:not(:disabled)') ?? focusables(root)[0];
      target?.focus({ preventScroll: true });
    });
  }

  // ------------------------------------------------------------------ keyboard

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const dialogOpen = !this.dialog.hidden;
    const top = dialogOpen ? this.dialog : this.overlayKind ? this.overlay : this.currentMenu ? this.menu : null;
    if (!top) return;
    if (trapTab(e, top)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      if (dialogOpen) this.dialogCancel?.();
      else if (this.overlayKind === 'howto') this.overlayClose?.();
      else if (this.overlayKind === 'pause') this.host.actions.resume();
      else if (this.overlayKind === 'results') return;
      else if (this.currentMenu) {
        const back = BACK_TARGET[this.currentMenu];
        if (!back) return;
        this.host.actions.sfx('ui_back');
        this.showMenu(back);
      }
      e.preventDefault();
      return;
    }
    if (arrowNav(e, top)) e.preventDefault();
  };

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
    const prev = this.currentMenu;
    const dir = !prev || opts.instant ? 'none' : SCREEN_DEPTH[screen] >= SCREEN_DEPTH[prev] ? 'fwd' : 'back';
    this.currentMenu = screen;
    this.menuToken++;
    this.menu.hidden = false;
    this.menu.classList.remove('closing');
    this.menu.dataset.screen = screen;
    const pane = el('div', `screen-pane${dir === 'none' && !prev ? ' enter-fade' : ` enter-${dir}`}`, [this.buildMenu(screen)]);
    pane.dataset.screen = screen;
    for (const old of Array.from(this.menu.querySelectorAll(':scope > .screen-pane'))) this.retire(old as HTMLElement, dir === 'fwd' ? 'fwd' : dir === 'back' ? 'back' : 'none');
    this.menu.prepend(pane);
    this.focusPrimary(pane);
  }

  private retire(node: HTMLElement, dir: 'fwd' | 'back' | 'none' | 'fade'): void {
    node.inert = true;
    node.setAttribute('aria-hidden', 'true');
    if (dir === 'none' || this.reduced) {
      node.remove();
      return;
    }
    node.classList.add('leaving', `leave-${dir}`);
    window.setTimeout(() => node.remove(), 260);
  }

  hideMenus(): void {
    this.currentMenu = null;
    const token = ++this.menuToken;
    if (this.menu.hidden) return;
    for (const old of Array.from(this.menu.querySelectorAll(':scope > .screen-pane'))) this.retire(old as HTMLElement, 'fade');
    if (this.reduced) {
      this.menu.hidden = true;
      this.menu.replaceChildren();
      return;
    }
    this.menu.classList.add('closing');
    window.setTimeout(() => {
      if (token !== this.menuToken) return;
      this.menu.hidden = true;
      this.menu.classList.remove('closing');
      this.menu.replaceChildren();
    }, 280);
  }

  private buildMenu(screen: MenuScreen): HTMLElement {
    const { progress, campaign } = this.host;
    switch (screen) {
      case 'title':
        return this.buildTitle();
      case 'chapters': {
        const cards = campaign.chapters.map((ch) => {
          const unlocked = progress.isChapterUnlocked(ch.index);
          const have = progress.chapterStars(ch.index);
          const total = ch.levels.length * 3;
          const art = el('span', 'chapter-art', [worldScene(ch.theme)]);
          if (!unlocked) art.append(el('span', 'chapter-lock', [icon('lock')]));
          const bar = el('span', 'chapter-bar', [el('span', 'chapter-bar-fill')]);
          (bar.firstChild as HTMLElement).style.width = `${total ? Math.round((have / total) * 100) : 0}%`;
          const card = el('button', `chapter-card theme-${ch.theme}`, [
            art,
            el('span', 'chapter-info', [
              el('span', 'chapter-num', [`Chapter ${ch.index + 1}`]),
              el('span', 'chapter-name', [ch.title]),
              el('span', 'chapter-sub', [unlocked ? ch.subtitle : 'Locked: finish the previous chapter']),
              unlocked && el('span', 'chapter-progress', [icon('star'), el('span', '', [`${have} / ${total}`]), bar]),
            ]),
          ]);
          card.type = 'button';
          card.dataset.action = `chapter-${ch.index}`;
          card.disabled = !unlocked;
          card.setAttribute('aria-label', unlocked ? `${ch.title}, ${have} of ${total} stars` : `${ch.title}, locked`);
          card.addEventListener('click', () => {
            this.host.actions.sfx('ui_click');
            this.chapter = ch.index;
            this.showMenu('levels');
          });
          return card;
        });
        const firstOpen = campaign.chapters.find((c) => progress.isChapterUnlocked(c.index) && progress.chapterStars(c.index) < c.levels.length * 3)?.index ?? 0;
        cards[firstOpen]?.setAttribute('data-primary', '1');
        return el('div', 'screen screen-chapters', [
          el('div', 'screen-head', [this.backButton('title'), this.ribbon('Choose a world'), el('span', 'head-spacer')]),
          el('div', 'chapter-row', cards),
        ]);
      }
      case 'levels': {
        const ch = campaign.chapters[this.chapter] ?? campaign.chapters[0]!;
        const caption = el('div', 'level-caption', ['Pick a level']);
        caption.setAttribute('aria-live', 'polite');
        const tiles = ch.levels.map((lvl) => {
          const unlocked = progress.isLevelUnlocked(lvl.index);
          const stars = progress.getStars(lvl.index);
          const best = progress.getBest(lvl.index);
          const tile = el('button', `level-tile${unlocked ? '' : ' locked'}${stars === 3 ? ' perfect' : ''}`, [
            el('span', 'tile-num', unlocked ? [String(lvl.number)] : [icon('lock')]),
            unlocked && el('span', 'tile-name', [lvl.name]),
            el('span', 'tile-stars', [0, 1, 2].map((i) => el('span', i < stars ? 'on' : 'off', [icon(i < stars ? 'star' : 'starEmpty')]))),
          ]);
          tile.type = 'button';
          tile.dataset.action = `level-${lvl.index}`;
          tile.disabled = !unlocked;
          tile.setAttribute('aria-label', unlocked ? `Level ${lvl.id}, ${lvl.name}, ${stars} of 3 stars` : `Level ${lvl.id}, locked`);
          const describe = (): void => {
            caption.textContent = unlocked ? `${lvl.id}  ${lvl.name}${best > 0 ? `  ·  Best ${fmt(best)}` : ''}` : 'Locked: clear the previous level first';
          };
          tile.addEventListener('focus', describe);
          tile.addEventListener('pointerenter', describe);
          tile.addEventListener('click', () => {
            this.host.actions.sfx('ui_click');
            this.host.actions.playLevel(lvl.index);
          });
          return tile;
        });
        const next = ch.levels.find((l) => progress.isLevelUnlocked(l.index) && progress.getStars(l.index) === 0) ?? ch.levels.find((l) => progress.isLevelUnlocked(l.index));
        if (next) tiles[ch.levels.indexOf(next)]?.setAttribute('data-primary', '1');
        return el('div', `screen screen-levels theme-${ch.theme}`, [
          el('div', 'screen-head', [this.backButton('chapters'), this.ribbon(ch.title, ch.theme === 'desert' ? 'orange' : ch.theme === 'snowlands' ? 'blue' : 'green'), this.starChip(progress.chapterStars(ch.index), ch.levels.length * 3, 'head-stars')]),
          el('div', 'level-board', [el('div', 'level-grid', tiles), caption]),
        ]);
      }
      case 'settings':
        return el('div', 'screen screen-settings', [
          el('div', 'screen-head', [this.backButton('title'), el('span', 'head-spacer'), el('span', 'head-spacer')]),
          this.panel('Settings', [this.settingsBody(true)], 'panel-settings'),
        ]);
      case 'credits':
        return el('div', 'screen screen-credits', [
          el('div', 'screen-head', [this.backButton('title'), el('span', 'head-spacer'), el('span', 'head-spacer')]),
          this.panel(
            'Credits',
            [
              el('div', 'credits-crest', [birdFace('red'), slingshotArt(), pigFace(false)]),
              el('p', 'credits-title', [`${GAME_TITLE} v${GAME_VERSION}`]),
              el('dl', 'credits-list', [
                el('dt', '', ['Art & animation']),
                el('dd', '', ['Every sprite and scene is drawn live with Canvas 2D paths and gradients.']),
                el('dt', '', ['Sound & music']),
                el('dd', '', ['All effects and the four music themes are synthesised on the fly with Web Audio.']),
                el('dt', '', ['Physics']),
                el('dd', '', ['Planck.js (MIT).']),
                el('dt', '', ['Type']),
                el('dd', '', ['Lilita One and Fredoka (SIL Open Font License).']),
                el('dt', '', ['Built with']),
                el('dd', '', ['TypeScript and Vite.']),
              ]),
              el('p', 'muted', ['Inspired by the classic bird-flinging games of 2009 to 2012. Not affiliated with or endorsed by Rovio.']),
            ],
            'panel-credits',
          ),
        ]);
      default:
        return el('div');
    }
  }

  private logo(): HTMLElement {
    const words = GAME_TITLE.toUpperCase().split(/\s+/);
    let n = 0;
    const row = (word: string, i: number): HTMLElement =>
      el(
        'span',
        `logo-word logo-word-${i === 0 ? 'a' : 'b'}`,
        Array.from(word).map((ch) => {
          const k = n++;
          const letter = el('span', 'lt', [el('span', 'lt-back', [ch]), el('span', 'lt-front', [ch])]);
          letter.style.setProperty('--i', String(k));
          return letter;
        }),
      );
    const h1 = el('h1', 'logo-title', words.map(row));
    h1.setAttribute('aria-label', GAME_TITLE);
    for (const w of Array.from(h1.children)) w.setAttribute('aria-hidden', 'true');
    return h1;
  }

  private buildTitle(): HTMLElement {
    const { progress } = this.host;
    const feathers = ['#e23b2e', '#58b7ee', '#f8cf1c', '#f5f0e6', '#e23b2e'].map((c, i) => {
      const f = featherArt(c, `feather f${i}`);
      return f;
    });
    const logoWrap = el('div', 'title-logo', [
      ...feathers,
      el('div', 'logo-peek peek-bird', [birdFace('red')]),
      el('div', 'logo-peek peek-pig', [pigFace(true)]),
      this.logo(),
      el('div', 'logo-tag', [el('span', '', [GAME_TAGLINE])]),
    ]);
    const play = this.button('Play', () => this.showMenu('chapters'), 'green', { action: 'play', icon: 'play', cls: 'big', primary: true });
    const tiles = el('div', 'tile-row', [
      this.button('How to play', () => this.showHowTo(), 'blue', { action: 'howto', icon: 'help', cls: 'btn-tile' }),
      this.button('Settings', () => this.showMenu('settings'), 'blue', { action: 'settings', icon: 'gear', cls: 'btn-tile' }),
      this.button('Credits', () => this.showMenu('credits'), 'blue', { action: 'credits', icon: 'heart', cls: 'btn-tile' }),
    ]);
    return el('div', 'screen screen-title', [
      logoWrap,
      el('div', 'title-menu', [play, tiles, this.starChip(progress.totalStars(), progress.maxStars(), 'title-stars')]),
      el('div', 'title-version', [`v${GAME_VERSION}`]),
    ]);
  }

  // ------------------------------------------------------------------ settings

  private settingsBody(withReset: boolean): HTMLElement {
    const { actions } = this.host;
    const s = this.host.getSettings();
    const row = (iconName: string, label: string, control: HTMLElement, sub?: string): HTMLElement =>
      el('label', 'setting', [el('span', 'setting-label', [icon(iconName, 'setting-icon'), el('span', 'setting-text', [el('span', '', [label]), sub && el('small', '', [sub])])]), control]);
    const slider = (iconName: string, label: string, value: number, key: 'musicVolume' | 'sfxVolume'): HTMLElement => {
      const input = el('input', 'slider');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      input.value = String(Math.round(value * 100));
      input.dataset.setting = key;
      const readout = el('output', 'slider-value', [`${input.value}`]);
      const paint = (): void => {
        input.style.setProperty('--fill', `${input.value}%`);
        readout.textContent = input.value;
        input.setAttribute('aria-valuetext', `${input.value} percent`);
      };
      paint();
      input.addEventListener('input', () => {
        paint();
        actions.changeSettings({ [key]: Number(input.value) / 100 });
      });
      input.addEventListener('change', () => actions.sfx(key === 'sfxVolume' ? 'wood_hit' : 'ui_toggle'));
      return row(iconName, label, el('span', 'slider-wrap', [input, readout]));
    };
    const toggle = (iconName: string, label: string, key: 'muted' | 'reducedMotion', value: boolean, sub?: string): HTMLElement => {
      const input = el('input', 'switch');
      input.type = 'checkbox';
      input.checked = value;
      input.dataset.setting = key;
      input.setAttribute('role', 'switch');
      input.addEventListener('change', () => {
        actions.changeSettings({ [key]: input.checked });
        if (key === 'reducedMotion') this.applyMotion();
        actions.sfx('ui_toggle');
      });
      return row(iconName, label, input, sub);
    };
    const body = el('div', 'settings', [
      slider('music', 'Music', s.musicVolume, 'musicVolume'),
      slider('speaker', 'Sound effects', s.sfxVolume, 'sfxVolume'),
      toggle('mute', 'Mute all', 'muted', s.muted),
      toggle('wind', 'Reduced motion', 'reducedMotion', s.reducedMotion, 'Calmer camera, less shake and flashing'),
    ]);
    if (withReset) {
      body.append(this.button('Reset progress', () => this.confirmReset(), 'red', { action: 'reset', icon: 'trash', cls: 'small btn-reset' }));
    }
    return body;
  }

  private confirmReset(): void {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const close = (): void => {
      this.dialog.hidden = true;
      this.dialog.replaceChildren();
      this.dialogCancel = null;
      this.menu.inert = this.overlayKind !== null;
      this.overlay.inert = false;
      opener?.focus({ preventScroll: true });
    };
    const confirm = this.button(
      'Erase it',
      () => {
        close();
        this.host.actions.resetProgress();
        this.showHint('Progress erased', 2.5);
      },
      'red',
      { action: 'reset-confirm', icon: 'trash' },
    );
    const cancel = this.button('Keep my stars', close, 'green', { action: 'reset-cancel', icon: 'check', sound: 'ui_back', primary: true });
    const panel = this.panel('Erase progress?', [el('div', 'dialog-art', [pigFace(true)]), el('p', 'dialog-text', ['All stars, best scores and unlocked levels will be lost. This cannot be undone.']), el('div', 'row', [confirm, cancel])], 'panel-dialog', 'red');
    panel.setAttribute('role', 'alertdialog');
    this.dialogCancel = (): void => {
      this.host.actions.sfx('ui_back');
      close();
    };
    this.dialog.replaceChildren(panel);
    this.dialog.hidden = false;
    this.menu.inert = true;
    this.overlay.inert = true;
    this.focusPrimary(this.dialog);
  }

  // ------------------------------------------------------------------ HUD

  showHud(info: HudInfo): void {
    const { actions } = this.host;
    this.hud.hidden = false;
    this.thresholds = info.starThresholds ?? null;
    const left = el('div', 'hud-left', [
      this.hudButton('pause', 'Pause', () => actions.requestPause(), 'pause'),
      this.hudButton('restart', 'Restart', () => actions.restart(), 'restart'),
      this.hudButton('overview', 'Overview', () => actions.toggleOverview(), 'overview'),
    ]);
    this.meterEl = null;
    const plaque = el('div', 'hud-plaque', [el('span', 'hud-score-label', ['Score']), this.scoreEl]);
    if (this.thresholds) {
      const fill = el('span', 'meter-fill');
      const mk = (cls: string, at: number): HTMLElement => {
        const m = el('span', `meter-star ${cls}`, [icon('star')]);
        m.style.left = `${at}%`;
        return m;
      };
      const two = (this.thresholds.two / this.thresholds.three) * 100;
      this.meterEl = el('div', 'hud-meter', [el('span', 'meter-track', [fill]), mk('s2', two), mk('s3', 100)]);
      this.meterEl.setAttribute('aria-hidden', 'true');
      plaque.append(this.meterEl);
    }
    const chip = el('div', 'hud-chip', [el('b', '', [info.levelLabel]), el('span', 'hud-chip-name', [info.levelName]), info.best > 0 && el('span', 'hud-chip-best', [`Best ${fmt(info.best)}`])]);
    const intro = el('div', 'level-intro', [el('span', 'intro-num', [`Level ${info.levelLabel}`]), el('span', 'intro-name', [info.levelName])]);
    this.hud.replaceChildren(el('div', 'hud-bar', [left, el('div', 'hud-right', [plaque, chip])]), intro, this.hintEl);
    clearTimeout(this.introTimer);
    this.introTimer = window.setTimeout(() => intro.remove(), 3200);
    this.updateMeter();
  }

  hideHud(): void {
    this.hud.hidden = true;
    clearTimeout(this.introTimer);
    this.showHint(null);
  }

  setScore(score: number, instant = false): void {
    const gained = score > this.targetScore;
    this.targetScore = score;
    if (instant || this.reduced) {
      cancelAnimationFrame(this.scoreRaf);
      this.scoreRaf = 0;
      this.shownScore = score;
      this.scoreEl.textContent = fmt(score);
      this.updateMeter();
      return;
    }
    if (gained) {
      this.scoreEl.classList.remove('bump');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('bump');
    }
    if (this.scoreRaf) return;
    const tick = (): void => {
      const diff = this.targetScore - this.shownScore;
      this.shownScore = Math.abs(diff) < 10 ? this.targetScore : this.shownScore + diff * 0.18;
      this.scoreEl.textContent = fmt(this.shownScore);
      this.updateMeter();
      this.scoreRaf = this.shownScore === this.targetScore ? 0 : requestAnimationFrame(tick);
    };
    this.scoreRaf = requestAnimationFrame(tick);
  }

  private updateMeter(): void {
    if (!this.meterEl || !this.thresholds) return;
    const p = Math.max(0, Math.min(1, this.shownScore / this.thresholds.three));
    this.meterEl.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
    this.meterEl.querySelector('.s2')?.classList.toggle('lit', this.shownScore >= this.thresholds.two);
    this.meterEl.querySelector('.s3')?.classList.toggle('lit', this.shownScore >= this.thresholds.three);
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

  private syncInert(): void {
    const covered = this.overlayKind !== null;
    this.menu.inert = covered;
    this.hud.inert = covered;
  }

  private openOverlay(kind: OverlayKind, content: HTMLElement, onEscape: (() => void) | null = null): void {
    if (this.overlayKind === null && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) this.returnFocus = document.activeElement;
    this.overlayKind = kind;
    this.overlayClose = onEscape;
    this.overlay.hidden = false;
    this.overlay.dataset.kind = kind;
    this.overlay.replaceChildren(content);
    this.syncInert();
    this.focusPrimary(content);
  }

  private closeOverlay(kind: OverlayKind): void {
    if (this.overlayKind !== kind) return;
    this.overlayKind = null;
    this.overlayClose = null;
    this.overlay.hidden = true;
    this.overlay.replaceChildren();
    this.clearTimers();
    this.syncInert();
    const back = this.returnFocus;
    this.returnFocus = null;
    if (back?.isConnected && !back.closest('[inert]')) back.focus({ preventScroll: true });
    else if (this.currentMenu) this.focusPrimary(this.menu);
  }

  showPause(): void {
    const { actions } = this.host;
    this.openOverlay(
      'pause',
      this.panel(
        'Paused',
        [
          el('div', 'pause-body', [
            el('div', 'stack pause-actions', [
              this.button('Resume', () => actions.resume(), 'green', { action: 'resume', icon: 'play', cls: 'big', primary: true }),
              this.button('Restart', () => actions.restart(), 'orange', { action: 'restart', icon: 'restart' }),
              this.button('How to play', () => this.showHowTo(() => this.showPause()), 'blue', { action: 'howto', icon: 'help' }),
              this.button('Levels', () => actions.exitToMenu(), 'red', { action: 'levels', sound: 'ui_back', icon: 'levels' }),
            ]),
            this.settingsBody(false),
          ]),
        ],
        'panel-pause',
      ),
      () => actions.resume(),
    );
  }

  hidePause(): void {
    this.closeOverlay('pause');
  }

  showResults(result: LevelResult): void {
    const { actions } = this.host;
    this.clearTimers();
    const reduced = this.reduced;
    const stars = el('div', 'result-stars', [0, 1, 2].map((i) => el('span', `star star-${i}`, [el('span', 'star-empty', [icon('starEmpty')]), el('span', 'star-lit', [icon('star')])])));
    const scoreEl = el('div', 'result-score', ['0']);
    const row = (label: Child[], value: string, i: number, cls = ''): HTMLElement => {
      const r = el('div', `result-row ${cls}`, [el('span', '', label), el('b', '', [value])]);
      r.style.setProperty('--d', `${0.25 + i * 0.14}s`);
      return r;
    };
    const rows: Child[] = result.won
      ? [
          row(['Destruction'], fmt(result.baseScore), 0),
          row(['Level clear'], fmt(result.clearBonus), 1),
          result.unusedBirds > 0 && row([icon('feather', 'row-icon'), `Unused birds × ${result.unusedBirds}`], fmt(result.birdBonus), 2, 'row-bonus'),
        ]
      : [row(['Pigs left standing'], String(result.pigsTotal - result.pigsDefeated), 0)];

    const t = result.starThresholds;
    let target: string | null = null;
    if (result.won && result.stars < 3) target = result.stars < 2 ? `Score ${fmt(t.two)} for two stars` : `Score ${fmt(t.three)} for three stars`;
    const best = result.won
      ? result.isNewBest
        ? el('div', 'new-best', [icon('trophy'), el('span', '', ['New best!'])])
        : el('div', 'result-best', [`Best: ${fmt(result.best)}`])
      : el('div', 'result-best', [result.best > 0 ? `Best: ${fmt(result.best)}` : 'No best score yet']);

    const buttons = el('div', 'result-buttons', [
      this.button('Levels', () => actions.exitToMenu(), 'red', { action: 'levels', sound: 'ui_back', icon: 'levels' }),
      this.button('Retry', () => actions.restart(), result.won ? 'orange' : 'green', { action: 'retry', icon: 'restart', primary: !result.won }),
      this.button('Next', () => actions.nextLevel(), 'green', { action: 'next', icon: 'next', cls: 'btn-next', disabled: !result.won || !result.hasNext || !result.nextUnlocked, primary: result.won }),
    ]);

    const head = result.won
      ? [el('div', 'result-rays'), el('div', 'result-level', [`${result.levelId}  ${result.levelName}`]), stars, scoreEl]
      : [el('div', 'result-pig', [pigFace(true)]), el('div', 'result-level', [`${result.levelId}  ${result.levelName}`]), el('p', 'fail-line', [FAIL_LINES[(result.levelIndex + result.birdsUsed) % FAIL_LINES.length]!]), scoreEl];
    const panel = this.panel(result.won ? 'Level cleared!' : 'The pigs win…', [...head, el('div', 'result-rows', rows), result.won && target && el('div', 'result-target', [icon('star'), el('span', '', [target])]), best, buttons], result.won ? 'panel-win' : 'panel-lose', result.won ? 'green' : 'red');
    this.openOverlay('results', panel);

    const fx = el('div', 'fx-layer');
    this.overlay.append(fx);
    const centre = (node: HTMLElement): { x: number; y: number } => {
      const a = node.getBoundingClientRect();
      const b = this.overlay.getBoundingClientRect();
      return { x: a.left + a.width / 2 - b.left, y: a.top + a.height / 2 - b.top };
    };

    // Score counts up, then the stars land one by one.
    const countStart = performance.now() + (reduced ? 0 : 350);
    const duration = reduced ? 1 : 1000;
    let lastTick = 0;
    const count = (): void => {
      if (this.overlayKind !== 'results') return;
      const now = performance.now();
      const p = Math.max(0, Math.min(1, (now - countStart) / duration));
      scoreEl.textContent = fmt(result.score * (1 - (1 - p) ** 3));
      if (p > 0 && p < 1 && now - lastTick > 70) {
        lastTick = now;
        actions.sfx('ui_count', { intensity: 0.3 + p * 0.7, rate: 0.8 + p * 0.8 });
      }
      if (p < 1) this.countRaf = requestAnimationFrame(count);
    };
    this.countRaf = requestAnimationFrame(count);

    const starStart = 1150;
    const step = 380;
    for (let i = 0; i < result.stars; i++) {
      this.later(starStart + step * i, () => {
        const slot = stars.children[i] as HTMLElement | undefined;
        if (!slot) return;
        slot.classList.add('lit');
        actions.sfx('ui_star', { index: i });
        if (!this.reduced) {
          const c = centre(slot);
          sparkleBurst(fx, c.x, c.y, 10 + i * 3, 70 + i * 20);
        }
      });
    }
    const doneAt = starStart + step * Math.max(0, result.stars) + 250;
    if (result.won) {
      this.later(doneAt, () => {
        if (result.stars === 3 && !this.reduced) {
          const c = centre(stars);
          confettiBurst(fx, c.x, c.y, 34);
        }
        if (result.isNewBest) {
          panel.querySelector('.new-best')?.classList.add('show');
          actions.sfx('score_bonus');
        }
      });
    }
  }

  hideResults(): void {
    this.closeOverlay('results');
  }

  showHowTo(onClose?: () => void): void {
    const close = (): void => {
      this.closeOverlay('howto');
      onClose?.();
    };
    const step = (n: number, kind: 'drag' | 'release' | 'tap', title: string, text: string): HTMLElement =>
      el('li', 'howto-step', [el('span', 'step-num', [String(n)]), el('div', 'step-art', [howToArt(kind)]), el('b', 'step-title', [title]), el('span', 'step-text', [text])]);
    const roster = ROSTER.map((type) => {
      const b = BIRDS[type];
      const badge = el('span', 'bird-badge', [birdFace(type)]);
      badge.style.setProperty('--c', b.color);
      return el('li', 'bird-chip', [badge, el('span', 'bird-info', [el('b', '', [b.name]), el('span', '', [b.blurb])])]);
    });
    this.openOverlay(
      'howto',
      this.panel(
        'How to play',
        [
          el('div', 'panel-scroll', [
            el('ol', 'howto-steps', [
              step(1, 'drag', 'Pull back', 'Drag the bird back in the slingshot. The dotted line shows its path.'),
              step(2, 'release', 'Let go', 'Release to fling. Topple towers and pop every pig.'),
              step(3, 'tap', 'Tap for power', 'Tap or click while a bird is flying to trigger its power.'),
            ]),
            el('h3', 'howto-sub', ['The flock']),
            el('ul', 'bird-roster', roster),
            el('p', 'howto-keys', [el('b', '', ['Look around: ']), 'drag the background, scroll or pinch to zoom, or use the overview button. ', el('b', '', ['Keyboard: ']), 'arrows aim, Space launches or uses powers, R restarts, O overview, Esc pauses.']),
          ]),
          this.button('Got it!', close, 'green', { action: 'close-howto', icon: 'check', cls: 'big', primary: true }),
        ],
        'panel-howto',
      ),
      close,
    );
  }

  refresh(): void {
    this.applyMotion();
    if (this.currentMenu) this.showMenu(this.currentMenu, { instant: true });
  }
}
