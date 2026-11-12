import { defaultPairs, withDefaults } from './defaults';
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
    expect(s.cloudy).toMatchObject({ enabled: false, size: 64, chatter: 'rare' });
    expect(s.carousel.items).toContain('battery');
    expect(s.updates.auto).toBe(true);
  });
});
