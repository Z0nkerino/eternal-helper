// Cloudy as a pet: fullness, happiness and energy drift over time; food, play and petting raise them.
// Pure functions (tested in pet.test.ts). State lives in localStorage, shared by Cloudy's windows.

export interface Pet {
  fullness: number; // 0–100
  happiness: number; // 0–100
  energy: number; // 0–100
  /** Friendship points; every 100 is a level. */
  love: number;
  fed: number;
  /** ms timestamp of the last update, to apply time-based decay. */
  at: number;
  /** ms timestamp each food was last eaten (cooldowns). */
  lastFood: Partial<Record<FoodId, number>>;
}

export type FoodId = 'candy' | 'drop' | 'rainbow' | 'sun' | 'snow' | 'cookie' | 'star' | 'icecream';

export interface Food {
  id: FoodId;
  emoji: string;
  name: [string, string];
  fullness: number;
  happiness: number;
  energy: number;
  /** How Cloudy reacts after eating it. */
  reaction: 'love' | 'happy' | 'glow' | 'shiver' | 'sparkle';
}

export const FOODS: Food[] = [
  { id: 'rainbow', emoji: '🌈', name: ['Rainbow', 'Радуга'], fullness: 20, happiness: 25, energy: 5, reaction: 'love' },
  { id: 'candy', emoji: '🍬', name: ['Cloud candy', 'Конфетка'], fullness: 25, happiness: 10, energy: 5, reaction: 'happy' },
  { id: 'drop', emoji: '💧', name: ['Raindrop', 'Капелька'], fullness: 15, happiness: 5, energy: 12, reaction: 'happy' },
  { id: 'sun', emoji: '☀️', name: ['Sunbeam', 'Солнечный лучик'], fullness: 10, happiness: 10, energy: 25, reaction: 'glow' },
  { id: 'snow', emoji: '❄️', name: ['Snowflake', 'Снежинка'], fullness: 10, happiness: 12, energy: 0, reaction: 'shiver' },
  { id: 'cookie', emoji: '🍪', name: ['Cookie', 'Печенька'], fullness: 30, happiness: 8, energy: 8, reaction: 'happy' },
  { id: 'star', emoji: '⭐', name: ['Star', 'Звёздочка'], fullness: 5, happiness: 30, energy: 10, reaction: 'sparkle' },
  { id: 'icecream', emoji: '🍦', name: ['Ice cream', 'Мороженое'], fullness: 22, happiness: 18, energy: 0, reaction: 'shiver' },
];

export const FOOD_COOLDOWN = 8_000;

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function newPet(now = Date.now()): Pet {
  return { fullness: 70, happiness: 75, energy: 80, love: 0, fed: 0, at: now, lastFood: {} };
}

/** Applies the time that passed: hunger grows, happiness fades slowly, energy recovers at night-ish rest. */
export function decay(p: Pet, now = Date.now(), sleeping = false): Pet {
  const h = Math.max(0, now - p.at) / 3_600_000; // hours
  if (h <= 0) return p;
  return {
    ...p,
    fullness: clamp(p.fullness - h * 9), // empty after ~11 h
    happiness: clamp(p.happiness - h * (p.fullness < 25 ? 8 : 4)),
    energy: clamp(p.energy + h * (sleeping ? 30 : -3)),
    at: now,
  };
}

export type FeedResult = { ok: true; pet: Pet; food: Food } | { ok: false; reason: 'full' | 'cooldown'; pet: Pet };

export function feed(p: Pet, id: FoodId, now = Date.now()): FeedResult {
  const food = FOODS.find((f) => f.id === id)!;
  const cur = decay(p, now);
  if (cur.fullness >= 96) return { ok: false, reason: 'full', pet: cur };
  if (now - (cur.lastFood[id] ?? 0) < FOOD_COOLDOWN) return { ok: false, reason: 'cooldown', pet: cur };
  return {
    ok: true,
    food,
    pet: {
      ...cur,
      fullness: clamp(cur.fullness + food.fullness),
      happiness: clamp(cur.happiness + food.happiness),
      energy: clamp(cur.energy + food.energy),
      love: cur.love + (food.reaction === 'love' ? 8 : 4),
      fed: cur.fed + 1,
      lastFood: { ...cur.lastFood, [id]: now },
    },
  };
}

/** Petting (a click) and play make him happier; play costs a little energy. */
export function cheer(p: Pet, kind: 'pet' | 'play', now = Date.now()): Pet {
  const cur = decay(p, now);
  return kind === 'pet'
    ? { ...cur, happiness: clamp(cur.happiness + 3), love: cur.love + 1 }
    : { ...cur, happiness: clamp(cur.happiness + 12), energy: clamp(cur.energy - 8), love: cur.love + 3 };
}

export const level = (p: Pet) => 1 + Math.floor(p.love / 100);

export type Need = 'hungry' | 'bored' | 'sleepy' | 'fine';

/** What he needs most right now (drives his face, behaviour and what he says). */
export function need(p: Pet, night: boolean): Need {
  if (p.fullness < 25) return 'hungry';
  if (p.energy < 20 || (night && p.energy < 60)) return 'sleepy';
  if (p.happiness < 35) return 'bored';
  return 'fine';
}

const KEY = 'eh.cloudy.pet';

export function loadPet(): Pet {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...newPet(), ...(JSON.parse(raw) as Pet) };
  } catch {
    /* storage unavailable */
  }
  return newPet();
}

export function savePet(p: Pet) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}
