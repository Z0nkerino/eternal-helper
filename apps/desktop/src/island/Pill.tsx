// What the closed island shows: the clock and weather at rest, or the most important live activity.
import { Music, Pause, Play, Square, Timer } from 'lucide-react';
import { colors } from '@eternal/ui';
import { Orb } from '../afina/Orb';
import { useT } from '../lib/i18n';
import { recElapsed, stopTimer, useApp } from '../lib/store';
import { pauseRecording, stopRecording } from '../lib/recorder';
import { mediaControl } from '../lib/music';
import { Carousel } from './Carousel';
import { Equalizer, Ring, fmtClock, useNow } from './bits';

export type ActivityId = 'rec' | 'timer' | 'afina' | 'planner' | 'media';

/** Live activities, most important first. The first takes the pill; the second becomes the side bubble. */
export function useActivities(): ActivityId[] {
  const rec = useApp((s) => s.rec.status);
  const timer = useApp((s) => !!s.timer);
  const thinking = useApp((s) => s.afinaThinking);
  const flash = useApp((s) => !!s.plannerFlash);
  const playing = useApp((s) => !!s.media?.playing);
  const out: ActivityId[] = [];
  if (rec !== 'idle') out.push('rec');
  if (timer) out.push('timer');
  if (thinking) out.push('afina');
  if (flash) out.push('planner');
  if (playing) out.push('media');
  return out;
}

const stop = (e: React.MouseEvent) => e.stopPropagation();

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

  if (activity === 'rec') {
    const r = s.rec;
    const label = r.status === 'saving' ? t('rec.saving') : r.status === 'starting' ? '…' : fmtClock(recElapsed(r, now));
    return (
      <Wings
        notch={notch}
        left={
          <>
            <span className={`rec-dot ${r.status === 'paused' ? 'paused' : ''}`} />
            <span className="mono">{label}</span>
          </>
        }
        right={
          (r.status === 'recording' || r.status === 'paused') && (
            <>
              {!r.native && (
                <button className="pill-btn" onClick={(e) => (stop(e), pauseRecording())} aria-label={r.status === 'paused' ? t('rec.resume') : t('rec.pause')}>
                  {r.status === 'paused' ? <Play size={13} /> : <Pause size={13} />}
                </button>
              )}
              <button className="pill-btn danger" onClick={(e) => (stop(e), void stopRecording())} aria-label={t('rec.stop')}>
                <Square size={11} fill="currentColor" />
              </button>
            </>
          )
        }
      />
    );
  }

  if (activity === 'timer' && s.timer) {
    const left = s.timer.endsAt - now;
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
    case 'rec':
      return <span className={`rec-dot ${s.rec.status === 'paused' ? 'paused' : ''}`} />;
    case 'timer':
      return s.timer ? <Ring progress={Math.max(0, (s.timer.endsAt - now) / s.timer.totalMs)} size={18} color={colors.warn} /> : null;
    case 'afina':
      return <Orb size={16} thinking />;
    case 'planner':
      return <img src="/up-mark.svg" width={16} height={16} alt="" />;
    case 'media':
      return s.media?.artwork ? <img className="art-mini round" src={s.media.artwork} alt="" /> : <Equalizer playing={!!s.media?.playing} color={colors.accent2} />;
  }
}
