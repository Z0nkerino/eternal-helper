import { motion } from 'framer-motion';
import { Camera, ChevronRight, Focus, Music, Pause, Play, Radio, SkipBack, SkipForward, Sparkles, Timer, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT, useTr } from '../lib/i18n';
import { openLibrary, openPanel, recElapsed, saveSettings, startTimer, takeScreenshot, timerLeft, useApp } from '../lib/store';
import { toggleRecording } from '../lib/recorder';
import { describeWeather, weatherEmoji } from '../lib/weather';
import { livePosition, mediaControl } from '../lib/music';
import { currentLine, fetchLyrics, type LyricLine } from '../lib/lyrics';
import { coverColor } from '../lib/color';
import { greeting } from '../lib/today';
import { Emoji, Rich } from '../lib/emoji';
import { Equalizer, fmtClock, useNow } from '../island/bits';

/** Tints the panel with the cover's colour while Home is open. */
function useCoverTint(art: string | null | undefined) {
  useEffect(() => {
    let alive = true;
    const root = document.documentElement;
    if (!art) return void root.style.removeProperty('--cover');
    void coverColor(art).then((c) => alive && (c ? root.style.setProperty('--cover', c) : root.style.removeProperty('--cover')));
    return () => {
      alive = false;
      root.style.removeProperty('--cover');
    };
  }, [art]);
}

function useLyrics(title?: string, artist?: string, duration?: number | null) {
  const [lines, setLines] = useState<LyricLine[] | null>(null);
  useEffect(() => {
    setLines(null);
    if (!title) return;
    let alive = true;
    const id = setTimeout(() => void fetchLyrics(title, artist ?? '', duration).then((l) => alive && setLines(l)), 400);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [title, artist, duration]);
  return lines;
}

function MediaCard() {
  const tr = useTr();
  const m = useApp((s) => s.media);
  const at = useApp((s) => s.mediaAt);
  const now = useNow(500);
  useCoverTint(m?.artwork);
  const lyrics = useLyrics(m?.title, m?.artist, m?.durationMs);
  if (!m) {
    return (
      <button className="card media empty-media" onClick={() => void import('../radio/player').then((r) => r.select(0))}>
        <span className="empty-art">
          <Radio size={26} />
        </span>
        <div className="media-info">
          <div className="title">{tr('Nothing playing', 'Ничего не играет')}</div>
          <div className="faint small">{tr('Tap for Eternal Radio — calm music made here', 'Нажми — Eternal Radio, спокойная музыка')}</div>
        </div>
        <Play size={18} className="faint" />
      </button>
    );
  }
  const pos = livePosition(m, at, now);
  const line = lyrics && pos != null ? currentLine(lyrics, pos + 300) : -1;
  return (
    <div className="card media">
      <div className="art-wrap">
        {m.artwork ? (
          <>
            <img className="art-glow" src={m.artwork} alt="" aria-hidden />
            <img className="art" src={m.artwork} alt="" />
          </>
        ) : (
          <div className="art placeholder">
            <Music size={26} />
          </div>
        )}
      </div>
      <div className="media-info">
        <div className="row gap">
          <div className="title ellipsis">{m.title}</div>
          <Equalizer playing={m.playing} color="var(--accent-2)" />
        </div>
        <div className="muted ellipsis">{[m.artist, m.source].filter(Boolean).join(' · ')}</div>
        {lyrics && line >= 0 ? (
          <div className="lyrics" aria-live="off">
            <div className="lyric now ellipsis">{lyrics[line].text || '♪'}</div>
          </div>
        ) : null}
        {m.durationMs && pos != null ? (
          <div className="progress-row">
            <span className="mono tiny">{fmtClock(pos)}</span>
            <div className="progress" aria-label="progress">
              <div style={{ width: `${Math.min(100, (pos / m.durationMs) * 100)}%` }} />
            </div>
            <span className="mono tiny">{fmtClock(m.durationMs)}</span>
          </div>
        ) : null}
        <div className="media-controls">
          <button className="icon-btn" aria-label="Previous" onClick={() => void mediaControl('previous')}>
            <SkipBack size={16} />
          </button>
          <button className="icon-btn big" aria-label={m.playing ? 'Pause' : 'Play'} onClick={() => void mediaControl('toggle')}>
            {m.playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="icon-btn" aria-label="Next" onClick={() => void mediaControl('next')}>
            <SkipForward size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** The big clock, the date with a greeting, and the weather in one line. */
function Glance() {
  const tr = useTr();
  const lang = tr.lang;
  const now = useNow(1000);
  const weather = useApp((s) => s.weather);
  const h24 = useApp((s) => s.settings?.clock24 ?? true);
  const name = useApp((s) => s.settings?.name ?? '');
  const date = new Date(now);
  const loc = lang === 'ru' ? 'ru-RU' : 'en-US';
  const time = date.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: !h24 }).replace(/\s?[AP]M$/i, '');
  return (
    <button className="glance" onClick={() => openLibrary('weather')}>
      <div className="glance-time mono">
        {time.split('').map((ch, i) => (
          <motion.span key={`${i}${ch}`} initial={{ y: -10, opacity: 0, filter: 'blur(3px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
            {ch}
          </motion.span>
        ))}
      </div>
      <div className="glance-date">{date.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="glance-line small muted">
        <Rich text={greeting(lang, date.getHours(), name)} size={14} />
      </div>
      {weather && (
        <div className="glance-line weather-line">
          <Emoji e={weatherEmoji(weather.code, weather.isDay)} size={18} />
          <span>{weather.temp}°</span>
          <span className="muted small">{describeWeather(weather.code, lang).label.toLowerCase()}</span>
        </div>
      )}
    </button>
  );
}

/** The next thing in the Planner today, or the running timer. */
function NextUp() {
  const tr = useTr();
  const lang = tr.lang;
  const now = useNow(1000);
  const planner = useApp((s) => s.planner);
  const timer = useApp((s) => s.timer);
  if (timer) {
    return (
      <button className="next-up live" onClick={() => openLibrary('timer')}>
        <Timer size={15} />
        <span className="grow ellipsis">{timer.label === 'focus' ? tr('Focus', 'Фокус') : tr('Timer', 'Таймер')}</span>
        <span className="mono">{fmtClock(timerLeft(timer, now))}</span>
        <ChevronRight size={14} className="faint" />
      </button>
    );
  }
  const today = new Date(now).toDateString();
  const next = planner?.upcoming.find((e) => new Date(e.start).toDateString() === today && e.end > now);
  return (
    <button className="next-up" onClick={() => openLibrary('planner')}>
      <Emoji e="📅" size={15} />
      <span className="grow ellipsis">
        {next
          ? `${new Date(next.start).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })} · ${next.title}`
          : planner
            ? planner.tasksToday.length
              ? `${planner.tasksToday.length} ${tr('tasks today', 'задач на сегодня')}`
              : tr('A free day — nothing planned', 'Свободный день — ничего не запланировано')
            : tr('Connect Universal Planner', 'Подключи Universal Planner')}
      </span>
      <ChevronRight size={14} className="faint" />
    </button>
  );
}

export function HomeTab() {
  const t = useT();
  const tr = useTr();
  const rec = useApp((s) => s.rec);
  const now = useNow();
  const recording = rec.status === 'recording' || rec.status === 'paused';

  const actions = [
    { icon: <Camera size={19} />, label: tr('Screenshot', 'Скриншот'), run: () => void takeScreenshot() },
    { icon: <Video size={19} />, label: recording ? fmtClock(recElapsed(rec, now)) : t('tool.record'), run: toggleRecording, hot: recording },
    { icon: <Timer size={19} />, label: t('tool.timer5'), run: () => startTimer(5) },
    { icon: <Focus size={19} />, label: t('tool.focus25'), run: () => (startTimer(25, 'focus'), void saveSettings({ doNotDisturb: true })) },
    { icon: <Sparkles size={19} />, label: 'Afina', run: () => (openPanel('afina'), useApp.setState((s) => ({ focusAfina: s.focusAfina + 1 }))) },
  ];

  return (
    <div className="home">
      <Glance />
      <div className="home-right">
        <MediaCard />
        <NextUp />
      </div>
      <div className="actions">
        {actions.map((x, i) => (
          <motion.button
            key={i}
            className={`action ${x.hot ? 'hot' : ''}`}
            onClick={x.run}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.04 * i, type: 'spring', stiffness: 500, damping: 30 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.9 }}
          >
            <span className="action-icon">{x.icon}</span>
            <span className="tiny ellipsis">{x.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
