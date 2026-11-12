// Eternal Radio — original instrumental tracks by Eternal Inc. Composed as data and played by engine.ts.
// Chill, modern and wordless. "Sunrise" is the theme of the Beta 0.1.1 "Sunrise" release.

export interface Section {
  name: string;
  bars: number;
  parts: Partial<Record<'pad' | 'bass' | 'keys' | 'arp' | 'melody' | 'drums' | 'texture', boolean>>;
  /** 0–1.2 loudness of this section. */
  energy?: number;
  /** Which melody variation plays here. */
  variant?: number;
}

export interface Track {
  id: string;
  title: string;
  mood: [string, string];
  bpm: number;
  /** MIDI note of the key's tonic (around middle C). */
  root: number;
  scale: 'major' | 'minor' | 'dorian' | 'lydian';
  /** Scale degrees (0 = tonic) of the chord progression. */
  progression: number[];
  barsPerChord: number;
  ext?: 5 | 7 | 9;
  swing?: number;
  structure: Section[];
  bassPattern: number[];
  bassLength?: number;
  keysPattern: number[];
  arp?: number[];
  drums: { kick: number[]; snare: number[]; hat: number[]; shaker?: number[] };
  texture?: 'vinyl' | 'rain';
  reverb?: number;
  brightness?: number;
  padCutoff?: number;
  seed: number;
  /** Cover colours (liquid glass blobs). */
  colors: [string, string, string];
}

/** 'x' = 1, 'o' = soft (0.55), '2' = special (fifth for bass, full chord for keys), '.' = rest. */
export const p = (s: string) => [...s.replace(/\s/g, '')].map((c) => (c === 'x' ? 1 : c === 'o' ? 0.55 : c === '2' ? 2 : 0));

const all = { pad: true, bass: true, keys: true, melody: true, drums: true };

export const TRACKS: Track[] = [
  {
    id: 'sunrise',
    title: 'Sunrise',
    mood: ['Warm, hopeful, a new day', 'Тёплый, светлый, новый день'],
    bpm: 84,
    root: 62, // D
    scale: 'major',
    progression: [0, 4, 5, 3], // D – A – Bm – G
    barsPerChord: 1,
    ext: 9,
    swing: 0.12,
    structure: [
      { name: 'Dawn', bars: 8, parts: { pad: true, arp: true }, energy: 0.65 },
      { name: 'Rise', bars: 8, parts: { pad: true, arp: true, bass: true, keys: true }, energy: 0.85 },
      { name: 'Light', bars: 16, parts: { ...all, arp: true }, energy: 1, variant: 0 },
      { name: 'Glow', bars: 8, parts: { pad: true, bass: true, melody: true }, energy: 0.8, variant: 1 },
      { name: 'Light', bars: 16, parts: { ...all, arp: true }, energy: 1.05, variant: 2 },
      { name: 'Morning', bars: 8, parts: { pad: true, arp: true, keys: true }, energy: 0.6 },
    ],
    bassPattern: p('x.....x. x.......'),
    keysPattern: p('2.......2...2...'),
    arp: [0, 1, 2, 3, 4, 3, 2, 1],
    drums: { kick: p('x.......x.o.....'), snare: p('....o.......o...'), hat: p('..o...o...o...o.'), shaker: p('o.o.o.o.o.o.o.o.') },
    reverb: 0.42,
    seed: 2026,
    colors: ['#FFB547', '#FF5E8A', '#5B8CFF'],
  },
  {
    id: 'liquid-glass',
    title: 'Liquid Glass',
    mood: ['Glassy, smooth, floating', 'Стеклянный, плавный, невесомый'],
    bpm: 92,
    root: 66, // F#
    scale: 'dorian',
    progression: [0, 3, 5, 4],
    barsPerChord: 2,
    ext: 9,
    swing: 0.08,
    structure: [
      { name: 'Surface', bars: 8, parts: { pad: true, arp: true }, energy: 0.7 },
      { name: 'Flow', bars: 16, parts: { pad: true, arp: true, bass: true, drums: true }, energy: 0.95 },
      { name: 'Refract', bars: 16, parts: { ...all, arp: true }, energy: 1, variant: 1 },
      { name: 'Still', bars: 8, parts: { pad: true, melody: true }, energy: 0.7, variant: 2 },
      { name: 'Flow', bars: 16, parts: { ...all, arp: true }, energy: 1.05, variant: 3 },
    ],
    bassPattern: p('x..x..x...x..x..'),
    bassLength: 2,
    keysPattern: p('..2...2...2...2.'),
    arp: [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 2, 1, 3, 2, 1],
    drums: { kick: p('x.....x...x.....'), snare: p('....x.......x...'), hat: p('o.x.o.x.o.x.o.x.') },
    reverb: 0.5,
    brightness: 10000,
    seed: 77,
    colors: ['#7FE7FF', '#8B5CF6', '#FF7AC6'],
  },
  {
    id: 'afterglow',
    title: 'Afterglow',
    mood: ['Lo-fi, cosy evening', 'Лоу-фай, уютный вечер'],
    bpm: 78,
    root: 63, // Eb
    scale: 'major',
    progression: [3, 2, 5, 0], // IVmaj7 – iii7 – vi7 – Imaj7
    barsPerChord: 1,
    ext: 7,
    swing: 0.3,
    structure: [
      { name: 'Dusk', bars: 4, parts: { keys: true, texture: true }, energy: 0.7 },
      { name: 'Groove', bars: 16, parts: { keys: true, bass: true, drums: true, texture: true, pad: true }, energy: 1 },
      { name: 'Hum', bars: 16, parts: { ...all, texture: true }, energy: 1, variant: 1 },
      { name: 'Window', bars: 8, parts: { keys: true, pad: true, texture: true }, energy: 0.7 },
      { name: 'Groove', bars: 16, parts: { ...all, texture: true }, energy: 1, variant: 2 },
      { name: 'Lights out', bars: 4, parts: { keys: true, texture: true }, energy: 0.55 },
    ],
    bassPattern: p('x......x..x.....'),
    keysPattern: p('2.....2...2..2..'),
    drums: { kick: p('x......xx.......'), snare: p('....x.......x...'), hat: p('x.x.x.x.x.x.x.xo') },
    texture: 'vinyl',
    reverb: 0.3,
    brightness: 5200,
    padCutoff: 900,
    seed: 314,
    colors: ['#FF8A5B', '#B44CFF', '#1E2A6B'],
  },
  {
    id: 'cloud-nine',
    title: 'Cloud Nine',
    mood: ['Playful and bouncy — Cloudy’s theme', 'Игривый и прыгучий — тема Cloudy'],
    bpm: 104,
    root: 60, // C
    scale: 'major',
    progression: [0, 5, 3, 4],
    barsPerChord: 1,
    ext: 7,
    swing: 0.18,
    structure: [
      { name: 'Hello', bars: 8, parts: { keys: true, arp: true }, energy: 0.8 },
      { name: 'Hop', bars: 16, parts: { ...all }, energy: 1, variant: 0 },
      { name: 'Float', bars: 8, parts: { pad: true, arp: true, bass: true }, energy: 0.8 },
      { name: 'Hop', bars: 16, parts: { ...all, arp: true }, energy: 1.05, variant: 1 },
      { name: 'Bye', bars: 8, parts: { keys: true, melody: true }, energy: 0.7, variant: 2 },
    ],
    bassPattern: p('x...2...x...2.x.'),
    bassLength: 1.5,
    keysPattern: p('..x...x...x...x.'),
    arp: [0, 2, 1, 3],
    drums: { kick: p('x...x...x...x...'), snare: p('....x.......x..o'), hat: p('..x...x...x...x.'), shaker: p('xoxoxoxoxoxoxoxo') },
    reverb: 0.3,
    brightness: 11000,
    seed: 9,
    colors: ['#FFFFFF', '#8FD3FF', '#FFC6E5'],
  },
  {
    id: 'deep-focus',
    title: 'Deep Focus',
    mood: ['Minimal, calm — for work', 'Минималистичный, спокойный — для работы'],
    bpm: 70,
    root: 57, // A
    scale: 'minor',
    progression: [0, 5, 2, 6],
    barsPerChord: 2,
    ext: 9,
    swing: 0,
    structure: [
      { name: 'Breathe', bars: 8, parts: { pad: true }, energy: 0.7 },
      { name: 'Pulse', bars: 16, parts: { pad: true, bass: true, arp: true }, energy: 0.8 },
      { name: 'Deep', bars: 16, parts: { pad: true, bass: true, arp: true, melody: true }, energy: 0.85, variant: 1 },
      { name: 'Pulse', bars: 16, parts: { pad: true, bass: true, arp: true, drums: true }, energy: 0.8 },
      { name: 'Exhale', bars: 8, parts: { pad: true }, energy: 0.6 },
    ],
    bassPattern: p('x.......x.......'),
    bassLength: 6,
    keysPattern: p('................'),
    arp: [0, 2, 3, 2],
    drums: { kick: p('x.......x.......'), snare: p('................'), hat: p('....o.......o...') },
    reverb: 0.55,
    brightness: 6000,
    padCutoff: 1100,
    seed: 4242,
    colors: ['#1B2A4A', '#3E7BFA', '#9AD1FF'],
  },
  {
    id: 'night-drive',
    title: 'Night Drive',
    mood: ['City lights, steady motion', 'Огни города, ровное движение'],
    bpm: 96,
    root: 59, // B
    scale: 'minor',
    progression: [0, 5, 2, 6],
    barsPerChord: 2,
    ext: 7,
    swing: 0,
    structure: [
      { name: 'Ignition', bars: 8, parts: { pad: true, arp: true }, energy: 0.75 },
      { name: 'Highway', bars: 16, parts: { pad: true, arp: true, bass: true, drums: true }, energy: 1 },
      { name: 'Neon', bars: 16, parts: { ...all, arp: true }, energy: 1.05, variant: 1 },
      { name: 'Tunnel', bars: 8, parts: { pad: true, bass: true }, energy: 0.7 },
      { name: 'Highway', bars: 16, parts: { ...all, arp: true }, energy: 1.05, variant: 2 },
    ],
    bassPattern: p('x.x.x.x.x.x.x.x.'),
    bassLength: 1.6,
    keysPattern: p('2.......2.......'),
    arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3],
    drums: { kick: p('x...x...x...x...'), snare: p('....x.......x...'), hat: p('..x...x...x...x.') },
    reverb: 0.4,
    brightness: 8500,
    seed: 1984,
    colors: ['#FF2E93', '#5B2EFF', '#0B0F2E'],
  },
  {
    id: 'rain-on-glass',
    title: 'Rain on Glass',
    mood: ['Soft rain, gentle keys', 'Тихий дождь и нежные клавиши'],
    bpm: 72,
    root: 67, // G
    scale: 'lydian',
    progression: [0, 1, 5, 4],
    barsPerChord: 2,
    ext: 9,
    swing: 0.1,
    structure: [
      { name: 'Drops', bars: 8, parts: { texture: true, keys: true }, energy: 0.7 },
      { name: 'Window', bars: 16, parts: { texture: true, keys: true, pad: true, bass: true }, energy: 0.85 },
      { name: 'Puddles', bars: 16, parts: { texture: true, keys: true, pad: true, bass: true, melody: true, drums: true }, energy: 0.9, variant: 1 },
      { name: 'Clearing', bars: 8, parts: { texture: true, pad: true, melody: true }, energy: 0.7, variant: 2 },
    ],
    bassPattern: p('x.......x...x...'),
    bassLength: 5,
    keysPattern: p('2...x...2...x.x.'),
    drums: { kick: p('x.........x.....'), snare: p('................'), hat: p('......o.......o.') },
    texture: 'rain',
    reverb: 0.5,
    brightness: 6500,
    padCutoff: 1000,
    seed: 61,
    colors: ['#6FA3C8', '#B8D8E8', '#2D3E57'],
  },
  {
    id: 'eternal',
    title: 'Eternal',
    mood: ['Dreamy, wide, timeless', 'Мечтательный, широкий, вне времени'],
    bpm: 80,
    root: 64, // E
    scale: 'major',
    progression: [0, 3, 5, 4],
    barsPerChord: 2,
    ext: 9,
    swing: 0.06,
    structure: [
      { name: 'Origin', bars: 8, parts: { pad: true }, energy: 0.65 },
      { name: 'Horizon', bars: 16, parts: { pad: true, arp: true, bass: true }, energy: 0.85 },
      { name: 'Infinite', bars: 16, parts: { ...all, arp: true }, energy: 1, variant: 1 },
      { name: 'Echo', bars: 8, parts: { pad: true, melody: true }, energy: 0.75, variant: 2 },
      { name: 'Infinite', bars: 16, parts: { ...all, arp: true }, energy: 1.05, variant: 3 },
      { name: 'Forever', bars: 8, parts: { pad: true, arp: true }, energy: 0.55 },
    ],
    bassPattern: p('x.......x...2...'),
    bassLength: 4,
    keysPattern: p('2.......2.......'),
    arp: [0, 2, 4, 3, 1, 3, 4, 2],
    drums: { kick: p('x.......x.......'), snare: p('....o.......o...'), hat: p('..o...o...o...o.'), shaker: p('.o.o.o.o.o.o.o.o') },
    reverb: 0.6,
    brightness: 9000,
    seed: 888,
    colors: ['#2F6BFF', '#FF4FA3', '#FFD60A'],
  },
];
