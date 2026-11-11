// Screen recordings: record, then keep, rename, open, reveal or delete the saved videos.
import { Circle, FolderOpen, Pause, Pencil, Play, Square, Trash2, FolderSearch } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { call, listen, type Recording } from '../lib/ipc';
import { useT } from '../lib/i18n';
import { recElapsed, saveSettings, toast, useApp } from '../lib/store';
import { fmtDuration, fmtSize, pauseRecording, startRecording, stopRecording } from '../lib/recorder';
import { fmtClock, useNow } from '../island/bits';

function Row({ r, onChange }: { r: Recording; onChange: () => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(r.title);
  const [confirm, setConfirm] = useState(false);
  const when = new Date(r.createdAt).toLocaleString(t.lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const ext = r.path.split('.').pop()?.toUpperCase();

  const rename = async () => {
    setEditing(false);
    if (title.trim() && title !== r.title) {
      try {
        await call('rec_rename', { path: r.path, title });
        onChange();
      } catch (e) {
        toast(String(e), { tone: 'error' });
      }
    }
  };

  return (
    <li className="rec-row">
      <button className="rec-thumb" onClick={() => void call('rec_open', { path: r.path, reveal: false })} aria-label={t('rec.play')}>
        <Play size={14} fill="currentColor" />
      </button>
      <div className="rec-meta">
        {editing ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => void rename()} onKeyDown={(e) => e.key === 'Enter' && void rename()} aria-label={t('rec.rename')} />
        ) : (
          <div className="ellipsis" onDoubleClick={() => setEditing(true)}>{r.title}</div>
        )}
        <div className="faint small">
          {when} · {r.durationMs ? fmtDuration(r.durationMs) + ' · ' : ''}
          {fmtSize(r.size)} · {ext}
        </div>
      </div>
      <div className="rec-actions">
        <button className="icon-btn" aria-label={t('rec.rename')} title={t('rec.rename')} onClick={() => setEditing(true)}>
          <Pencil size={14} />
        </button>
        <button className="icon-btn" aria-label={t('rec.reveal')} title={t('rec.reveal')} onClick={() => void call('rec_open', { path: r.path, reveal: true })}>
          <FolderSearch size={14} />
        </button>
        <button
          className={`icon-btn ${confirm ? 'danger-solid' : ''}`}
          aria-label={confirm ? t('rec.confirmDelete') : t('rec.delete')}
          title={confirm ? t('rec.confirmDelete') : t('rec.delete')}
          onBlur={() => setConfirm(false)}
          onClick={async () => {
            if (!confirm) return setConfirm(true);
            try {
              await call('rec_delete', { path: r.path });
              onChange();
            } catch (e) {
              toast(String(e), { tone: 'error' });
            }
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

export function VideosTab() {
  const t = useT();
  const rec = useApp((s) => s.rec);
  const audio = useApp((s) => s.settings?.recording.audio ?? 'system');
  const native = useApp((s) => !!s.layout?.nativeRecording);
  const [list, setList] = useState<Recording[]>([]);
  const [folder, setFolder] = useState('');
  const now = useNow();

  const reload = useCallback(() => void call('rec_list').then(setList), []);
  useEffect(() => {
    reload();
    void call('rec_info').then((i) => setFolder(i.folder));
    return listen('recordings://changed', reload);
  }, [reload]);

  const active = rec.status === 'recording' || rec.status === 'paused';
  const setAudio = (a: typeof audio) => void saveSettings({ recording: { ...useApp.getState().settings!.recording, audio: a } });

  return (
    <div className="videos">
      <div className="rec-bar card">
        {active ? (
          <>
            <span className={`rec-dot ${rec.status === 'paused' ? 'paused' : ''}`} />
            <span className="mono big">{fmtClock(recElapsed(rec, now))}</span>
            <div className="grow" />
            {!rec.native && (
              <button className="btn" onClick={pauseRecording}>
                {rec.status === 'paused' ? <Play size={14} /> : <Pause size={14} />} {rec.status === 'paused' ? t('rec.resume') : t('rec.pause')}
              </button>
            )}
            <button className="btn danger" onClick={() => void stopRecording()}>
              <Square size={12} fill="currentColor" /> {t('rec.stop')}
            </button>
          </>
        ) : (
          <>
            <button className="btn accent" disabled={rec.status !== 'idle'} onClick={() => void startRecording()}>
              <Circle size={12} fill="currentColor" /> {rec.status === 'saving' ? t('rec.saving') : t('rec.start')}
            </button>
            <div className="grow" />
            <span className="faint small">{t('rec.audio')}</span>
            <div className="segmented" role="radiogroup" aria-label={t('rec.audio')}>
              {(['none', 'system', 'system+mic'] as const).map((a) => (
                <button key={a} role="radio" aria-checked={audio === a} className={audio === a ? 'on' : ''} onClick={() => setAudio(a)}>
                  {t(a === 'none' ? 'rec.audio.none' : a === 'system' ? 'rec.audio.system' : 'rec.audio.mic')}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {native && audio === 'system' && !active && (
        <p className="faint small hint">{t.lang === 'ru' ? 'На macOS запись идёт системным инструментом: со звуком микрофона или без звука.' : 'On macOS recording uses the system tool: with microphone sound or silent.'}</p>
      )}

      <ul className="rec-list scroll">
        {list.length ? list.map((r) => <Row key={r.path} r={r} onChange={reload} />) : <p className="muted empty-note">{t('rec.empty')}</p>}
      </ul>

      <div className="row between folder-row">
        <span className="faint small ellipsis">
          {t('rec.folder')}: {folder}
        </span>
        <button className="btn" onClick={() => void call('rec_open_folder')}>
          <FolderOpen size={14} /> {t('rec.openFolder')}
        </button>
      </div>
    </div>
  );
}
