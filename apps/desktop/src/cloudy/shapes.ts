// Cloudy is made of 16 soft puffs. Every shape he can form is a layout of the same 16 puffs, so he can
// morph smoothly from one to another (each puff glides to its new place). Coordinates are in his
// 122×96 drawing; shapes may spill over the edges a little.

export const PUFFS = 16;
export type Puff = [x: number, y: number, r: number];
/** Where the face sits in a shape and how big it is (0 hides it). */
export type FacePos = [x: number, y: number, scale: number];
export interface Shape {
  puffs: Puff[];
  face: FacePos;
}

/** Fills up to 16 puffs by repeating the last ones (repeats sit on top of each other, invisibly). */
function fill(p: Puff[]): Puff[] {
  const out = p.slice(0, PUFFS);
  for (let i = 0; out.length < PUFFS; i++) out.push(out[i % p.length]);
  return out;
}

const ring = (cx: number, cy: number, rx: number, ry: number, n: number, r: (i: number) => number, from = 0, to = from + Math.PI * 2, closed = true): Puff[] =>
  Array.from({ length: n }, (_, i) => {
    const a = from + ((to - from) * i) / (closed ? n : n - 1);
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, r(i)];
  });

const line = (x1: number, y1: number, x2: number, y2: number, n: number, r: number): Puff[] =>
  Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r];
  });

/**
 * His everyday look: a soft, round cloud made of only a few big puffs (so it reads as one solid 3D shape
 * rather than a bunch of circles) — a wide base and two domes on top.
 */
const cloud: Shape = {
  puffs: [
    [61, 66, 24], [36, 66, 18], [86, 66, 18], [47, 48, 20], [71, 42, 25], [61, 74, 20], [40, 72, 15], [82, 72, 15],
    [61, 66, 24], [36, 66, 18], [86, 66, 18], [47, 48, 20], [71, 42, 25], [61, 74, 20], [40, 72, 15], [82, 72, 15],
  ],
  face: [61, 61, 1],
};

const heart: Shape = {
  puffs: [
    [36, 36, 10], [44, 26, 10], [56, 29, 9], [66, 29, 9], [78, 26, 10], [86, 36, 10],
    [84, 48, 10], [76, 60, 10], [68, 70, 9], [61, 79, 8], [54, 70, 9], [46, 60, 10], [38, 48, 10],
    [50, 42, 12], [72, 42, 12], [61, 56, 13],
  ],
  face: [61, 46, 0.7],
};

const star: Shape = {
  puffs: fill([
    ...ring(61, 52, 44, 42, 5, () => 6.5, -Math.PI / 2),
    ...ring(61, 52, 30, 29, 5, () => 8.5, -Math.PI / 2),
    ...ring(61, 52, 15, 14, 5, () => 10, -Math.PI / 2 + Math.PI / 5),
    [61, 52, 15],
  ]),
  face: [61, 53, 0.65],
};

const bunny: Shape = {
  puffs: [
    [61, 72, 18], [45, 74, 13], [77, 74, 13], [61, 60, 14],
    [61, 43, 15], [50, 46, 10], [72, 46, 10],
    [52, 29, 6], [50, 19, 6], [49, 9, 5.5], [70, 29, 6], [72, 19, 6], [73, 9, 5.5],
    [83, 80, 7], [50, 87, 6], [72, 87, 6],
  ],
  face: [61, 46, 0.55],
};

const cat: Shape = {
  puffs: [
    [61, 54, 22], [45, 58, 14], [77, 58, 14], [61, 68, 14],
    [43, 34, 7], [40, 25, 5], [50, 38, 9], [79, 34, 7], [82, 25, 5], [72, 38, 9],
    [30, 58, 5], [26, 65, 4], [92, 58, 5], [96, 65, 4],
    [61, 40, 13], [61, 74, 10],
  ],
  face: [61, 57, 0.85],
};

const fish: Shape = {
  puffs: fill([
    ...ring(52, 50, 30, 17, 10, () => 9),
    [46, 50, 15], [60, 50, 14],
    [88, 50, 8], [99, 40, 8], [99, 60, 8], [107, 32, 5],
  ]),
  face: [42, 48, 0.55],
};

const note: Shape = {
  puffs: fill([
    [46, 76, 13], [36, 78, 9], [56, 73, 9], [40, 70, 8], [52, 82, 8], [46, 84, 7],
    ...line(57, 66, 59, 18, 6, 5),
    [65, 20, 6], [73, 26, 6], [79, 34, 6], [81, 44, 5],
  ]),
  face: [46, 77, 0.42],
};

const umbrella: Shape = {
  puffs: fill([
    ...ring(61, 52, 38, 30, 9, () => 10, Math.PI, Math.PI * 2, false),
    [61, 31, 14], [45, 37, 10], [77, 37, 10],
    ...line(61, 58, 61, 82, 3, 4),
    [55, 88, 4],
  ]),
  face: [61, 38, 0.6],
};

const sun: Shape = {
  puffs: fill([[61, 48, 22], ...ring(61, 48, 38, 36, 12, () => 6), [61, 48, 18], [55, 44, 14], [67, 52, 14]]),
  face: [61, 49, 0.8],
};

const moon: Shape = {
  puffs: fill([
    ...ring(68, 48, 32, 34, 13, (i) => 5 + 8 * Math.sin((i / 12) * Math.PI), Math.PI * 0.35, Math.PI * 1.65, false),
    [44, 48, 11], [48, 34, 8], [48, 62, 8],
  ]),
  face: [46, 49, 0.5],
};

/** E for Eternal. */
const letterE: Shape = {
  puffs: fill([
    ...line(40, 18, 40, 78, 6, 8),
    [53, 18, 8], [66, 18, 8], [78, 18, 7.5],
    [53, 48, 8], [65, 48, 7.5],
    [53, 78, 8], [66, 78, 8], [78, 78, 7.5],
    [40, 48, 9], [72, 48, 6],
  ]),
  face: [0, 0, 0],
};

const sheep: Shape = {
  puffs: [
    [40, 50, 13], [56, 44, 14], [72, 46, 13], [84, 54, 11], [36, 62, 11], [52, 62, 15], [70, 62, 14], [84, 66, 9],
    [22, 52, 10], [16, 46, 5], [26, 44, 5],
    [42, 80, 4], [52, 82, 4], [70, 82, 4], [80, 80, 4], [96, 56, 6],
  ],
  face: [21, 54, 0.4],
};

/** Melted into a lazy puddle (naps on the taskbar, bored days). */
const puddle: Shape = {
  puffs: fill(line(10, 80, 112, 80, 10, 10).map(([x, y], i): Puff => [x, y - Math.sin((i / 9) * Math.PI) * 6, 9 + Math.sin((i / 9) * Math.PI) * 4]).concat([[40, 72, 11], [61, 70, 13], [82, 72, 11]])),
  face: [61, 74, 0.8],
};

/** Stretched up tall, like a morning stretch. */
const tall: Shape = {
  puffs: cloud.puffs.map(([x, y, r]): Puff => [61 + (x - 61) * 0.62, 84 - (84 - y) * 1.55, r * 0.92]),
  face: [61, 46, 0.9],
};

export const SHAPES = { cloud, heart, star, bunny, cat, fish, note, umbrella, sun, moon, letterE, sheep, puddle, tall } satisfies Record<string, Shape>;
export type ShapeId = keyof typeof SHAPES;

/** The shapes he shows off on his own (not the poses used by other animations). */
export const SHOW_SHAPES: ShapeId[] = ['heart', 'star', 'bunny', 'cat', 'fish', 'note', 'umbrella', 'sun', 'moon', 'letterE', 'sheep'];

export const SHAPE_NAMES: Record<ShapeId, [emoji: string, en: string, ru: string]> = {
  cloud: ['☁️', 'Me again!', 'Снова я!'],
  heart: ['💗', 'A heart for you!', 'Сердечко для тебя!'],
  star: ['⭐', 'A star!', 'Звёздочка!'],
  bunny: ['🐰', 'A bunny!', 'Зайчик!'],
  cat: ['🐱', 'Meow!', 'Мяу!'],
  fish: ['🐟', 'Blub-blub, a fish!', 'Буль-буль, рыбка!'],
  note: ['🎵', 'La-la-la ♪', 'Ля-ля-ля ♪'],
  umbrella: ['☂️', 'An umbrella!', 'Зонтик!'],
  sun: ['☀️', 'A little sun!', 'Солнышко!'],
  moon: ['🌙', 'The moon!', 'Луна!'],
  letterE: ['✨', 'E — for Eternal!', 'E — значит Eternal!'],
  sheep: ['🐑', 'Baa! A sheep!', 'Бе-е! Овечка!'],
  puddle: ['🫠', 'Melting…', 'Таю…'],
  tall: ['🙆', 'Stretch!', 'Потягушки!'],
};

/** Each puff flies outward from the middle when he dissolves (deterministic, so it looks the same each time). */
export function scatter(p: Puff, i: number): [dx: number, dy: number] {
  const a = Math.atan2(p[1] - 58, p[0] - 61) + Math.sin(i * 12.9898) * 0.5;
  const d = 26 + ((i * 7) % 5) * 7;
  return [Math.cos(a) * d, Math.sin(a) * d - 6];
}
