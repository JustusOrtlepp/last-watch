import type { SimEvent } from '../sim/events';

/**
 * Synthesized sound effects (SPEC 10.2): every effect is a small recipe of pitch-swept
 * oscillators and filtered noise, played through the Web Audio API. No audio files.
 *
 * The recipes are plain data (testable without an AudioContext). Nothing is created until
 * `unlock()` is called from a user gesture; while muted nothing is played.
 */
export const SFX_NAMES = [
  'jump',
  'land',
  'charge',
  'impact',
  'stomp',
  'stun',
  'kill',
  'trample',
  'error',
  'levelUp',
  'death',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

/** An oscillator whose frequency glides from `from` to `to` Hz over `dur` s, starting `at` s in. */
export interface Tone {
  wave: OscillatorType;
  from: number;
  to: number;
  at: number;
  dur: number;
  gain: number;
}

/** White noise through a filter whose cutoff glides from `from` to `to` Hz. */
export interface Noise {
  filter: BiquadFilterType;
  from: number;
  to: number;
  at: number;
  dur: number;
  gain: number;
}

export interface Recipe {
  tones: readonly Tone[];
  noise: readonly Noise[];
}

/** Longest noise burst a recipe may use (the shared noise buffer is this long). */
export const NOISE_BUFFER_SEC = 1;
/** Fade-in of every voice, to avoid clicks. */
export const ATTACK_SEC = 0.005;

const tone = (
  wave: OscillatorType,
  from: number,
  to: number,
  at: number,
  dur: number,
  gain: number,
): Tone => ({
  wave,
  from,
  to,
  at,
  dur,
  gain,
});
const noise = (
  filter: BiquadFilterType,
  from: number,
  to: number,
  at: number,
  dur: number,
  gain: number,
): Noise => ({ filter, from, to, at, dur, gain });

export const SFX_RECIPES: Readonly<Record<SfxName, Recipe>> = {
  jump: { tones: [tone('square', 220, 520, 0, 0.14, 0.18)], noise: [] },
  land: {
    tones: [tone('sine', 120, 55, 0, 0.1, 0.35)],
    noise: [noise('lowpass', 500, 150, 0, 0.09, 0.3)],
  },
  charge: {
    tones: [tone('sawtooth', 110, 320, 0, 0.32, 0.14)],
    noise: [noise('bandpass', 300, 2200, 0, 0.36, 0.4)],
  },
  impact: {
    tones: [tone('sine', 170, 45, 0, 0.22, 0.5)],
    noise: [noise('lowpass', 1500, 200, 0, 0.16, 0.5)],
  },
  stomp: {
    tones: [tone('sine', 130, 32, 0, 0.34, 0.65)],
    noise: [noise('lowpass', 700, 90, 0, 0.24, 0.4)],
  },
  stun: {
    tones: [tone('triangle', 880, 620, 0, 0.1, 0.25), tone('triangle', 620, 880, 0.1, 0.1, 0.25)],
    noise: [],
  },
  kill: {
    tones: [tone('square', 523, 523, 0, 0.08, 0.16), tone('square', 784, 784, 0.07, 0.14, 0.16)],
    noise: [],
  },
  trample: {
    tones: [tone('square', 95, 55, 0, 0.1, 0.3)],
    noise: [noise('lowpass', 600, 200, 0, 0.07, 0.35)],
  },
  error: { tones: [tone('square', 190, 140, 0, 0.16, 0.22)], noise: [] },
  levelUp: {
    tones: [
      tone('triangle', 523, 523, 0, 0.3, 0.3),
      tone('triangle', 659, 659, 0.09, 0.3, 0.3),
      tone('triangle', 784, 784, 0.18, 0.3, 0.3),
      tone('triangle', 1047, 1047, 0.27, 0.5, 0.3),
    ],
    noise: [],
  },
  death: {
    tones: [tone('sawtooth', 420, 55, 0, 0.85, 0.3)],
    noise: [noise('lowpass', 900, 100, 0, 0.55, 0.25)],
  },
};

/** The effect a sim event makes, or null for events without a sound. */
export function sfxForEvent(ev: SimEvent): SfxName | null {
  switch (ev.type) {
    case 'PlayerJumped':
      return 'jump';
    case 'PlayerLanded':
      return 'land';
    case 'ChargeStarted':
      return 'charge';
    case 'ChargeHit':
      return 'impact';
    case 'StompUsed':
      return 'stomp';
    case 'EnemyStunned':
      return 'stun';
    case 'EnemyDefeated':
      return ev.cause === 'trample' ? 'trample' : 'kill';
    case 'PlayerDied':
      return 'death';
    case 'AbilityError':
      return 'error';
    default:
      return null;
  }
}

export interface SfxOptions {
  /** Master gain. */
  volume: number;
  /** Minimum gap between two plays of the same effect, in ms. */
  minGapMs: number;
  muted: boolean;
}

export interface Sfx {
  /** Call from a user gesture (key, click, touch): allows audio. */
  unlock(): void;
  setMuted(muted: boolean): void;
  play(name: SfxName): void;
}

const SILENT = 0.0001;

export function createSfx(options: SfxOptions): Sfx {
  let muted = options.muted;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  const lastPlay = new Map<SfxName, number>();

  const ensureContext = (): AudioContext | null => {
    if (ctx) return ctx;
    if (typeof AudioContext === 'undefined') return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = options.volume;
    master.connect(ctx.destination);
    return ctx;
  };

  const noiseSource = (audio: AudioContext): AudioBuffer => {
    if (noiseBuffer) return noiseBuffer;
    const length = Math.floor(audio.sampleRate * NOISE_BUFFER_SEC);
    noiseBuffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  };

  const envelope = (audio: AudioContext, start: number, dur: number, gain: number): GainNode => {
    const node = audio.createGain();
    node.gain.setValueAtTime(SILENT, start);
    node.gain.exponentialRampToValueAtTime(gain, start + ATTACK_SEC);
    node.gain.exponentialRampToValueAtTime(SILENT, start + dur);
    return node;
  };

  return {
    unlock() {
      const audio = ensureContext();
      if (audio && audio.state === 'suspended') void audio.resume();
    },
    setMuted(next) {
      muted = next;
    },
    play(name) {
      if (muted || !ctx || !master) return;
      const nowMs = performance.now();
      const last = lastPlay.get(name);
      if (last !== undefined && nowMs - last < options.minGapMs) return;
      lastPlay.set(name, nowMs);
      if (ctx.state === 'suspended') void ctx.resume();
      const audio = ctx;
      const out = master;
      const t0 = audio.currentTime;
      const recipe = SFX_RECIPES[name];

      for (const voice of recipe.tones) {
        const start = t0 + voice.at;
        const osc = audio.createOscillator();
        osc.type = voice.wave;
        osc.frequency.setValueAtTime(voice.from, start);
        if (voice.to !== voice.from) {
          osc.frequency.exponentialRampToValueAtTime(voice.to, start + voice.dur);
        }
        const env = envelope(audio, start, voice.dur, voice.gain);
        osc.connect(env);
        env.connect(out);
        osc.start(start);
        osc.stop(start + voice.dur + 0.02);
        osc.onended = () => {
          osc.disconnect();
          env.disconnect();
        };
      }

      for (const voice of recipe.noise) {
        const start = t0 + voice.at;
        const src = audio.createBufferSource();
        src.buffer = noiseSource(audio);
        const filter = audio.createBiquadFilter();
        filter.type = voice.filter;
        filter.Q.value = 1;
        filter.frequency.setValueAtTime(voice.from, start);
        filter.frequency.exponentialRampToValueAtTime(voice.to, start + voice.dur);
        const env = envelope(audio, start, voice.dur, voice.gain);
        src.connect(filter);
        filter.connect(env);
        env.connect(out);
        src.start(start);
        src.stop(start + voice.dur + 0.02);
        src.onended = () => {
          src.disconnect();
          filter.disconnect();
          env.disconnect();
        };
      }
    },
  };
}
