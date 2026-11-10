/**
 * Procedural audio: every effect and the music are synthesised live with the Web Audio API.
 * Effects are layered recipes (body + transient + tail) with per-sound rate limiting, random pitch
 * variation and a shared reverb; music is a look-ahead step sequencer playing the arrangements
 * in songs.ts, cross-faded between tracks.
 */
import type { BirdType, GameSettings } from '../core/types';
import { SONGS, parseBar, type MelodyNote, type Song } from './songs';
import type { IAudioManager, MusicTrack, SfxName, SfxOptions } from './types';

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  to?: number;
  delay?: number;
  pan?: number;
  attack?: number;
  wet?: number;
  /** Low-pass cutoff in Hz. */
  lp?: number;
  q?: number;
  detune?: number;
}
interface NoiseOpts {
  freq?: number;
  q?: number;
  type?: BiquadFilterType;
  vol?: number;
  to?: number;
  delay?: number;
  pan?: number;
  attack?: number;
  wet?: number;
}
interface VoiceOpts {
  vol?: number;
  delay?: number;
  pan?: number;
  wet?: number;
  /** Pitch multiplier reached about a third of the way through. */
  mid?: number;
  /** Pitch wobble in Hz (0 = clean, 30+ = growl). */
  growl?: number;
  type?: OscillatorType;
}

/** Formants (centre Hz, relative level) that give each bird its voice. */
const BIRD_VOICE: Record<BirdType, { f0: number; to: number; dur: number; formants: [number, number][]; mid: number; growl: number }> = {
  red: { f0: 470, to: 360, dur: 0.3, formants: [[800, 1], [1350, 0.7], [2800, 0.25]], mid: 1.45, growl: 0 },
  chuck: { f0: 760, to: 1250, dur: 0.22, formants: [[650, 0.8], [2300, 1], [3300, 0.3]], mid: 0.9, growl: 22 },
  bomb: { f0: 190, to: 130, dur: 0.42, formants: [[520, 1], [900, 0.8], [2200, 0.2]], mid: 1.2, growl: 40 },
  blues: { f0: 1250, to: 1750, dur: 0.14, formants: [[950, 0.8], [3000, 1]], mid: 1.2, growl: 0 },
  matilda: { f0: 360, to: 250, dur: 0.34, formants: [[700, 1], [1150, 0.8], [2500, 0.2]], mid: 1.3, growl: 14 },
};

/** Sounds that must always play, even when the mix is crowded. */
const PRIORITY = new Set<SfxName>(['explosion', 'level_win', 'level_fail', 'level_start', 'bird_launch', 'sling_release', 'ability_boost', 'ability_split', 'ability_egg', 'bomb_fuse', 'pig_defeat', 'armor_break', 'score_bonus']);
const MIN_GAP_MS: Partial<Record<SfxName, number>> = {
  ui_click: 30,
  ui_count: 45,
  score_tick: 60,
  wood_hit: 55,
  stone_hit: 70,
  glass_hit: 55,
  metal_hit: 60,
  ground_hit: 90,
  wood_break: 70,
  stone_break: 90,
  glass_break: 80,
  metal_break: 90,
  pig_hurt: 120,
  pig_oink: 220,
  armor_hit: 80,
  bird_impact: 90,
  explosion: 120,
  level_win: 800,
  level_fail: 800,
  bird_launch: 150,
};
const DEFAULT_GAP_MS = 40;
const MAX_VOICES = 56;

const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export class AudioManager implements IAudioManager {
  unlocked = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private noiseBuffer!: AudioBuffer;
  private settings: GameSettings;
  private readonly lastPlayed = new Map<SfxName, number>();
  private recent: number[] = [];
  private variant = 0;
  private voices = 0;
  private stretch: { gain: GainNode; osc: OscillatorNode; filter: BiquadFilterNode; hiss: GainNode } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private track: MusicTrack = 'none';
  private song: Song | null = null;
  private melody: MelodyNote[][] = [];
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
      comp.threshold.value = -16;
      comp.ratio.value = 5;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      this.master.connect(comp).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);

      const length = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

      // Small shared room: decaying stereo noise.
      this.reverb = ctx.createConvolver();
      const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 1.3), ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2.6;
      }
      this.reverb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      this.reverb.connect(wet).connect(this.master);
      const musicSend = ctx.createGain();
      musicSend.gain.value = 0.22;
      this.musicBus.connect(musicSend).connect(this.reverb);

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
    this.master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.04);
    this.sfxBus.gain.setTargetAtTime(settings.sfxVolume * 1.5, t, 0.04);
    this.musicBus.gain.setTargetAtTime(settings.musicVolume * 0.45, t, 0.05);
  }

  setSuspended(suspended: boolean): void {
    if (!this.ctx) return;
    if (suspended) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  // ------------------------------------------------------------------ primitives

  /** Wires a finished voice into the buses, starts its sources and cleans up when they end. */
  private emit(out: GainNode, sources: AudioScheduledSourceNode[], t: number, dur: number, pan = 0, wet = 0.1, offset = 0): void {
    const ctx = this.ctx!;
    let node: AudioNode = out;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(p);
      node = p;
    }
    node.connect(this.sfxBus);
    let send: GainNode | null = null;
    if (wet > 0) {
      send = ctx.createGain();
      send.gain.value = wet;
      node.connect(send);
      send.connect(this.reverb);
    }
    let remaining = sources.length;
    this.voices += remaining;
    for (const s of sources) {
      if (s instanceof AudioBufferSourceNode) s.start(t, offset);
      else s.start(t);
      s.stop(t + dur + 0.08);
      s.onended = () => {
        this.voices--;
        if (--remaining === 0) {
          out.disconnect();
          if (node !== out) node.disconnect();
          send?.disconnect();
        }
      };
    }
  }

  private envelope(gain: GainNode, t: number, vol: number, attack: number, dur: number): void {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private tone(freq: number, dur: number, o: ToneOpts = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    this.envelope(gain, t, o.vol ?? 0.3, o.attack ?? 0.006, dur);
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      f.Q.value = o.q ?? 0.7;
      osc.connect(f).connect(gain);
    } else osc.connect(gain);
    this.emit(gain, [osc], t, dur, o.pan, o.wet);
  }

  private noise(dur: number, o: NoiseOpts = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = rand(0.85, 1.2);
    const filter = ctx.createBiquadFilter();
    filter.type = o.type ?? 'bandpass';
    filter.frequency.setValueAtTime(o.freq ?? 1200, t);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t + dur);
    filter.Q.value = o.q ?? 1;
    const gain = ctx.createGain();
    this.envelope(gain, t, o.vol ?? 0.3, o.attack ?? 0.003, dur);
    src.connect(filter).connect(gain);
    this.emit(gain, [src], t, dur, o.pan, o.wet, rand(0, 1.5));
  }

  /** Sawtooth through a bank of formant filters: birds, pigs. */
  private voice(f0: number, to: number, dur: number, formants: [number, number][], o: VoiceOpts = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, f0 * (o.mid ?? 1)), t + dur * 0.35);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const env = ctx.createGain();
    this.envelope(env, t, o.vol ?? 0.2, Math.min(0.02, dur * 0.2), dur);
    const sources: AudioScheduledSourceNode[] = [osc];
    for (const [freq, level] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 5;
      const g = ctx.createGain();
      g.gain.value = level * 2.2;
      osc.connect(bp).connect(g).connect(env);
    }
    if (o.growl) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.growl;
      const depth = ctx.createGain();
      depth.gain.value = f0 * 0.08;
      lfo.connect(depth).connect(osc.frequency);
      sources.push(lfo);
    }
    this.emit(env, sources, t, dur, o.pan, o.wet ?? 0.08);
  }

  /** Struck metal: inharmonic partials that ring at different rates. */
  private clang(base: number, dur: number, vol: number, o: { delay?: number; pan?: number; wet?: number } = {}): void {
    const ratios = [1, 2.76, 5.4, 8.93, 13.3];
    const levels = [1, 0.55, 0.38, 0.22, 0.12];
    const decay = [1, 0.62, 0.42, 0.3, 0.2];
    ratios.forEach((r, i) => this.tone(base * r * rand(0.995, 1.005), dur * decay[i]!, { vol: vol * levels[i]!, delay: o.delay, pan: o.pan, wet: o.wet ?? 0.18, attack: 0.002 }));
  }

  /** Bell / glass chime. */
  private chime(base: number, dur: number, vol: number, delay = 0, pan = 0): void {
    [1, 2.01, 3.98, 6.2].forEach((r, i) => this.tone(base * r, dur / (1 + i * 0.7), { vol: vol / (1 + i * 0.9), delay, pan, wet: 0.35, attack: 0.002 }));
  }

  // ------------------------------------------------------------------ effects

  play(name: SfxName, opts: SfxOptions = {}): void {
    if (!this.ctx || this.settings.muted || this.ctx.state !== 'running') return;
    const now = performance.now();
    const priority = PRIORITY.has(name) || name.startsWith('ui_');
    if (now - (this.lastPlayed.get(name) ?? 0) < (MIN_GAP_MS[name] ?? DEFAULT_GAP_MS)) return;
    if (this.voices > MAX_VOICES && !priority) return;
    this.lastPlayed.set(name, now);
    // Crowding: when many sounds fire at once, each gets quieter so mass collapses stay clean.
    this.recent = this.recent.filter((n) => now - n < 180);
    const crowd = priority ? 0 : this.recent.length;
    this.recent.push(now);
    const squash = 1 / (1 + Math.max(0, crowd - 2) * 0.16);
    this.variant = (this.variant + 1) % 3;

    const k = clamp01(opts.intensity ?? 0.7);
    const lv = (0.16 + 0.84 * k) * (opts.volume ?? 1) * squash;
    const br = 0.55 + 0.45 * k;
    const pan = opts.pan ?? 0;
    const rate = (opts.rate ?? 1) * rand(0.93, 1.07);
    const bird: BirdType = opts.bird ?? 'red';
    const v = this.variant;

    switch (name) {
      // ---------------------------------------------------------- interface
      case 'ui_click':
        this.tone(520 * rate, 0.07, { type: 'triangle', vol: 0.2, to: 360, wet: 0.05 });
        this.tone(1040 * rate, 0.05, { type: 'sine', vol: 0.08, delay: 0.012, wet: 0.05 });
        this.noise(0.025, { freq: 2600, q: 2, vol: 0.08 });
        break;
      case 'ui_back':
        this.tone(420 * rate, 0.09, { type: 'triangle', vol: 0.18, to: 250, wet: 0.05 });
        this.noise(0.02, { freq: 1800, q: 2, vol: 0.06 });
        break;
      case 'ui_toggle':
        this.tone(740 * rate, 0.06, { type: 'triangle', vol: 0.14, wet: 0.05 });
        this.tone(1110 * rate, 0.08, { type: 'triangle', vol: 0.1, delay: 0.05, wet: 0.08 });
        break;
      case 'ui_denied':
        this.tone(190, 0.16, { type: 'square', vol: 0.1, to: 140, lp: 700 });
        this.tone(160, 0.2, { type: 'square', vol: 0.09, delay: 0.1, to: 110, lp: 600 });
        break;
      case 'ui_star': {
        const i = opts.index ?? 0;
        const base = 72 + i * 3;
        [0, 4, 7, 12].forEach((s, j) => this.tone(midi(base + s), 0.5, { type: 'triangle', vol: 0.15, delay: j * 0.055, wet: 0.3, attack: 0.004 }));
        this.chime(midi(base + 24), 0.9, 0.18, 0.1);
        this.noise(0.5, { freq: 7000, type: 'highpass', vol: 0.04, delay: 0.05 });
        break;
      }
      case 'ui_count':
        this.tone(1250 * rate, 0.04, { type: 'square', vol: 0.03 + 0.04 * k, lp: 3200, wet: 0.02 });
        break;
      case 'score_tick':
        this.tone(1500 * rate, 0.05, { type: 'square', vol: 0.03 + 0.03 * k, to: 1900, lp: 4000, pan, wet: 0.05 });
        break;
      case 'score_bonus':
        [0, 4, 7, 12, 16].forEach((s, j) => this.tone(midi(79 + s), 0.22, { type: 'triangle', vol: 0.12, delay: j * 0.06, pan, wet: 0.3 }));
        this.chime(midi(103), 1.1, 0.14, 0.3);
        break;

      // ---------------------------------------------------------- slingshot + birds
      case 'sling_release': {
        const s = 0.5 + k * 0.5;
        this.tone(330 * s, 0.22, { type: 'sawtooth', vol: 0.16 * lv + 0.04, to: 95, lp: 1400, q: 4, pan, wet: 0.08 });
        this.tone(90, 0.16, { type: 'sine', vol: 0.3 * lv, to: 55, pan });
        this.noise(0.14, { freq: 1200, to: 4200, vol: 0.18 * lv + 0.04, pan });
        this.noise(0.03, { freq: 3200, q: 1.5, vol: 0.2 * lv, pan });
        break;
      }
      case 'bird_launch': {
        const b = BIRD_VOICE[bird];
        this.noise(0.4, { freq: 500, to: 3600, q: 0.8, vol: 0.2, attack: 0.05, pan, wet: 0.12 });
        this.voice(b.f0 * rate, b.to * rate, b.dur, b.formants, { vol: 0.22, delay: 0.04, pan, mid: b.mid, growl: b.growl });
        if (bird === 'chuck' || bird === 'blues') this.voice(b.f0 * rate * 1.1, b.to * rate * 1.1, b.dur * 0.8, b.formants, { vol: 0.14, delay: 0.2, pan, mid: b.mid, growl: b.growl });
        break;
      }
      case 'bird_ready': {
        const b = BIRD_VOICE[bird];
        this.voice(b.f0 * 1.4 * rate, b.f0 * 1.9 * rate, 0.09, b.formants, { vol: 0.1, pan, mid: 1.1 });
        this.tone(560 * rate, 0.05, { type: 'triangle', vol: 0.05, to: 840 });
        break;
      }
      case 'bird_impact': {
        const b = BIRD_VOICE[bird];
        this.noise(0.1, { freq: 380 * br, type: 'lowpass', vol: 0.42 * lv, pan });
        this.tone(130 * rate, 0.14, { type: 'sine', vol: 0.34 * lv, to: 70, pan });
        this.voice(b.f0 * 0.9 * rate, b.to * 0.7, 0.16, b.formants, { vol: 0.12 * lv + 0.03, delay: 0.015, pan, mid: 1.15 });
        break;
      }
      case 'bird_poof':
        this.noise(0.34, { freq: 3200, to: 600, vol: 0.12, attack: 0.02, pan, wet: 0.15 });
        this.tone(900 * rate, 0.12, { type: 'sine', vol: 0.05, to: 400, pan });
        break;

      // ---------------------------------------------------------- abilities
      case 'ability_boost':
        this.noise(0.45, { freq: 400, to: 6000, q: 0.9, vol: 0.32, attack: 0.04, pan, wet: 0.12 });
        this.tone(260, 0.38, { type: 'sawtooth', vol: 0.09, to: 1500, lp: 3000, pan });
        this.chime(1500 * rate, 0.4, 0.07, 0.12, pan);
        break;
      case 'ability_split':
        [0, 0.045, 0.09].forEach((d, i) => {
          this.tone(900 + i * 320, 0.1, { type: 'triangle', vol: 0.12, delay: d, to: 1600 + i * 300, pan: pan + (i - 1) * 0.3 });
          this.noise(0.06, { freq: 2500 + i * 700, q: 2, vol: 0.1, delay: d, pan });
        });
        this.noise(0.25, { freq: 800, to: 3500, vol: 0.14, pan });
        break;
      case 'ability_egg':
        this.tone(640 * rate, 0.22, { type: 'sine', vol: 0.26, to: 170, pan, wet: 0.12 });
        this.tone(1280 * rate, 0.08, { type: 'triangle', vol: 0.1, to: 520, pan });
        this.voice(420, 330, 0.12, BIRD_VOICE.matilda.formants, { vol: 0.16, delay: 0.04, pan, mid: 1.3 });
        break;
      case 'bomb_fuse':
        for (let i = 0; i < 7; i++) this.noise(0.06, { freq: 6500 + Math.random() * 2500, type: 'highpass', vol: 0.06 + Math.random() * 0.05, delay: i * 0.075, pan });
        this.tone(1400, 0.5, { type: 'sine', vol: 0.025, to: 2400, pan });
        break;
      case 'explosion': {
        const s = clamp01(opts.intensity ?? 1);
        const big = 0.5 + s * 0.5;
        this.tone(130, 0.9 * big + 0.3, { type: 'sine', vol: 0.75 * big, to: 32, pan, wet: 0.2, attack: 0.004 });
        this.tone(70, 0.6 * big + 0.2, { type: 'triangle', vol: 0.4 * big, to: 28, pan, attack: 0.004 });
        this.noise(1.3 * big + 0.3, { freq: 2600, to: 110, type: 'lowpass', vol: 0.8 * big, pan, wet: 0.3, attack: 0.002 });
        this.noise(0.18, { freq: 5200, type: 'highpass', vol: 0.4 * big, pan });
        for (let i = 0; i < 6; i++) this.noise(0.05 + Math.random() * 0.06, { freq: 2500 + Math.random() * 3500, q: 1.5, vol: 0.14 * big, delay: 0.1 + Math.random() * 0.7, pan });
        this.duck(0.5 + 0.2 * big);
        break;
      }

      // ---------------------------------------------------------- materials
      case 'wood_hit': {
        const f = (v === 0 ? 170 : v === 1 ? 210 : 245) * rate;
        this.tone(f, 0.1, { type: 'triangle', vol: 0.34 * lv, to: f * 0.62, lp: 1500 * br, pan, wet: 0.05 });
        this.tone(f * 2.4, 0.05, { type: 'sine', vol: 0.1 * lv, to: f * 1.7, pan });
        this.noise(0.035, { freq: 1100 * br + 400, q: 3, vol: 0.22 * lv, pan });
        break;
      }
      case 'wood_break': {
        const f = 135 * rate;
        this.tone(f, 0.22, { type: 'triangle', vol: 0.32 * lv, to: f * 0.55, lp: 900, pan, wet: 0.08 });
        const splinters = 3 + Math.round(k * 3);
        for (let i = 0; i < splinters; i++) this.noise(0.05 + Math.random() * 0.05, { freq: 1300 + Math.random() * 2600, q: 5, vol: (0.22 + Math.random() * 0.12) * lv + 0.04, delay: i * 0.032 + Math.random() * 0.02, pan });
        this.noise(0.12, { freq: 2200, to: 700, q: 2, vol: 0.2 * lv, pan });
        this.tone(480 * rate, 0.09, { type: 'sawtooth', vol: 0.06 * lv, to: 230, lp: 1800, delay: 0.01, pan });
        break;
      }
      case 'stone_hit': {
        this.tone(85 * rate, 0.17, { type: 'sine', vol: 0.5 * lv, to: 48, pan, wet: 0.08 });
        this.noise(0.12, { freq: 320 * br + 100, type: 'lowpass', vol: 0.42 * lv, pan });
        this.noise(0.04, { freq: 2400, q: 2, vol: 0.12 * lv, delay: 0.01, pan });
        break;
      }
      case 'stone_break': {
        this.tone(78 * rate, 0.5, { type: 'sine', vol: 0.55 * lv, to: 34, pan, wet: 0.15 });
        this.noise(0.55, { freq: 900 * br + 200, to: 140, type: 'lowpass', vol: 0.5 * lv + 0.06, pan, wet: 0.1 });
        const bits = 4 + Math.round(k * 5);
        for (let i = 0; i < bits; i++) this.noise(0.03 + Math.random() * 0.03, { freq: 1800 + Math.random() * 2800, q: 4, vol: 0.12 * lv + 0.02, delay: 0.04 + Math.random() * 0.4, pan });
        break;
      }
      case 'glass_hit': {
        const f = (v === 0 ? 2300 : v === 1 ? 2750 : 3300) * rate;
        this.tone(f, 0.18, { type: 'sine', vol: 0.15 * lv, pan, wet: 0.25, attack: 0.002 });
        this.tone(f * 1.51, 0.12, { type: 'sine', vol: 0.08 * lv, pan, wet: 0.25, attack: 0.002 });
        this.tone(f * 2.4, 0.08, { type: 'sine', vol: 0.05 * lv, pan, attack: 0.002 });
        this.noise(0.02, { freq: 6000, q: 2, type: 'highpass', vol: 0.1 * lv, pan });
        break;
      }
      case 'glass_break': {
        this.noise(0.1, { freq: 4200, type: 'highpass', vol: 0.4 * lv + 0.05, pan, attack: 0.001, wet: 0.2 });
        this.noise(0.5, { freq: 7000, to: 3000, type: 'highpass', vol: 0.18 * lv + 0.03, pan, delay: 0.04, wet: 0.25 });
        const shards = 6 + Math.round(k * 6);
        for (let i = 0; i < shards; i++) this.tone(2000 + Math.random() * 4800, 0.08 + Math.random() * 0.12, { type: 'sine', vol: (0.07 + Math.random() * 0.05) * lv + 0.01, delay: 0.02 + Math.random() * 0.32, pan: pan + (Math.random() - 0.5) * 0.4, wet: 0.3, attack: 0.001 });
        this.tone(260, 0.12, { type: 'triangle', vol: 0.14 * lv, to: 150, lp: 800, pan });
        break;
      }
      case 'metal_hit':
        this.clang((v === 0 ? 380 : v === 1 ? 440 : 520) * rate, 0.55, 0.16 * lv + 0.03, { pan });
        this.noise(0.02, { freq: 4000, q: 1, type: 'highpass', vol: 0.12 * lv, pan });
        this.tone(110 * rate, 0.1, { type: 'sine', vol: 0.2 * lv, to: 70, pan });
        break;
      case 'metal_break':
        this.clang(300 * rate, 1.0, 0.2 * lv + 0.05, { pan, wet: 0.25 });
        this.clang(470 * rate, 0.7, 0.12 * lv, { delay: 0.05, pan });
        this.noise(0.25, { freq: 3500, to: 1500, q: 1.2, vol: 0.3 * lv, pan });
        this.tone(900 * rate, 0.3, { type: 'sawtooth', vol: 0.06 * lv, to: 220, lp: 2500, pan });
        this.tone(80, 0.3, { type: 'sine', vol: 0.4 * lv, to: 40, pan });
        break;
      case 'armor_hit':
        this.clang((v === 0 ? 560 : v === 1 ? 640 : 740) * rate, 0.4, 0.13 * lv + 0.03, { pan });
        this.noise(0.02, { freq: 5000, type: 'highpass', vol: 0.12 * lv, pan });
        break;
      case 'armor_break':
        this.clang(520 * rate, 0.9, 0.22, { pan, wet: 0.25 });
        this.noise(0.3, { freq: 4000, to: 1200, vol: 0.25, pan });
        this.tone(1000, 0.35, { type: 'sawtooth', vol: 0.06, to: 260, lp: 2200, pan });
        break;
      case 'ground_hit':
        this.tone(62 * rate, 0.16, { type: 'sine', vol: 0.4 * lv, to: 38, pan });
        this.noise(0.12, { freq: 220 * br + 60, type: 'lowpass', vol: 0.3 * lv, pan });
        break;

      // ---------------------------------------------------------- pigs
      case 'pig_hurt': {
        const f = rand(520, 820) * rate;
        this.voice(f, f * 0.55, 0.2, [[700, 1], [2000, 0.8], [3300, 0.2]], { vol: 0.17, mid: 1.5, pan, growl: 18 });
        this.noise(0.06, { freq: 1500, q: 2, vol: 0.06, pan });
        break;
      }
      case 'pig_defeat': {
        const f = rand(760, 1050) * rate;
        this.voice(f, 170, 0.42, [[650, 1], [1900, 0.9], [3200, 0.25]], { vol: 0.2, mid: 1.25, pan, growl: 24 });
        this.tone(420, 0.18, { type: 'sine', vol: 0.18, to: 110, delay: 0.3, pan });
        this.noise(0.24, { freq: 2500, to: 600, vol: 0.2, delay: 0.32, pan, wet: 0.15 });
        break;
      }
      case 'pig_oink': {
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const f = rand(125, 175) * rate;
          this.voice(f, f * 0.75, 0.13, [[420, 1], [1300, 0.8], [2400, 0.3]], { vol: 0.2, delay: i * 0.17, pan, mid: 1.25, growl: 34, wet: 0.05 });
          this.noise(0.07, { freq: 1700, q: 1.5, vol: 0.05, delay: i * 0.17, pan });
        }
        break;
      }

      // ---------------------------------------------------------- score + flow
      case 'level_start':
        [0, 4, 7, 12].forEach((s, j) => this.tone(midi(67 + s), 0.2, { type: 'triangle', vol: 0.12, delay: j * 0.07, wet: 0.2 }));
        break;
      case 'level_win': {
        const melody = [0, 4, 7, 12, 7, 12, 16, 19];
        melody.forEach((s, j) => {
          this.tone(midi(72 + s), 0.3, { type: 'triangle', vol: 0.14, delay: j * 0.1, wet: 0.3 });
          this.tone(midi(72 + s) * 2.005, 0.22, { type: 'sine', vol: 0.05, delay: j * 0.1, wet: 0.3 });
        });
        [0, 4, 7].forEach((s) => this.tone(midi(60 + s), 1.6, { type: 'sawtooth', vol: 0.045, delay: 0.7, lp: 1100, wet: 0.35, attack: 0.05 }));
        this.chime(midi(96), 1.6, 0.16, 0.8);
        this.tone(midi(48), 1.2, { type: 'sine', vol: 0.22, delay: 0.7 });
        break;
      }
      case 'level_fail': {
        // A sad "wah wah wah waaah".
        const notes: [number, number, number][] = [[0, 0.3, 62], [0.34, 0.3, 61], [0.68, 0.3, 60], [1.02, 0.9, 58]];
        notes.forEach(([delay, dur, n], i) => {
          const f = midi(n);
          this.tone(f, dur, { type: 'sawtooth', vol: 0.13, delay, lp: 700, q: 6, wet: 0.2, attack: 0.03 });
          this.tone(f * 0.5, dur, { type: 'triangle', vol: 0.12, delay, wet: 0.1 });
          if (i === 3) this.tone(f * 0.94, dur, { type: 'sawtooth', vol: 0.06, delay: delay + 0.2, to: f * 0.75, lp: 600 });
        });
        break;
      }
      default:
        break;
    }
  }

  /** Briefly lowers the music under a big sound. */
  private duck(amount: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = this.settings.musicVolume * 0.45;
    const g = this.musicBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(base * amount, t + 0.04);
    g.setTargetAtTime(base, t + 0.3, 0.4);
  }

  setStretch(amount: number | null): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (amount === null || amount < 0.05) {
      this.stretch?.gain.gain.setTargetAtTime(0, t, 0.06);
      this.stretch?.hiss.gain.setTargetAtTime(0, t, 0.06);
      return;
    }
    if (!this.stretch) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      filter.Q.value = 6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(this.sfxBus);
      osc.start();
      // Fibre creak: faint filtered noise that brightens with tension.
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 5;
      const hiss = ctx.createGain();
      hiss.gain.value = 0;
      src.connect(bp).connect(hiss).connect(this.sfxBus);
      src.start();
      this.stretch = { osc, gain, filter, hiss };
    }
    this.stretch.osc.frequency.setTargetAtTime(55 + amount * 110 + Math.sin(t * 17) * 4, t, 0.05);
    this.stretch.filter.frequency.setTargetAtTime(280 + amount * 700, t, 0.05);
    this.stretch.gain.gain.setTargetAtTime(0.02 + amount * 0.045, t, 0.05);
    this.stretch.hiss.gain.setTargetAtTime(amount * amount * 0.03, t, 0.05);
  }

  setFlight(speed: number | null): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (speed === null) {
      this.wind?.gain.gain.setTargetAtTime(0, t, 0.18);
      return;
    }
    if (!this.wind) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.9;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start();
      this.wind = { gain, filter };
    }
    const s = clamp01(speed / 35);
    this.wind.filter.frequency.setTargetAtTime(350 + s * 1900, t, 0.12);
    this.wind.gain.gain.setTargetAtTime(s * s * 0.14, t, 0.12);
  }

  // ------------------------------------------------------------------ music

  playMusic(track: MusicTrack): void {
    if (track === this.track) return;
    this.track = track;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.songGain) {
      const old = this.songGain;
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + 1.4);
      window.setTimeout(() => old.disconnect(), 2200);
      this.songGain = null;
    }
    clearInterval(this.timer);
    this.song = track === 'none' ? null : SONGS[track];
    if (!this.song) return;
    this.melody = this.song.melody.map(parseBar);
    this.songGain = this.ctx.createGain();
    this.songGain.gain.setValueAtTime(0, t);
    this.songGain.gain.linearRampToValueAtTime(1, t + 1.6);
    this.songGain.connect(this.musicBus);
    this.step = 0;
    this.nextNoteTime = t + 0.12;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  private schedule(): void {
    const ctx = this.ctx;
    const song = this.song;
    const out = this.songGain;
    if (!ctx || !song || !out || ctx.state !== 'running') return;
    const d = 60 / song.bpm / 4;
    // A long stall (tab in background) would otherwise burst through every missed step.
    if (this.nextNoteTime < ctx.currentTime - 0.5) this.nextNoteTime = ctx.currentTime + 0.05;
    while (this.nextNoteTime < ctx.currentTime + 0.3) {
      this.playStep(song, out, this.step, this.nextNoteTime, d);
      this.step++;
      this.nextNoteTime += d;
    }
  }

  private playStep(song: Song, out: AudioNode, step: number, t0: number, d: number): void {
    const bars = song.chords.length;
    const bar = Math.floor(step / 16) % bars;
    const pos = step % 16;
    const loop = Math.floor(step / (16 * bars));
    const swung = pos % 4 >= 2 ? song.swing * d * 1.2 : 0;
    const t = t0 + swung + rand(-0.003, 0.003);
    const chord = song.chords[bar]!;
    const vel = pos === 0 ? 1.1 : pos % 4 === 0 ? 1 : 0.85;

    if (pos === 0 && song.pad) this.padChord(out, chord, song, t, d * 16);

    for (const n of this.melody[bar] ?? []) {
      if (n.pos !== pos) continue;
      const dur = n.len * d * 0.92;
      this.leadNote(out, song.root + n.note, t, dur, song, vel);
      if (loop % 2 === 1 && bar >= 4) this.leadNote(out, song.root + n.note - 12, t + 0.01, dur, { ...song, lead: { ...song.lead, vol: song.lead.vol * 0.45, wave: 'sine' } }, vel);
    }

    const arp = song.arp;
    if (arp && pos % arp.every === 0 && !(loop === 0 && bar < 2)) {
      const idx = arp.pattern[(pos / arp.every) % arp.pattern.length];
      if (idx !== null && idx !== undefined) {
        const tone = chord[idx % chord.length]!;
        this.pluck(out, midi(song.root + tone + arp.octave), t, d * arp.every * 1.7, arp.wave, arp.cutoff, arp.vol * vel);
      }
    }

    const b = song.bass.pattern[pos];
    if (b !== null && b !== undefined) {
      const rootTone = chord[0]!;
      const base = song.root - 24 + rootTone - (rootTone > 6 ? 12 : 0);
      const note = base + (b === 1 ? 7 : b === 2 ? 12 : 0);
      this.bassNote(out, midi(note), t, d * 3.2, song.bass.wave, song.bass.vol * vel);
    }

    const dr = song.drums;
    if (dr.kick.includes(pos)) this.kick(out, t, dr.kit === 'soft' ? 0.16 : 0.26);
    if (dr.snare.includes(pos)) this.snare(out, t, 0.11);
    if (dr.hat.includes(pos)) this.hat(out, t, pos % 4 === 0 ? 0.035 : 0.025, false);
    if (dr.perc.includes(pos)) this.hand(out, t, pos % 8 === 0 ? 'dum' : pos % 4 === 2 ? 'tek' : 'ka');
    if (dr.shaker.includes(pos)) this.hat(out, t, dr.kit === 'soft' ? 0.03 : 0.02, true);

    if (song.bells && pos % song.bells.every === 0 && Math.random() < 0.4) {
      const tone = chord[Math.floor(Math.random() * chord.length)]!;
      this.bell(out, midi(song.root + tone + 12 * (1 + Math.floor(Math.random() * 2))), t, song.bells.vol * rand(0.6, 1));
    }
  }

  private musicOsc(out: AudioNode, type: OscillatorType, freq: number, t: number, dur: number, vol: number, cutoff: number, attack: number, detune = 0, vibrato = 0): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff * 1.6, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.7), t + Math.min(dur, 0.35));
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    const v = Math.max(0.0002, vol * (type === 'sawtooth' || type === 'square' ? 0.5 : 1));
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(v, t + attack);
    gain.gain.setTargetAtTime(v * 0.6, t + attack, Math.max(0.05, dur * 0.4));
    gain.gain.setValueAtTime(v * 0.5, t + dur);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.14);
    osc.connect(filter).connect(gain).connect(out);
    const sources: AudioScheduledSourceNode[] = [osc];
    if (vibrato > 0 && dur > 0.2) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rand(4.8, 5.8);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(freq * vibrato, t + 0.25);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.2);
      sources.push(lfo);
    }
    osc.start(t);
    osc.stop(t + dur + 0.2);
    osc.onended = () => gain.disconnect();
  }

  private leadNote(out: AudioNode, note: number, t: number, dur: number, song: Song, vel: number): void {
    const l = song.lead;
    const f = midi(note);
    this.musicOsc(out, l.wave, f, t, dur, l.vol * vel, l.cutoff, 0.012, -5, l.vibrato);
    this.musicOsc(out, l.wave, f, t, dur, l.vol * vel * 0.7, l.cutoff, 0.012, 6);
  }

  private pluck(out: AudioNode, freq: number, t: number, dur: number, wave: OscillatorType, cutoff: number, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff * 1.8, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(300, cutoff * 0.5), t + dur);
    const gain = ctx.createGain();
    const v = Math.max(0.0002, vol * (wave === 'square' || wave === 'sawtooth' ? 0.5 : 1));
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(v, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    osc.onended = () => gain.disconnect();
  }

  private bassNote(out: AudioNode, freq: number, t: number, dur: number, wave: OscillatorType, vol: number): void {
    this.pluck(out, freq, t, dur, wave, 520, vol);
    this.pluck(out, freq * 2, t, dur * 0.5, 'sine', 900, vol * 0.25);
  }

  private padChord(out: AudioNode, chord: number[], song: Song, t: number, dur: number): void {
    const pad = song.pad!;
    for (const tone of chord) {
      for (const detune of [-7, 7]) this.musicOsc(out, pad.wave, midi(song.root + tone), t, dur * 0.96, pad.vol * 0.5, pad.cutoff, Math.min(0.9, dur * 0.25), detune);
    }
  }

  private noiseHit(out: AudioNode, t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, rand(0, 1.5));
    src.stop(t + dur + 0.02);
    src.onended = () => g.disconnect();
  }

  private kick(out: AudioNode, t: number, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.26);
    osc.onended = () => g.disconnect();
  }

  private snare(out: AudioNode, t: number, vol: number): void {
    this.noiseHit(out, t, 0.14, vol, 'bandpass', 1900, 0.8);
    this.pluck(out, 190, t, 0.09, 'triangle', 1200, vol * 1.2);
  }

  private hat(out: AudioNode, t: number, vol: number, shaker: boolean): void {
    if (shaker) this.noiseHit(out, t, 0.07, vol, 'bandpass', 5200, 1.2);
    else this.noiseHit(out, t, 0.035, vol, 'highpass', 7500);
  }

  /** Hand-drum hits for the desert groove. */
  private hand(out: AudioNode, t: number, kind: 'dum' | 'tek' | 'ka'): void {
    if (kind === 'dum') {
      this.pluck(out, 150, t, 0.2, 'sine', 700, 0.3);
      this.noiseHit(out, t, 0.05, 0.05, 'lowpass', 600);
    } else if (kind === 'tek') {
      this.noiseHit(out, t, 0.06, 0.09, 'bandpass', 3000, 4);
      this.pluck(out, 330, t, 0.06, 'triangle', 2000, 0.06);
    } else this.noiseHit(out, t, 0.04, 0.05, 'bandpass', 4400, 4);
  }

  private bell(out: AudioNode, freq: number, t: number, vol: number): void {
    [1, 2.76, 5.4].forEach((r, i) => this.pluck(out, freq * r, t, 1.3 / (1 + i), 'sine', 6000, vol / (1 + i * 1.2)));
  }
}
