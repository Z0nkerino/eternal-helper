// Weather as live tiles over an animated sky that follows the weather and the time of day.
import { useTr } from '../lib/i18n';
import { openPanel, useApp, type WeatherNow } from '../lib/store';
import { describeWeather, explain, meteocon, pressureLabel, weatherScene, windArrow } from '../lib/weather';
import { Emoji } from '../lib/emoji';
import { Empty } from '../components/Empty';
import { useNow } from '../island/bits';

function Tile({ emoji, label, value, note }: { emoji: string; label: string; value: string; note: string }) {
  return (
    <div className="wtile">
      <div className="wtile-head">
        <Emoji e={emoji} size={18} /> <span>{label}</span>
      </div>
      <div className="wtile-value">{value}</div>
      <div className="wtile-note">{note}</div>
    </div>
  );
}

/** Sunrise → sunset arc with the sun moving along it. */
function SunArc({ sunrise, sunset, now, lang }: { sunrise: number; sunset: number; now: number; lang: string }) {
  const t = Math.min(1, Math.max(0, (now - sunrise) / (sunset - sunrise)));
  const up = now >= sunrise && now <= sunset;
  const x = 10 + 140 * t;
  const y = 62 - Math.sin(Math.PI * t) * 48;
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="wtile sun">
      <svg viewBox="0 0 160 72" width="100%" height="64" aria-hidden>
        <path d="M10 62 Q80 -34 150 62" fill="none" stroke="#ffffff33" strokeWidth="2" strokeDasharray="4 4" />
        <line x1="4" y1="62" x2="156" y2="62" stroke="#ffffff22" />
        {up && <circle cx={x} cy={y} r="7" fill="#FFD60A" style={{ filter: 'drop-shadow(0 0 6px #ffd60a)' }} />}
      </svg>
      <div className="row between small">
        <span>🌅 {fmt(sunrise)}</span>
        <span>🌇 {fmt(sunset)}</span>
      </div>
    </div>
  );
}

/** Seven days with a mini chart of highs and lows. */
function Week({ w, lang }: { w: WeatherNow; lang: string }) {
  const max = Math.max(...w.daily.map((d) => d.max));
  const min = Math.min(...w.daily.map((d) => d.min));
  const span = Math.max(1, max - min);
  const pt = (v: number, i: number) => `${(i / (w.daily.length - 1)) * 100},${34 - ((v - min) / span) * 28}`;
  return (
    <div className="week">
      <svg className="week-chart" viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden>
        <polyline points={w.daily.map((d, i) => pt(d.max, i)).join(' ')} fill="none" stroke="#FFB020" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline points={w.daily.map((d, i) => pt(d.min, i)).join(' ')} fill="none" stroke="#64D2FF" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="week-days">
        {w.daily.map((d, i) => (
          <div key={d.date} className="wday">
            <span className="small muted">{i === 0 ? (lang === 'ru' ? 'Сегодня' : 'Today') : new Date(d.date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short' })}</span>
            <img src={meteocon(d.code)} width={30} height={30} alt="" />
            <span className="small mono">
              {d.max}° <span className="faint">{d.min}°</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeatherTab() {
  const tr = useTr();
  const lang = tr.lang;
  const w = useApp((s) => s.weather);
  const place = useApp((s) => s.settings?.weather.place);
  const now = useNow(60_000);

  if (!w) {
    return (
      <Empty
        emoji="🌤️"
        title={tr('Choose your city', 'Выбери свой город')}
        hint={tr('Weather comes from Open-Meteo, free and without an account.', 'Погода от Open-Meteo — бесплатно и без аккаунта.')}
        action={<button className="btn accent" onClick={() => openPanel('settings')}>{tr('Open settings', 'Открыть настройки')}</button>}
      />
    );
  }

  const scene = weatherScene(w, now);
  const today = w.daily[0];
  const d = describeWeather(w.code, lang);
  return (
    <div className="weather-tab scroll">
      <div className={`sky sky-${scene}`}>
        <img className="sky-icon" src={meteocon(w.code, w.isDay)} width={96} height={96} alt="" />
        <div className="sky-main">
          <div className="sky-temp">{w.temp}°</div>
          <div>{d.label}</div>
          <div className="small sky-sub">
            {place} · {tr('feels like', 'ощущается как')} {w.feels}° · {today ? `${today.min}…${today.max}°` : ''}
          </div>
        </div>
        <div className="hourly" aria-label={tr('Next 24 hours', 'Ближайшие 24 часа')}>
          {w.hourly.slice(0, 24).map((h, i) => (
            <div key={h.time} className="hour">
              <span className="small">{i === 0 ? tr('Now', 'Сейчас') : new Date(h.time).getHours()}</span>
              <img src={meteocon(h.code, h.isDay)} width={28} height={28} alt="" />
              <span className="mono small">{h.temp}°</span>
              {h.rain >= 20 && <span className="hour-rain">💧{h.rain}%</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="wtiles">
        <Tile emoji="💧" label={tr('Humidity', 'Влажность')} value={`${w.humidity}%`} note={explain.humidity(w.humidity, lang)} />
        <Tile emoji="💨" label={tr('Wind', 'Ветер')} value={`${windArrow(w.windDir)} ${w.wind} ${tr('km/h', 'км/ч')}`} note={explain.wind(w.wind, lang)} />
        <Tile emoji="🌡️" label={tr('Pressure', 'Давление')} value={pressureLabel(w.pressure, lang)} note={explain.pressure(w.pressure, lang)} />
        <Tile emoji="☀️" label={tr('UV index', 'УФ-индекс')} value={String(Math.round(today?.uv ?? 0))} note={explain.uv(today?.uv ?? 0, lang)} />
        <Tile emoji="☔" label={tr('Precipitation', 'Осадки')} value={`${today?.rain ?? 0}%`} note={explain.rain(today?.rain ?? 0, lang)} />
        {w.aqi != null && <Tile emoji="🌬️" label={tr('Air quality', 'Качество воздуха')} value={`AQI ${Math.round(w.aqi)}`} note={explain.aqi(w.aqi, lang)} />}
        {today && <SunArc sunrise={today.sunrise} sunset={today.sunset} now={now} lang={lang} />}
      </div>

      <Week w={w} lang={lang} />
    </div>
  );
}
