// Video editor for a recording: play it, trim the start and end on a timeline of thumbnails, choose a
// speed, keep or drop the sound, rename it, save the current frame as a screenshot, and save the result
// as a new video next to the original. Export redraws the trimmed part through a canvas (and the sound
// through Web Audio) in real time, which works the same in WebView2 (Windows) and WebKit (macOS).
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Check, Pause, Play, Save, Scissors, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { appendChunk, call, emitEvent, inTauri, type Recording } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { TitleBar } from '../components/TitleBar';
import { fmtDuration } from '../lib/recorder';

const MIME = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const pickMime = () => MIME.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
const SPEEDS = [0.5, 1, 1.5, 2];
const fmt = (s: number) => fmtDuration(Math.max(0, s) * 1000) + '.' + String(Math.floor((s % 1) * 10));

export function VideoEditor({ path }: { path: string }) {
  const tr = useTr();
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<Recording | null>(null);
  const [title, setTitle] = useState('');
  const [dur, setDur] = useState(0);
  const [t, setT] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [exporting, setExporting] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelExport = useRef(false);
  const ext = path.split('.').pop()?.toLowerCase() ?? 'webm';

  // Load the file as a same-origin blob (needed to cut and re-encode it).
  useEffect(() => {
    let u = '';
    void (async () => {
      try {
        const list = inTauri ? await call('rec_list') : [];
        const r = list.find((x) => x.path === path) ?? null;
        setRec(r);
        setTitle(r?.title ?? path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, ''));
        const bytes = inTauri ? await invoke<ArrayBuffer>('rec_read', { path }) : await (await fetch(path)).arrayBuffer();
        u = URL.createObjectURL(new Blob([bytes], { type: ext === 'mp4' ? 'video/mp4' : ext === 'mov' ? 'video/quicktime' : 'video/webm' }));
        setUrl(u);
      } catch (e) {
        setError(String(e));
      }
    })();
    return () => void (u && URL.revokeObjectURL(u));
  }, [path, ext]);

  // Recordings from MediaRecorder often report an unknown length until seeked to the end.
  const onMeta = () => {
    const v = video.current!;
    const ready = (d: number) => {
      setDur(d);
      setRange([0, d]);
      v.currentTime = 0;
      void makeThumbs(d);
    };
    if (Number.isFinite(v.duration) && v.duration > 0) return ready(v.duration);
    const fix = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) {
        v.removeEventListener('timeupdate', fix);
        ready(v.duration);
      }
    };
    v.addEventListener('timeupdate', fix);
    v.currentTime = 1e9;
  };

  // A strip of frames for the timeline, taken from a second, hidden player.
  const makeThumbs = async (d: number) => {
    if (!url) return;
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }));
    const out: string[] = [];
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 90;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 10; i++) {
      v.currentTime = (d * (i + 0.5)) / 10;
      await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
      g.drawImage(v, 0, 0, c.width, c.height);
      out.push(c.toDataURL('image/jpeg', 0.6));
      setThumbs([...out]);
    }
  };

  // Playback stays inside the trimmed part.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const tick = () => {
      setT(v.currentTime);
      if (exporting == null && v.currentTime >= range[1] - 0.02 && !v.paused) {
        v.pause();
        v.currentTime = range[0];
      }
    };
    v.addEventListener('timeupdate', tick);
    return () => v.removeEventListener('timeupdate', tick);
  }, [range, exporting]);

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v || exporting != null) return;
    if (v.paused) {
      if (v.currentTime < range[0] || v.currentTime >= range[1] - 0.05) v.currentTime = range[0];
      v.playbackRate = speed;
      void v.play();
    } else v.pause();
  }, [range, speed, exporting]);

  // Timeline dragging: playhead, start handle, end handle.
  const drag = (which: 'head' | 'in' | 'out') => (e: React.PointerEvent) => {
    e.stopPropagation();
    const el = track.current!;
    el.setPointerCapture(e.pointerId);
    const at = (x: number) => {
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.min(dur, ((x - r.left) / r.width) * dur));
    };
    const move = (ev: PointerEvent) => {
      const s = at(ev.clientX);
      const v = video.current!;
      if (which === 'head') v.currentTime = Math.max(range[0], Math.min(range[1], s));
      if (which === 'in') setRange(([, b]) => [Math.min(s, b - 0.3), b]), (v.currentTime = Math.min(s, range[1] - 0.3));
      if (which === 'out') setRange(([a]) => [a, Math.max(s, a + 0.3)]), (v.currentTime = Math.max(s, range[0] + 0.3));
    };
    move(e.nativeEvent);
    const up = () => (el.removeEventListener('pointermove', move), el.removeEventListener('pointerup', up));
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  // Keyboard: Space play/pause, I / O set the start / end at the playhead, arrows step.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const v = video.current;
      if (!v) return;
      if (e.key === ' ') (e.preventDefault(), toggle());
      if (e.key === 'i') setRange(([, b]) => [Math.min(v.currentTime, b - 0.3), b]);
      if (e.key === 'o') setRange(([a]) => [a, Math.max(v.currentTime, a + 0.3)]);
      if (e.key === 'ArrowLeft') v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 5 : 1 / 30));
      if (e.key === 'ArrowRight') v.currentTime = Math.min(dur, v.currentTime + (e.shiftKey ? 5 : 1 / 30));
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [toggle, dur]);

  const snapshot = async () => {
    const v = video.current!;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (!blob) return;
    try {
      const saved = await invoke<string>('shot_save', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-copy': '1' } });
      void emitEvent('island://shot-saved', saved);
      setNotice(tr('Frame saved to Screenshots and copied', 'Кадр сохранён в скриншоты и скопирован'));
    } catch (e) {
      setNotice(String(e));
    }
  };

  const rename = async () => {
    if (!rec || !title.trim() || title === rec.title) return;
    try {
      await call('rec_rename', { path, title: title.trim() });
      setNotice(tr('Renamed', 'Переименовано'));
    } catch (e) {
      setNotice(String(e));
    }
  };

  /** Plays the trimmed part through a canvas (+ Web Audio for sound) and records it as a new file. */
  const exportVideo = async () => {
    const v = video.current!;
    const [a, b] = range;
    const mimeType = pickMime();
    const c = document.createElement('canvas');
    c.width = v.videoWidth || 1280;
    c.height = v.videoHeight || 720;
    const g = c.getContext('2d')!;
    const stream = c.captureStream(30);
    let ctx: AudioContext | null = null;
    if (!muted) {
      ctx = new AudioContext();
      const srcNode = ctx.createMediaElementSource(v);
      const dest = ctx.createMediaStreamDestination();
      srcNode.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
    let id = '';
    try {
      id = await call('rec_begin', { ext: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' });
      const mr = new MediaRecorder(stream, { mimeType: mimeType || undefined, videoBitsPerSecond: 8_000_000 });
      let writes: Promise<unknown> = Promise.resolve();
      mr.ondataavailable = (e) => {
        if (e.data.size) writes = writes.then(async () => appendChunk(id, new Uint8Array(await e.data.arrayBuffer())));
      };
      cancelExport.current = false;
      setExporting(0);
      v.pause();
      v.currentTime = a;
      await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
      v.playbackRate = speed;
      v.muted = false;
      mr.start(1000);
      await v.play();
      await new Promise<void>((resolve) => {
        const frame = () => {
          g.drawImage(v, 0, 0, c.width, c.height);
          setExporting((v.currentTime - a) / (b - a));
          if (cancelExport.current || v.currentTime >= b || v.ended) return resolve();
          requestAnimationFrame(frame);
        };
        frame();
      });
      v.pause();
      await new Promise<void>((r) => (mr.addEventListener('stop', () => r(), { once: true }), mr.stop()));
      await writes;
      if (cancelExport.current) {
        await call('rec_cancel', { id });
        setNotice(tr('Export cancelled', 'Сохранение отменено'));
      } else {
        await call('rec_finish', { id, durationMs: Math.round(((b - a) / speed) * 1000), title: `${title.trim() || 'Recording'} (edited)` });
        setNotice(tr('Saved as a new video next to the original', 'Сохранено как новое видео рядом с оригиналом'));
      }
    } catch (e) {
      if (id) void call('rec_cancel', { id });
      setNotice(`${tr('Couldn’t save the video', 'Не удалось сохранить видео')}: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setExporting(null);
      stream.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    }
  };

  const del = async () => {
    if (!confirm(tr('Delete this recording?', 'Удалить эту запись?'))) return;
    await call('rec_delete', { path });
    void getCurrentWindow().close();
  };

  const pct = (s: number) => `${dur ? (s / dur) * 100 : 0}%`;
  const trimmed = range[0] > 0.05 || (dur && range[1] < dur - 0.05);

  return (
    <div className="veditor">
      <TitleBar>
        <span className="popout-ic"><Scissors size={13} /></span>
        <input className="ve-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => void rename()} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={tr('Name', 'Название')} />
      </TitleBar>
      {error ? (
        <div className="ve-error"><p>{error}</p></div>
      ) : (
        <>
          <div className="ve-stage" onClick={toggle}>
            {url && <video ref={video} src={url} onLoadedMetadata={onMeta} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} muted={muted && exporting == null} playsInline />}
            <AnimatePresence>
              {!playing && exporting == null && url && (
                <motion.span className="ve-bigplay" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }} transition={{ duration: 0.18 }}>
                  <Play size={28} fill="currentColor" />
                </motion.span>
              )}
            </AnimatePresence>
            {exporting != null && (
              <div className="ve-export" onClick={(e) => e.stopPropagation()}>
                <div className="small">{tr('Saving the new video…', 'Сохраняю новое видео…')} {Math.round(exporting * 100)}%</div>
                <div className="ve-bar"><i style={{ transform: `scaleX(${exporting})` }} /></div>
                <button className="chip-btn" onClick={() => (cancelExport.current = true)}><X size={12} /> {tr('Cancel', 'Отмена')}</button>
              </div>
            )}
          </div>

          <div className="ve-controls">
            <button className="play-btn sm" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={exporting != null}>
              {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
            <span className="mono small">{fmt(t)} <span className="faint">/ {fmt(dur)}</span></span>
            <span className="grow" />
            <div className="segmented" title={tr('Speed of the new video', 'Скорость нового видео')}>
              {SPEEDS.map((s) => (
                <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>
              ))}
            </div>
            <button className={`chip-btn ${muted ? 'on' : ''}`} onClick={() => setMuted(!muted)} title={tr('Keep or remove the sound', 'Оставить или убрать звук')}>
              {muted ? <VolumeX size={13} /> : <Volume2 size={13} />} {muted ? tr('No sound', 'Без звука') : tr('Sound', 'Звук')}
            </button>
          </div>

          <div className="ve-track" ref={track} onPointerDown={drag('head')}>
            <div className="ve-thumbs">{thumbs.map((s, i) => <img key={i} src={s} alt="" draggable={false} />)}</div>
            <div className="ve-shade" style={{ left: 0, width: pct(range[0]) }} />
            <div className="ve-shade" style={{ left: pct(range[1]), right: 0 }} />
            <div className="ve-range" style={{ left: pct(range[0]), width: `calc(${pct(range[1])} - ${pct(range[0])})` }}>
              <span className="ve-handle in" onPointerDown={drag('in')} />
              <span className="ve-handle out" onPointerDown={drag('out')} />
            </div>
            <div className="ve-head" style={{ left: pct(t) }} />
          </div>
          <div className="ve-hint tiny faint">
            {tr('Drag the yellow edges to trim · I / O set the start / end · Space plays', 'Тяни жёлтые края, чтобы обрезать · I / O — начало / конец · Пробел — воспроизведение')}
            {trimmed ? <span className="mono"> · {fmt(range[1] - range[0])}</span> : null}
          </div>

          <div className="ve-actions">
            <button className="chip-btn" onClick={() => void snapshot()} disabled={!url}><Camera size={13} /> {tr('Save frame as screenshot', 'Кадр в скриншот')}</button>
            <button className="chip-btn" onClick={() => void del()}><Trash2 size={13} /> {tr('Delete', 'Удалить')}</button>
            <span className="grow" />
            <button className="btn accent" onClick={() => void exportVideo()} disabled={!dur || exporting != null}>
              <Save size={14} /> {tr('Save as new video', 'Сохранить как новое видео')}
            </button>
          </div>
          <AnimatePresence>
            {notice && (
              <motion.div className="ve-notice" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onAnimationComplete={() => setTimeout(() => setNotice(null), 3500)}>
                <Check size={14} /> {notice}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
