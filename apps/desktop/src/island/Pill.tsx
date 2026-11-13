// What the closed island shows: the clock and weather at rest, or the most important live activity.
import { ArrowBigUp, ArrowDownToLine, Bell, Download, FileCheck2, FolderOpen, Music, Pause, Play, Square, SunMedium, Timer, Volume1, Volume2, VolumeX } from 'lucide-react';
import { call } from '../lib/ipc';
import { colors } from '@eternal/ui';
import { Orb } from '../afina/Orb';
import { useT } from '../lib/i18n';
import { stopTimer, timerLeft, useApp } from '../lib/store';
import { AppLogo } from '../lib/brands';
import { mediaControl } from '../lib/music';
import { Carousel } from './Carousel';
import { Equalizer, Ring, fmtClock, useNow } from './bits';

export type ActivityId = 'update' | 'hud' | 'notif' | 'timer' | 'afina' | 'planner' | 'media';

/** Live activities, most important first. The first takes the pill; the second becomes the side bubble. */
export function useActivities(): ActivityId[] {
  const notif = useApp((s) => !!s.notifFlash);
  const timer = useApp((s) => !!s.timer);
  const thinking = useApp((s) => s.afinaThinking);
  const flash = useApp((s) => !!s.plannerFlash);
  const playing = useApp((s) => !!s.media?.playing);
  const update = useApp((s) => !!s.update?.available);
  const out: ActivityId[] = [];
  const hud = useApp((s) => !!s.hud);
  if (update) out.push('update');
  if (hud) out.push('hud');
  if (notif) out.push('notif');
  if (timer) out.push('timer');
  if (thinking) out.push('afina');
  if (flash) out.push('planner');
  if (playing) out.push('media');
  return out;
}

const stop = (e: React.MouseEvent) => e.stopPropagation();
const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export function Wings({ left, right, notch }: { left: React.ReactNode; right: React.ReactNode; notch: number }) {
  return (
    <div className="pill-row">
      <div className="pill-side left">{left}</div>
      {notch > 0 && <div style={{ width: notch, flex: 'none' }} />}
      <div className="pill-side right">{right}</div>
    </div>
  );
}

export function PillContent({ activity, notch }: { activity: ActivityId | undefined; notch: number }) {
  const t = useT();
  const now = useNow();
  const s = useApp();

  if (activity === 'update') {
    return (
      <Wings
        notch={notch}
        left={
          <>
            <ArrowDownToLine size={14} className="pill-update-ic" />
            <span className="ellipsis">{s.update?.progress != null ? `${Math.round(s.update.progress * 100)}%` : t.lang === 'ru' ? 'Нужно обновление' : 'Update required'}</span>
          </>
        }
        right={null}
      />
    );
  }

  if (activity === 'hud' && s.hud) {
    const h = s.hud;
    const ru = t.lang === 'ru';
    if (h.kind === 'volume' || h.kind === 'brightness') {
      const v = h.kind === 'volume' && h.muted ? 0 : h.value;
      const Icon = h.kind === 'brightness' ? SunMedium : v === 0 ? VolumeX : v < 50 ? Volume1 : Volume2;
      return (
        <div className="pill-row hud-row">
          <Icon size={15} className="hud-ic" />
          <div className="hud-bar"><i style={{ transform: `scaleX(${v / 100})` }} /></div>
          <span className="mono tiny hud-val">{v}</span>
        </div>
      );
    }
    if (h.kind === 'caps') {
      return (
        <Wings notch={notch} left={<><ArrowBigUp size={15} className={h.on ? 'hud-on' : 'faint'} /><span>Caps Lock</span></>} right={<span className={`hud-state ${h.on ? 'on' : ''}`}>{h.on ? (ru ? 'Вкл' : 'On') : ru ? 'Выкл' : 'Off'}</span>} />
      );
    }
    return (
      <Wings
        notch={notch}
        left={<>{h.done ? <FileCheck2 size={15} className="hud-on" /> : <Download size={15} className="hud-dl" />}<span className="ellipsis">{h.name}</span></>}
        right={
          h.done ? (
            <button className="pill-btn ghost hud-open" onClick={(e) => (stop(e), void call('reveal_download', { path: h.path }))} aria-label={ru ? 'Показать в папке' : 'Show in folder'}>
              <FolderOpen size={13} />
            </button>
          ) : (
            <span className="mono tiny faint">{fmtSize(h.size)}</span>
          )
        }
      />
    );
  }

  if (activity === 'notif' && s.notifFlash) {
    const n = s.notifFlash;
    return (
      <Wings
        notch={notch}
        left={
          <>
            <AppLogo name={n.app} size={16} fallback={<Bell size={14} className="hud-on" />} />
            <span className="small ellipsis notif-pill-title" style={{ maxWidth: notch ? 110 : 190 }}>{n.title || n.app}</span>
          </>
        }
        right={<span className="tiny faint ellipsis" style={{ maxWidth: 70 }}>{n.app}</span>}
      />
    );
  }

  if (activity === 'timer' && s.timer) {
    const left = timerLeft(s.timer, now);
    return (
      <Wings
        notch={notch}
        left={
          <>
            <Ring progress={Math.max(0, left / s.timer.totalMs)} color={s.timer.label === 'focus' ? colors.accent2 : colors.warn} />
            <span className="muted">{s.timer.label === 'focus' ? (t.lang === 'ru' ? 'Фокус' : 'Focus') : <Timer size={13} />}</span>
          </>
        }
        right={
          <>
            <span className="mono" style={{ color: s.timer.label === 'focus' ? colors.accent2 : colors.warn }}>
              {fmtClock(left)}
            </span>
            <button className="pill-btn" onClick={(e) => (stop(e), stopTimer())} aria-label={t('timer.stop')}>
              <Square size={10} fill="currentColor" />
            </button>
          </>
        }
      />
    );
  }

  if (activity === 'afina') {
    return <Wings notch={notch} left={<Orb size={18} thinking />} right={<span className="muted small">{t('afina.thinking')}</span>} />;
  }

  if (activity === 'planner' && s.plannerFlash) {
    return (
      <Wings
        notch={notch}
        left={
          <>
            <img src="/up-mark.svg" width={16} height={16} alt="" />
            <span className="small ellipsis">{s.plannerFlash.text || s.plannerFlash.title}</span>
          </>
        }
        right={null}
      />
    );
  }

  if (activity === 'media' && s.media) {
    const m = s.media;
    return (
      <Wings
        notch={notch}
        left={
          <>
            {m.artwork ? <img className="art-mini" src={m.artwork} alt="" /> : <Music size={14} />}
            <span className="small ellipsis" style={{ maxWidth: notch ? 90 : 170 }}>{m.title}</span>
          </>
        }
        right={
          <>
            <button className="pill-btn ghost" onClick={(e) => (stop(e), void mediaControl('toggle'))} aria-label="Play/Pause">
              {m.playing ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <Equalizer playing={m.playing} color={colors.accent2} />
          </>
        }
      />
    );
  }

  // At rest: a carousel of mini widgets (time + weather, next event, battery, currency, track).
  return <Carousel notch={notch} />;
}

/** The second activity, as a small round bubble beside the pill. */
export function Bubble({ activity }: { activity: ActivityId }) {
  const s = useApp();
  const now = useNow();
  switch (activity) {
    case 'notif':
      return <AppLogo name={s.notifFlash?.app ?? ''} size={16} fallback={<Bell size={14} />} />;
    case 'timer':
      return s.timer ? <Ring progress={Math.max(0, (timerLeft(s.timer, now)) / s.timer.totalMs)} size={18} color={colors.warn} /> : null;
    case 'afina':
      return <Orb size={16} thinking />;
    case 'planner':
      return <img src="/up-mark.svg" width={16} height={16} alt="" />;
    case 'media':
      return s.media?.artwork ? <img className="art-mini round" src={s.media.artwork} alt="" /> : <Equalizer playing={!!s.media?.playing} color={colors.accent2} />;
  }
}
