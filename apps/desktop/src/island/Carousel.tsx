// The resting pill: mini widgets that rotate every few seconds, or with the mouse wheel / a swipe.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Orb } from '../afina/Orb';
import { useTr } from '../lib/i18n';
import { useApp } from '../lib/store';
import { weatherEmoji } from '../lib/weather';
import { formatRate, rate, symbol } from '../lib/today';
import { Emoji } from '../lib/emoji';
import type { CarouselItem } from '../lib/ipc';
import { useNow } from './bits';
import { Wings } from './Pill';

function useRate(pair: [string, string] | undefined) {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    if (pair) void rate(pair[0], pair[1]).then(setV);
  }, [pair?.[0], pair?.[1]]);
  return v;
}

export function Carousel({ notch }: { notch: number }) {
  const tr = useTr();
  const lang = tr.lang;
  const now = useNow();
  const s = useApp();
  const cfg = s.settings?.carousel;
  const pair = s.settings?.currency.pairs[0];
  const fx = useRate(pair);
  const nextEvent = s.planner?.upcoming.find((e) => e.end > now);

  // Only widgets that have something to show.
  const pool: CarouselItem[] = cfg?.enabled === false ? ['time'] : cfg?.items ?? ['time'];
  const available = pool.filter((it) => {
    if (it === 'event') return !!nextEvent || (s.planner?.tasksToday.length ?? 0) > 0;
    if (it === 'battery') return !!s.battery?.present;
    if (it === 'currency') return !!pair && fx != null;
    if (it === 'track') return !!s.media;
    return true;
  });
  const items = available.length ? available : (['time'] as CarouselItem[]);

  const [i, setI] = useState(0);
  const idx = i % items.length;
  const wheelAt = useRef(0);
  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setI((x) => x + 1), Math.max(3, cfg?.interval ?? 6) * 1000);
    return () => clearInterval(id);
  }, [items.length, cfg?.interval]);

  const time = new Date(now).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const item = items[idx];
  let left: React.ReactNode = null;
  let right: React.ReactNode = null;
  if (item === 'time') {
    left = (
      <>
        <Orb size={14} />
        <span className="mono">{time}</span>
      </>
    );
    right = s.weather ? (
      <>
        <Emoji e={weatherEmoji(s.weather.code, s.weather.isDay)} size={18} />
        <span className="mono">{s.weather.temp}°</span>
      </>
    ) : null;
  } else if (item === 'event') {
    left = <Emoji e="📅" size={16} />;
    right = nextEvent ? (
      <span className="small ellipsis">
        {new Date(nextEvent.start).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })} {nextEvent.title}
      </span>
    ) : (
      <span className="small">📋 {s.planner?.tasksToday.length}</span>
    );
  } else if (item === 'battery' && s.battery) {
    left = <Emoji e={s.battery.percent <= 20 && !s.battery.charging ? '🪫' : '🔋'} size={16} />;
    right = (
      <span className="mono">
        {s.battery.percent}%{s.battery.charging ? ' ⚡' : ''}
      </span>
    );
  } else if (item === 'currency' && pair && fx != null) {
    left = <Emoji e="💱" size={16} />;
    right = (
      <span className="mono small">
        {symbol(pair[0])} {formatRate(fx, pair[1], lang)}
      </span>
    );
  } else if (item === 'track' && s.media) {
    left = s.media.artwork ? <img className="art-mini" src={s.media.artwork} alt="" /> : <Emoji e="🎵" size={16} />;
    right = <span className="small ellipsis">{s.media.title}</span>;
  }

  return (
    <div
      className="carousel"
      onWheel={(e) => {
        if (items.length < 2 || Date.now() - wheelAt.current < 350) return;
        wheelAt.current = Date.now();
        setI((x) => x + (e.deltaY + e.deltaX > 0 ? 1 : items.length - 1));
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={item} className="carousel-slide" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          <Wings notch={notch} left={left} right={right} />
        </motion.div>
      </AnimatePresence>
      {items.length > 1 && !notch && (
        <div className="carousel-dots" aria-hidden>
          {items.map((it, k) => (
            <span key={it} className={k === idx ? 'on' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}
