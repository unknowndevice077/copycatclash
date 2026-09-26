import { useSettings } from '../store/settings';

/** All game sounds are synthesised with the Web Audio API; no audio assets are shipped. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  const { muted, volume } = useSettings.getState();
  if (muted || volume <= 0) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  (master as GainNode).gain.value = volume * 0.6;
  return { ctx, out: master as GainNode };
}

/** Browsers only allow audio after a user gesture; call this from the first click. */
export function unlockAudio(): void {
  audio();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'triangle', gain = 0.3, slideTo?: number): void {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + start;
  const osc = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(): AudioBuffer | null {
  const a = audio();
  if (!a) return null;
  if (!noiseBuffer) {
    noiseBuffer = a.ctx.createBuffer(1, a.ctx.sampleRate, a.ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function noiseBurst(start: number, dur: number, freq: number, gain: number): void {
  const a = audio();
  const buf = noise();
  if (!a || !buf) return;
  const t0 = a.ctx.currentTime + start;
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const filter = a.ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(a.out);
  src.start(t0);
  src.stop(t0 + dur);
}

export const sfx = {
  click: () => tone(660, 0, 0.06, 'square', 0.08),
  pop: () => tone(520, 0, 0.12, 'sine', 0.2, 900),
  tick: () => tone(880, 0, 0.05, 'square', 0.1),
  finalTick: () => {
    tone(1320, 0, 0.09, 'square', 0.16);
    tone(1320, 0.14, 0.09, 'square', 0.16);
  },
  go: () => {
    tone(523, 0, 0.1, 'square', 0.18);
    tone(784, 0.08, 0.18, 'square', 0.2);
  },
  matchFound: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.22, 'sawtooth', 0.14));
    noiseBurst(0.32, 0.3, 3000, 0.2);
  },
  drumroll: (seconds = 2) => {
    for (let t = 0; t < seconds; t += 0.055) noiseBurst(t, 0.05, 1200 + Math.random() * 400, 0.12 + (t / seconds) * 0.15);
    noiseBurst(seconds, 0.4, 600, 0.4);
    tone(110, seconds, 0.4, 'sine', 0.4, 60);
  },
  fanfare: () => {
    const notes = [523, 659, 784, 1046, 784, 1046];
    notes.forEach((f, i) => tone(f, i * 0.11, i === notes.length - 1 ? 0.6 : 0.16, 'square', 0.16));
    notes.forEach((f, i) => tone(f / 2, i * 0.11, 0.16, 'triangle', 0.12));
  },
  lose: () => {
    [392, 370, 349, 262].forEach((f, i) => tone(f, i * 0.22, i === 3 ? 0.7 : 0.24, 'triangle', 0.22, i === 3 ? 200 : undefined));
  },
  rankUp: () => {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, i * 0.07, 0.5, 'sine', 0.16));
  },
  roundWin: () => {
    tone(784, 0, 0.12, 'square', 0.16);
    tone(1046, 0.1, 0.3, 'square', 0.18);
  },
  roundLose: () => tone(330, 0, 0.35, 'triangle', 0.2, 220),
};

/** Continuous, subtle pencil scratch while drawing. */
let scratch: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

export function scratchStart(): void {
  if (!useSettings.getState().brushSound || scratch) return;
  const a = audio();
  const buf = noise();
  if (!a || !buf) return;
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = a.ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 3500;
  const gain = a.ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(a.out);
  src.start();
  scratch = { src, gain };
}

/** Speed in logical px per ms modulates loudness so faster strokes sound scratchier. */
export function scratchSpeed(speed: number): void {
  if (!scratch || !ctx) return;
  scratch.gain.gain.setTargetAtTime(Math.min(0.05, speed * 0.02), ctx.currentTime, 0.03);
}

export function scratchStop(): void {
  if (!scratch || !ctx) return;
  const s = scratch;
  scratch = null;
  s.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
  s.src.stop(ctx.currentTime + 0.15);
}

export function vibrate(pattern: number | number[]): void {
  if (!useSettings.getState().haptics) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
}
