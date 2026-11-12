import { FOOD_COOLDOWN, cheer, decay, feed, level, need, newPet } from './pet';

describe('Cloudy pet', () => {
  const t0 = 1_000_000_000_000;
  it('gets hungry over time and sleepier without rest', () => {
    const p = decay(newPet(t0), t0 + 5 * 3_600_000);
    expect(p.fullness).toBeCloseTo(25, 0);
    expect(p.energy).toBeLessThan(80);
    expect(decay(p, t0 + 5 * 3_600_000)).toBe(p); // no time passed
  });

  it('eats, refuses when full, and has cooldowns', () => {
    const r = feed({ ...newPet(t0), fullness: 40 }, 'rainbow', t0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pet.fullness).toBe(60);
    expect(r.pet.love).toBe(8);
    expect(feed(r.pet, 'rainbow', t0 + 1000)).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(feed(r.pet, 'rainbow', t0 + FOOD_COOLDOWN + 1).ok).toBe(true);
    expect(feed({ ...newPet(t0), fullness: 98 }, 'cookie', t0)).toMatchObject({ ok: false, reason: 'full' });
  });

  it('knows what he needs', () => {
    expect(need({ ...newPet(), fullness: 10 }, false)).toBe('hungry');
    expect(need({ ...newPet(), energy: 50 }, true)).toBe('sleepy');
    expect(need({ ...newPet(), happiness: 20 }, false)).toBe('bored');
    expect(need(newPet(), false)).toBe('fine');
  });

  it('levels up friendship with petting and play', () => {
    let p = newPet(t0);
    for (let i = 0; i < 34; i++) p = cheer(p, 'play', t0);
    expect(level(p)).toBe(2);
    expect(p.energy).toBe(0);
  });
});
