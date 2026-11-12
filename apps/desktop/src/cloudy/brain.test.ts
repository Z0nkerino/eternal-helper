import { avoidCursor, decide, floorY, step, throwVelocity, type Body, type Env } from './brain';

const env: Env = { width: 1000, height: 600, size: 60, speed: 1, now: 0, night: false, music: false };
const body = (p: Partial<Body> = {}): Body => ({ x: 100, y: floorY(env), vx: 0, vy: 0, facing: 1, action: 'idle', until: 0, ...p });

describe('Cloudy brain', () => {
  it('walks and turns at the screen edge', () => {
    let b = body({ action: 'walk', x: 935 });
    b = step(b, 0.5, env);
    expect(b.x).toBe(940);
    expect(b.facing).toBe(-1);
  });

  it('falls, bounces and lands', () => {
    let b = body({ y: 0, action: 'fall' });
    let bounced = false;
    for (let i = 0; i < 400 && b.action === 'fall'; i++) {
      const prev = b.vy;
      b = step(b, 1 / 60, env);
      if (prev > 0 && b.vy < 0) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(b.action).toBe('idle');
    expect(b.y).toBe(floorY(env));
  });

  it('stays inside the screen when thrown sideways', () => {
    let b = body({ y: 100, vx: 3000, action: 'fall' });
    for (let i = 0; i < 300; i++) b = step(b, 1 / 60, env);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeLessThanOrEqual(env.width - env.size);
  });

  it('dances to music and sleeps at night', () => {
    expect(decide(body(), { ...env, music: true }, () => 0.1).action).toBe('dance');
    expect(decide(body(), { ...env, night: true }, () => 0.1).action).toBe('sleep');
    expect(decide(body({ until: 5000 }), env, () => 0.1).action).toBe('idle'); // still busy
  });

  it('computes a capped throw', () => {
    expect(throwVelocity([{ x: 0, y: 0, t: 0 }, { x: 100, y: -50, t: 100 }])).toEqual({ vx: 1000, vy: -500 });
    expect(throwVelocity([{ x: 0, y: 0, t: 0 }, { x: 900, y: 0, t: 16 }]).vx).toBe(2200);
  });

  it('steps out of the cursor’s way', () => {
    const b = body({ action: 'walk', facing: 1 });
    expect(avoidCursor(b, { x: 150, y: floorY(env) + 20 }, 60).facing).toBe(-1);
    expect(avoidCursor(b, { x: 900, y: 10 }, 60).facing).toBe(1);
  });
});
