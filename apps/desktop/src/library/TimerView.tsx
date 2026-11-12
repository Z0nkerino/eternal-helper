// Timer: presets, a custom minutes/seconds setter, a label, and pause/resume while it runs.
import { motion } from 'framer-motion';
import { Minus, Pause, Play, Plus, Square } from 'lucide-react';
import { useState } from 'react';
import { useTr } from '../lib/i18n';
import { addToTimer, pauseTimer, resumeTimer, saveSettings, startTimer, stopTimer, timerLeft, useApp } from '../lib/store';
import { fmtClock, useNow } from '../island/bits';

const PRESETS = [1, 3, 5, 10, 15, 25, 45, 60];

function Stepper({ value, set, max, label }: { value: number; set: (v: number) => void; max: number; label: string }) {
  return (
    <div className="stepper" onWheel={(e) => set(Math.max(0, Math.min(max, value + (e.deltaY < 0 ? 1 : -1))))}>
      <button className="icon-btn" aria-label={`${label} +`} onClick={() => set(Math.min(max, value + 1))}>
        <Plus size={16} />
      </button>
      <input className="stepper-value mono" inputMode="numeric" value={String(value).padStart(2, '0')} onChange={(e) => set(Math.max(0, Math.min(max, parseInt(e.target.value.replace(/\D/g, '') || '0', 10))))} aria-label={label} />
      <button className="icon-btn" aria-label={`${label} −`} onClick={() => set(Math.max(0, value - 1))}>
        <Minus size={16} />
      </button>
      <span className="tiny faint">{label}</span>
    </div>
  );
}

export function TimerView() {
  const tr = useTr();
  const timer = useApp((s) => s.timer);
  const now = useNow(250);
  const [min, setMin] = useState(5);
  const [sec, setSec] = useState(0);
  const [label, setLabel] = useState('');

  if (timer) {
    const left = timerLeft(timer, now);
    const progress = left / timer.totalMs;
    const r = 70;
    const c = 2 * Math.PI * r;
    return (
      <div className="timer-run">
        <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden>
          <circle cx="90" cy="90" r={r} fill="none" stroke="#ffffff14" strokeWidth="10" />
          <motion.circle cx="90" cy="90" r={r} fill="none" stroke="url(#tg)" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} animate={{ strokeDashoffset: c * (1 - progress) }} transition={{ duration: 0.25, ease: 'linear' }} transform="rotate(-90 90 90)" />
          <defs>
            <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--accent)" />
              <stop offset="1" stopColor="var(--accent-2)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="timer-face">
          <div className="timer-big mono">{fmtClock(left)}</div>
          <div className="small muted">{timer.label === 'focus' ? tr('Focus', 'Фокус') : timer.label || tr('Timer', 'Таймер')}</div>
        </div>
        <div className="row gap">
          {timer.pausedLeft != null ? (
            <button className="btn accent" onClick={resumeTimer}><Play size={14} /> {tr('Resume', 'Продолжить')}</button>
          ) : (
            <button className="btn" onClick={pauseTimer}><Pause size={14} /> {tr('Pause', 'Пауза')}</button>
          )}
          <button className="btn" onClick={() => addToTimer(60_000)}>
            +1 {tr('min', 'мин')}
          </button>
          <button className="btn danger" onClick={stopTimer}><Square size={12} fill="currentColor" /> {tr('Stop', 'Стоп')}</button>
        </div>
      </div>
    );
  }

  const start = (minutes: number, l = label) => startTimer(minutes, l);
  return (
    <div className="timer-set">
      <div className="presets">
        {PRESETS.map((m) => (
          <motion.button key={m} className="chip" whileTap={{ scale: 0.92 }} onClick={() => start(m)}>
            {m} {tr('min', 'мин')}
          </motion.button>
        ))}
        <motion.button className="chip accent-chip" whileTap={{ scale: 0.92 }} onClick={() => (startTimer(25, 'focus'), void saveSettings({ doNotDisturb: true }))}>
          🍅 {tr('Focus 25', 'Фокус 25')}
        </motion.button>
      </div>
      <div className="steppers">
        <Stepper value={min} set={setMin} max={180} label={tr('min', 'мин')} />
        <span className="timer-colon">:</span>
        <Stepper value={sec} set={setSec} max={59} label={tr('sec', 'сек')} />
      </div>
      <input className="field timer-label" placeholder={tr('Label (optional) — e.g. Tea', 'Название (необязательно) — например, Чай')} value={label} onChange={(e) => setLabel(e.target.value.slice(0, 40))} />
      <motion.button className="btn accent big-btn" whileTap={{ scale: 0.96 }} disabled={min * 60 + sec === 0} onClick={() => start(min + sec / 60)}>
        <Play size={15} /> {tr('Start timer', 'Запустить таймер')}
      </motion.button>
    </div>
  );
}
