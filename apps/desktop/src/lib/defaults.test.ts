import { defaultPairs, safeAccent, withDefaults } from './defaults';
import type { Settings } from './ipc';

describe('settings defaults', () => {
  it('picks currency pairs by region', () => {
    expect(defaultPairs('RU')).toEqual([['USD', 'RUB'], ['EUR', 'RUB']]);
    expect(defaultPairs('US')).toEqual([['EUR', 'USD'], ['GBP', 'USD']]);
    expect(defaultPairs('DE')).toEqual([['USD', 'EUR'], ['GBP', 'EUR']]);
    expect(defaultPairs('ZZ')).toEqual([['EUR', 'USD'], ['GBP', 'USD']]);
  });

  it('fills missing UI settings and keeps stored ones', () => {
    const s = withDefaults({ theme: 'neon', cloudy: { enabled: false } } as unknown as Settings);
    expect(s.theme).toBe('neon');
    expect(s.cloudy).toMatchObject({ enabled: false, size: 72, chatter: 'rare', roam: 'rare' });
    expect(s.carousel.items).toContain('battery');
    expect(s.updates.auto).toBe(true);
  });

  it('keeps personalisation inside its limits', () => {
    const s = withDefaults({ uiScale: 3, fontScale: 0.2, islandOpacity: 0, name: 'x'.repeat(50), hiddenTabs: ['home', 'weather', 'settings'] } as unknown as Settings);
    expect([s.uiScale, s.fontScale, s.islandOpacity]).toEqual([1.15, 0.9, 0.8]);
    expect(s.name.length).toBe(24);
    expect(s.hiddenTabs).toEqual(['weather']);
  });

  it('keeps custom accents readable', () => {
    expect(safeAccent('#000000')).toBe('#737373');
    expect(safeAccent('#FFFFFF')).toBe('#BFBFBF');
    expect(safeAccent('#2F6BFF')).toBe('#2F6BFF');
    expect(safeAccent('nonsense')).toBe('#2F6BFF');
  });
});

describe('0.3 defaults', () => {
  it('uses Saint Petersburg when no city is set, and keeps a chosen one', () => {
    const a = withDefaults({} as unknown as Settings);
    expect(a.weather.lat).toBeCloseTo(59.94, 1);
    expect(a.weather.place).toMatch(/Петербург/);
    const b = withDefaults({ weather: { place: 'Paris', lat: 48.85, lon: 2.35, unit: 'c' } } as unknown as Settings);
    expect(b.weather.place).toBe('Paris');
  });
  it('has default widgets and a signed-out account', () => {
    const s = withDefaults({} as unknown as Settings);
    expect(s.homeWidgets.length).toBeGreaterThan(3);
    expect(s.account.signedIn).toBe(false);
    expect(withDefaults({ homeWidgets: [] } as unknown as Settings).homeWidgets).toEqual([]);
  });
});
