import type { SfxName } from '../game/types';

export interface Audio {
  play(name: SfxName): void;
  unlock(): void;
  setMuted(m: boolean): void;
  muted: boolean;
}

const MUTE_KEY = 'sizzle-street.muted';

/** Fully procedural Web Audio SFX. No files. */
export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let sizzle: { src: AudioBufferSourceNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked */ }

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  };

  // --- primitives -------------------------------------------------------
  const env = (g: GainNode, t: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };

  const tone = (
    c: AudioContext, freq: number, dur: number, opts: { type?: OscillatorType; peak?: number; at?: number; slide?: number } = {},
  ) => {
    const t = c.currentTime + (opts.at ?? 0);
    const o = c.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    const g = c.createGain();
    env(g, t, opts.peak ?? 0.3, 0.005, dur);
    o.connect(g).connect(master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const noise = (
    c: AudioContext, dur: number,
    opts: { peak?: number; at?: number; filter?: BiquadFilterType; freq?: number; q?: number; attack?: number } = {},
  ) => {
    const t = c.currentTime + (opts.at ?? 0);
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = opts.filter ?? 'bandpass';
    f.frequency.value = opts.freq ?? 2000;
    f.Q.value = opts.q ?? 1;
    const g = c.createGain();
    env(g, t, opts.peak ?? 0.3, opts.attack ?? 0.005, dur);
    s.connect(f).connect(g).connect(master!);
    s.start(t);
    s.stop(t + dur + 0.05);
  };

  // --- sounds -------------------------------------------------------------
  const sfx: Record<SfxName, (c: AudioContext) => void> = {
    chop: (c) => {
      noise(c, 0.03, { peak: 0.5, filter: 'highpass', freq: 3000 });        // click
      tone(c, 140, 0.12, { type: 'triangle', peak: 0.5, slide: 60 });       // thud
    },
    sizzle_start: (c) => {
      if (sizzle) return;
      const src = c.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2500;
      const lfo = c.createOscillator();
      lfo.frequency.value = 7;
      const lfoG = c.createGain();
      lfoG.gain.value = 0.08;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, c.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, c.currentTime + 0.3);
      lfo.connect(lfoG).connect(gain.gain);
      src.connect(f).connect(gain).connect(master!);
      src.start();
      lfo.start();
      src.onended = () => { src.disconnect(); f.disconnect(); lfoG.disconnect(); gain.disconnect(); };
      sizzle = { src, lfo, gain };
    },
    sizzle_loop_stop: (c) => {
      if (!sizzle) return;
      const { src, lfo, gain } = sizzle;
      sizzle = null;
      gain.gain.cancelScheduledValues(c.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.4);
      src.stop(c.currentTime + 0.45);
      lfo.stop(c.currentTime + 0.45);
    },
    fry_drop: (c) => {
      noise(c, 0.35, { peak: 0.6, filter: 'highpass', freq: 1500, attack: 0.01 });
      noise(c, 0.15, { peak: 0.3, filter: 'lowpass', freq: 400 });
    },
    fry_pull: (c) => {
      noise(c, 0.25, { peak: 0.35, filter: 'highpass', freq: 3000, attack: 0.05 });
      tone(c, 500, 0.15, { type: 'triangle', peak: 0.15, slide: 900 });
    },
    shake: (c) => noise(c, 0.08, { peak: 0.4, freq: 6000, q: 0.7 }),
    stir: (c) => noise(c, 0.4, { peak: 0.2, filter: 'lowpass', freq: 900, attack: 0.15 }),
    ding: (c) => {
      tone(c, 1760, 0.6, { peak: 0.25 });
      tone(c, 2637, 0.4, { peak: 0.1 });
    },
    bell: (c) => {
      tone(c, 880, 0.9, { peak: 0.3 });
      tone(c, 1320, 0.7, { peak: 0.15 });
      tone(c, 2200, 0.3, { peak: 0.08 });
    },
    coin: (c) => {
      tone(c, 1046, 0.1, { type: 'square', peak: 0.12 });
      tone(c, 1568, 0.25, { type: 'square', peak: 0.12, at: 0.08 });
    },
    good: (c) => {
      tone(c, 523, 0.12, { type: 'triangle', peak: 0.25 });
      tone(c, 659, 0.12, { type: 'triangle', peak: 0.25, at: 0.1 });
      tone(c, 784, 0.3, { type: 'triangle', peak: 0.25, at: 0.2 });
    },
    bad: (c) => {
      tone(c, 330, 0.2, { type: 'sawtooth', peak: 0.15, slide: 250 });
      tone(c, 260, 0.35, { type: 'sawtooth', peak: 0.15, at: 0.18, slide: 180 });
    },
    burn: (c) => {
      tone(c, 70, 0.6, { type: 'sawtooth', peak: 0.3 });
      tone(c, 73, 0.6, { type: 'square', peak: 0.1 });
      noise(c, 0.5, { peak: 0.15, filter: 'lowpass', freq: 300 });
    },
    ui_tap: (c) => tone(c, 900, 0.05, { type: 'triangle', peak: 0.12, slide: 1200 }),
    critic: (c) => {
      [523, 659, 784, 1046].forEach((f, i) => tone(c, f, i === 3 ? 0.7 : 0.16, { type: 'triangle', peak: 0.25, at: i * 0.14 }));
      tone(c, 392, 1.0, { type: 'triangle', peak: 0.12, at: 0.42 });
    },
  };

  const api: Audio = {
    get muted() { return muted; },
    set muted(m: boolean) { api.setMuted(m); },
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') void c.resume();
    },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* storage blocked */ }
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
    },
    play(name) {
      const c = ensure();
      if (!c) return;
      if (c.state !== 'running' && name !== 'sizzle_loop_stop') return; // wait for unlock()
      try { sfx[name](c); } catch { /* never let audio break the game */ }
    },
  };
  return api;
}
