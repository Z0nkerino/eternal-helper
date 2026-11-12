// Defaults for UI-only settings. Rust stores whatever the UI sends; missing keys are filled here.
import type { CarouselItem, Settings } from './ipc';

const REGION_CURRENCY: Record<string, string> = {
  RU: 'RUB', BY: 'BYN', KZ: 'KZT', UA: 'UAH', US: 'USD', GB: 'GBP', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', AT: 'EUR', FI: 'EUR',
  AE: 'AED', TR: 'TRY', JP: 'JPY', CN: 'CNY', IN: 'INR', CA: 'CAD', AU: 'AUD', CH: 'CHF', PL: 'PLN', GE: 'GEL', AM: 'AMD', UZ: 'UZS',
};

export function systemRegion(): string {
  const loc = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  const region = loc.split('-')[1]?.toUpperCase();
  if (region) return region;
  return loc.toLowerCase().startsWith('ru') ? 'RU' : 'US';
}

/** USD and EUR in the local currency; where the local currency is USD, EUR and GBP in dollars. */
export function defaultPairs(region = systemRegion()): [string, string][] {
  const local = REGION_CURRENCY[region] ?? 'USD';
  if (local === 'USD') return [['EUR', 'USD'], ['GBP', 'USD']];
  if (local === 'EUR') return [['USD', 'EUR'], ['GBP', 'EUR']];
  return [['USD', local], ['EUR', local]];
}

export function defaultClocks(region = systemRegion()): Settings['clocks'] {
  const all = [
    { tz: 'Europe/Moscow', city: 'Москва' },
    { tz: 'Asia/Dubai', city: 'Dubai' },
    { tz: 'America/New_York', city: 'New York' },
    { tz: 'Europe/London', city: 'London' },
  ];
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return all.filter((c) => c.tz !== here && !(region === 'RU' && c.tz === 'Europe/London')).slice(0, 3);
}

export const CAROUSEL_ITEMS: CarouselItem[] = ['time', 'event', 'battery', 'currency', 'track'];

/** Fills in any UI setting the stored file doesn't have yet (older versions, first run). */
export function withDefaults(s: Settings): Settings {
  const x = s as Partial<Settings>;
  return {
    ...s,
    theme: x.theme ?? 'classic',
    radius: x.radius ?? 1,
    carousel: { enabled: true, interval: 6, items: CAROUSEL_ITEMS, ...x.carousel },
    currency: { pairs: defaultPairs(), ...x.currency },
    clocks: x.clocks ?? defaultClocks(),
    cloudy: { enabled: true, size: 64, speed: 1, chatter: 'rare', ...x.cloudy },
    music: { startHidden: [], ...x.music },
    updates: { auto: true, ...x.updates },
  };
}
