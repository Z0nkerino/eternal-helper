// Eternal Radio: a liquid-glass player for the Eternal Inc. tracks.
import { AnimatePresence, motion } from 'framer-motion';
import { ListMusic, Pause, Play, Shuffle, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { useTr } from '../lib/i18n';
import { fmtClock } from '../island/bits';
import { TRACKS } from './tracks';
import { coverArt, next, previous, seek, select, setVolume, toggle, useRadio } from './player';

export function RadioCard({ compact = false }: { compact?: boolean }) {
  const tr = useTr();
  const r = useRadio();
  const t = TRACKS[r.index];
  const [list, setList] = useState(false);
  const [a, b, c] = t.colors;
  return (
    <div className={`radio ${compact ? 'compact' : ''} ${r.playing ? 'playing' : ''}`} style={{ ['--ra' as string]: a, ['--rb' as string]: b, ['--rc' as string]: c }}>
      <div className="radio-glow" aria-hidden />
      <div className="radio-main">
        <motion.img key={t.id} className="radio-cover" src={coverArt(t)} alt="" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }} />
        <div className="radio-info">
          <div className="tiny radio-label">ETERNAL RADIO</div>
          <div className="radio-title">
            {t.title}
            {t.id === 'sunrise' && <span className="radio-badge">Beta theme</span>}
          </div>
          <div className="small muted ellipsis">{tr(...t.mood)}</div>
          <div className="radio-progress" onClick={(e) => seek((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth)} role="slider" aria-valuenow={Math.round(r.position)} aria-valuemax={Math.round(r.duration)} aria-label={tr('Position', 'Позиция')}>
            <div style={{ width: `${(r.position / r.duration) * 100}%` }} />
          </div>
          <div className="row between tiny mono faint">
            <span>{fmtClock(r.position * 1000)}</span>
            <span>{fmtClock(r.duration * 1000)}</span>
          </div>
        </div>
      </div>
      <div className="radio-controls">
        <button className={`icon-btn ${r.shuffle ? 'on' : ''}`} aria-label={tr('Shuffle', 'Перемешать')} onClick={() => useRadio.setState({ shuffle: !r.shuffle })}>
          <Shuffle size={15} />
        </button>
        <button className="icon-btn" aria-label={tr('Previous', 'Назад')} onClick={previous}>
          <SkipBack size={17} />
        </button>
        <motion.button className="radio-play" whileTap={{ scale: 0.9 }} aria-label={r.playing ? tr('Pause', 'Пауза') : tr('Play', 'Играть')} onClick={toggle}>
          {r.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </motion.button>
        <button className="icon-btn" aria-label={tr('Next', 'Дальше')} onClick={() => next()}>
          <SkipForward size={17} />
        </button>
        <button className={`icon-btn ${list ? 'on' : ''}`} aria-label={tr('Tracks', 'Треки')} onClick={() => setList(!list)}>
          <ListMusic size={16} />
        </button>
        <div className="radio-vol">
          <Volume2 size={14} className="faint" />
          <input type="range" min={0} max={1} step={0.01} value={r.volume} onChange={(e) => setVolume(parseFloat(e.target.value))} aria-label={tr('Volume', 'Громкость')} />
        </div>
        <div className="radio-eq" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ transform: `scaleY(${r.playing ? 0.15 + (r.levels[i] ?? 0) * 0.95 : 0.15})` }} />
          ))}
        </div>
      </div>
      <AnimatePresence>
        {list && (
          <motion.ol className="radio-list" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            {TRACKS.map((x, i) => (
              <li key={x.id}>
                <button className={i === r.index ? 'on' : ''} onClick={() => select(i)}>
                  <img src={coverArt(x, 40)} alt="" />
                  <span className="grow ellipsis">{x.title}</span>
                  <span className="tiny faint">{x.bpm} BPM</span>
                </button>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}
