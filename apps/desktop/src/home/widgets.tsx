// Home widgets. Each widget is a small card on a 4-column grid: small (1 column), medium (2) or wide (4).
// The user picks which ones to show and in what order (Home → Edit). Kept deliberately simple: each
// widget reads the shared store and shows one thing well.
import { motion } from 'framer-motion';
import {
  CalendarRange, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, CalendarDays, Camera, Clock, Cloud, Coins, Focus, Globe, Lightbulb, ListTodo, Music2, Pause, Play, Sparkles, Timer, Waves, Zap, type LucideIcon, Smile, Archive, Gauge, StickyNote,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { emitEvent } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { openLibrary, openPanel, saveSettings, startTimer, takeScreenshot, timerLeft, useApp } from '../lib/store';
import { useEvents, ymd } from '../library/CalendarView';
import { HoloFace } from './HoloFace';
import { NotesBoard } from '../library/NotesBoard';
import { iconFor, useShelf } from '../library/ShelfView';
import { describeWeather } from '../lib/weather';
import { mediaControl } from '../lib/music';
import { factOfDay, formatRate, greeting, offsetFromLocal, rate, symbol, timeIn } from '../lib/today';
import { fmtClock, useNow, WeatherIcon } from '../island/bits';
import { CloudyFace } from '../cloudy/CloudyFace';

export type WidgetSize = 's' | 'm' | 'w' | 't';
export interface WidgetDef {
  id: string;
  name: [string, string];
  icon: LucideIcon;
  /** The size it starts at. */
  size: WidgetSize;
  /** Sizes it can be resized to (in Home's edit mode). */
  sizes?: WidgetSize[];
  Body: () => JSX.Element | null;
}
const COLS: Record<WidgetSize, number> = { s: 1, m: 2, w: 4, t: 2 };
/** Grid cells a widget takes (a tall one is two columns by two rows). */
const CELLS: Record<WidgetSize, number> = { s: 1, m: 2, w: 4, t: 4 };

const locale = (lang: string) => (lang === 'ru' ? 'ru-RU' : 'en-US');

function ClockW() {
  const tr = useTr();
  const now = useNow(1000);
  const h24 = useApp((s) => s.settings?.clock24 ?? true);
  const name = useApp((s) => s.settings?.account?.name || s.settings?.name || '');
  const d = new Date(now);
  const time = d.toLocaleTimeString(locale(tr.lang), { hour: '2-digit', minute: '2-digit', hour12: !h24 }).replace(/\s?[AP]M$/i, '');
  return (
    <div className="w-clock">
      <div className="w-time mono">
        {time.split('').map((ch, i) => (
          <motion.span key={`${i}${ch}`} initial={{ y: '-60%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
            {ch}
          </motion.span>
        ))}
      </div>
      <div className="w-sub">{d.toLocaleDateString(locale(tr.lang), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="tiny faint">{greeting(tr.lang, d.getHours(), name)}</div>
    </div>
  );
}

function WeatherW() {
  const tr = useTr();
  const w = useApp((s) => s.weather);
  const place = useApp((s) => s.settings?.weather.place ?? '');
  if (!w) return <Empty icon={Cloud} text={tr('No weather yet', 'Погоды пока нет')} />;
  const today = w.daily[0];
  return (
    <button className="w-weather" onClick={() => openLibrary('weather')}>
      <div className="row between">
        <span className="tiny w-place ellipsis">{place.split(',')[0] || tr('Weather', 'Погода')}</span>
        <WeatherIcon code={w.code} size={18} lang={tr.lang} />
      </div>
      <div className="w-big">{w.temp}°</div>
      <div className="tiny faint ellipsis">{describeWeather(w.code, tr.lang).label}</div>
      {today && <div className="tiny faint">↑{Math.round(today.max)}° ↓{Math.round(today.min)}°</div>}
    </button>
  );
}

function MusicW() {
  const tr = useTr();
  const m = useApp((s) => s.media);
  if (!m)
    return (
      <button className="w-music is-empty" onClick={() => openPanel('music')}>
        <span className="w-music-art ph"><Music2 size={20} /></span>
        <span className="grow">
          <span className="w-title">{tr('Nothing playing', 'Ничего не играет')}</span>
          <span className="tiny faint">{tr('Open Music', 'Открыть музыку')}</span>
        </span>
      </button>
    );
  return (
    <div className={`w-music ${m.playing ? 'playing' : ''}`} onClick={() => openPanel('music')} role="button" tabIndex={0}>
      {m.artwork ? <img className="w-music-art" src={m.artwork} alt="" /> : <span className="w-music-art ph"><Music2 size={20} /></span>}
      <span className="grow ellipsis">
        <span className="w-title ellipsis">{m.title}</span>
        <span className="tiny faint ellipsis">{m.artist}</span>
        <span className="w-bars" aria-hidden><i /><i /><i /><i /><i /></span>
      </span>
      <motion.button className="w-play" whileTap={{ scale: 0.85 }} onClick={(e) => (e.stopPropagation(), void mediaControl('toggle'))} aria-label={m.playing ? 'Pause' : 'Play'}>
        {m.playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
      </motion.button>
    </div>
  );
}

function NextW() {
  const tr = useTr();
  const now = useNow(30_000);
  const events = useEvents();
  const today = ymd(new Date(now));
  const hm = new Date(now).toTimeString().slice(0, 5);
  const list = events.filter((e) => e.date === today && (!e.time || e.time >= hm)).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')).slice(0, 2);
  return (
    <button className="w-next" onClick={() => openLibrary('calendar')}>
      <div className="row gap tiny faint"><ListTodo size={13} /> {tr('Up next', 'Дальше')}</div>
      {list.length ? (
        list.map((e) => (
          <div key={e.id} className="w-event">
            <span className="w-dot" style={{ background: e.color }} />
            {e.time && <span className="mono tiny">{e.time}</span>}
            <span className="ellipsis">{e.title}</span>
          </div>
        ))
      ) : (
        <div className="small muted">{tr('A free day', 'Свободный день')}</div>
      )}
    </button>
  );
}

function ActionsW() {
  const tr = useTr();
  const items: [LucideIcon, string, () => void, boolean?][] = [
    [Camera, tr('Screenshot', 'Скриншот'), () => void takeScreenshot()],
    [StickyNote, tr('Note', 'Заметка'), () => openLibrary('notes')],
    [Timer, tr('5 min', '5 мин'), () => startTimer(5)],
    [Focus, tr('Focus', 'Фокус'), () => (startTimer(25, 'focus'), void saveSettings({ doNotDisturb: true }))],
    [Sparkles, tr('Chats', 'Чаты'), () => openPanel('ai')],
  ];
  return (
    <div className="w-actions">
      {items.map(([Icon, label, run, hot], i) => (
        <motion.button key={i} className={`action ${hot ? 'hot' : ''}`} onClick={run} whileHover={{ y: -2 }} whileTap={{ scale: 0.88 }}>
          <span className="action-icon"><Icon size={18} /></span>
          <span className="tiny ellipsis">{label}</span>
        </motion.button>
      ))}
    </div>
  );
}

function TimerW() {
  const tr = useTr();
  const now = useNow(1000);
  const t = useApp((s) => s.timer);
  const left = t ? timerLeft(t, now) : 0;
  const p = t ? 1 - left / t.totalMs : 0;
  return (
    <button className="w-timer" onClick={() => (t ? openLibrary('timer') : startTimer(5))}>
      <svg viewBox="0 0 40 40" className="w-ring">
        <circle cx="20" cy="20" r="17" className="w-ring-bg" />
        <circle cx="20" cy="20" r="17" className="w-ring-fg" style={{ strokeDashoffset: 106.8 * (1 - p) }} />
      </svg>
      <span className="w-ring-label mono">{t ? fmtClock(left) : '5:00'}</span>
      <span className="tiny faint">{t ? (t.pausedLeft != null ? tr('Paused', 'Пауза') : tr('Timer', 'Таймер')) : tr('Start', 'Старт')}</span>
    </button>
  );
}

function BatteryW() {
  const tr = useTr();
  const b = useApp((s) => s.battery);
  if (!b?.present) return <Empty icon={Zap} text={tr('Plugged in', 'От сети')} />;
  const Icon = b.charging ? BatteryCharging : b.percent > 70 ? BatteryFull : b.percent > 30 ? BatteryMedium : BatteryLow;
  return (
    <div className={`w-battery ${b.percent <= 20 && !b.charging ? 'low' : ''} ${b.charging ? 'charging' : ''}`}>
      <Icon size={20} />
      <div className="w-big">{b.percent}%</div>
      <div className="w-bat-bar"><i style={{ transform: `scaleX(${b.percent / 100})` }} /></div>
    </div>
  );
}

function CalendarW() {
  const tr = useTr();
  const now = useNow(60_000);
  const d = new Date(now);
  return (
    <div className="w-cal">
      <div className="w-cal-wd">{d.toLocaleDateString(locale(tr.lang), { weekday: 'short' })}</div>
      <div className="w-cal-day">{d.getDate()}</div>
      <div className="tiny faint">{d.toLocaleDateString(locale(tr.lang), { month: 'long' })}</div>
    </div>
  );
}

/** This month at a glance, today highlighted. */
function MonthW() {
  const tr = useTr();
  const now = useNow(60_000);
  const d = new Date(now);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  const names = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(tr.lang), { weekday: 'narrow' }));
  return (
    <div className="w-month">
      <div className="w-month-head"><span className="w-cal-wd">{d.toLocaleDateString(locale(tr.lang), { month: 'long' })}</span><span className="tiny faint">{d.getFullYear()}</span></div>
      <div className="w-month-grid">
        {names.map((n, i) => <span key={`n${i}`} className="w-mn faint">{n}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => <span key={i} className={i + 1 === d.getDate() ? 'today' : ''}>{i + 1}</span>)}
      </div>
    </div>
  );
}

function WorldW() {
  const tr = useTr();
  const now = useNow(30_000);
  const clocks = useApp((s) => s.settings?.clocks ?? []);
  if (!clocks.length) return <Empty icon={Globe} text={tr('Add cities in Settings', 'Добавь города в Настройках')} />;
  return (
    <div className="w-world">
      {clocks.slice(0, 2).map((c) => (
        <div key={c.tz}>
          <div className="mono w-mid">{timeIn(c.tz, tr.lang, new Date(now))}</div>
          <div className="tiny faint ellipsis">{c.city} {offsetFromLocal(c.tz, new Date(now))}</div>
        </div>
      ))}
    </div>
  );
}

function CurrencyW() {
  const tr = useTr();
  const pairs = useApp((s) => s.settings?.currency.pairs ?? []);
  const [vals, setVals] = useState<(number | null)[]>([]);
  const key = JSON.stringify(pairs.slice(0, 2));
  useEffect(() => void Promise.all(pairs.slice(0, 2).map(([a, b]) => rate(a, b))).then(setVals), [key]);
  if (!pairs.length) return <Empty icon={Coins} text={tr('Add currencies in Settings', 'Добавь валюты в Настройках')} />;
  return (
    <div className="w-world">
      {pairs.slice(0, 2).map(([a, b], i) => (
        <div key={a + b}>
          <div className="mono w-mid">{vals[i] != null ? formatRate(vals[i]!, b, tr.lang) : '…'}</div>
          <div className="tiny faint">1 {symbol(a)}</div>
        </div>
      ))}
    </div>
  );
}

function CloudyW() {
  const tr = useTr();
  const [poke, setPoke] = useState(0);
  return (
    <button className="w-cloudy" onClick={() => (setPoke((p) => p + 1), void emitEvent('cloudy://action', { kind: 'trick' }))} title={tr('Say hi to Cloudy', 'Помаши Cloudy')}>
      <motion.span key={poke} initial={{ scale: 0.8, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }}>
        <CloudyFace expr={poke ? 'tongue' : 'happy'} look={{ x: 0, y: 0 }} size={70} />
      </motion.span>
      <span className="tiny faint">Cloudy</span>
    </button>
  );
}

/** Purely for fun: a glowing orb that breathes, and dances when music plays. */
function VibesW() {
  const playing = useApp((s) => !!s.media?.playing);
  return (
    <div className={`w-vibes ${playing ? 'on' : ''}`} aria-hidden>
      <i />
      <i />
      <i />
      <Waves size={16} className="w-vibes-ic" />
    </div>
  );
}

function FaceW() {
  return (
    <div className="w-face">
      <HoloFace />
    </div>
  );
}

function NotesW() {
  return (
    <div className="w-notes">
      <NotesBoard compact />
    </div>
  );
}

function ShelfW() {
  const tr = useTr();
  const items = useShelf();
  return (
    <button className="w-shelf" onClick={() => openLibrary('shelf')}>
      <div className="row gap tiny faint"><Archive size={13} /> {tr('Shelf', 'Полка')} · {items.length}</div>
      {items.length ? (
        <div className="w-shelf-list">
          {items.slice(0, 4).map((f) => {
            const Icon = iconFor(f.name, f.isDir);
            return (
              <span key={f.name} className="w-shelf-item">
                <Icon size={16} />
                <span className="tiny ellipsis">{f.name}</span>
              </span>
            );
          })}
        </div>
      ) : (
        <div className="small muted">{tr('Drop files on the island', 'Перетащи файлы на остров')}</div>
      )}
    </button>
  );
}

function ProgressW() {
  const tr = useTr();
  const now = useNow(60_000);
  const d = new Date(now);
  const day = (d.getHours() * 60 + d.getMinutes()) / 1440;
  const y0 = new Date(d.getFullYear(), 0, 1).getTime();
  const year = (now - y0) / (new Date(d.getFullYear() + 1, 0, 1).getTime() - y0);
  const ring = (v: number, label: string, i: number) => {
    const r = 26;
    const c = 2 * Math.PI * r;
    return (
      <div className="w-ring" key={label}>
        <svg viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="32" r={r} className="w-ring-bg" />
          <motion.circle cx="32" cy="32" r={r} className={`w-ring-fg r${i}`} strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - v) }} transition={{ type: 'spring', stiffness: 60, damping: 16 }} />
        </svg>
        <span className="mono small">{Math.floor(v * 100)}%</span>
        <span className="tiny faint">{label}</span>
      </div>
    );
  };
  return <div className="w-progress">{[ring(day, tr('Day', 'День'), 0), ring(year, tr('Year', 'Год'), 1)]}</div>;
}

function FactW() {
  const tr = useTr();
  const now = useNow(3600_000);
  return (
    <div className="w-fact">
      <div className="row gap tiny faint"><Lightbulb size={13} /> {tr('Did you know?', 'А ты знал?')}</div>
      <div className="small w-fact-text">{factOfDay(tr.lang, new Date(now)).replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, '').trim()}</div>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="w-empty">
      <Icon size={18} />
      <span className="tiny">{text}</span>
    </div>
  );
}

export const WIDGETS: WidgetDef[] = [
  { id: 'clock', name: ['Clock', 'Часы'], icon: Clock, size: 'm', sizes: ['s', 'm', 'w'], Body: ClockW },
  { id: 'music', name: ['Now playing', 'Сейчас играет'], icon: Music2, size: 'm', sizes: ['m', 'w'], Body: MusicW },
  { id: 'weather', name: ['Weather', 'Погода'], icon: Cloud, size: 's', sizes: ['s', 'm'], Body: WeatherW },
  { id: 'face', name: ['Face', 'Лицо'], icon: Smile, size: 's', sizes: ['s', 'm', 't'], Body: FaceW },
  { id: 'next', name: ['Up next', 'Дальше по плану'], icon: ListTodo, size: 'm', sizes: ['m', 'w'], Body: NextW },
  { id: 'actions', name: ['Quick actions', 'Быстрые действия'], icon: Zap, size: 'w', sizes: ['m', 'w'], Body: ActionsW },
  { id: 'notes', name: ['Notes', 'Заметки'], icon: StickyNote, size: 't', sizes: ['m', 't', 'w'], Body: NotesW },
  { id: 'shelf', name: ['Shelf', 'Полка'], icon: Archive, size: 'm', sizes: ['s', 'm', 'w'], Body: ShelfW },
  { id: 'progress', name: ['Day & year', 'День и год'], icon: Gauge, size: 'm', sizes: ['s', 'm'], Body: ProgressW },
  { id: 'timer', name: ['Timer', 'Таймер'], icon: Timer, size: 's', sizes: ['s', 'm'], Body: TimerW },
  { id: 'calendar', name: ['Date', 'Дата'], icon: CalendarDays, size: 's', sizes: ['s', 'm'], Body: CalendarW },
  { id: 'month', name: ['Calendar', 'Календарь'], icon: CalendarRange, size: 't', sizes: ['t'], Body: MonthW },
  { id: 'battery', name: ['Battery', 'Батарея'], icon: BatteryMedium, size: 's', sizes: ['s', 'm'], Body: BatteryW },
  { id: 'world', name: ['World clocks', 'Мировые часы'], icon: Globe, size: 's', sizes: ['s', 'm', 't'], Body: WorldW },
  { id: 'currency', name: ['Currency', 'Валюты'], icon: Coins, size: 's', sizes: ['s', 'm'], Body: CurrencyW },
  { id: 'cloudy', name: ['Cloudy', 'Cloudy'], icon: Cloud, size: 's', sizes: ['s', 'm', 't'], Body: CloudyW },
  { id: 'vibes', name: ['Vibes', 'Вайб'], icon: Waves, size: 's', sizes: ['s', 'm', 'w'], Body: VibesW },
  { id: 'fact', name: ['Did you know?', 'А ты знал?'], icon: Lightbulb, size: 'm', sizes: ['m', 'w'], Body: FactW },
];
export const DEFAULT_WIDGETS = ['clock', 'weather', 'calendar', 'music', 'next', 'actions'];
export const MAX_CELLS = 16;
const byId = new Map(WIDGETS.map((w) => [w.id, w]));
export const widget = (id: string) => byId.get(id);

/** A widget's size on Home: the one the user picked (edit mode), else its own. */
export function sizeOf(id: string): WidgetSize {
  const picked = (useApp.getState().settings as unknown as { widgetSizes?: Record<string, WidgetSize> } | null)?.widgetSizes?.[id];
  const w = widget(id);
  return picked && (w?.sizes ?? [w?.size]).includes(picked) ? picked : w?.size ?? 's';
}
/** The next size in the widget's list (for the resize button). */
export function nextSize(id: string): WidgetSize {
  const w = widget(id);
  const list = w?.sizes ?? [w?.size ?? 's'];
  return list[(list.indexOf(sizeOf(id)) + 1) % list.length];
}
export const cellsOf = (ids: string[]) => ids.reduce((n, id) => n + CELLS[sizeOf(id)], 0);
export const cellsOfWidget = (w: WidgetDef) => CELLS[w.size];
export const colsOf = (w: WidgetDef) => COLS[w.size];
/** Rows the grid needs (the grid packs densely, so this is the cell count over four, rounded up). */
export const rowsOf = (ids: string[]) => Math.max(1, Math.ceil(cellsOf(ids) / 4));
export const ROW_H = 92;
export const GAP = 10;
/** Height of the Home tab's content for these widgets (grid plus the small bar below it). */
export const homeHeight = (ids: string[]) => rowsOf(ids) * ROW_H + (rowsOf(ids) - 1) * GAP + 34;
