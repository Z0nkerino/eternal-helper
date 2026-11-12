import { clampToArea, defaultSpot, nextTripIn, planTrip, step, throwVelocity, type Area, type Body } from './brain';

const a: Area = { width: 1200, height: 800, size: 72 };
const rest = (p: Partial<Body> = {}): Body => ({ x: 500, y: 500, vx: 0, vy: 0, facing: 1, mode: 'rest', trip: null, ...p });

describe('Cloudy movement', () => {
  it('lives bottom-right by default and stays inside the screen', () => {
    const s = defaultSpot(a);
    expect(s.x).toBeGreaterThan(1000);
    expect(s.y).toBeGreaterThan(650);
    expect(clampToArea(-50, 5000, a)).toEqual({ x: 8, y: 800 - 72 * 0.8 - 8 });
  });

  it('flies a trip and settles at a new spot', () => {
    let b = planTrip(rest(), a, 0, { to: { x: 100, y: 100 }, rand: () => 0.9 });
    expect(b.facing).toBe(-1);
    const dur = b.trip!.duration;
    const mid = step(b, 0.016, dur / 2, a, { x: 500, y: 500 }).body;
    expect(mid.mode).toBe('trip');
    const end = step(mid, 0.016, dur + 1, a, { x: 500, y: 500 });
    expect(end.body.mode).toBe('rest');
    expect(end.settled).toEqual({ x: 100, y: 100 });
    b = end.body;
    expect(b.x).toBe(100);
  });

  it('a visit heads back home afterwards', () => {
    const b = planTrip(rest(), a, 0, { to: { x: 100, y: 100 }, back: true });
    const r = step(b, 0.016, b.trip!.duration + 1, a, { x: 500, y: 500 });
    expect(r.body.mode).toBe('trip');
    expect(r.body.trip!.to).toEqual({ x: 500, y: 500 });
  });

  it('glides after a throw, bounces off edges and stops', () => {
    let r = { body: rest({ mode: 'glide', vx: 2400, vy: -600 }) } as ReturnType<typeof step>;
    let settled = null;
    for (let i = 0; i < 400 && !settled; i++) {
      r = step(r.body, 1 / 60, i, a, { x: 0, y: 0 });
      settled = r.settled ?? null;
    }
    expect(settled).not.toBeNull();
    expect(r.body.x).toBeLessThanOrEqual(1200 - 72 - 8);
    expect(r.body.y).toBeGreaterThanOrEqual(8);
  });

  it('roams rarely by default and never when told to stay', () => {
    expect(nextTripIn('stay')).toBeNull();
    expect(nextTripIn('rare', () => 0.5)).toBe(9 * 60_000);
    expect(nextTripIn('often', () => 0)!).toBeLessThan(nextTripIn('rare', () => 0)!);
    expect(throwVelocity([{ x: 0, y: 0, t: 0 }, { x: 50, y: 0, t: 50 }])).toEqual({ vx: 1000, vy: 0 });
  });
});
