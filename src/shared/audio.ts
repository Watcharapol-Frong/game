// Sound for the psychometric session.
//
// Everything here is synthesised with the Web Audio API rather than loaded from
// audio files: the session already ships ~1.3 MB of art inlined into a single
// artifact, and a background loop alone would roughly double that. Synthesis
// costs no download and no decode.
//
// Two constraints shape the design:
//   * Browsers refuse to start audio before a user gesture, so the context is
//     created lazily and `unlockAudio()` must run inside a real click.
//   * This is a measurement instrument people may run in a shared room, so
//     sound is opt-out at any time and the preference persists.

const MUTE_STORAGE_KEY = 'ktp_audio_muted';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let ambientGain: GainNode | null = null;
let ambientNodes: { stop: () => void } | null = null;
let muted = readMutedPreference();
let unavailable = false;

function readMutedPreference(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistMutedPreference(value: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Private mode or blocked storage: the preference just won't survive reload.
  }
}

function getCtx(): AudioContext | null {
  if (unavailable) return null;
  if (ctx) return ctx;

  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    unavailable = true;
    return null;
  }

  try {
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(ctx.destination);
    return ctx;
  } catch {
    unavailable = true;
    return null;
  }
}

/**
 * Must be called from inside a user gesture (a click handler) before any sound
 * will actually play. Safe to call repeatedly.
 */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  persistMutedPreference(value);
  if (masterGain && ctx) {
    // Ramp instead of stepping, so toggling doesn't click.
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.setTargetAtTime(value ? 0 : 1, ctx.currentTime, 0.02);
  }
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

// ---- synthesis helpers -------------------------------------------------

/** A single enveloped oscillator tone. */
function tone(opts: {
  freq: number;
  toFreq?: number;
  type?: OscillatorType;
  start?: number;
  duration: number;
  peak: number;
  attack?: number;
}): void {
  const c = getCtx();
  if (!c || !masterGain) return;

  const t0 = c.currentTime + (opts.start ?? 0);
  const attack = opts.attack ?? 0.008;

  const osc = c.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.toFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.toFreq), t0 + opts.duration);
  }

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(opts.peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** A burst of filtered noise. */
function noise(opts: {
  duration: number;
  peak: number;
  filterFreq: number;
  filterToFreq?: number;
  type?: BiquadFilterType;
  start?: number;
}): void {
  const c = getCtx();
  if (!c || !masterGain) return;

  const t0 = c.currentTime + (opts.start ?? 0);
  const frames = Math.max(1, Math.floor(c.sampleRate * opts.duration));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = opts.type ?? 'lowpass';
  filter.frequency.setValueAtTime(opts.filterFreq, t0);
  if (opts.filterToFreq !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, opts.filterToFreq), t0 + opts.duration);
  }

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(opts.peak, t0 + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  src.start(t0);
  src.stop(t0 + opts.duration + 0.02);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

// ---- sound effects -----------------------------------------------------

/** Game 1 pump: a short water-squirt blip that rises as the cactus grows. */
export function playPump(intensity = 0): void {
  // intensity 0..1 nudges the pitch up so later pumps feel more strained.
  const base = 320 + intensity * 260;
  tone({ freq: base, toFreq: base * 1.9, type: 'triangle', duration: 0.12, peak: 0.30 });
  noise({ duration: 0.09, peak: 0.10, filterFreq: 900, filterToFreq: 2600, type: 'bandpass' });
}

/** Game 1 bank: a two-note coin chime. */
export function playBank(): void {
  tone({ freq: 880, type: 'triangle', duration: 0.16, peak: 0.30 });
  tone({ freq: 1320, type: 'triangle', duration: 0.30, peak: 0.24, start: 0.08 });
}

/** Game 1 burst: noise blast plus a falling thud. */
export function playBurst(): void {
  noise({ duration: 0.45, peak: 0.50, filterFreq: 3200, filterToFreq: 220 });
  tone({ freq: 180, toFreq: 45, type: 'sawtooth', duration: 0.45, peak: 0.36 });
}

/** Positive feedback (Game 2 correct, Game 3 correct). */
export function playCorrect(): void {
  tone({ freq: 660, type: 'sine', duration: 0.12, peak: 0.26 });
  tone({ freq: 990, type: 'sine', duration: 0.22, peak: 0.22, start: 0.07 });
}

/** Negative feedback (Game 2 incorrect, Game 3 incorrect/timeout). */
export function playIncorrect(): void {
  tone({ freq: 240, toFreq: 150, type: 'square', duration: 0.22, peak: 0.18 });
}

/** Neutral UI tick, e.g. advancing a Game 4 round. */
export function playClick(): void {
  tone({ freq: 520, type: 'sine', duration: 0.07, peak: 0.16 });
}

/** Session-complete flourish. */
export function playComplete(): void {
  [523, 659, 784, 1047].forEach((f, i) => {
    tone({ freq: f, type: 'triangle', duration: 0.42, peak: 0.24, start: i * 0.1 });
  });
}

// ---- ambient background ------------------------------------------------

/**
 * A soft, slowly-breathing pad. Deliberately quiet and static: this plays under
 * a timed cognitive test, so it must not pull attention or cue the beat.
 */
export function startAmbient(): void {
  const c = getCtx();
  if (!c || !masterGain || ambientNodes) return;

  ambientGain = c.createGain();
  ambientGain.gain.value = 0.0001;
  ambientGain.gain.setTargetAtTime(0.10, c.currentTime, 1.5);

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;

  filter.connect(ambientGain);
  ambientGain.connect(masterGain);

  // A quiet open chord: root, fifth, octave, slightly detuned so it drifts.
  const voices = [110, 164.81, 220].map((freq, i) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value = (i - 1) * 6;

    const vGain = c.createGain();
    vGain.gain.value = 0.34;

    // Slow independent swell per voice so the pad never sits still.
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.05 + i * 0.017;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = 0.16;
    lfo.connect(lfoDepth);
    lfoDepth.connect(vGain.gain);

    osc.connect(vGain);
    vGain.connect(filter);
    osc.start();
    lfo.start();
    return { osc, lfo, vGain, lfoDepth };
  });

  ambientNodes = {
    stop: () => {
      const now = c.currentTime;
      ambientGain?.gain.cancelScheduledValues(now);
      ambientGain?.gain.setTargetAtTime(0.0001, now, 0.4);
      voices.forEach(({ osc, lfo, vGain, lfoDepth }) => {
        osc.stop(now + 1.6);
        lfo.stop(now + 1.6);
        osc.onended = () => {
          osc.disconnect();
          lfo.disconnect();
          vGain.disconnect();
          lfoDepth.disconnect();
        };
      });
      setTimeout(() => {
        filter.disconnect();
        ambientGain?.disconnect();
        ambientGain = null;
      }, 1800);
    },
  };
}

export function stopAmbient(): void {
  ambientNodes?.stop();
  ambientNodes = null;
}

export function isAmbientPlaying(): boolean {
  return ambientNodes !== null;
}
