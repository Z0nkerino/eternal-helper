// Captures: every screenshot (and videos recorded with earlier versions), saved as files and shown here as
// a gallery. Open, edit fully (screenshots in the drawing editor, videos in the video editor), copy,
// rename, show in the folder or delete. New screenshots start right here.
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Copy, FolderOpen, Image as ImageIcon, Pencil, Play, Trash2, Video } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { call, inTauri, listen, type Recording, type ShotFile } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { takeScreenshot, toast } from '../lib/store';
import { fmtDuration, fmtSize } from '../lib/recorder';

type Kind = 'shots' | 'videos';
const src = (path: string) => (inTauri ? convertFileSrc(path) : '');

function Card({ title, sub, thumb, onOpen, actions, i }: { title: string; sub: string; thumb: React.ReactNode; onOpen: () => void; actions: React.ReactNode; i: number }) {
  return (
    <motion.div className="cap-card" layout initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: Math.min(i, 8) * 0.03, type: 'spring', stiffness: 380, damping: 30 }}>
      <button className="cap-thumb" onClick={onOpen}>
        {thumb}
      </button>
      <div className="cap-meta">
        <span className="cap-title ellipsis" title={title}>{title}</span>
        <span className="tiny faint">{sub}</span>
      </div>
      <div className="cap-actions">{actions}</div>
    </motion.div>
  );
}

function Rename({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(value);
  return <input className="cap-rename" autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onDone(v)} onKeyDown={(e) => (e.key === 'Enter' ? onDone(v) : e.key === 'Escape' ? onDone(null) : undefined)} />;
}

export function CapturesView() {
  const tr = useTr();
  const [kind, setKind] = useState<Kind>('shots');
  const [shots, setShots] = useState<ShotFile[]>([]);
  const [videos, setVideos] = useState<Recording[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const loc = tr.lang === 'ru' ? 'ru-RU' : 'en-US';
  const when = (t: number) => new Date(t).toLocaleString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const load = useCallback(() => {
    void call('shot_list').then((l) => setShots(l ?? []));
    void call('rec_list').then((l) => setVideos(l ?? []));
  }, []);
  useEffect(() => {
    load();
    const a = listen('shots://changed', load);
    const b = listen('recordings://changed', load);
    const c = listen<string>('island://shot-saved', load);
    return () => (a(), b(), c());
  }, [load]);

  const safe = async (p: Promise<unknown>, ok?: string) => {
    try {
      await p;
      if (ok) toast(ok, { tone: 'ok' });
      load();
    } catch (e) {
      toast(String(e), { tone: 'error', force: true });
    }
  };
  const del = (path: string, run: () => Promise<unknown>) => {
    if (confirm !== path) return setConfirm(path);
    setConfirm(null);
    void safe(run());
  };

  return (
    <div className="captures">
      <div className="cap-top">
        <div className="segmented cap-seg">
          <button className={kind === 'shots' ? 'on' : ''} onClick={() => setKind('shots')}>
            <ImageIcon size={13} /> {tr('Screenshots', 'Скриншоты')} <span className="faint">{shots.length}</span>
          </button>
          <button className={kind === 'videos' ? 'on' : ''} onClick={() => setKind('videos')}>
            <Video size={13} /> {tr('Videos', 'Видео')} <span className="faint">{videos.length}</span>
          </button>
        </div>
        <span className="grow" />
        <button className="chip-btn" onClick={() => void takeScreenshot()}>
          <Camera size={13} /> {tr('Screenshot', 'Скриншот')}
        </button>
        <button className="icon-btn" title={tr('Open the folder', 'Открыть папку')} aria-label={tr('Open the folder', 'Открыть папку')} onClick={() => void (kind === 'videos' ? call('rec_open_folder') : shots[0] ? call('shot_reveal', { path: shots[0].path }) : takeScreenshot())}>
          <FolderOpen size={15} />
        </button>
      </div>

      <div className="cap-grid scroll">
        <AnimatePresence initial={false} mode="popLayout">
          {kind === 'shots' &&
            shots.map((f, i) => (
              <Card
                key={f.path}
                i={i}
                title={renaming === f.path ? '' : f.name}
                sub={`${when(f.createdAt)} · ${fmtSize(f.size)}`}
                onOpen={() => void safe(call('shot_edit', { path: f.path }))}
                thumb={src(f.path) ? <img src={src(f.path)} alt="" loading="lazy" /> : <ImageIcon size={22} className="faint" />}
                actions={
                  renaming === f.path ? (
                    <Rename value={f.name} onDone={(v) => (setRenaming(null), v && v !== f.name && void safe(call('shot_rename', { path: f.path, title: v })))} />
                  ) : (
                    <>
                      <button className="icon-btn sm" title={tr('Edit', 'Изменить')} onClick={() => void safe(call('shot_edit', { path: f.path }))}><Pencil size={13} /></button>
                      <button className="icon-btn sm" title={tr('Copy', 'Копировать')} onClick={() => void safe(call('shot_copy', { path: f.path }), tr('Copied', 'Скопировано'))}><Copy size={13} /></button>
                      <button className="icon-btn sm" title={tr('Rename', 'Переименовать')} onClick={() => setRenaming(f.path)}><span className="cap-aa">Aa</span></button>
                      <button className="icon-btn sm" title={tr('Show in folder', 'Показать в папке')} onClick={() => void safe(call('shot_reveal', { path: f.path }))}><FolderOpen size={13} /></button>
                      <button className={`icon-btn sm ${confirm === f.path ? 'danger-solid' : ''}`} title={confirm === f.path ? tr('Click again to delete', 'Нажми ещё раз, чтобы удалить') : tr('Delete', 'Удалить')} onBlur={() => setConfirm(null)} onClick={() => del(f.path, () => call('shot_delete', { path: f.path }))}><Trash2 size={13} /></button>
                    </>
                  )
                }
              />
            ))}
          {kind === 'videos' &&
            videos.map((v, i) => (
              <Card
                key={v.path}
                i={i}
                title={renaming === v.path ? '' : v.title}
                sub={`${when(v.createdAt)} · ${v.durationMs ? fmtDuration(v.durationMs) + ' · ' : ''}${fmtSize(v.size)}`}
                onOpen={() => void safe(call('video_edit', { path: v.path }))}
                thumb={
                  <>
                    {src(v.path) ? <video src={`${src(v.path)}#t=0.5`} preload="metadata" muted /> : <Video size={22} className="faint" />}
                    <span className="cap-play"><Play size={14} fill="currentColor" /></span>
                    {v.durationMs ? <span className="cap-dur mono">{fmtDuration(v.durationMs)}</span> : null}
                  </>
                }
                actions={
                  renaming === v.path ? (
                    <Rename value={v.title} onDone={(t) => (setRenaming(null), t && t !== v.title && void safe(call('rec_rename', { path: v.path, title: t })))} />
                  ) : (
                    <>
                      <button className="icon-btn sm" title={tr('Edit', 'Изменить')} onClick={() => void safe(call('video_edit', { path: v.path }))}><Pencil size={13} /></button>
                      <button className="icon-btn sm" title={tr('Play', 'Смотреть')} onClick={() => void safe(call('rec_open', { path: v.path, reveal: false }))}><Play size={13} /></button>
                      <button className="icon-btn sm" title={tr('Rename', 'Переименовать')} onClick={() => setRenaming(v.path)}><span className="cap-aa">Aa</span></button>
                      <button className="icon-btn sm" title={tr('Show in folder', 'Показать в папке')} onClick={() => void safe(call('rec_open', { path: v.path, reveal: true }))}><FolderOpen size={13} /></button>
                      <button className={`icon-btn sm ${confirm === v.path ? 'danger-solid' : ''}`} title={confirm === v.path ? tr('Click again to delete', 'Нажми ещё раз, чтобы удалить') : tr('Delete', 'Удалить')} onBlur={() => setConfirm(null)} onClick={() => del(v.path, () => call('rec_delete', { path: v.path }))}><Trash2 size={13} /></button>
                    </>
                  )
                }
              />
            ))}
        </AnimatePresence>
        {(kind === 'shots' ? shots : videos).length === 0 && (
          <div className="cap-empty">
            {kind === 'shots' ? <Camera size={26} /> : <Video size={26} />}
            <p className="small muted">
              {kind === 'shots'
                ? tr('No screenshots yet. Press Alt+Shift+S or the button above — every screenshot is saved here.', 'Пока нет скриншотов. Нажми Alt+Shift+S или кнопку выше — каждый скриншот сохраняется здесь.')
                : tr('No recordings yet. Press Record above to capture your screen.', 'Пока нет записей. Нажми «Запись» выше, чтобы записать экран.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
