// TEMPORARY STUB - replaced by the real procedural audio engine.
import type { GameSettings } from '../core/types';
import type { IAudioManager, MusicTrack, SfxName, SfxOptions } from './types';

export class AudioManager implements IAudioManager {
  unlocked = false;

  constructor(_settings: GameSettings) {}

  unlock(): void {
    this.unlocked = true;
  }

  play(_name: SfxName, _opts?: SfxOptions): void {}
  setStretch(_amount: number | null): void {}
  setFlight(_speed: number | null): void {}
  playMusic(_track: MusicTrack): void {}
  applySettings(_settings: GameSettings): void {}
  setSuspended(_suspended: boolean): void {}
}
