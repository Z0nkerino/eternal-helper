// Cloudy's body and decisions, as pure functions (tested in brain.test.ts).
// Coordinates are window pixels; y grows downward; the floor is the bottom of the work area.

export type Action = 'idle' | 'walk' | 'sit' | 'sleep' | 'drag' | 'fall' | 'dance';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  action: Action;
  /** When the current action ends and Cloudy picks a new one (ms timestamp). */
  until: number;
}

export interface Env {
  width: number;
  height: number;
  /** Cloudy's width; his height is 0.78 of it. */
  size: number;
  /** User speed multiplier (1 = normal). */
  speed: number;
  now: number;
  night: boolean;
  music: boolean;
}

export const GRAVITY = 2400;
export const WALK = 38; // px/s at speed 1
export const heightOf = (size: number) => size * 0.78;
export const floorY = (env: Pick<Env, 'height' | 'size'>) => env.height - heightOf(env.size);

/** Moves Cloudy forward by `dt` seconds: walking, falling, bouncing off the floor and the screen edges. */
export function step(b: Body, dt: number, env: Env): Body {
  const n = { ...b };
  const floor = floorY(env);
  const maxX = env.width - env.size;
  if (n.action === 'drag') return n;
  if (n.action === 'fall' || n.y < floor - 0.5) {
    n.vy += GRAVITY * dt;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    n.vx *= Math.pow(0.6, dt); // air drag
    if (n.x < 0 || n.x > maxX) {
      n.x = Math.min(maxX, Math.max(0, n.x));
      n.vx = -n.vx * 0.5;
    }
    if (n.y >= floor) {
      n.y = floor;
      if (Math.abs(n.vy) > 320) {
        n.vy = -n.vy * 0.38; // bounce
        n.vx *= 0.7;
      } else {
        n.vy = 0;
        n.vx = 0;
        n.action = 'idle';
        n.until = env.now + 900;
      }
    } else {
      n.action = 'fall';
    }
    return n;
  }
  if (n.action === 'walk') {
    n.x += n.facing * WALK * env.speed * dt;
    if (n.x <= 0 || n.x >= maxX) {
      n.x = Math.min(maxX, Math.max(0, n.x));
      n.facing = n.facing === 1 ? -1 : 1;
    }
  }
  n.y = floor;
  return n;
}

/** Picks the next thing to do when the current action is over. `rand` returns 0..1. */
export function decide(b: Body, env: Env, rand: () => number = Math.random): Body {
  if (b.action === 'drag' || b.action === 'fall' || env.now < b.until) return b;
  const r = rand();
  const n = { ...b };
  if (env.music) {
    n.action = r < 0.75 ? 'dance' : 'walk';
  } else if (env.night) {
    n.action = r < 0.6 ? 'sleep' : r < 0.8 ? 'sit' : 'walk';
  } else {
    n.action = r < 0.45 ? 'walk' : r < 0.8 ? 'idle' : r < 0.95 ? 'sit' : 'sleep';
  }
  if (n.action === 'walk' && rand() < 0.4) n.facing = n.facing === 1 ? -1 : 1;
  const dur: Record<Action, [number, number]> = { walk: [3, 9], idle: [2, 5], sit: [5, 12], sleep: [20, 60], dance: [6, 14], drag: [0, 0], fall: [0, 0] };
  const [lo, hi] = dur[n.action];
  n.until = env.now + (lo + rand() * (hi - lo)) * 1000;
  return n;
}

/** Throw velocity from recent pointer samples (px/s), capped so he doesn't fly off. */
export function throwVelocity(samples: { x: number; y: number; t: number }[]): { vx: number; vy: number } {
  if (samples.length < 2) return { vx: 0, vy: 0 };
  const a = samples[0];
  const z = samples[samples.length - 1];
  const dt = Math.max(16, z.t - a.t) / 1000;
  const cap = (v: number) => Math.max(-2200, Math.min(2200, v));
  return { vx: cap((z.x - a.x) / dt), vy: cap((z.y - a.y) / dt) };
}

/** Steps aside when the cursor comes close while he walks along the floor. */
export function avoidCursor(b: Body, cursor: { x: number; y: number } | null, size: number): Body {
  if (!cursor || b.action !== 'walk') return b;
  const cx = b.x + size / 2;
  const cy = b.y + heightOf(size) / 2;
  if (Math.hypot(cursor.x - cx, cursor.y - cy) > size * 1.6) return b;
  const away: 1 | -1 = cursor.x < cx ? 1 : -1;
  return away === b.facing ? b : { ...b, facing: away };
}
