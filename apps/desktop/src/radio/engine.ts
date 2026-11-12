// Eternal Radio's synthesizer. Every track is composed as data (tracks.ts) and played live with WebAudio:
// pads, electric piano, glassy bells, sub bass, soft drums and textures, through reverb and a tempo delay.
// Melodies come from a seeded random generator, so each track sounds the same every time.
import type { Track, Section } from './tracks';

export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scale note `deg` (any integer) of a track, as a MIDI number around `octave` offset. */
export function scaleNote(t: Track, deg: number, octave = 0) {
  const sc = SCALES[t.scale];
  const o = Math.floor(deg / 7);
  const i = ((deg % 7) + 7) % 7;
  return t.root + sc[i] + 12 * (o + octave);
}

/** Chord tones (root, 3rd, 5th, 7th, optionally 9th) for a scale degree. */
export function chordTones(t: Track, degree: number, ext = 7): number[] {
  const steps = ext >= 9 ? [0, 2, 4, 6, 8] : ext >= 7 ? [0, 2, 4, 6] : [0, 2, 4];
  return steps.map((s) => scaleNote(t, degree + s));
}

export interface Bar {
  index: number;
  section: Section;
  chord: number;
}

/** The flat list of bars: sections in order, chords cycling through the progression. */
export function bars(t: Track): Bar[] {
  const out: Bar[] = [];
  let i = 0;
  for (const section of t.structure) {
    for (let b = 0; b < section.bars; b++) {
      out.push({ index: i, section, chord: t.progression[Math.floor(i / t.barsPerChord) % t.progression.length] });
      i++;
    }
  }
  return out;
}

export const barSeconds = (t: Track) => (4 * 60) / t.bpm;
export const trackSeconds = (t: Track) => bars(t).length * barSeconds(t);

/** A melody motif per track: 16 steps of scale degrees (null = rest), varied per section seed. */
export function motif(t: Track, variant: number): (number | null)[] {
  const r = rng(t.seed * 31 + variant);
  let deg = 2 + Math.floor(r() * 3);
  return Array.from({ length: 16 }, (_, i) => {
    const restChance = i % 4 === 0 ? 0.15 : 0.55;
    if (r() < restChance) return null;
    deg += Math.floor(r() * 5) - 2; // small steps sound singable
    deg = Math.max(-1, Math.min(9, deg));
    return deg;
  });
}

// ---------- the mixer ----------

export interface Mixer {
  ctx: BaseAudioContext;
  input: GainNode;
  reverb: GainNode;
  delay: GainNode;
  master: GainNode;
  analyser: AnalyserNode;
  noise: AudioBuffer;
}

function impulse(ctx: BaseAudioContext, seconds = 3.6, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const r = rng(7);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function noiseBuffer(ctx: BaseAudioContext) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = rng(99);
  for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  return buf;
}

export function createMixer(ctx: BaseAudioContext, t: Track): Mixer {
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = t.brightness ?? 9000;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  master.connect(tone).connect(comp).connect(analyser).connect(ctx.destination);

  const input = ctx.createGain();
  input.connect(master);

  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx);
  const reverb = ctx.createGain();
  reverb.gain.value = 1;
  const revOut = ctx.createGain();
  revOut.gain.value = t.reverb ?? 0.35;
  reverb.connect(conv).connect(revOut).connect(master);

  const delay = ctx.createGain();
  const d = ctx.createDelay(2);
  d.delayTime.value = (60 / t.bpm) * 0.75; // dotted eighth
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const dl = ctx.createBiquadFilter();
  dl.type = 'lowpass';
  dl.frequency.value = 3200;
  const delOut = ctx.createGain();
  delOut.gain.value = 0.3;
  delay.connect(d).connect(dl).connect(fb).connect(d);
  dl.connect(delOut).connect(master);
  delOut.connect(reverb);

  return { ctx, input, reverb, delay, master, analyser, noise: noiseBuffer(ctx) };
}

// ---------- instruments ----------

function env(g: AudioParam, t: number, a: number, peak: number, d: number, s: number, rel: number, end: number) {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + a);
  g.setTargetAtTime(peak * s, t + a, d);
  g.setTargetAtTime(0.0001, end, rel);
}

function send(m: Mixer, node: AudioNode, dry: number, rev: number, del = 0) {
  const a = m.ctx.createGain();
  a.gain.value = dry;
  node.connect(a).connect(m.input);
  if (rev) {
    const b = m.ctx.createGain();
    b.gain.value = rev;
    node.connect(b).connect(m.reverb);
  }
  if (del) {
    const c = m.ctx.createGain();
    c.gain.value = del;
    node.connect(c).connect(m.delay);
  }
}

export function pad(m: Mixer, time: number, notes: number[], dur: number, vel = 0.5, cutoff = 1400) {
  const ctx = m.ctx;
  const out = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff * 0.5, time);
  f.frequency.linearRampToValueAtTime(cutoff, time + dur * 0.5);
  f.Q.value = 0.6;
  out.connect(f);
  send(m, f, 0.55, 0.7);
  const level = (vel * 0.19) / Math.sqrt(notes.length);
  env(out.gain, time, 1.2, level, 1, 0.9, 0.6, time + dur);
  for (const n of notes) {
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(n);
      o.detune.value = det;
      o.connect(out);
      o.start(time);
      o.stop(time + dur + 3);
    }
  }
}

export function keys(m: Mixer, time: number, note: number, dur: number, vel = 0.6) {
  const ctx = m.ctx;
  const out = ctx.createGain();
  send(m, out, 0.8, 0.35, 0.15);
  env(out.gain, time, 0.008, vel * 0.16, 0.5, 0.25, 0.3, time + dur);
  const trem = ctx.createGain();
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.5;
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = 0.18;
  lfo.connect(lfoAmt).connect(trem.gain);
  trem.gain.value = 0.82;
  trem.connect(out);
  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = midiHz(note);
  const mod = ctx.createOscillator();
  mod.frequency.value = midiHz(note) * 2;
  const modAmt = ctx.createGain();
  modAmt.gain.setValueAtTime(midiHz(note) * 1.2, time);
  modAmt.gain.exponentialRampToValueAtTime(midiHz(note) * 0.08, time + 0.6);
  mod.connect(modAmt).connect(carrier.frequency);
  carrier.connect(trem);
  for (const o of [carrier, mod, lfo]) {
    o.start(time);
    o.stop(time + dur + 1.5);
  }
}

export function bell(m: Mixer, time: number, note: number, vel = 0.5) {
  const ctx = m.ctx;
  const out = ctx.createGain();
  send(m, out, 0.55, 0.6, 0.5);
  out.gain.setValueAtTime(0.0001, time);
  out.gain.linearRampToValueAtTime(vel * 0.11, time + 0.004);
  out.gain.exponentialRampToValueAtTime(0.0001, time + 1.6);
  for (const [mult, g, type] of [[1, 1, 'sine'], [2, 0.35, 'triangle'], [3.01, 0.12, 'sine']] as [number, number, OscillatorType][]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = midiHz(note) * mult;
    const og = ctx.createGain();
    og.gain.value = g;
    o.connect(og).connect(out);
    o.start(time);
    o.stop(time + 1.7);
  }
}

export function bass(m: Mixer, time: number, note: number, dur: number, vel = 0.7) {
  const ctx = m.ctx;
  const out = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  out.connect(f);
  send(m, f, 1, 0);
  env(out.gain, time, 0.02, vel * 0.32, 0.25, 0.7, 0.08, time + dur);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = midiHz(note);
  const o2 = ctx.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = midiHz(note);
  const g2 = ctx.createGain();
  g2.gain.value = 0.25;
  o.connect(out);
  o2.connect(g2).connect(out);
  for (const x of [o, o2]) {
    x.start(time);
    x.stop(time + dur + 0.5);
  }
}

export function kick(m: Mixer, time: number, vel = 0.8) {
  const ctx = m.ctx;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(120, time);
  o.frequency.exponentialRampToValueAtTime(42, time + 0.18);
  g.gain.setValueAtTime(vel * 0.55, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
  o.connect(g);
  send(m, g, 1, 0);
  o.start(time);
  o.stop(time + 0.45);
}

function noiseHit(m: Mixer, time: number, dur: number, vel: number, type: BiquadFilterType, freq: number, rev = 0.15) {
  const ctx = m.ctx;
  const src = ctx.createBufferSource();
  src.buffer = m.noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(f).connect(g);
  send(m, g, 1, rev);
  src.start(time, (time * 7.3) % 1.5);
  src.stop(time + dur + 0.05);
}

export const hat = (m: Mixer, time: number, vel = 0.5) => noiseHit(m, time, 0.05, vel * 0.09, 'highpass', 8000, 0.05);
export const snare = (m: Mixer, time: number, vel = 0.6) => noiseHit(m, time, 0.18, vel * 0.16, 'bandpass', 1900, 0.35);
export const shaker = (m: Mixer, time: number, vel = 0.4) => noiseHit(m, time, 0.09, vel * 0.06, 'bandpass', 6500, 0.1);

/** Texture bed for one bar: vinyl crackle or rain. */
export function texture(m: Mixer, time: number, dur: number, kind: 'vinyl' | 'rain', seed: number) {
  if (kind === 'rain') {
    const ctx = m.ctx;
    const src = ctx.createBufferSource();
    src.buffer = m.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.028, time + 0.3);
    g.gain.setValueAtTime(0.028, time + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, time + dur + 0.05);
    src.connect(f).connect(g);
    send(m, g, 1, 0.2);
    src.start(time, (seed * 0.37) % 1.5);
    src.stop(time + dur + 0.1);
    return;
  }
  const r = rng(seed);
  for (let i = 0; i < 9; i++) noiseHit(m, time + r() * dur, 0.012, 0.03 + r() * 0.03, 'highpass', 3000, 0);
}

// ---------- scheduling one bar ----------

/** Schedules every note of bar `b` starting at `time`. */
export function scheduleBar(m: Mixer, t: Track, b: Bar, time: number) {
  const beat = 60 / t.bpm;
  const six = beat / 4;
  const sw = (i: number) => (i % 2 === 1 ? six * (t.swing ?? 0) : 0);
  const on = (part: keyof Section['parts']) => !!b.section.parts[part];
  const chord = chordTones(t, b.chord, t.ext ?? 7);
  const barDur = beat * 4;
  const v = b.section.energy ?? 1;

  if (on('pad')) pad(m, time, chord.map((n) => n - 12), barDur, 0.55 * v, t.padCutoff ?? 1400);
  if (on('texture') && t.texture) texture(m, time, barDur, t.texture, t.seed + b.index);

  if (on('bass')) {
    const root = chord[0] - 24;
    t.bassPattern.forEach((step, i) => {
      if (step) bass(m, time + i * six + sw(i), step === 2 ? root + 7 : root, six * (t.bassLength ?? 3), 0.7 * v);
    });
  }

  if (on('keys')) {
    t.keysPattern.forEach((step, i) => {
      if (!step) return;
      const notes = step === 2 ? chord.slice(1, 4) : [chord[(i / 2) % chord.length | 0]];
      for (const n of notes) keys(m, time + i * six + sw(i), n, six * (step === 2 ? 3 : 2), 0.55 * v);
    });
  }

  if (on('arp')) {
    const pattern = t.arp ?? [0, 1, 2, 3, 2, 1, 2, 3];
    const per = 16 / pattern.length;
    pattern.forEach((idx, i) => bell(m, time + i * per * six + sw(i * per), chord[idx % chord.length] + 12, 0.45 * v));
  }

  if (on('melody')) {
    const mot = motif(t, b.section.variant ?? 0);
    mot.forEach((deg, i) => deg != null && bell(m, time + i * six + sw(i), scaleNote(t, deg, 1), (i % 4 === 0 ? 0.6 : 0.42) * v));
  }

  if (on('drums')) {
    const d = t.drums;
    d.kick.forEach((x, i) => x && kick(m, time + i * six, x * v));
    d.snare.forEach((x, i) => x && snare(m, time + i * six + sw(i), x * v));
    d.hat.forEach((x, i) => x && hat(m, time + i * six + sw(i), x * v));
    d.shaker?.forEach((x, i) => x && shaker(m, time + i * six + sw(i), x * v));
  }
}
