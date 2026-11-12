// Music: whatever plays right now, big — artwork on a spinning record, a soft aurora in the cover's
// colours, a visualizer, smooth synced lyrics — plus Eternal Radio stations and the music accounts.
import { AnimatePresence, motion } from 'framer-motion';
import { Pause, Play, SkipBack, SkipForward, Radio as RadioIcon, Music2, LogIn } from 'lucide-react';
import { call } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { useApp } from '../lib/store';
import { livePosition, mediaControl, SERVICE_NAMES } from '../lib/music';
import { fmtClock, useNow } from '../island/bits';
import { TRACKS } from '../radio/tracks';
import { coverArt, select, toggle as radioToggle, useRadio } from '../radio/player';
import { useCoverColor, useLyrics } from '../music/hooks';
import { useShallow } from 'zustand/react/shallow';
import { Lyrics } from '../music/Lyrics';

/** Twelve bars. With Eternal Radio they follow the real sound; otherwise they dance on their own. */
function Visualizer({ playing, radio }: { playing: boolean; radio: boolean }) {
  const levels = useRadio((r) => (radio ? r.levels : null));
  return (
    <div className={`viz ${playing ? 'on' : ''} ${levels?.length ? 'live' : ''}`} aria-hidden>
      {Array.from({ length: 12 }, (_, i) => {
        const lv = levels?.length ? levels[[0, 1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 2][i]] : null;
        return <i key={i} style={{ ['--i' as string]: i, ...(lv != null && playing ? { transform: `scaleY(${0.12 + lv * 0.95})` } : {}) }} />;
      })}
    </div>
  );
}

function Stations() {
  const tr = useTr();
  const r = useRadio();
  const src = useApp((s) => s.mediaSource.kind);
  return (
    <div className="stations scroll">
      <div className="section-title">Eternal Radio</div>
      {TRACKS.map((t, i) => {
        const on = r.index === i && src === 'radio';
        return (
          <motion.button key={t.id} className={`station ${on ? 'on' : ''}`} onClick={() => (on ? radioToggle() : select(i))} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03, type: 'spring', stiffness: 420, damping: 32 }} whileTap={{ scale: 0.97 }}>
            <img src={coverArt(t, 60)} alt="" />
            <span className="grow ellipsis">
              <span className="station-title">{t.title}</span>
              <span className="tiny faint ellipsis">{tr(...t.mood)}</span>
            </span>
            {on && r.playing ? <span className="mini-eq" aria-hidden><i /><i /><i /></span> : <Play size={13} className="faint" />}
          </motion.button>
        );
      })}
    </div>
  );
}

export function MusicTab() {
  const tr = useTr();
  const m = useApp((s) => s.media);
  const at = useApp((s) => s.mediaAt);
  const source = useApp((s) => s.mediaSource);
  const web = useApp((s) => s.webMusic);
  const radioState = useRadio(useShallow((r) => ({ index: r.index, position: r.position, playing: r.playing })));
  const now = useNow(250);
  const isRadio = source.kind === 'radio';
  const track = TRACKS[radioState.index];
  // With nothing playing, the current radio station waits here, ready to play.
  const art = m?.artwork ?? coverArt(track, 240);
  const cover = useCoverColor(art);
  const lyrics = useLyrics(m?.title, m?.artist, m?.durationMs, !m || isRadio);
  const pos = isRadio ? radioState.position * 1000 : livePosition(m, at, now);
  const playing = !!m?.playing;
  const dur = m?.durationMs ?? null;
  const toggle = () => (m ? void mediaControl('toggle') : radioToggle());

  return (
    <div className={`music ${playing ? 'playing' : ''}`} style={cover ? { ['--cover' as string]: cover } : undefined}>
      <div className="aurora" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="music-left">
        <div className="disc-wrap">
          <div className="vinyl" style={{ ["--label" as string]: `url("${art}")` }} />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img key={art} className="disc-art" src={art} alt="" initial={{ opacity: 0, scale: 0.85, rotate: -6 }} animate={{ opacity: 1, scale: playing ? 1 : 0.94, rotate: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }} />
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={m?.title ?? 'none'} className="music-meta" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            <div className="music-title ellipsis">{m?.title ?? track.title}</div>
            <div className="small muted ellipsis">{m ? [m.artist, m.source].filter(Boolean).join(' · ') : tr('Eternal Radio · tap play', 'Eternal Radio · нажми play')}</div>
          </motion.div>
        </AnimatePresence>
        {dur && pos != null ? (
          <div className="music-progress">
            <div className="mp-track">
              <div className="mp-fill" style={{ transform: `scaleX(${Math.min(1, pos / dur)})` }} />
            </div>
            <div className="row between tiny mono faint">
              <span>{fmtClock(pos)}</span>
              <span>-{fmtClock(Math.max(0, dur - pos))}</span>
            </div>
          </div>
        ) : (
          <div className="music-progress" />
        )}
        <div className="music-controls">
          <motion.button className="icon-btn" whileTap={{ scale: 0.85 }} aria-label="Previous" onClick={() => void mediaControl('previous')} disabled={!m}>
            <SkipBack size={18} fill="currentColor" />
          </motion.button>
          <motion.button className="play-btn" whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.06 }} aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={playing ? 'pause' : 'play'} initial={{ scale: 0.4, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.4, opacity: 0, rotate: 30 }} transition={{ type: 'spring', stiffness: 500, damping: 28 }}>
                {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          <motion.button className="icon-btn" whileTap={{ scale: 0.85 }} aria-label="Next" onClick={() => void mediaControl('next')} disabled={!m}>
            <SkipForward size={18} fill="currentColor" />
          </motion.button>
        </div>
        <Visualizer playing={playing} radio={isRadio} />
      </div>
      <div className="music-right">
        {lyrics?.length && pos != null ? <Lyrics lines={lyrics} pos={pos} /> : <Stations />}
        <div className="music-sources">
          {(['spotify', 'yandex', 'soundcloud'] as const).map((s) => (
            <button key={s} className={`src-chip ${web[s] ? 'on' : ''} ${source.kind === 'web' && source.service === s ? 'live' : ''}`} onClick={() => void call('music_open', { service: s, show: true })} title={web[s] ? tr('Open the player', 'Открыть плеер') : tr('Sign in', 'Войти')}>
              {web[s] ? <Music2 size={12} /> : <LogIn size={12} />}
              {SERVICE_NAMES[s]}
            </button>
          ))}
          <button className={`src-chip ${isRadio ? 'live' : ''}`} onClick={() => (isRadio ? radioToggle() : select(radioState.index))}>
            <RadioIcon size={12} /> Radio
          </button>
        </div>
      </div>
    </div>
  );
}
