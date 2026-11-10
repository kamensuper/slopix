/**
 * Procedural audio: every effect and the music are synthesised with the Web Audio API. Effects are
 * small recipes of oscillators and filtered noise; music is a tiny look-ahead step sequencer.
 */
import type { BirdType, GameSettings } from '../core/types';
import type { IAudioManager, MusicTrack, SfxName, SfxOptions } from './types';

interface Song {
  bpm: number;
  /** Semitone offsets from `root` per eighth note; null = rest. */
  melody: (number | null)[];
  bass: number[];
  root: number;
  wave: OscillatorType;
}

const SONGS: Record<Exclude<MusicTrack, 'none'>, Song> = {
  menu: { bpm: 112, root: 60, wave: 'square', melody: [0, null, 4, 7, 12, null, 7, 4, 5, null, 9, 12, 9, null, 7, null, 4, null, 7, 12, 11, null, 7, 5, 4, 2, 0, null, 2, null, null, null], bass: [0, 0, 5, 5, 7, 7, 0, 0] },
  grasslands: { bpm: 126, root: 62, wave: 'triangle', melody: [0, 4, 7, 4, 9, 7, 4, null, 5, 9, 12, 9, 7, null, 4, 2, 0, 4, 7, 12, 11, 7, 9, null, 7, 5, 4, 2, 0, null, null, null], bass: [0, 7, 5, 7, 0, 7, 5, 7] },
  desert: { bpm: 104, root: 57, wave: 'sawtooth', melody: [0, null, 1, 4, 5, null, 4, 1, 0, null, 7, null, 5, 4, 1, null, 0, 1, 4, 7, 8, null, 7, 4, 5, 4, 1, 0, null, null, null, null], bass: [0, 0, 1, 1, 5, 5, 0, 0] },
  snowlands: { bpm: 96, root: 64, wave: 'sine', melody: [12, null, 7, null, 4, 7, 12, null, 11, null, 7, null, 2, 7, 11, null, 9, null, 5, null, 0, 5, 9, null, 7, null, 4, 2, 0, null, null, null], bass: [0, 0, 7, 7, 5, 5, 7, 7] },
};

const BIRD_PITCH: Record<BirdType, number> = { red: 1, chuck: 1.35, bomb: 0.7, blues: 1.6, matilda: 0.9 };
const MIN_GAP_MS = 40;
const MAX_VOICES = 24;

const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);

export class AudioManager implements IAudioManager {
  unlocked = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private settings: GameSettings;
  private readonly lastPlayed = new Map<SfxName, number>();
  private voices = 0;
  private stretch: { gain: GainNode; osc: OscillatorNode } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private track: MusicTrack = 'none';
  private song: Song | null = null;
  private songGain: GainNode | null = null;
  private step = 0;
  private nextNoteTime = 0;
  private timer = 0;

  constructor(settings: GameSettings) {
    this.settings = { ...settings };
  }

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      const length = ctx.sampleRate;
      this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.applySettings(this.settings);
      const pending = this.track;
      this.track = 'none';
      if (pending !== 'none') this.playMusic(pending);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.unlocked = this.ctx.state === 'running' || this.ctx.state === 'suspended';
  }

  applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(settings.sfxVolume, t, 0.03);
    this.musicBus.gain.setTargetAtTime(settings.musicVolume * 0.35, t, 0.03);
  }

  setSuspended(suspended: boolean): void {
    if (!this.ctx) return;
    if (suspended) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  // ------------------------------------------------------------------ primitives

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; to?: number; delay?: number; pan?: number; attack?: number } = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    const vol = opts.vol ?? 0.3;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + (opts.attack ?? 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.route(osc, gain, opts.pan ?? 0, t, dur);
  }

  private noise(dur: number, opts: { freq?: number; q?: number; type?: BiquadFilterType; vol?: number; to?: number; delay?: number; pan?: number } = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.setValueAtTime(opts.freq ?? 1200, t);
    if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    filter.Q.value = opts.q ?? 1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.vol ?? 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    this.route(filter, gain, opts.pan ?? 0, t, dur, src);
  }

  private route(node: AudioNode, gain: GainNode, pan: number, t: number, dur: number, source?: AudioScheduledSourceNode): void {
    const ctx = this.ctx!;
    let out: AudioNode = gain;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      gain.connect(p);
      out = p;
    }
    node.connect(gain);
    out.connect(this.sfxBus);
    const src = source ?? (node as AudioScheduledSourceNode);
    src.start(t);
    src.stop(t + dur + 0.05);
    this.voices++;
    src.onended = () => {
      this.voices--;
      out.disconnect();
    };
  }

  // ------------------------------------------------------------------ effects

  play(name: SfxName, opts: SfxOptions = {}): void {
    if (!this.ctx || this.settings.muted || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? 0) < MIN_GAP_MS || this.voices > MAX_VOICES) return;
    this.lastPlayed.set(name, now);
    const k = (opts.intensity ?? 0.7) * (opts.volume ?? 1);
    const pan = opts.pan ?? 0;
    const rate = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12);
    const bp = opts.bird ? BIRD_PITCH[opts.bird] : 1;
    switch (name) {
      case 'ui_click':
        this.tone(660, 0.07, { type: 'square', vol: 0.12 });
        this.tone(990, 0.06, { type: 'square', vol: 0.08, delay: 0.03 });
        break;
      case 'ui_back':
        this.tone(520, 0.08, { type: 'square', vol: 0.1, to: 330 });
        break;
      case 'ui_toggle':
        this.tone(800, 0.05, { type: 'triangle', vol: 0.12 * k + 0.05 });
        break;
      case 'ui_denied':
        this.tone(180, 0.18, { type: 'square', vol: 0.12 });
        break;
      case 'ui_star': {
        const i = opts.index ?? 0;
        [0, 4, 7].forEach((s, j) => this.tone(midi(76 + i * 2 + s), 0.35, { type: 'triangle', vol: 0.18, delay: j * 0.05 }));
        this.noise(0.4, { freq: 6000, type: 'highpass', vol: 0.05 });
        break;
      }
      case 'ui_count':
      case 'score_tick':
        this.tone(1320 * rate, 0.05, { type: 'square', vol: 0.05 * k + 0.02, pan });
        break;
      case 'score_bonus':
        [0, 4, 7, 12].forEach((s, j) => this.tone(midi(79 + s), 0.18, { type: 'square', vol: 0.08, delay: j * 0.06, pan }));
        break;
      case 'sling_release':
        this.noise(0.18, { freq: 900, to: 3000, vol: 0.25 * k + 0.1, pan });
        this.tone(140, 0.15, { type: 'triangle', vol: 0.25, to: 70, pan });
        break;
      case 'bird_launch':
        this.tone(700 * bp * rate, 0.35, { type: 'sawtooth', vol: 0.09, to: 1100 * bp, pan, attack: 0.03 });
        this.tone(900 * bp * rate, 0.3, { type: 'square', vol: 0.05, to: 600 * bp, delay: 0.12, pan });
        break;
      case 'bird_ready':
        this.tone(900 * bp, 0.08, { type: 'triangle', vol: 0.08, to: 1300 * bp });
        break;
      case 'bird_impact':
        this.noise(0.12, { freq: 400, type: 'lowpass', vol: 0.35 * k, pan });
        this.tone(500 * bp * rate, 0.22, { type: 'square', vol: 0.07, to: 260 * bp, delay: 0.02, pan });
        break;
      case 'bird_poof':
        this.noise(0.3, { freq: 2500, to: 600, vol: 0.12, pan });
        break;
      case 'ability_boost':
        this.noise(0.35, { freq: 600, to: 4000, vol: 0.3, pan });
        this.tone(300, 0.3, { type: 'sawtooth', vol: 0.08, to: 1200, pan });
        break;
      case 'ability_split':
        [0, 0.05, 0.1].forEach((d, i) => this.tone(1200 + i * 250, 0.12, { type: 'triangle', vol: 0.1, delay: d, to: 1800, pan }));
        break;
      case 'ability_egg':
        this.tone(400, 0.25, { type: 'square', vol: 0.1, to: 160, pan });
        this.noise(0.2, { freq: 800, vol: 0.15, pan });
        break;
      case 'bomb_fuse':
        this.noise(0.6, { freq: 5000, type: 'highpass', vol: 0.1, pan });
        break;
      case 'explosion': {
        const size = opts.intensity ?? 1;
        this.noise(1.1 * size + 0.3, { freq: 1800, to: 120, type: 'lowpass', vol: 0.7 * size, pan });
        this.tone(90, 0.7, { type: 'sine', vol: 0.6 * size, to: 30, pan });
        break;
      }
      case 'wood_hit':
        this.tone(220 * rate, 0.09, { type: 'triangle', vol: 0.22 * k, to: 160, pan });
        this.noise(0.06, { freq: 900, q: 4, vol: 0.15 * k, pan });
        break;
      case 'wood_break':
        for (let i = 0; i < 3; i++) this.noise(0.12, { freq: 700 + i * 500, q: 3, vol: 0.25 * k + 0.05, delay: i * 0.035, pan });
        this.tone(160, 0.2, { type: 'triangle', vol: 0.2, to: 90, pan });
        break;
      case 'glass_hit':
        this.tone(2400 * rate, 0.15, { type: 'sine', vol: 0.12 * k, pan });
        this.tone(3700 * rate, 0.1, { type: 'sine', vol: 0.06 * k, pan });
        break;
      case 'glass_break':
        this.noise(0.4, { freq: 6000, type: 'highpass', vol: 0.3 * k + 0.08, pan });
        for (let i = 0; i < 5; i++) this.tone(2000 + Math.random() * 3000, 0.12, { type: 'sine', vol: 0.06, delay: Math.random() * 0.15, pan });
        break;
      case 'stone_hit':
        this.noise(0.15, { freq: 250, type: 'lowpass', vol: 0.4 * k, pan });
        this.tone(90 * rate, 0.15, { type: 'sine', vol: 0.3 * k, to: 60, pan });
        break;
      case 'stone_break':
        this.noise(0.5, { freq: 700, to: 150, type: 'lowpass', vol: 0.45 * k + 0.1, pan });
        this.tone(70, 0.4, { type: 'sine', vol: 0.35, to: 40, pan });
        break;
      case 'ground_hit':
        this.noise(0.12, { freq: 200, type: 'lowpass', vol: 0.3 * k, pan });
        break;
      case 'pig_hurt':
        this.tone(380 * rate, 0.18, { type: 'sawtooth', vol: 0.08, to: 260, pan });
        break;
      case 'pig_defeat':
        this.tone(500, 0.3, { type: 'square', vol: 0.09, to: 150, pan });
        this.noise(0.25, { freq: 1500, vol: 0.15, delay: 0.05, pan });
        break;
      case 'pig_oink':
        for (let i = 0; i < 3; i++) this.tone(300 + i * 40, 0.12, { type: 'sawtooth', vol: 0.08, to: 220, delay: i * 0.16, pan });
        break;
      case 'armor_hit':
        this.tone(1400 * rate, 0.25, { type: 'square', vol: 0.06 * k + 0.02, to: 1100, pan });
        this.tone(2100 * rate, 0.2, { type: 'sine', vol: 0.06, pan });
        break;
      case 'armor_break':
        this.tone(900, 0.4, { type: 'square', vol: 0.1, to: 300, pan });
        this.noise(0.3, { freq: 4000, vol: 0.15, pan });
        break;
      case 'level_start':
        [0, 4, 7].forEach((s, j) => this.tone(midi(67 + s), 0.15, { type: 'triangle', vol: 0.12, delay: j * 0.08 }));
        break;
      case 'level_win':
        [0, 4, 7, 12, 7, 12, 16].forEach((s, j) => this.tone(midi(72 + s), 0.25, { type: 'square', vol: 0.09, delay: j * 0.1 }));
        break;
      case 'level_fail':
        [7, 6, 5, 0].forEach((s, j) => this.tone(midi(60 + s), 0.35, { type: 'triangle', vol: 0.14, delay: j * 0.22 }));
        break;
      default:
        break;
    }
  }

  setStretch(amount: number | null): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (amount === null || amount < 0.05) {
      this.stretch?.gain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    if (!this.stretch) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(this.sfxBus);
      osc.start();
      this.stretch = { osc, gain };
    }
    this.stretch.osc.frequency.setTargetAtTime(60 + amount * 90, t, 0.05);
    this.stretch.gain.gain.setTargetAtTime(0.025 + amount * 0.05, t, 0.05);
  }

  setFlight(speed: number | null): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (speed === null) {
      this.wind?.gain.gain.setTargetAtTime(0, t, 0.15);
      return;
    }
    if (!this.wind) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.8;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start();
      this.wind = { gain, filter };
    }
    const s = Math.min(1, speed / 35);
    this.wind.filter.frequency.setTargetAtTime(400 + s * 1600, t, 0.1);
    this.wind.gain.gain.setTargetAtTime(s * 0.12, t, 0.1);
  }

  // ------------------------------------------------------------------ music

  playMusic(track: MusicTrack): void {
    if (track === this.track) return;
    this.track = track;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.songGain) {
      const old = this.songGain;
      old.gain.setTargetAtTime(0, t, 0.3);
      setTimeout(() => old.disconnect(), 1500);
      this.songGain = null;
    }
    clearInterval(this.timer);
    this.song = track === 'none' ? null : SONGS[track];
    if (!this.song) return;
    this.songGain = this.ctx.createGain();
    this.songGain.gain.setValueAtTime(0, t);
    this.songGain.gain.setTargetAtTime(1, t, 0.4);
    this.songGain.connect(this.musicBus);
    this.step = 0;
    this.nextNoteTime = t + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  private schedule(): void {
    const ctx = this.ctx;
    const song = this.song;
    const out = this.songGain;
    if (!ctx || !song || !out || ctx.state !== 'running') return;
    const eighth = 30 / song.bpm;
    while (this.nextNoteTime < ctx.currentTime + 0.2) {
      const t = this.nextNoteTime;
      const note = song.melody[this.step % song.melody.length];
      if (note !== null && note !== undefined) this.musicNote(out, midi(song.root + note), t, eighth * 0.9, song.wave, 0.12);
      if (this.step % 4 === 0) {
        const bass = song.bass[Math.floor(this.step / 4) % song.bass.length] ?? 0;
        this.musicNote(out, midi(song.root - 24 + bass), t, eighth * 3.6, 'triangle', 0.22);
      }
      if (this.step % 2 === 1) this.musicHat(out, t);
      this.step++;
      this.nextNoteTime += eighth;
    }
  }

  private musicNote(out: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(type === 'sawtooth' || type === 'square' ? vol * 0.45 : vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private musicHat(out: AudioNode, t: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
    src.stop(t + 0.05);
  }
}
