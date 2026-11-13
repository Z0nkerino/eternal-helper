// Music: whatever plays right now, big — artwork on a spinning record, a soft aurora in the cover's
// colours, a visualizer, smooth synced lyrics — plus Eternal Radio stations and the music accounts.
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Disc3, ListMusic, LogIn, Music2, Mic2, Pause, Play, Radio as RadioIcon, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { toast } from '../lib/store';
import { slideControl, useControls, readControls } from '../lib/controls';
import { useEffect } from 'react';
import { call } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { useApp } from '../lib/store';
import { livePosition, mediaControl, mediaSeek, SERVICE_NAMES } from '../lib/music';
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

/** The seek bar: click or drag anywhere on it; the thumb grows under the cursor. */
function Seek({ pos, dur }: { pos: number; dur: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const at = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width)) * dur;
  };
  const shown = drag ?? pos;
  return (
    <div className="music-progress">
      <div
        ref={ref}
        className={`mp-track seekable ${drag != null ? 'drag' : ''}`}
        onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), setDrag(at(e.clientX)))}
        onPointerMove={(e) => drag != null && setDrag(at(e.clientX))}
        onPointerUp={(e) => (void mediaSeek(at(e.clientX)), setDrag(null))}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={dur}
        aria-valuenow={Math.round(shown)}
      >
        <div className="mp-fill" style={{ transform: `scaleX(${Math.min(1, shown / dur)})` }} />
        <span className="mp-thumb" style={{ left: `${Math.min(100, (shown / dur) * 100)}%` }} />
      </div>
      <div className="row between tiny mono faint">
        <span>{fmtClock(shown)}</span>
        <span>-{fmtClock(Math.max(0, dur - shown))}</span>
      </div>
    </div>
  );
}

/** Long titles glide sideways so the whole name can be read. */
function Marquee({ text, className }: { text: string; className: string }) {
  const long = text.length > 22;
  return (
    <div className={`${className} marquee ${long ? 'on' : ''}`} title={text}>
      <span>{text}</span>
      {long && <span aria-hidden>{text}</span>}
    </div>
  );
}

function VolumeRow() {
  const c = useControls((s) => s.c);
  useEffect(() => void readControls(), []);
  if (c?.volume == null) return null;
  const v = c.muted ? 0 : c.volume;
  const Icon = v === 0 ? VolumeX : v < 50 ? Volume1 : Volume2;
  return (
    <div className="music-vol">
      <Icon size={14} className="faint" />
      <input type="range" min={0} max={100} value={v} onChange={(e) => slideControl('volume', Number(e.target.value))} aria-label="Volume" style={{ ['--v' as string]: `${v}%` }} />
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
  const [pane, setPane] = useState<'lyrics' | 'stations'>('lyrics');
  const pos = isRadio ? radioState.position * 1000 : livePosition(m, at, now);
  const playing = !!m?.playing;
  const dur = m?.durationMs ?? null;
  const toggle = () => (m ? void mediaControl('toggle') : radioToggle());
  const showLyrics = pane === 'lyrics' && !!lyrics?.lines.length && pos != null;

  return (
    <div className={`music ${playing ? 'playing' : ''}`} style={cover ? { ['--cover' as string]: cover } : undefined}>
      <div className="aurora" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="music-left">
        <div className="disc-wrap">
          <div className="vinyl" style={{ ['--label' as string]: `url("${art}")` }} />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img key={art} className="disc-art" src={art} alt="" initial={{ opacity: 0, scale: 0.85, rotate: -6 }} animate={{ opacity: 1, scale: playing ? 1 : 0.94, rotate: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }} />
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={m?.title ?? 'none'} className="music-meta" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
            <Marquee className="music-title" text={m?.title ?? track.title} />
            <div className="small muted ellipsis">{m ? m.artist || tr('Unknown artist', 'Неизвестный исполнитель') : tr('Eternal Radio · tap play', 'Eternal Radio · нажми play')}</div>
            {m && (m.album || m.source) && (
              <div className="music-tags tiny">
                {m.album && <span title={m.album}><Disc3 size={10} /> {m.album}</span>}
                {m.source && <span><Music2 size={10} /> {m.source}</span>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        {dur && pos != null ? <Seek pos={pos} dur={dur} /> : <div className="music-progress" />}
        <div className="music-controls">
          <motion.button className="icon-btn" whileTap={{ scale: 0.85 }} aria-label="Previous" onClick={() => void mediaControl('previous')} disabled={!m}>
            <SkipBack size={18} fill="currentColor" />
          </motion.button>
          <motion.button className={`play-btn ${playing ? 'pulse' : ''}`} whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.06 }} aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
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
        <VolumeRow />
      </div>
      <div className="music-right">
        <div className="music-panes">
          <div className="segmented">
            <button className={pane === 'lyrics' ? 'on' : ''} onClick={() => setPane('lyrics')}><Mic2 size={12} /> {tr('Lyrics', 'Текст')}</button>
            <button className={pane === 'stations' ? 'on' : ''} onClick={() => setPane('stations')}><ListMusic size={12} /> {tr('Radio', 'Радио')}</button>
          </div>
          <span className="grow" />
          {pane === 'lyrics' && lyrics && <span className={`lyr-badge tiny ${lyrics.approximate ? 'approx' : ''}`}>{lyrics.approximate ? tr('Approximate timing', 'Примерно по времени') : tr('Synced', 'Синхронно')}</span>}
          {m && (
            <button className="icon-btn sm" title={tr('Copy song name', 'Скопировать название')} onClick={() => void copyText(`${m.artist ? m.artist + ' — ' : ''}${m.title}`).then(() => toast(tr('Copied', 'Скопировано'), { tone: 'ok' }))}>
              <Copy size={13} />
            </button>
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={showLyrics ? 'l' : pane} className="music-pane" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            {showLyrics ? (
              <Lyrics lines={lyrics!.lines} pos={pos!} />
            ) : pane === 'lyrics' ? (
              <div className="lyr-empty">
                <Mic2 size={22} />
                <span className="small muted">{!m ? tr('Play something to see its lyrics here.', 'Включи музыку — здесь появится текст.') : isRadio ? tr('Eternal Radio has no words — just music.', 'В Eternal Radio нет слов — только музыка.') : lyrics === null ? tr('Looking for the lyrics…', 'Ищу текст…') : tr('No lyrics found for this song.', 'Текст для этой песни не найден.')}</span>
              </div>
            ) : (
              <Stations />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="music-sources">
          {(['spotify', 'yandex', 'soundcloud', 'youtube'] as const).map((s) => (
            <button key={s} className={`src-chip ${web[s] ? 'on' : ''} ${source.kind === 'web' && source.service === s ? 'live' : ''}`} onClick={() => void call('music_open', { service: s, show: true })} title={web[s] ? tr('Open the player', 'Открыть плеер') : tr('Sign in', 'Войти')}>
              {web[s] ? <Music2 size={12} /> : <LogIn size={12} />}
              {s === 'youtube' ? 'YouTube' : s === 'yandex' ? 'Yandex' : SERVICE_NAMES[s]}
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
