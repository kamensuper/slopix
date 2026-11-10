import type { CampaignMeta, GameSettings, ProgressReader } from '../core/types';

const STORAGE_KEY = 'flockfury.save.v1';

export interface LevelRecord {
  best: number;
  stars: number;
}

export interface SaveData {
  version: 1;
  levels: Record<string, LevelRecord>;
  settings: GameSettings;
  flags: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: GameSettings = { musicVolume: 0.6, sfxVolume: 0.8, muted: false };

/** Minimal slice of the Storage API, so tests can pass an in-memory implementation. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    const storage = globalThis.localStorage;
    const probe = '__flockfury_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    // Private browsing or blocked storage: progress lives in memory for this session only.
    return null;
  }
}

function clampNumber(value: unknown, lo: number, hi: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback;
}

export interface RecordOutcome {
  previousBest: number;
  best: number;
  isNewBest: boolean;
  previousStars: number;
  stars: number;
}

/** Persistent campaign progress and settings (localStorage). */
export class SaveManager implements ProgressReader {
  private data: SaveData;
  /** Testing / debugging aid: treat every level as unlocked without touching the save file. */
  unlockAll = false;

  constructor(
    private readonly campaign: CampaignMeta,
    private readonly storage: StorageLike | null = defaultStorage(),
  ) {
    this.data = this.load();
  }

  private blank(): SaveData {
    return { version: 1, levels: {}, settings: { ...DEFAULT_SETTINGS }, flags: {} };
  }

  private load(): SaveData {
    const data = this.blank();
    if (!this.storage) return data;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return data;
      const parsed = JSON.parse(raw) as Partial<SaveData> | null;
      if (!parsed || typeof parsed !== 'object') return data;
      if (parsed.levels && typeof parsed.levels === 'object') {
        for (const [id, rec] of Object.entries(parsed.levels)) {
          if (!rec || typeof rec !== 'object') continue;
          data.levels[id] = {
            best: Math.round(clampNumber(rec.best, 0, 1e9, 0)),
            stars: Math.round(clampNumber(rec.stars, 0, 3, 0)),
          };
        }
      }
      if (parsed.settings && typeof parsed.settings === 'object') {
        data.settings = {
          musicVolume: clampNumber(parsed.settings.musicVolume, 0, 1, DEFAULT_SETTINGS.musicVolume),
          sfxVolume: clampNumber(parsed.settings.sfxVolume, 0, 1, DEFAULT_SETTINGS.sfxVolume),
          muted: parsed.settings.muted === true,
        };
      }
      if (parsed.flags && typeof parsed.flags === 'object') {
        for (const [key, value] of Object.entries(parsed.flags)) data.flags[key] = value === true;
      }
    } catch {
      // Corrupt save data: start fresh rather than crash.
    }
    return data;
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Quota exceeded or storage revoked: keep playing with in-memory progress.
    }
  }

  // ------------------------------------------------------------ settings & flags

  getSettings(): GameSettings {
    return { ...this.data.settings };
  }

  updateSettings(patch: Partial<GameSettings>): GameSettings {
    const s = this.data.settings;
    this.data.settings = {
      musicVolume: clampNumber(patch.musicVolume, 0, 1, s.musicVolume),
      sfxVolume: clampNumber(patch.sfxVolume, 0, 1, s.sfxVolume),
      muted: typeof patch.muted === 'boolean' ? patch.muted : s.muted,
    };
    this.persist();
    return this.getSettings();
  }

  getFlag(name: string): boolean {
    return this.data.flags[name] === true;
  }

  setFlag(name: string, value: boolean): void {
    this.data.flags[name] = value;
    this.persist();
  }

  // ------------------------------------------------------------ progress

  private record(levelIndex: number): LevelRecord | undefined {
    const meta = this.campaign.levels[levelIndex];
    return meta ? this.data.levels[meta.id] : undefined;
  }

  /** Stores the outcome of a won level; keeps the best score and the best star count. */
  recordResult(levelIndex: number, score: number, stars: number): RecordOutcome {
    const meta = this.campaign.levels[levelIndex];
    const previous = this.record(levelIndex);
    const previousBest = previous?.best ?? 0;
    const previousStars = previous?.stars ?? 0;
    const outcome: RecordOutcome = {
      previousBest,
      previousStars,
      best: Math.max(previousBest, Math.round(score)),
      stars: Math.max(previousStars, stars),
      isNewBest: score > previousBest,
    };
    if (meta) {
      this.data.levels[meta.id] = { best: outcome.best, stars: outcome.stars };
      this.persist();
    }
    return outcome;
  }

  resetProgress(): void {
    this.data.levels = {};
    this.data.flags = {};
    this.persist();
  }

  isLevelCompleted(levelIndex: number): boolean {
    return (this.record(levelIndex)?.stars ?? 0) > 0;
  }

  isLevelUnlocked(levelIndex: number): boolean {
    if (levelIndex < 0 || levelIndex >= this.campaign.levels.length) return false;
    if (this.unlockAll || levelIndex === 0) return true;
    return this.isLevelCompleted(levelIndex - 1) || this.isLevelCompleted(levelIndex);
  }

  isChapterUnlocked(chapterIndex: number): boolean {
    const first = this.campaign.chapters[chapterIndex]?.levels[0];
    return first ? this.isLevelUnlocked(first.index) : false;
  }

  getStars(levelIndex: number): number {
    return this.record(levelIndex)?.stars ?? 0;
  }

  getBest(levelIndex: number): number {
    return this.record(levelIndex)?.best ?? 0;
  }

  totalStars(): number {
    return this.campaign.levels.reduce((sum, level) => sum + this.getStars(level.index), 0);
  }

  maxStars(): number {
    return this.campaign.levels.length * 3;
  }

  chapterStars(chapterIndex: number): number {
    const chapter = this.campaign.chapters[chapterIndex];
    return chapter ? chapter.levels.reduce((sum, level) => sum + this.getStars(level.index), 0) : 0;
  }

  nextLevelIndex(): number {
    const levels = this.campaign.levels;
    for (const level of levels) {
      if (this.isLevelUnlocked(level.index) && !this.isLevelCompleted(level.index)) return level.index;
    }
    return Math.max(0, levels.length - 1);
  }
}
