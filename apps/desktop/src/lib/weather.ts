// Weather from Open-Meteo (free, no key). Refreshed every 30 minutes.
import { useApp, type WeatherNow } from './store';
import type { Lang } from './i18n';

export interface Place {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export async function searchPlaces(q: string, lang: Lang): Promise<Place[]> {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&format=json&language=${lang}&name=${encodeURIComponent(q)}`);
  const j = (await r.json()) as { results?: Place[] };
  return j.results ?? [];
}

export async function refreshWeather() {
  const w = useApp.getState().settings?.weather;
  if (!w || w.lat == null || w.lon == null) return useApp.setState({ weather: null });
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}&timezone=auto&forecast_days=3` +
    '&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    (w.unit === 'f' ? '&temperature_unit=fahrenheit' : '');
  try {
    const r = (await (await fetch(url)).json()) as {
      current: { temperature_2m: number; weather_code: number; is_day: number };
      daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
    };
    const weather: WeatherNow = {
      temp: Math.round(r.current.temperature_2m),
      code: r.current.weather_code,
      isDay: r.current.is_day === 1,
      daily: r.daily.time.map((date, i) => ({ date, code: r.daily.weather_code[i], max: Math.round(r.daily.temperature_2m_max[i]), min: Math.round(r.daily.temperature_2m_min[i]) })),
      at: Date.now(),
    };
    useApp.setState({ weather });
  } catch {
    /* offline: keep the last reading */
  }
}

/** WMO weather code → short label and an emoji-free icon key for lucide. */
export function describeWeather(code: number, lang: Lang): { label: string; icon: 'sun' | 'cloud-sun' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' } {
  const L = (en: string, ru: string) => (lang === 'ru' ? ru : en);
  if (code === 0) return { label: L('Clear', 'Ясно'), icon: 'sun' };
  if (code <= 2) return { label: L('Partly cloudy', 'Переменная облачность'), icon: 'cloud-sun' };
  if (code === 3) return { label: L('Overcast', 'Пасмурно'), icon: 'cloud' };
  if (code <= 48) return { label: L('Fog', 'Туман'), icon: 'fog' };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: L('Rain', 'Дождь'), icon: 'rain' };
  if (code <= 77 || code === 85 || code === 86) return { label: L('Snow', 'Снег'), icon: 'snow' };
  return { label: L('Thunderstorm', 'Гроза'), icon: 'storm' };
}

/** WMO weather code → emoji, for compact places like the notch strip. Day/night aware for clear skies. */
export function weatherEmoji(code: number, isDay = true): string {
  if (code === 0) return isDay ? '☀️' : '🌙';
  if (code <= 2) return isDay ? '🌤️' : '☁️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧️';
  if (code <= 77 || code === 85 || code === 86) return '🌨️';
  return '⛈️';
}
