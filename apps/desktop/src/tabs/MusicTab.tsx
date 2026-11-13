// Music: what plays right now, big — a 3D cover that tilts toward the cursor, the record sliding out
// while it plays, the source's real logo, a seek line that pulses with the beat, its own volume (the
// system volume stays as it is), and below: synced lyrics, the players to choose from, Eternal Radio
// and what played recently.
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Clock3, Copy, Disc3, ListMusic, Mic2, Minus, Pause, Play, Plus, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { call } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { toast, useApp } from '../lib/store';
import { livePosition, mediaControl, mediaSeek, SERVICE_NAMES } from '../lib/music';
import { fmtClock, useNow } from '../island/bits';
import { TRACKS } from '../radio/tracks';
import { coverArt, select, setVolume as radioVolume, toggle as radioToggle, useRadio } from '../radio/player';
import { useCoverColor, useLyrics } from '../music/hooks';
import { useShallow } from 'zustand/react/shallow';
import { Lyrics } from '../music/Lyrics';
import { AppLogo } from '../lib/brands';
import { readExtra, saveExtra, useExtra } from '../lib/extra';
import { recentTracks } from '../lib/recent';

type Pane = 'lyrics' | 'players' | 'radio' | 'recent';

/** Bars across the bottom of the hero: Eternal Radio's real levels, otherwise driven by the beat. */
function Visualizer({ playing, radio }: { playing: boolean; radio: boolean }) {
  const levels = useRadio((r) => (radio ? r.levels : null));
  return (
    <div className={`viz2 ${playing ? 'on' : ''}`} aria-hidden>
      {Array.from({ length: 28 }, (_, i) => {
        const lv = levels?.length ? levels[Math.abs(((i * 7) % 9) - 4) % levels.length] : null;
        return <i key={i} style={{ ['--i' as string]: i, ...(lv != null && playing ? { transform: `scaleY(${0.1 + lv})` } : {}) }} />;
      })}
    </div>
  );
}

/** The seek line: click or drag; it glows and thickens with the beat. */
function Seek({ pos, dur }: { pos: number; dur: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const at = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width)) * dur;
  };
  const shown = drag ?? pos;
  const p = Math.min(1, shown / dur);
  return (
    <div className="seek2">
      <span className="tiny mono faint">{fmtClock(shown)}</span>
      <div
        ref={ref}
        className={`seek2-track ${drag != null ? 'drag' : ''}`}
        onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), setDrag(at(e.clientX)))}
        onPointerMove={(e) => drag != null && setDrag(at(e.clientX))}
        onPointerUp={(e) => (void mediaSeek(at(e.clientX)), setDrag(null))}
        role="slider"
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={dur}
        aria-valuenow={Math.round(shown)}
      >
        <div className="seek2-fill" style={{ transform: `scaleX(${p})` }} />
        <div className="seek2-glow" style={{ width: `${p * 100}%` }} />
        <span className="seek2-thumb" style={{ left: `${p * 100}%` }} />
      </div>
      <span className="tiny mono faint">-{fmtClock(Math.max(0, dur - shown))}</span>
    </div>
  );
}

function Marquee({ text, className }: { text: string; className: string }) {
  const long = text.length > 24;
  return (
    <div className={`${className} marquee ${long ? 'on' : ''}`} title={text}>
      <span>{text}</span>
      {long && <span aria-hidden>{text}</span>}
    </div>
  );
}

/**
 * The music's own volume: Eternal Radio's, the web player's, or (Windows) the player app's own audio
 * session — never the system volume, so notifications and other apps stay as loud as they were.
 */
function MusicVolume() {
  const tr = useTr();
  const m = useApp((s) => s.media);
  const src = useApp((s) => s.mediaSource);
  const radioVol = useRadio((r) => r.volume);
  const webVols = useExtra<Record<string, number>>('webVolume', {});
  const [sys, setSys] = useState<number | null | undefined>(undefined);
  const app = m?.source ?? '';
  useEffect(() => {
    if (src.kind !== 'system' || !app) return void setSys(undefined);
    let alive = true;
    void call('music_volume_get', { appName: app }).then((v) => alive && setSys(v ?? null));
    return () => void (alive = false);
  }, [src.kind, app]);
  const pending = useRef<ReturnType<typeof setTimeout>>();
  const value = src.kind === 'radio' ? radioVol : src.kind === 'web' ? (webVols[src.service] ?? 100) / 100 : sys;
  if (value == null) {
    return sys === null && src.kind === 'system' ? <span className="tiny faint mvol-na">{tr(`${app || 'This player'}: volume not available`, `${app || 'Плеер'}: громкость недоступна`)}</span> : null;
  }
  const set = (v: number) => {
    if (src.kind === 'radio') return radioVolume(v);
    if (src.kind === 'web') {
      clearTimeout(pending.current);
      pending.current = setTimeout(() => void saveExtra('webVolume', { ...readExtra<Record<string, number>>('webVolume', {}), [src.service]: Math.round(v * 100) }), 300);
      useApp.setState({ musicVolume: v });
      return void call('music_control', { service: src.service, action: `volume:${Math.round(v * 100)}` });
    }
    setSys(v);
    clearTimeout(pending.current);
    pending.current = setTimeout(() => void call('music_volume_set', { appName: app, level: v }).catch((e) => toast(String(e), { tone: 'error' })), 40);
  };
  const Icon = value === 0 ? VolumeX : value < 0.5 ? Volume1 : Volume2;
  return (
    <div className="mvol" title={tr('Only the music — the system volume stays the same', 'Только музыка — общая громкость не меняется')}>
      <button className="icon-btn sm" onClick={() => set(value > 0 ? 0 : 0.7)} aria-label={tr('Mute music', 'Без звука')}>
        <Icon size={14} />
      </button>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => set(Number(e.target.value) / 100)} aria-label={tr('Music volume', 'Громкость музыки')} style={{ ['--v' as string]: `${value * 100}%` }} />
      <span className="tiny mono faint mvol-n">{Math.round(value * 100)}</span>
    </div>
  );
}

/** "Choose the music": every player, with its real logo and what it's doing. */
function Players() {
  const tr = useTr();
  const web = useApp((s) => s.webMusic);
  const src = useApp((s) => s.mediaSource);
  const sys = useApp((s) => s.systemMedia);
  const r = useRadio(useShallow((x) => ({ index: x.index, playing: x.playing })));
  const card = (key: string, logo: string, name: string, status: string, live: boolean, onClick: () => void, i: number) => (
    <motion.button key={key} className={`player-card ${live ? 'live' : ''}`} onClick={onClick} initial={{ opacity: 0, y: 10, rotateX: -20 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 28 }} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
      <AppLogo name={logo} size={30} fallback={<span className="player-fallback"><Disc3 size={16} /></span>} />
      <span className="grow ellipsis">
        <span className="small ellipsis">{name}</span>
        <span className="tiny faint ellipsis">{status}</span>
      </span>
      {live && <span className="mini-eq" aria-hidden><i /><i /><i /></span>}
    </motion.button>
  );
  return (
    <div className="players scroll">
      {sys && card('sys', sys.source, sys.source || tr('This computer', 'Этот компьютер'), `${sys.playing ? '▶ ' : ''}${sys.title}`, src.kind === 'system' && !!sys.playing, () => void mediaControl('toggle'), 0)}
      {(['spotify', 'yandex', 'youtube', 'soundcloud'] as const).map((s, i) => {
        const rep = web[s];
        const live = src.kind === 'web' && src.service === s && !!rep?.playing;
        return card(s, s, SERVICE_NAMES[s], rep?.title ? `${rep.playing ? '▶ ' : ''}${rep.title}` : rep ? tr('Signed in', 'Вход выполнен') : tr('Sign in to play here', 'Войди, чтобы слушать здесь'), live, () => void call('music_open', { service: s, show: true }), i + 1);
      })}
      {card('radio', 'eternal', 'Eternal Radio', `${src.kind === 'radio' && r.playing ? '▶ ' : ''}${TRACKS[r.index].title}`, src.kind === 'radio' && r.playing, () => (src.kind === 'radio' ? radioToggle() : select(r.index)), 6)}
    </div>
  );
}

function Stations() {
  const tr = useTr();
  const r = useRadio();
  const src = useApp((s) => s.mediaSource.kind);
  return (
    <div className="stations scroll">
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

function Recent() {
  const tr = useTr();
  const list = recentTracks();
  if (!list.length) return <div className="lyr-empty"><Clock3 size={22} /><span className="small muted">{tr('Songs you play will show up here.', 'Здесь появятся песни, которые ты слушаешь.')}</span></div>;
  return (
    <div className="recent scroll">
      {list.map((t, i) => (
        <motion.div key={`${t.title}-${i}`} className="recent-row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
          {t.artwork ? <img src={t.artwork} alt="" /> : <span className="recent-ph"><Disc3 size={14} /></span>}
          <span className="grow ellipsis">
            <span className="small ellipsis">{t.title}</span>
            <span className="tiny faint ellipsis">{t.artist}</span>
          </span>
          <AppLogo name={t.source ?? ''} size={16} />
        </motion.div>
      ))}
    </div>
  );
}

/** The cover as a 3D card that tilts toward the cursor, with the record sliding out while it plays. */
function Cover({ art, playing }: { art: string; playing: boolean }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-1, 1], [12, -12]), { stiffness: 200, damping: 18 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-14, 14]), { stiffness: 200, damping: 18 });
  return (
    <div
      className={`cover3d ${playing ? 'playing' : ''}`}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
        my.set(((e.clientY - r.top) / r.height) * 2 - 1);
      }}
      onPointerLeave={() => (mx.set(0), my.set(0))}
    >
      <div className="vinyl2" style={{ ['--label' as string]: `url("${art}")` }} />
      <motion.div className="cover3d-card" style={{ rotateX: rx, rotateY: ry }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.img key={art} src={art} alt="" initial={{ opacity: 0, scale: 0.8, rotateY: -60 }} animate={{ opacity: 1, scale: playing ? 1 : 0.95, rotateY: 0 }} exit={{ opacity: 0, scale: 0.85, rotateY: 60 }} transition={{ type: 'spring', stiffness: 220, damping: 22 }} />
        </AnimatePresence>
        <span className="cover3d-shine" />
      </motion.div>
      <img className="cover3d-reflect" src={art} alt="" aria-hidden />
    </div>
  );
}

export function MusicTab() {
  const tr = useTr();
  const m = useApp((s) => s.media);
  const at = useApp((s) => s.mediaAt);
  const source = useApp((s) => s.mediaSource);
  const radioState = useRadio(useShallow((r) => ({ index: r.index, position: r.position, playing: r.playing })));
  const now = useNow(200);
  const isRadio = source.kind === 'radio';
  const track = TRACKS[radioState.index];
  const art = m?.artwork ?? coverArt(track, 240);
  const cover = useCoverColor(art);
  const lyrics = useLyrics(m?.title, m?.artist, m?.durationMs, !m || isRadio);
  const [pane, setPane] = useState<Pane>('lyrics');
  const offset = useExtra<number>('lyricsOffset', 0);
  const pos = isRadio ? radioState.position * 1000 : livePosition(m, at, now);
  const playing = !!m?.playing;
  const dur = m?.durationMs ?? null;
  const toggle = () => (m ? void mediaControl('toggle') : radioToggle());
  const showLyrics = pane === 'lyrics' && !!lyrics?.lines.length && pos != null;
  const srcName = isRadio ? 'Eternal Radio' : m?.source ?? '';
  const nudge = (d: number) => void saveExtra('lyricsOffset', Math.max(-5000, Math.min(5000, offset + d)));

  const PANES: [Pane, typeof Mic2, string][] = [
    ['lyrics', Mic2, tr('Lyrics', 'Текст')],
    ['players', Disc3, tr('Players', 'Плееры')],
    ['radio', ListMusic, tr('Radio', 'Радио')],
    ['recent', Clock3, tr('Recent', 'Недавние')],
  ];

  return (
    <div className={`music2 ${playing ? 'playing' : ''}`} style={cover ? { ['--cover' as string]: cover } : undefined}>
      <div className="aurora" aria-hidden><i /><i /><i /></div>
      {/* Now playing: cover, what it is, then one full-width seek bar and one row of big controls. */}
      <div className="m3-top">
        <Cover art={art} playing={playing} />
        <div className="m3-info">
          <div className="m2-src">
            <AppLogo name={srcName} size={15} fallback={<Disc3 size={13} className="faint" />} />
            <span className="tiny faint ellipsis">{srcName || tr('Nothing playing', 'Ничего не играет')}</span>
            <span className="grow" />
            {m && (
              <button className="icon-btn sm" title={tr('Copy song name', 'Скопировать название')} onClick={() => void copyText(`${m.artist ? m.artist + ' — ' : ''}${m.title}`).then(() => toast(tr('Copied', 'Скопировано'), { tone: 'ok' }))}>
                <Copy size={12} />
              </button>
            )}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={m?.title ?? 'none'} className="m2-meta" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.22 }}>
              <Marquee className="m2-title" text={m?.title ?? track.title} />
              <div className="small muted ellipsis">
                {m ? m.artist || tr('Unknown artist', 'Неизвестный исполнитель') : tr('Eternal Radio · press play', 'Eternal Radio · нажми play')}
                {m?.album ? <span className="faint"> · {m.album}</span> : null}
              </div>
            </motion.div>
          </AnimatePresence>
          <Visualizer playing={playing} radio={isRadio} />
        </div>
      </div>
      {dur && pos != null ? <Seek pos={pos} dur={dur} /> : <div className="seek2 empty" />}
      <div className="m3-controls">
        <span className="m3-side" />
        <div className="m3-buttons">
          <motion.button className="m3-skip" whileTap={{ scale: 0.82 }} aria-label="Previous" title={tr('Previous', 'Назад')} onClick={() => void mediaControl('previous')} disabled={!m}>
            <SkipBack size={20} fill="currentColor" />
          </motion.button>
          <motion.button className={`play-btn big ${playing ? 'pulse' : ''}`} whileTap={{ scale: 0.86 }} whileHover={{ scale: 1.06 }} aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={playing ? 'pause' : 'play'} initial={{ scale: 0.3, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.3, opacity: 0, rotate: 40 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}>
                {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          <motion.button className="m3-skip" whileTap={{ scale: 0.82 }} aria-label="Next" title={tr('Next', 'Дальше')} onClick={() => void mediaControl('next')} disabled={!m}>
            <SkipForward size={20} fill="currentColor" />
          </motion.button>
        </div>
        <span className="m3-side right"><MusicVolume /></span>
      </div>
      <div className="m2-panes">
        <div className="m2-tabs">
          {PANES.map(([id, Icon, label]) => (
            <button key={id} className={pane === id ? 'on' : ''} onClick={() => setPane(id)}>
              {pane === id && <motion.span layoutId="m2-tab" className="m2-tab-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              <Icon size={12} /> {label}
            </button>
          ))}
          <span className="grow" />
          {pane === 'lyrics' && lyrics && (
            <>
              <span className={`lyr-badge tiny ${lyrics.approximate ? 'approx' : ''}`}>{lyrics.approximate ? tr('Approximate', 'Примерно') : tr('Synced', 'Синхронно')}</span>
              <span className="lyr-offset" title={tr('Lyrics early/late', 'Текст раньше/позже')}>
                <button className="icon-btn sm" onClick={() => nudge(-250)} aria-label={tr('Lyrics earlier', 'Текст раньше')}><Minus size={11} /></button>
                <span className="tiny mono">{offset === 0 ? '0.0s' : `${offset > 0 ? '+' : ''}${(offset / 1000).toFixed(2)}s`}</span>
                <button className="icon-btn sm" onClick={() => nudge(250)} aria-label={tr('Lyrics later', 'Текст позже')}><Plus size={11} /></button>
              </span>
            </>
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={showLyrics ? 'l' : pane} className="m2-pane" initial={{ opacity: 0, y: 10, rotateX: -8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
            {showLyrics ? (
              <Lyrics lines={lyrics!.lines} pos={pos! - offset} />
            ) : pane === 'lyrics' ? (
              <div className="lyr-empty">
                <Mic2 size={22} />
                <span className="small muted">{!m ? tr('Play something to see its lyrics here.', 'Включи музыку — здесь появится текст.') : isRadio ? tr('Eternal Radio has no words — just music.', 'В Eternal Radio нет слов — только музыка.') : lyrics === null ? tr('Looking for the lyrics…', 'Ищу текст…') : tr('No lyrics found for this song.', 'Текст для этой песни не найден.')}</span>
              </div>
            ) : pane === 'players' ? (
              <Players />
            ) : pane === 'radio' ? (
              <Stations />
            ) : (
              <Recent />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
