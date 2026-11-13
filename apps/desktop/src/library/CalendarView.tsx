// Calendar: a month you can flip through, today marked, and your own events (with an optional time and
// colour). Events are kept with the settings, so the desktop widget and the island show the same ones.
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useT } from '../lib/i18n';
import { saveExtra, uid, useExtra } from '../lib/extra';

export interface CalEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  title: string;
  color: string;
}
const COLORS = ['#5b8cff', '#ff6b8b', '#ffb547', '#3ddc97', '#b67cff'];
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ISO week number. */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

/** The 6×7 days shown for a month, starting on Monday. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const shift = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - shift + i));
}

export function useEvents() {
  return useExtra<CalEvent[]>('calendarEvents', []);
}

export function CalendarView() {
  const t = useT();
  const ru = t.lang === 'ru';
  const today = new Date();
  const [cur, setCur] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [dir, setDir] = useState(1);
  const [sel, setSel] = useState(ymd(today));
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const events = useEvents();
  const days = useMemo(() => monthGrid(cur.y, cur.m), [cur]);
  const byDay = useMemo(() => {
    const m: Record<string, CalEvent[]> = {};
    for (const e of events) (m[e.date] ??= []).push(e);
    Object.values(m).forEach((l) => l.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')));
    return m;
  }, [events]);
  const loc = ru ? 'ru-RU' : 'en-GB';
  const monthName = new Date(cur.y, cur.m, 1).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const wd = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: 'short' }));
  const flip = (d: number) => {
    setDir(d);
    setCur(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));
  };
  const add = () => {
    if (!title.trim()) return;
    void saveExtra('calendarEvents', [...events, { id: uid(), date: sel, time: time || undefined, title: title.trim().slice(0, 80), color }]);
    setTitle('');
    setTime('');
  };
  const selDate = new Date(sel + 'T12:00');
  const list = byDay[sel] ?? [];

  return (
    <div className="cal">
      <div className="cal-left">
        <header className="cal-head">
          <button className="icon-btn" onClick={() => flip(-1)} aria-label={ru ? 'Назад' : 'Previous'}><ChevronLeft size={16} /></button>
          <button className="cal-month" onClick={() => (setCur({ y: today.getFullYear(), m: today.getMonth() }), setSel(ymd(today)))}>{monthName}</button>
          <button className="icon-btn" onClick={() => flip(1)} aria-label={ru ? 'Вперёд' : 'Next'}><ChevronRight size={16} /></button>
        </header>
        <div className="cal-wd">
          <span className="cal-wk">{ru ? 'нед' : 'wk'}</span>
          {wd.map((w) => <span key={w}>{w}</span>)}
        </div>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={`${cur.y}-${cur.m}`} className="cal-grid" custom={dir} initial={{ opacity: 0, x: 30 * dir, rotateY: 12 * dir }} animate={{ opacity: 1, x: 0, rotateY: 0 }} exit={{ opacity: 0, x: -30 * dir, rotateY: -12 * dir }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
            {days.map((d, i) => {
              const k = ymd(d);
              const ev = byDay[k];
              return (
                <Fragment key={k}>
                  {i % 7 === 0 && <span className="cal-wk">{isoWeek(d)}</span>}
                  <button className={`cal-day ${d.getMonth() !== cur.m ? 'out' : ''} ${k === ymd(today) ? 'today' : ''} ${k === sel ? 'sel' : ''} ${i % 7 > 4 ? 'we' : ''}`} onClick={() => setSel(k)}>
                    {k === sel && <motion.span layoutId="cal-sel" className="cal-sel" transition={{ type: 'spring', stiffness: 520, damping: 36 }} />}
                    <span className="cal-num">{d.getDate()}</span>
                    {ev && <span className="cal-dots">{ev.slice(0, 3).map((e) => <i key={e.id} style={{ background: e.color }} />)}</span>}
                  </button>
                </Fragment>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="cal-right">
        <p className="cal-day-title">{selDate.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <div className="cal-events scroll">
          <AnimatePresence initial={false}>
            {list.length === 0 && (
              <motion.p key="empty" className="tiny faint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {ru ? 'Ничего не запланировано' : 'Nothing planned'}
              </motion.p>
            )}
            {list.map((e) => (
              <motion.div key={e.id} layout className="cal-event" style={{ ['--c' as string]: e.color }} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12, height: 0 }}>
                <span className="cal-event-bar" />
                <span className="grow">
                  <span className="small">{e.title}</span>
                  {e.time && <span className="tiny faint mono">{e.time}</span>}
                </span>
                <button className="icon-btn" aria-label={ru ? 'Удалить' : 'Delete'} onClick={() => void saveExtra('calendarEvents', events.filter((x) => x.id !== e.id))}>
                  <Trash2 size={13} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <form className="cal-add" onSubmit={(e) => (e.preventDefault(), add())}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ru ? 'Новое событие' : 'New event'} aria-label={ru ? 'Событие' : 'Event'} />
          <input className="cal-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={ru ? 'Время' : 'Time'} />
          <div className="cal-colors">
            {COLORS.map((c) => <button type="button" key={c} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}
          </div>
          <button className="send" type="submit" disabled={!title.trim()} aria-label={ru ? 'Добавить' : 'Add'}><Plus size={15} /></button>
        </form>
      </div>
    </div>
  );
}
