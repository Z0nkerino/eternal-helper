// Defaults for UI-only settings. Rust stores whatever the UI sends; missing keys are filled here.
import type { CarouselItem, Settings } from './ipc';

/** The classic default city: Saint Petersburg. */
export const SPB = { place: 'Санкт-Петербург, Россия', lat: 59.9386, lon: 30.3141 };
/** Same as DEFAULT_WIDGETS in home/widgets.tsx (kept here so this file has no UI imports). */
const DEFAULT_WIDGET_IDS = ['clock', 'weather', 'calendar', 'music', 'next', 'actions'];

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

export const LIMITS = {
  uiScale: [0.85, 1.15],
  fontScale: [0.9, 1.15],
  islandOpacity: [0.8, 1],
  nameLength: 24,
} as const;

const clamp = (v: unknown, [lo, hi]: readonly [number, number], d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Keeps a custom accent readable on the dark UI: lightness between 45% and 75%, some saturation. */
export function safeAccent(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#2F6BFF';
  const n = parseInt(m[1], 16);
  let [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l0 = (max + min) / 2;
  const d = max - min;
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const l = Math.min(0.75, Math.max(0.45, l0));
  const s = s0 < 0.08 ? s0 : Math.max(0.35, s0); // greys stay grey
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + mm) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/** Fills in any UI setting the stored file doesn't have yet (older versions, first run). */
export function withDefaults(s: Settings): Settings {
  const x = s as Partial<Settings>;
  // One-time move to Afina's new default brain (on-device), for settings from 0.2 and earlier.
  const afina = (x as { afinaV2?: boolean }).afinaV2 ? s.afina : { ...s.afina, provider: 'local' as const, model: 'Qwen2.5-1.5B-Instruct' };
  return {
    ...s,
    afina,
    afinaV2: true,
    afinaTools: { enabled: false, ...x.afinaTools },
    theme: x.theme ?? 'classic',
    radius: x.radius ?? 1,
    carousel: { enabled: true, interval: 6, items: CAROUSEL_ITEMS, ...x.carousel },
    currency: { pairs: defaultPairs(), ...x.currency },
    clocks: x.clocks ?? defaultClocks(),
    cloudy: { enabled: true, size: 72, speed: 1, chatter: 'rare', roam: 'rare', sounds: false, ...x.cloudy },
    music: { startHidden: [], ...x.music },
    updates: { auto: true, ...x.updates },
    name: typeof x.name === 'string' ? x.name.slice(0, LIMITS.nameLength) : '',
    uiScale: clamp(x.uiScale, LIMITS.uiScale, 1),
    fontScale: clamp(x.fontScale, LIMITS.fontScale, 1),
    islandOpacity: clamp(x.islandOpacity, LIMITS.islandOpacity, 1),
    motion: x.motion === 'reduced' ? 'reduced' : 'full',
    clock24: x.clock24 ?? !/en-US/i.test(typeof navigator !== 'undefined' ? navigator.language : ''),
    clockSeconds: x.clockSeconds ?? false,
    // Home and Settings can never be hidden.
    shotHotkey: typeof x.shotHotkey === 'string' ? x.shotHotkey : 'Alt+Shift+S',
    hoverOpen: x.hoverOpen ?? true,
    homeWidgets: Array.isArray(x.homeWidgets) ? x.homeWidgets.filter((w) => typeof w === 'string').slice(0, 16) : DEFAULT_WIDGET_IDS,
    account: { signedIn: false, name: '', email: '', city: SPB.place, color: '#2f6bff', bio: '', since: 0, ...x.account },
    weather: x.weather?.lat == null ? { ...x.weather, place: SPB.place, lat: SPB.lat, lon: SPB.lon, unit: x.weather?.unit || 'c' } : x.weather,
    hiddenTabs: Array.isArray(x.hiddenTabs) ? x.hiddenTabs.filter((t) => t !== 'home' && t !== 'settings') : [],
  };
}
