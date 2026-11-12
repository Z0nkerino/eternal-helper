import { CalendarCheck, Focus, Music, Pause, Play, SkipBack, SkipForward, Sparkles, Timer, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { call } from '../lib/ipc';
import { useT, useTr } from '../lib/i18n';
import { openPanel, recElapsed, saveSettings, startTimer, useApp } from '../lib/store';
import { toggleRecording } from '../lib/recorder';
import { describeWeather, weatherEmoji } from '../lib/weather';
import { livePosition, mediaControl } from '../lib/music';
import { currentLine, fetchLyrics, type LyricLine } from '../lib/lyrics';
import { coverColor } from '../lib/color';
import { recentTracks } from '../lib/recent';
import { factOfDay, formatRate, greeting, holidayToday, offsetFromLocal, rate, symbol, timeIn } from '../lib/today';
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
      <div className="card media empty-media">
        <Emoji e="🎧" size={44} />
        <div>
          <div>{tr('Nothing playing', 'Ничего не играет')}</div>
          <div className="faint small">{tr('Play music in any app, or sign in to Spotify, Yandex Music or SoundCloud in Settings → Music.', 'Включи музыку в любом приложении или войди в Spotify, Яндекс Музыку или SoundCloud: Настройки → Музыка.')}</div>
        </div>
      </div>
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
            <div className="lyric next ellipsis">{lyrics[line + 1]?.text ?? ''}</div>
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

function TodayCard() {
  const tr = useTr();
  const lang = tr.lang;
  const now = useNow(30_000);
  const weather = useApp((s) => s.weather);
  const planner = useApp((s) => s.planner);
  const pairs = useApp((s) => s.settings?.currency.pairs ?? []);
  const clocks = useApp((s) => s.settings?.clocks ?? []);
  const [rates, setRates] = useState<(number | null)[]>([]);
  const [holiday, setHoliday] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all(pairs.slice(0, 2).map(([a, b]) => rate(a, b))).then(setRates);
    void holidayToday(lang).then(setHoliday);
  }, [JSON.stringify(pairs), lang]);

  const date = new Date(now);
  const nextEvent = planner?.upcoming.find((e) => new Date(e.start).toDateString() === date.toDateString() && e.end > now);
  return (
    <div className="card today-card" onClick={() => openPanel('weather')} role="button" tabIndex={0}>
      <div className="today-date">
        <span className="today-day">{date.getDate()}</span>
        <div>
          <div className="today-weekday">{date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'long', month: 'long' })}</div>
          <div className="small muted">
            <Rich text={greeting(lang, date.getHours(), useApp.getState().settings?.name ?? '')} size={14} />
          </div>
        </div>
      </div>
      {weather && (
        <div className="today-line">
          <Emoji e={weatherEmoji(weather.code, weather.isDay)} size={18} /> {weather.temp}° · {describeWeather(weather.code, lang).label.toLowerCase()}
        </div>
      )}
      <div className="today-line">
        <Emoji e="📅" size={16} />{' '}
        {nextEvent
          ? `${new Date(nextEvent.start).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })} ${nextEvent.title}`
          : planner
            ? `${planner.tasksToday.length} ${tr('tasks today', 'задач на сегодня')}`
            : tr('Connect Universal Planner', 'Подключи Universal Planner')}
      </div>
      {pairs.length > 0 && (
        <div className="today-line">
          <Emoji e="💱" size={16} />{' '}
          {pairs.slice(0, 2).map(([a, b], i) => (
            <span key={a + b} className="mono">
              {i > 0 && ' · '}
              {symbol(a)} {rates[i] != null ? formatRate(rates[i]!, b, lang) : '…'}
            </span>
          ))}
        </div>
      )}
      {clocks.length > 0 && (
        <div className="clocks">
          {clocks.slice(0, 3).map((c) => (
            <div key={c.tz} className="clock">
              <span className="mono">{timeIn(c.tz, lang, date)}</span>
              <span className="faint tiny ellipsis">
                {c.city} {offsetFromLocal(c.tz, date)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="today-fact small muted">
        <Rich text={holiday ?? factOfDay(lang, date)} size={14} />
      </div>
    </div>
  );
}

function Recent() {
  const tr = useTr();
  const media = useApp((s) => s.media?.title);
  const [list, setList] = useState(recentTracks);
  useEffect(() => setList(recentTracks()), [media]);
  const shown = list.filter((t) => t.title !== media).slice(0, 6);
  if (!shown.length) return null;
  return (
    <div className="recent">
      <div className="section-title">{tr('Recently played', 'Недавно играло')}</div>
      <div className="recent-row">
        {shown.map((t) => (
          <div key={t.title + t.artist} className="recent-item" title={`${t.title} — ${t.artist}`}>
            {t.artwork ? <img src={t.artwork} alt="" /> : <div className="recent-ph"><Music size={14} /></div>}
            <span className="tiny ellipsis">{t.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeTab() {
  const t = useT();
  const rec = useApp((s) => s.rec);
  const now = useNow();
  const recording = rec.status === 'recording' || rec.status === 'paused';

  const tools = [
    { icon: <Video size={18} />, label: recording ? `${t('rec.stop')} · ${fmtClock(recElapsed(rec, now))}` : t('tool.record'), run: toggleRecording, hot: recording },
    { icon: <Timer size={18} />, label: t('tool.timer5'), run: () => startTimer(5) },
    { icon: <Focus size={18} />, label: t('tool.focus25'), run: () => (startTimer(25, 'focus'), void saveSettings({ doNotDisturb: true })) },
    { icon: <Sparkles size={18} />, label: t('tool.afina'), run: () => (openPanel('afina'), useApp.setState((s) => ({ focusAfina: s.focusAfina + 1 }))) },
    { icon: <CalendarCheck size={18} />, label: t('tool.planner'), run: () => void call('planner_open') },
  ];

  return (
    <div className="home">
      <MediaCard />
      <TodayCard />
      <div className="tools">
        <div className="tool-grid">
          {tools.map((x) => (
            <button key={x.label} className={`tool ${x.hot ? 'hot' : ''}`} onClick={x.run}>
              {x.icon}
              <span>{x.label}</span>
            </button>
          ))}
        </div>
      </div>
      <Recent />
    </div>
  );
}
