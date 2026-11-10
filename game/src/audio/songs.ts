/**
 * Original music arrangements. Each song is an 8-bar loop on a 16th-note grid:
 * chords (tone offsets from the key root), a melody written as eighth-note tokens
 * ("16" = new note, "." = hold, "-" = rest) and a drum / bass / arpeggio feel.
 */
import type { MusicTrack } from './types';

export type SongId = Exclude<MusicTrack, 'none'>;

export interface Song {
  bpm: number;
  /** 0..0.35: how late the off-beat eighths land. */
  swing: number;
  /** MIDI note of the key root. */
  root: number;
  /** One chord per bar; tones are semitone offsets from the root, lowest first. */
  chords: number[][];
  /** One string per bar, eight eighth-note tokens each. Offsets are relative to the root. */
  melody: string[];
  lead: { wave: OscillatorType; cutoff: number; vol: number; vibrato: number };
  pad: { wave: OscillatorType; cutoff: number; vol: number } | null;
  /** Arpeggio indices into the chord tones, one per step of `every` sixteenths; null = rest. */
  arp: { pattern: (number | null)[]; every: 1 | 2; wave: OscillatorType; cutoff: number; vol: number; octave: number } | null;
  bass: { pattern: (0 | 1 | 2 | null)[]; wave: OscillatorType; vol: number };
  /** Step positions (0..15) within the bar. */
  drums: { kick: number[]; snare: number[]; hat: number[]; perc: number[]; shaker: number[]; kit: 'pop' | 'hand' | 'soft' };
  /** Bell sparkle played on the chord tones. */
  bells: { every: number; vol: number } | null;
}

export const SONGS: Record<SongId, Song> = {
  // Playful and sunny: C major, ukulele-ish pluck over a bouncy kick / clap.
  menu: {
    bpm: 108,
    swing: 0.2,
    root: 60,
    chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7], [4, 7, 11], [5, 9, 12], [7, 11, 14]],
    melody: ['16 . 19 . 24 . 19 16', '21 . 19 . 16 . 12 .', '17 . 21 . 24 . 21 17', '19 . 23 . 19 . 16 14', '16 . 19 . 24 . 28 24', '23 . 19 . 16 . 19 23', '24 . 21 . 17 . 21 24', '23 . 19 . 14 . - -'],
    lead: { wave: 'triangle', cutoff: 3200, vol: 0.14, vibrato: 0.004 },
    pad: { wave: 'triangle', cutoff: 900, vol: 0.05 },
    arp: { pattern: [0, 1, 2, 1, 0, 1, 2, 1], every: 2, wave: 'triangle', cutoff: 2400, vol: 0.06, octave: 12 },
    bass: { pattern: [0, null, null, 0, null, 2, null, null, 0, null, null, 0, null, 1, null, 2], wave: 'triangle', vol: 0.22 },
    drums: { kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14], perc: [], shaker: [], kit: 'pop' },
    bells: null,
  },
  // Bright and wind-in-the-grass: D major, driving shuffle, flowing arps.
  grasslands: {
    bpm: 120,
    swing: 0.22,
    root: 62,
    chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14], [5, 9, 12], [7, 11, 14]],
    melody: ['16 . 19 . 24 . 21 19', '23 . 19 . 14 . 19 23', '24 . 21 . 16 . 21 24', '21 . 17 . 21 . 24 21', '16 . 19 . 24 . 28 24', '26 . 23 . 19 . 23 26', '24 21 17 . 21 24 . 21', '23 . 19 . 14 . - -'],
    lead: { wave: 'triangle', cutoff: 3600, vol: 0.15, vibrato: 0.005 },
    pad: { wave: 'sawtooth', cutoff: 700, vol: 0.03 },
    arp: { pattern: [0, 2, 1, 2, 0, 2, 1, 2], every: 2, wave: 'square', cutoff: 1800, vol: 0.035, octave: 12 },
    bass: { pattern: [0, null, 0, null, 2, null, 0, null, 0, null, 0, null, 2, null, 1, null], wave: 'triangle', vol: 0.24 },
    drums: { kick: [0, 6, 8, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], perc: [], shaker: [], kit: 'pop' },
    bells: null,
  },
  // Hot and exotic: A hijaz scale over hand drums and a droning fifth.
  desert: {
    bpm: 100,
    swing: 0.08,
    root: 57,
    chords: [[0, 7, 12], [1, 5, 8], [0, 7, 12], [1, 5, 8], [0, 7, 12], [1, 5, 8], [7, 11, 14], [0, 7, 12]],
    melody: ['12 . 13 . 16 . 13 12', '13 . 17 . 20 . 17 13', '16 . 17 . 19 . 17 16', '13 . 12 . 13 . 16 .', '19 . 20 . 24 . 20 19', '20 . 17 . 13 . 17 20', '19 . 23 . 26 . 23 19', '24 . 20 . 16 . 12 .'],
    lead: { wave: 'sawtooth', cutoff: 1900, vol: 0.1, vibrato: 0.01 },
    pad: { wave: 'sawtooth', cutoff: 500, vol: 0.035 },
    arp: { pattern: [0, 1, 2, 1], every: 2, wave: 'triangle', cutoff: 1500, vol: 0.05, octave: 12 },
    bass: { pattern: [0, null, null, null, 0, null, 2, null, null, null, 0, null, null, 2, null, null], wave: 'sine', vol: 0.3 },
    drums: { kick: [], snare: [], hat: [], perc: [0, 3, 6, 8, 10, 14], shaker: [2, 4, 6, 10, 12, 14], kit: 'hand' },
    bells: null,
  },
  // Cold and magical: E aeolian, glassy bells over a slow pad.
  snowlands: {
    bpm: 84,
    swing: 0,
    root: 64,
    chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17], [0, 3, 7], [8, 12, 15], [10, 14, 17], [0, 3, 7]],
    melody: ['12 . . . 15 . 14 .', '15 . . . 12 . 8 .', '14 . . . 10 . 14 .', '17 . 14 . 10 . . .', '12 . 15 . 19 . . .', '20 . 15 . 12 . 8 .', '14 . . . 17 . 14 10', '12 . . . . . . .'],
    lead: { wave: 'sine', cutoff: 3000, vol: 0.12, vibrato: 0.003 },
    pad: { wave: 'triangle', cutoff: 1100, vol: 0.07 },
    arp: { pattern: [0, 1, 2, 1, 2, 1, 0, null], every: 2, wave: 'sine', cutoff: 3600, vol: 0.05, octave: 24 },
    bass: { pattern: [0, null, null, null, null, null, null, null, 0, null, null, null, 2, null, null, null], wave: 'sine', vol: 0.26 },
    drums: { kick: [0, 10], snare: [], hat: [], perc: [], shaker: [4, 12], kit: 'soft' },
    bells: { every: 4, vol: 0.05 },
  },
};

export interface MelodyNote {
  /** Sixteenth-note position within the bar. */
  pos: number;
  /** Semitones from the key root. */
  note: number;
  /** Length in sixteenths. */
  len: number;
}

/** Parses the eighth-note tokens of a bar into notes with lengths. */
export function parseBar(bar: string): MelodyNote[] {
  const out: MelodyNote[] = [];
  const tokens = bar.trim().split(/\s+/);
  let last: MelodyNote | null = null;
  tokens.forEach((tok, i) => {
    if (tok === '.') {
      if (last) last.len += 2;
    } else if (tok === '-') {
      last = null;
    } else {
      last = { pos: i * 2, note: Number(tok), len: 2 };
      out.push(last);
    }
  });
  return out;
}
