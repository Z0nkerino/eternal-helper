// Time: a big analog clock with a gliding second hand, the time and date, how far through the day, week
// and year you are, sunrise and sunset, the moon, your time zone, world clocks and a stopwatch with laps.
import { AnimatePresence, motion } from 'framer-motion';
import { Flag, Moon, Pause, Play, RotateCcw, Sunrise, Sunset, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n';
import { openLibrary, useApp } from '../lib/store';
import { useNow } from '../island/bits';
import { isoWeek } from '../library/CalendarView';

/** Re-renders every animation frame while mounted (for the gliding second hand). */
function useFrame() {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    let raf = 0;
    const loop = () => ((raf = requestAnimationFrame(loop)), setT(Date.now()));
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

/** The time in a zone as h/m/s numbers. */
function partsIn(tz: string | undefined, at: number) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { h: +p.hour, m: +p.minute, s: +p.second };
}

/** Offset of a zone from here, in hours ("+3", "−5", "±0"). */
function diffFrom(tz: string, at: number) {
  const here = partsIn(undefined, at);
  const there = partsIn(tz, at);
  let d = there.h * 60 + there.m - (here.h * 60 + here.m);
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  const h = d / 60;
  return h === 0 ? '±0' : `${h > 0 ? '+' : '−'}${Math.abs(h) % 1 ? Math.abs(h).toFixed(1) : Math.abs(h)}`;
}

/** 0 = new moon, 0.5 = full. */
export function moonPhase(at: number) {
  const syn = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  return ((((at - ref) / 86400000) % syn) + syn) % syn / syn;
}

function moonName(p: number, ru: boolean) {
  const names = ru
    ? ['Новолуние', 'Растущий серп', 'Первая четверть', 'Растущая луна', 'Полнолуние', 'Убывающая луна', 'Последняя четверть', 'Убывающий серп']
    : ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return names[Math.round(p * 8) % 8];
}

function MoonIcon({ p, size = 26 }: { p: number; size?: number }) {
  // The lit part as an ellipse sliding across the disc.
  const r = size / 2;
  const k = Math.cos(p * 2 * Math.PI); // 1 new → -1 full
  const waxing = p < 0.5;
  const rx = Math.abs(k) * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="moon-ic" aria-hidden>
      <circle cx={r} cy={r} r={r - 0.5} fill="#2a2e3a" />
      <path d={`M${r} 0.5 A${r - 0.5} ${r - 0.5} 0 0 ${waxing ? 1 : 0} ${r} ${size - 0.5} A${rx} ${r - 0.5} 0 0 ${k > 0 === waxing ? 0 : 1} ${r} 0.5`} fill="#f4f1e4" />
    </svg>
  );
}

export function Analog({ tz, size, smooth = true, at }: { tz?: string; size: number; smooth?: boolean; at: number }) {
  const { h, m, s } = partsIn(tz, at);
  const ms = smooth ? at % 1000 : 0;
  const sec = s + ms / 1000;
  const min = m + sec / 60;
  const hr = (h % 12) + min / 60;
  const c = size / 2;
  const hand = (deg: number, len: number, w: number, cls: string) => <line className={cls} x1={c} y1={c + len * 0.14} x2={c} y2={c - len} strokeWidth={w} strokeLinecap="round" transform={`rotate(${deg} ${c} ${c})`} />;
  const night = h < 6 || h >= 20;
  return (
    <svg className={`analog ${night ? 'night' : ''}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <defs>
        <radialGradient id={`face-${size}`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="rgba(255,255,255,.13)" />
          <stop offset="1" stopColor="rgba(255,255,255,.02)" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={c - 1} fill={`url(#face-${size})`} stroke="rgba(255,255,255,.14)" />
      {Array.from({ length: 60 }, (_, i) => {
        const big = i % 5 === 0;
        if (size < 80 && !big) return null;
        const a = (i / 60) * Math.PI * 2;
        const r1 = c - (big ? size * 0.1 : size * 0.05);
        const r2 = c - size * 0.03;
        return <line key={i} className={big ? 'tick big' : 'tick'} x1={c + Math.sin(a) * r1} y1={c - Math.cos(a) * r1} x2={c + Math.sin(a) * r2} y2={c - Math.cos(a) * r2} />;
      })}
      {hand(hr * 30, c * 0.5, Math.max(2, size * 0.035), 'hand-h')}
      {hand(min * 6, c * 0.72, Math.max(1.6, size * 0.024), 'hand-m')}
      {size >= 80 && hand(sec * 6, c * 0.8, 1.2, 'hand-s')}
      <circle cx={c} cy={c} r={Math.max(2, size * 0.025)} className="hand-dot" />
    </svg>
  );
}

function Stopwatch() {
  const t = useT();
  const ru = t.lang === 'ru';
  const [start, setStart] = useState<number | null>(null);
  const [acc, setAcc] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const now = useNow(start ? 50 : 1000);
  const elapsed = acc + (start ? now - start : 0);
  const fmt = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };
  return (
    <div className="tcard sw">
      <span className="tcard-label"><Timer size={12} /> {ru ? 'Секундомер' : 'Stopwatch'}</span>
      <span className="sw-time mono">{fmt(elapsed)}</span>
      <div className="row gap-s">
        <button className={`sw-btn ${start ? 'stop' : 'go'}`} onClick={() => (start ? (setAcc(elapsed), setStart(null)) : setStart(Date.now()))} aria-label={start ? (ru ? 'Пауза' : 'Pause') : ru ? 'Старт' : 'Start'}>
          {start ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button className="sw-btn" disabled={!start} onClick={() => setLaps((l) => [elapsed, ...l].slice(0, 20))} aria-label={ru ? 'Круг' : 'Lap'}><Flag size={12} /></button>
        <button className="sw-btn" disabled={!elapsed} onClick={() => (setStart(null), setAcc(0), setLaps([]))} aria-label={ru ? 'Сброс' : 'Reset'}><RotateCcw size={12} /></button>
      </div>
      <div className="sw-laps scroll">
        <AnimatePresence initial={false}>
          {laps.map((l, i) => (
            <motion.span key={laps.length - i} className="tiny mono faint" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
              #{laps.length - i} · {fmt(l - (laps[i + 1] ?? 0))}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Progress({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="tprog">
      <div className="row"><span className="tiny faint">{label}</span><span className="grow" /><span className="tiny mono">{Math.floor(value * 100)}%</span></div>
      <div className="tprog-bar"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: value }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} /></div>
      <span className="tiny faint">{sub}</span>
    </div>
  );
}

export function TimeTab() {
  const t = useT();
  const ru = t.lang === 'ru';
  const loc = ru ? 'ru-RU' : 'en-GB';
  const at = useFrame();
  const now = new Date(at);
  const clocks = useApp((s) => s.settings?.clocks ?? []);
  const weather = useApp((s) => s.weather);
  const h24 = useApp((s) => s.settings?.clock24 ?? true);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offMin = -now.getTimezoneOffset();
  const utc = `UTC${offMin >= 0 ? '+' : '−'}${Math.floor(Math.abs(offMin) / 60)}${Math.abs(offMin) % 60 ? ':' + String(Math.abs(offMin) % 60).padStart(2, '0') : ''}`;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayP = (at - dayStart) / 86400000;
  const y0 = new Date(now.getFullYear(), 0, 1).getTime();
  const y1 = new Date(now.getFullYear() + 1, 0, 1).getTime();
  const yearP = (at - y0) / (y1 - y0);
  const dayN = Math.floor((dayStart - y0) / 86400000) + 1;
  const weekP = (((now.getDay() + 6) % 7) + dayP) / 7;
  const today = weather?.daily?.[0];
  const sun = today ? { rise: today.sunrise, set: today.sunset } : null;
  const fmtT = (ms: number) => new Date(ms).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: !h24 });
  const light = sun ? Math.max(0, sun.set - sun.rise) : 0;
  const mp = moonPhase(at);
  const s = now.getSeconds();

  return (
    <div className="timetab">
      <div className="time-hero">
        <motion.div className="time-dial" initial={{ rotateY: -25, opacity: 0, scale: 0.9 }} animate={{ rotateY: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }}>
          <Analog size={172} at={at} />
        </motion.div>
        <div className="time-digital">
          <span className="time-big mono">
            {now.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: !h24 })}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={s} className="time-sec" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.18 }}>
                {String(s).padStart(2, '0')}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="time-date">{now.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span className="tiny faint">{tz.replace(/_/g, ' ')} · {utc} · {ru ? `неделя ${isoWeek(now)}, день ${dayN}` : `week ${isoWeek(now)}, day ${dayN}`}</span>
          <div className="time-progress">
            <Progress label={ru ? 'День' : 'Day'} value={dayP} sub={ru ? `осталось ${Math.floor((1 - dayP) * 24)} ч ${Math.floor(((1 - dayP) * 1440) % 60)} мин` : `${Math.floor((1 - dayP) * 24)}h ${Math.floor(((1 - dayP) * 1440) % 60)}m left`} />
            <Progress label={ru ? 'Неделя' : 'Week'} value={weekP} sub={now.toLocaleDateString(loc, { weekday: 'long' })} />
            <Progress label={ru ? 'Год' : 'Year'} value={yearP} sub={ru ? `${Math.ceil((y1 - at) / 86400000)} дн. до ${now.getFullYear() + 1}` : `${Math.ceil((y1 - at) / 86400000)} days to ${now.getFullYear() + 1}`} />
          </div>
        </div>
      </div>
      <div className="time-cards">
        <div className="tcard">
          <span className="tcard-label"><Sunrise size={12} /> {ru ? 'Солнце' : 'Sun'}</span>
          {sun ? (
            <>
              <div className="sun-arc">
                <svg viewBox="0 0 100 44" aria-hidden>
                  <path d="M4 40 Q50 -6 96 40" className="sun-path" />
                  {(() => {
                    const p = Math.max(0, Math.min(1, (at - sun.rise) / Math.max(1, light)));
                    const x = (1 - p) * (1 - p) * 4 + 2 * (1 - p) * p * 50 + p * p * 96;
                    const y = (1 - p) * (1 - p) * 40 + 2 * (1 - p) * p * -6 + p * p * 40;
                    return <circle cx={x} cy={y} r="4.5" className={`sun-dot ${at < sun.rise || at > sun.set ? 'down' : ''}`} />;
                  })()}
                </svg>
              </div>
              <div className="row gap-s tiny"><Sunrise size={12} className="faint" /> {fmtT(sun.rise)} <span className="grow" /> <Sunset size={12} className="faint" /> {fmtT(sun.set)}</div>
              <span className="tiny faint">{ru ? `световой день ${Math.floor(light / 3600000)} ч ${Math.round((light % 3600000) / 60000)} мин` : `${Math.floor(light / 3600000)}h ${Math.round((light % 3600000) / 60000)}m of daylight`}</span>
            </>
          ) : (
            <span className="tiny faint">{ru ? 'Нужна погода для твоего города' : 'Needs the weather for your city'}</span>
          )}
        </div>
        <div className="tcard moon">
          <span className="tcard-label"><Moon size={12} /> {ru ? 'Луна' : 'Moon'}</span>
          <MoonIcon p={mp} size={40} />
          <span className="small">{moonName(mp, ru)}</span>
          <span className="tiny faint">{Math.round((1 - Math.cos(mp * 2 * Math.PI)) * 50)}% {ru ? 'освещено' : 'lit'}</span>
        </div>
        <Stopwatch />
        <button className="tcard tcard-btn" onClick={() => openLibrary('timer')}>
          <span className="tcard-label"><Timer size={12} /> {ru ? 'Таймер' : 'Timer'}</span>
          <span className="small">{ru ? 'Фокус и таймеры' : 'Focus & timers'}</span>
          <span className="tiny faint">{ru ? 'Открыть →' : 'Open →'}</span>
        </button>
      </div>
      {clocks.length > 0 && (
        <div className="world">
          {clocks.map((c, i) => {
            const p = partsIn(c.tz, at);
            return (
              <motion.div key={c.tz} className="world-clock" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
                <Analog tz={c.tz} size={44} at={at} smooth={false} />
                <span className="grow">
                  <span className="small ellipsis">{c.city}</span>
                  <span className="tiny faint">{diffFrom(c.tz, at)} {ru ? 'ч' : 'h'}</span>
                </span>
                <span className="mono world-time">{String(p.h).padStart(2, '0')}:{String(p.m).padStart(2, '0')}</span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
