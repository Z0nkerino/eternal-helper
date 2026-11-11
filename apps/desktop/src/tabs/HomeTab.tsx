import { Music, Pause, Play, SkipBack, SkipForward, Sparkles, Timer, Video, Focus, CalendarCheck } from 'lucide-react';
import { call } from '../lib/ipc';
import { useT } from '../lib/i18n';
import { openPanel, startTimer, saveSettings, useApp, recElapsed } from '../lib/store';
import { toggleRecording } from '../lib/recorder';
import { describeWeather } from '../lib/weather';
import { WeatherIcon, fmtClock, useNow } from '../island/bits';

function MediaCard() {
  const t = useT();
  const m = useApp((s) => s.media);
  const now = useNow();
  if (!m) {
    return (
      <div className="card media empty">
        <Music size={18} className="faint" />
        <span className="muted">{t('nothing.playing')}</span>
      </div>
    );
  }
  // Position comes from the last poll; interpolate between polls while playing.
  const pos = m.positionMs != null ? Math.min(m.durationMs ?? Infinity, m.positionMs + (m.playing ? (now % 1000) : 0)) : null;
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
            <Music size={22} />
          </div>
        )}
      </div>
      <div className="media-info">
        <div className="title ellipsis">{m.title}</div>
        <div className="muted ellipsis">{[m.artist, m.source].filter(Boolean).join(' · ')}</div>
        {m.durationMs && pos != null ? (
          <div className="progress" aria-label="progress">
            <div style={{ width: `${Math.min(100, (pos / m.durationMs) * 100)}%` }} />
          </div>
        ) : null}
        <div className="media-controls">
          <button className="icon-btn" aria-label="Previous" onClick={() => void call('media_control', { action: 'previous' })}>
            <SkipBack size={16} />
          </button>
          <button className="icon-btn big" aria-label={m.playing ? 'Pause' : 'Play'} onClick={() => void call('media_control', { action: 'toggle' })}>
            {m.playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="icon-btn" aria-label="Next" onClick={() => void call('media_control', { action: 'next' })}>
            <SkipForward size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function HomeTab() {
  const t = useT();
  const weather = useApp((s) => s.weather);
  const place = useApp((s) => s.settings?.weather.place);
  const planner = useApp((s) => s.planner);
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
      <div className="home-side">
        <div className="card weather" onClick={() => openPanel('settings')} role="button" tabIndex={0}>
          {weather ? (
            <>
              <div className="row gap">
                <WeatherIcon code={weather.code} size={22} lang={t.lang} />
                <span className="temp">{weather.temp}°</span>
              </div>
              <div className="muted small ellipsis">{[place, describeWeather(weather.code, t.lang).label].filter(Boolean).join(' · ')}</div>
            </>
          ) : (
            <span className="muted small">{t('set.citySearch')} →</span>
          )}
        </div>
        <div className="card today" onClick={() => openPanel('planner')} role="button" tabIndex={0}>
          <div className="row gap">
            <img src="/up-mark.svg" width={16} height={16} alt="" />
            <span className="small">{t('planner.today')}</span>
          </div>
          {planner ? (
            <div className="muted small ellipsis">
              {planner.tasksToday.length ? planner.tasksToday[0].title : t('planner.allDone')}
              {planner.tasksToday.length > 1 ? ` +${planner.tasksToday.length - 1}` : ''}
            </div>
          ) : (
            <div className="faint small">—</div>
          )}
        </div>
      </div>
      <div className="tools">
        <div className="section-title">{t('tools')}</div>
        <div className="tool-grid">
          {tools.map((x) => (
            <button key={x.label} className={`tool ${x.hot ? 'hot' : ''}`} onClick={x.run}>
              {x.icon}
              <span>{x.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
