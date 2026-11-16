/**
 * AUDIO CONTRACT - the game talks to audio only through IAudioManager.
 * All sound is synthesised at runtime with the Web Audio API (no audio files).
 */
import type { BirdType, GameSettings } from '../core/types';

export type MusicTrack = 'menu' | 'grasslands' | 'desert' | 'snowlands' | 'storm' | 'ironworks' | 'celestial' | 'none';

export type SfxName =
  // interface
  | 'ui_click'
  | 'ui_back'
  | 'ui_toggle'
  | 'ui_denied'
  /** Star reveal on the results screen; opts.index = 0, 1, 2 (rising pitch). */
  | 'ui_star'
  /** Rapid tick while a score counts up. */
  | 'ui_count'
  // slingshot + birds
  /** Rubber snap when the bird is released; opts.intensity = pull strength 0..1. */
  | 'sling_release'
  /** Launch cry of the bird; opts.bird selects the voice. */
  | 'bird_launch'
  /** The next bird hops into the pouch; opts.bird selects the voice. */
  | 'bird_ready'
  /** Thud + squawk when a bird hits something; opts.intensity 0..1, opts.bird. */
  | 'bird_impact'
  /** Feathery puff when a spent bird disappears. */
  | 'bird_poof'
  // abilities
  | 'ability_boost'
  | 'ability_split'
  /** Brawn tips over into the anvil drop. */
  | 'ability_slam'
  /** Rime's frost burst: a glassy rush. */
  | 'ability_freeze'
  /** Jolt's lightning: opts.intensity grows with the number of things it ran through. */
  | 'ability_shock'
  /** Nova's gravity well opening (a falling drone) ... */
  | 'ability_gravity'
  /** ... and snapping shut. */
  | 'gravity_release'
  /** Short sizzle when Ember's fuse is lit by the first impact. */
  | 'fuse'
  /** A bird springs off rubber. */
  | 'bounce'
  /** A crystal rings out as it shatters. */
  | 'crystal_ring'
  | 'ice_crack'
  | 'balloon_pop'
  | 'rope_snap'
  /** opts.intensity scales size (Ember = 1, crates about 0.85, quakes about 0.6). */
  | 'explosion'
  // materials: opts.intensity 0..1 scales loudness and brightness
  | 'wood_hit'
  | 'wood_break'
  | 'glass_hit'
  | 'glass_break'
  | 'stone_hit'
  | 'stone_break'
  | 'metal_hit'
  | 'metal_break'
  /** Dull thump of something landing on the ground. */
  | 'ground_hit'
  // foes
  | 'foe_hurt'
  | 'foe_defeat'
  /** Idle grunt / snicker; also used when the foes laugh at a failed level. */
  | 'foe_grunt'
  /** Clank of a hit on a helmet or armour. */
  | 'armor_hit'
  | 'armor_break'
  // score + level flow
  /** Small blip for floating score numbers. */
  | 'score_tick'
  /** Bigger chime for the 10,000 unused-bird bonus. */
  | 'score_bonus'
  | 'level_start'
  | 'level_win'
  | 'level_fail'
  /** An achievement unlocked. */
  | 'achievement';

export interface SfxOptions {
  /** 0..1, default 1. Multiplied with the effects volume. */
  volume?: number;
  /** Playback pitch factor, default 1. */
  rate?: number;
  /** Stereo position, -1 (left) .. 1 (right). */
  pan?: number;
  /** 0..1 strength of the event; default 0.7. */
  intensity?: number;
  bird?: BirdType;
  index?: number;
}

export interface IAudioManager {
  /** True once the AudioContext is running (after the first user gesture). */
  readonly unlocked: boolean;
  /** Call from a user gesture (pointerdown / keydown). Safe to call repeatedly. */
  unlock(): void;
  /** Fire-and-forget sound effect. Must be cheap and rate-limited internally (mass destruction triggers dozens per second). */
  play(name: SfxName, opts?: SfxOptions): void;
  /** Continuous rubber-band creak while aiming. amount = pull 0..1, null stops it. */
  setStretch(amount: number | null): void;
  /** Continuous wind whoosh while a bird flies. speed in m/s (0..40), null stops it. */
  setFlight(speed: number | null): void;
  /** Cross-fades to the given music track ('none' fades the music out). */
  playMusic(track: MusicTrack): void;
  /** Applies volumes and mute. */
  applySettings(settings: GameSettings): void;
  /** Suspends / resumes all audio output (page hidden, game paused in the background). */
  setSuspended(suspended: boolean): void;
}
