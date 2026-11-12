// Cloudy's movement, as pure functions (tested in brain.test.ts).
// He floats: most of the time he stays at his spot (gently bobbing, done in CSS), and only now and then
// takes a lively trip somewhere on the screen. Thrown, he glides with friction and settles where he stops.
// Coordinates are window pixels (top-left of Cloudy); the window covers the work area.

export type Mode = 'rest' | 'trip' | 'glide' | 'drag';

export interface Trip {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Two control points for a curvy, playful path. */
  c1: { x: number; y: number };
  c2: { x: number; y: number };
  start: number;
  duration: number;
  /** Return to the spot afterwards (a visit) or stay at the destination (a move). */
  back: boolean;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  mode: Mode;
  trip: Trip | null;
}

export interface Area {
  width: number;
  height: number;
  /** Cloudy's width; his height is 0.8 of it. */
  size: number;
}

export const heightOf = (size: number) => size * 0.8;
const margin = 8;

export function clampToArea(x: number, y: number, a: Area) {
  return {
    x: Math.min(a.width - a.size - margin, Math.max(margin, x)),
    y: Math.min(a.height - heightOf(a.size) - margin, Math.max(margin, y)),
  };
}

/** Where he lives by default: bottom-right, above the taskbar / Dock. */
export const defaultSpot = (a: Area) => clampToArea(a.width - a.size - 48, a.height - heightOf(a.size) - 36, a);

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function bezier(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Plans a trip to a point (or a random one). `speed` 1 = normal; `rand` returns 0..1. */
export function planTrip(b: Body, a: Area, now: number, opts: { to?: { x: number; y: number }; back?: boolean; speed?: number; rand?: () => number } = {}): Body {
  const rand = opts.rand ?? Math.random;
  const to = clampToArea(opts.to?.x ?? margin + rand() * (a.width - a.size - 2 * margin), opts.to?.y ?? margin + rand() * (a.height - heightOf(a.size) - 2 * margin), a);
  const from = { x: b.x, y: b.y };
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  // Swoop: control points pushed sideways from the straight line for a lively curve.
  const nx = -(to.y - from.y) / (dist || 1);
  const ny = (to.x - from.x) / (dist || 1);
  const swing = (rand() - 0.5) * Math.min(260, dist * 0.6);
  const c1 = { x: from.x + (to.x - from.x) * 0.3 + nx * swing, y: from.y + (to.y - from.y) * 0.3 + ny * swing - 40 };
  const c2 = { x: from.x + (to.x - from.x) * 0.7 - nx * swing * 0.6, y: from.y + (to.y - from.y) * 0.7 - ny * swing * 0.6 - 20 };
  const duration = Math.max(900, Math.min(6000, (dist / (260 * (opts.speed ?? 1))) * 1000));
  return { ...b, mode: 'trip', vx: 0, vy: 0, facing: to.x >= from.x ? 1 : -1, trip: { from, to, c1, c2, start: now, duration, back: !!opts.back } };
}

export interface StepResult {
  body: Body;
  /** The body arrived somewhere new and became his spot (end of a move or a throw). */
  settled?: { x: number; y: number };
}

/** Advances the body by `dt` seconds (trips follow their curve; glides slow down and bounce off edges). */
export function step(b: Body, dt: number, now: number, a: Area, spot: { x: number; y: number }, speed = 1): StepResult {
  if (b.mode === 'trip' && b.trip) {
    const tr = b.trip;
    const t = Math.min(1, (now - tr.start) / tr.duration);
    const e = ease(t);
    const x = bezier(e, tr.from.x, tr.c1.x, tr.c2.x, tr.to.x);
    const y = bezier(e, tr.from.y, tr.c1.y, tr.c2.y, tr.to.y);
    const facing: 1 | -1 = x > b.x + 0.2 ? 1 : x < b.x - 0.2 ? -1 : b.facing;
    if (t < 1) return { body: { ...b, x, y, facing } };
    if (tr.back) {
      // Pause is handled by the caller; head home.
      return { body: planTrip({ ...b, x: tr.to.x, y: tr.to.y }, a, now, { to: spot, speed }) };
    }
    return { body: { ...b, x: tr.to.x, y: tr.to.y, mode: 'rest', trip: null }, settled: { x: tr.to.x, y: tr.to.y } };
  }
  if (b.mode === 'glide') {
    const f = Math.pow(0.1, dt); // strong air friction: a cloud glides, it doesn't fall
    let { x, y, vx, vy } = b;
    vx *= f;
    vy *= f;
    x += vx * dt;
    y += vy * dt;
    const c = clampToArea(x, y, a);
    if (c.x !== x) vx = -vx * 0.55;
    if (c.y !== y) vy = -vy * 0.55;
    const facing: 1 | -1 = vx > 5 ? 1 : vx < -5 ? -1 : b.facing;
    if (Math.hypot(vx, vy) < 18) return { body: { ...b, x: c.x, y: c.y, vx: 0, vy: 0, mode: 'rest', facing }, settled: c };
    return { body: { ...b, x: c.x, y: c.y, vx, vy, facing } };
  }
  return { body: b };
}

/** Throw velocity from recent pointer samples (px/s), capped. */
export function throwVelocity(samples: { x: number; y: number; t: number }[]): { vx: number; vy: number } {
  if (samples.length < 2) return { vx: 0, vy: 0 };
  const a = samples[0];
  const z = samples[samples.length - 1];
  const dt = Math.max(16, z.t - a.t) / 1000;
  const cap = (v: number) => Math.max(-2600, Math.min(2600, v));
  return { vx: cap((z.x - a.x) / dt), vy: cap((z.y - a.y) / dt) };
}

export type Roam = 'stay' | 'rare' | 'sometimes' | 'often';

/** Minutes between spontaneous trips for a roaming setting (with ±40% randomness). */
export function nextTripIn(roam: Roam, rand: () => number = Math.random): number | null {
  const base = { stay: 0, rare: 9, sometimes: 4, often: 1.5 }[roam];
  if (!base) return null;
  return base * 60_000 * (0.6 + rand() * 0.8);
}
