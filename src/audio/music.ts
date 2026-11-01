/**
 * Background music: one track on a seamless loop through the Web Audio API.
 *
 * The track fades in over its first second and out over its last, so a plain loop dips to
 * silence at the seam. Instead each pass starts `overlapSec` before the previous one ends, with
 * an equal-power crossfade. The overlap is one bar of the track (100 bpm, 2.4 s), so the beat
 * and bar stay aligned and the level stays steady through the seam. Passes are scheduled on the
 * audio clock a few passes ahead, so there is no timer jitter and no gap.
 *
 * Browsers only allow audio after a user gesture, so nothing is created or downloaded until
 * `unlock()` is called from one. Muting fades out and suspends the context (silent and idle);
 * unmuting resumes it where the track was. A hidden tab is silent too.
 */
export type MusicState = 'idle' | 'loading' | 'playing' | 'off';

export interface MusicOptions {
  url: string;
  volume: number;
  fadeMs: number;
  /** Crossfade length at the loop seam, in seconds (one bar of the track). */
  overlapSec: number;
  muted: boolean;
  /** Called whenever `state` changes. */
  onChange?: (state: MusicState) => void;
}

export interface Music {
  readonly state: MusicState;
  /** Call from a user gesture (key, click, touch): allows audio, starts it unless muted. */
  unlock(): void;
  setMuted(muted: boolean): void;
}

/** Start time of pass `index`: each pass begins `overlap` before the previous one ends. */
export function passStart(first: number, duration: number, overlap: number, index: number): number {
  return first + index * (duration - overlap);
}

/** Passes are scheduled this many passes ahead of the audio clock. */
const PASSES_AHEAD = 3;
const CURVE_POINTS = 128;
const TOP_UP_MS = 5000;
/** Start delay for the first pass so that scheduling never lands in the past. */
const START_DELAY_SEC = 0.05;

function crossfadeCurves(): { fadeIn: Float32Array; fadeOut: Float32Array } {
  const fadeIn = new Float32Array(CURVE_POINTS);
  const fadeOut = new Float32Array(CURVE_POINTS);
  for (let i = 0; i < CURVE_POINTS; i++) {
    const x = (i / (CURVE_POINTS - 1)) * (Math.PI / 2);
    fadeIn[i] = Math.sin(x);
    fadeOut[i] = Math.cos(x);
  }
  return { fadeIn, fadeOut };
}

export function createMusic(options: MusicOptions): Music {
  let muted = options.muted;
  let unlocked = false;
  let state: MusicState = 'idle';
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let buffer: AudioBuffer | null = null;
  let loading = false;
  let suspendTimer: ReturnType<typeof setTimeout> | undefined;
  let nextPass = 0;
  let firstStart = 0;
  const curves = crossfadeCurves();

  const setState = (next: MusicState): void => {
    if (next === state) return;
    state = next;
    options.onChange?.(state);
  };

  const wanted = (): boolean => unlocked && !muted && !document.hidden;

  const ensureContext = (): AudioContext | null => {
    if (ctx) return ctx;
    if (typeof AudioContext === 'undefined') return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    return ctx;
  };

  const overlap = (): number => (buffer ? Math.min(options.overlapSec, buffer.duration / 3) : 0);

  const schedulePass = (audio: AudioContext, index: number): void => {
    if (!buffer || !master) return;
    const lap = overlap();
    const start = passStart(firstStart, buffer.duration, lap, index);
    const node = audio.createBufferSource();
    node.buffer = buffer;
    const envelope = audio.createGain();
    node.connect(envelope);
    envelope.connect(master);
    if (index === 0) {
      envelope.gain.setValueAtTime(1, start);
    } else {
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.setValueCurveAtTime(curves.fadeIn, start, lap);
    }
    envelope.gain.setValueCurveAtTime(curves.fadeOut, start + buffer.duration - lap, lap);
    node.start(start);
    node.onended = () => {
      node.disconnect();
      envelope.disconnect();
    };
  };

  const topUp = (): void => {
    if (!ctx || !buffer) return;
    const horizon = ctx.currentTime + PASSES_AHEAD * (buffer.duration - overlap());
    while (passStart(firstStart, buffer.duration, overlap(), nextPass) < horizon) {
      schedulePass(ctx, nextPass);
      nextPass += 1;
    }
  };

  const ramp = (audio: AudioContext, target: number): void => {
    if (!master) return;
    const now = audio.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(target, now + options.fadeMs / 1000);
  };

  const load = async (audio: AudioContext): Promise<void> => {
    loading = true;
    try {
      const response = await fetch(options.url);
      buffer = await audio.decodeAudioData(await response.arrayBuffer());
      firstStart = audio.currentTime + START_DELAY_SEC;
      nextPass = 0;
      topUp();
      setInterval(topUp, TOP_UP_MS); // a no-op while the context is suspended (clock stands still)
    } catch {
      // Missing or undecodable track: the game plays on in silence.
    } finally {
      loading = false;
    }
    sync();
  };

  const sync = (): void => {
    if (wanted()) {
      const audio = ensureContext();
      if (audio) {
        clearTimeout(suspendTimer);
        if (!buffer && !loading) void load(audio);
        void audio.resume();
        ramp(audio, options.volume);
      }
    } else if (ctx) {
      const audio = ctx;
      ramp(audio, 0);
      clearTimeout(suspendTimer);
      suspendTimer = setTimeout(() => {
        if (!wanted()) void audio.suspend();
      }, options.fadeMs + 50);
    }
    setState(muted ? 'off' : !unlocked ? 'idle' : buffer ? 'playing' : 'loading');
  };

  document.addEventListener('visibilitychange', sync);
  if (muted) state = 'off';

  return {
    get state() {
      return state;
    },
    unlock() {
      unlocked = true;
      sync();
    },
    setMuted(next) {
      muted = next;
      sync();
    },
  };
}
