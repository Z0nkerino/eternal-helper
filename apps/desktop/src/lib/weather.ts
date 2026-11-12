// Weather from Open-Meteo (free, no key): now, 24 hours, 7 days, air quality. Refreshed every 30 minutes.
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

interface ForecastResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    is_day: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    surface_pressure: number;
    precipitation: number;
  };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: (number | null)[]; is_day: number[] };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: (number | null)[];
    precipitation_probability_max: (number | null)[];
    precipitation_sum: (number | null)[];
  };
}

export async function refreshWeather() {
  const w = useApp.getState().settings?.weather;
  if (!w || w.lat == null || w.lon == null) return useApp.setState({ weather: null });
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}&timezone=auto&forecast_days=7` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,surface_pressure,precipitation' +
    '&hourly=temperature_2m,weather_code,precipitation_probability,is_day&forecast_hours=25' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum' +
    (w.unit === 'f' ? '&temperature_unit=fahrenheit' : '');
  try {
    const r = (await (await fetch(url)).json()) as ForecastResponse;
    const aqi = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${w.lat}&longitude=${w.lon}&current=european_aqi`)
      .then((x) => x.json() as Promise<{ current?: { european_aqi?: number } }>)
      .then((x) => x.current?.european_aqi ?? null)
      .catch(() => null);
    const c = r.current;
    const weather: WeatherNow = {
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      code: c.weather_code,
      isDay: c.is_day === 1,
      humidity: Math.round(c.relative_humidity_2m),
      wind: Math.round(c.wind_speed_10m),
      windDir: c.wind_direction_10m,
      pressure: Math.round(c.surface_pressure),
      precipitation: c.precipitation,
      aqi,
      hourly: r.hourly.time.slice(0, 25).map((time, i) => ({
        time: Date.parse(time),
        temp: Math.round(r.hourly.temperature_2m[i]),
        code: r.hourly.weather_code[i],
        rain: r.hourly.precipitation_probability[i] ?? 0,
        isDay: r.hourly.is_day[i] === 1,
      })),
      daily: r.daily.time.map((date, i) => ({
        date,
        code: r.daily.weather_code[i],
        max: Math.round(r.daily.temperature_2m_max[i]),
        min: Math.round(r.daily.temperature_2m_min[i]),
        sunrise: Date.parse(r.daily.sunrise[i]),
        sunset: Date.parse(r.daily.sunset[i]),
        uv: r.daily.uv_index_max[i] ?? 0,
        rain: r.daily.precipitation_probability_max[i] ?? 0,
        rainSum: r.daily.precipitation_sum[i] ?? 0,
      })),
      at: Date.now(),
    };
    useApp.setState({ weather });
  } catch {
    /* offline: keep the last reading */
  }
}

const L = (lang: Lang, en: string, ru: string) => (lang === 'ru' ? ru : en);

/** WMO weather code → short label and an icon key for lucide. */
export function describeWeather(code: number, lang: Lang): { label: string; icon: 'sun' | 'cloud-sun' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' } {
  if (code === 0) return { label: L(lang, 'Clear', 'Ясно'), icon: 'sun' };
  if (code <= 2) return { label: L(lang, 'Partly cloudy', 'Переменная облачность'), icon: 'cloud-sun' };
  if (code === 3) return { label: L(lang, 'Overcast', 'Пасмурно'), icon: 'cloud' };
  if (code <= 48) return { label: L(lang, 'Fog', 'Туман'), icon: 'fog' };
  if (code <= 57) return { label: L(lang, 'Drizzle', 'Морось'), icon: 'rain' };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: L(lang, 'Rain', 'Дождь'), icon: 'rain' };
  if (code <= 77 || code === 85 || code === 86) return { label: L(lang, 'Snow', 'Снег'), icon: 'snow' };
  return { label: L(lang, 'Thunderstorm', 'Гроза'), icon: 'storm' };
}

/** WMO weather code → emoji. Day/night aware for clear skies. */
export function weatherEmoji(code: number, isDay = true): string {
  if (code === 0) return isDay ? '☀️' : '🌙';
  if (code <= 2) return isDay ? '🌤️' : '☁️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧️';
  if (code <= 77 || code === 85 || code === 86) return '🌨️';
  return '⛈️';
}

/** WMO weather code → animated Meteocons icon (MIT, bundled in /weather). */
export function meteocon(code: number, isDay = true): string {
  const dn = isDay ? 'day' : 'night';
  let name: string;
  if (code === 0) name = `clear-${dn}`;
  else if (code <= 2) name = `partly-cloudy-${dn}`;
  else if (code === 3) name = `overcast-${dn}`;
  else if (code <= 48) name = `fog-${dn}`;
  else if (code <= 57) name = 'drizzle';
  else if (code <= 67) name = 'rain';
  else if (code <= 77) name = 'snow';
  else if (code <= 82) name = `partly-cloudy-${dn}-rain`;
  else if (code <= 86) name = `partly-cloudy-${dn}-snow`;
  else if (code === 95) name = `thunderstorms-${dn}`;
  else name = `thunderstorms-${dn}-rain`;
  return `/weather/${name}.svg`;
}

export type Scene = 'morning' | 'day' | 'sunset' | 'night' | 'rain' | 'snow' | 'storm' | 'cloudy';

/** Background scene for the weather card: weather first, then the time of day. */
export function weatherScene(w: Pick<WeatherNow, 'code' | 'isDay'> & { daily?: { sunrise: number; sunset: number }[] }, now = Date.now()): Scene {
  const c = w.code;
  if (c >= 95) return 'storm';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  const today = w.daily?.[0];
  if (today) {
    if (now >= today.sunrise && now < today.sunrise + 2 * 3600_000) return 'morning';
    if (now >= today.sunset - 3600_000 && now < today.sunset + 1800_000) return 'sunset';
  }
  if (!w.isDay) return 'night';
  return c === 3 || (c >= 45 && c <= 48) ? 'cloudy' : 'day';
}

/** One-line explanations for the weather tiles ("💧 64% — comfortable"). */
export const explain = {
  humidity: (h: number, lang: Lang) => (h < 30 ? L(lang, 'dry', 'сухо') : h <= 60 ? L(lang, 'comfortable', 'комфортно') : h <= 80 ? L(lang, 'humid', 'влажно') : L(lang, 'very humid', 'очень влажно')),
  uv: (u: number, lang: Lang) => (u < 3 ? L(lang, 'low', 'низкий') : u < 6 ? L(lang, 'moderate — sunglasses', 'умеренный — очки') : u < 8 ? L(lang, 'high — sunscreen needed', 'высокий — нужен крем') : L(lang, 'very high — avoid midday sun', 'очень высокий — избегай солнца днём')),
  wind: (kmh: number, lang: Lang) => (kmh < 6 ? L(lang, 'calm', 'штиль') : kmh < 20 ? L(lang, 'light breeze', 'лёгкий ветер') : kmh < 39 ? L(lang, 'breezy', 'ветрено') : kmh < 62 ? L(lang, 'strong wind', 'сильный ветер') : L(lang, 'gale — stay safe', 'шторм — осторожно')),
  pressure: (hpa: number, lang: Lang) => (hpa < 1000 ? L(lang, 'low — may feel tired', 'низкое — возможна вялость') : hpa > 1025 ? L(lang, 'high', 'высокое') : L(lang, 'normal', 'в норме')),
  aqi: (a: number, lang: Lang) => (a <= 20 ? L(lang, 'good', 'хороший') : a <= 40 ? L(lang, 'fair', 'нормальный') : a <= 60 ? L(lang, 'moderate', 'умеренный') : a <= 80 ? L(lang, 'poor', 'плохой') : L(lang, 'very poor', 'очень плохой')),
  rain: (p: number, lang: Lang) => (p < 20 ? L(lang, 'unlikely', 'маловероятны') : p < 60 ? L(lang, 'possible — take an umbrella', 'возможны — возьми зонт') : L(lang, 'likely', 'вероятны')),
};

export const windArrow = (deg: number) => ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'][Math.round(deg / 45) % 8];

/** Pressure in the unit people expect: mmHg for Russian, hPa otherwise. */
export const pressureLabel = (hpa: number, lang: Lang) => (lang === 'ru' ? `${Math.round(hpa * 0.750062)} мм рт. ст.` : `${hpa} hPa`);
