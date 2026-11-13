// Clipboard: everything you copy, newest first, with when and where it came from (the app, the page and
// its address). Click to copy again; pin what you need often. Kept only on this computer.
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Globe, Pause, Pin, Play, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { call, listen, type Clip, type Settings } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { saveSettings, toast, useApp } from '../lib/store';
import { copyText } from '../lib/clipboard';

const host = (u: string | null) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
};

export function ClipboardTab() {
  const tr = useTr();
  const [items, setItems] = useState<Clip[]>([]);
  const [q, setQ] = useState('');
  const paused = useApp((s) => (s.settings as unknown as { clipboard?: { enabled?: boolean } })?.clipboard?.enabled === false);
  useEffect(() => {
    void call('clip_list').then((l) => setItems(l ?? []));
    return listen<Clip>('clip://added', (c) => setItems((xs) => [c, ...xs.filter((x) => x.text !== c.text)]));
  }, []);

  const loc = tr.lang === 'ru' ? 'ru-RU' : 'en-US';
  const day = (t: number) => {
    const d = new Date(t);
    const today = new Date();
    const y = new Date(Date.now() - 864e5);
    if (d.toDateString() === today.toDateString()) return tr('Today', 'Сегодня');
    if (d.toDateString() === y.toDateString()) return tr('Yesterday', 'Вчера');
    return d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const shown = useMemo(() => {
    const f = q.trim().toLowerCase();
    const list = f ? items.filter((c) => (c.text + ' ' + (c.title ?? '') + ' ' + (c.url ?? '') + ' ' + (c.app ?? '')).toLowerCase().includes(f)) : items;
    return [...list.filter((c) => c.pinned), ...list.filter((c) => !c.pinned)];
  }, [items, q]);

  const copy = async (c: Clip) => {
    await copyText(c.text);
    toast(tr('Copied', 'Скопировано'), { tone: 'ok' });
  };
  const del = (c: Clip) => (setItems((xs) => xs.filter((x) => x.id !== c.id)), void call('clip_delete', { id: c.id }));
  const pin = (c: Clip) => (setItems((xs) => xs.map((x) => (x.id === c.id ? { ...x, pinned: !x.pinned } : x))), void call('clip_pin', { id: c.id, pinned: !c.pinned }));

  let lastDay = '';
  return (
    <div className="clips">
      <div className="clips-top">
        <label className="settings-search grow">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search what you copied', 'Поиск по скопированному')} aria-label={tr('Search', 'Поиск')} />
          {q && <button className="icon-btn" onClick={() => setQ('')} aria-label={tr('Clear', 'Очистить')}><X size={13} /></button>}
        </label>
        <button className="chip-btn" onClick={() => void saveSettings({ clipboard: { enabled: paused } } as unknown as Partial<Settings>)} title={paused ? tr('Resume history', 'Продолжить запись') : tr('Pause history', 'Приостановить запись')}>
          {paused ? <Play size={12} /> : <Pause size={12} />} {paused ? tr('Paused', 'Пауза') : tr('Recording', 'Записывается')}
        </button>
        <button className="chip-btn" onClick={() => (setItems((xs) => xs.filter((x) => x.pinned)), void call('clip_clear'))} title={tr('Clear (pinned stay)', 'Очистить (закреплённое останется)')}>
          <Trash2 size={12} />
        </button>
      </div>
      <div className="clips-list scroll">
        {shown.length === 0 && <p className="empty-note small muted">{q ? tr('Nothing found.', 'Ничего не найдено.') : tr('Copy any text (Ctrl+C) and it shows up here — with the time and where it came from.', 'Скопируй любой текст (Ctrl+C) — он появится здесь со временем и источником.')}</p>}
        <AnimatePresence initial={false}>
          {shown.map((c) => {
            const d = c.pinned ? tr('Pinned', 'Закреплено') : day(c.at);
            const head = d !== lastDay ? ((lastDay = d), <div key={`h-${d}`} className="clips-day section-title">{d}</div>) : null;
            const h = host(c.url);
            return [
              head,
              <motion.div key={c.id} layout="position" className={`clip ${c.pinned ? 'pinned' : ''}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                <button className="clip-text" onClick={() => void copy(c)} title={tr('Click to copy again', 'Нажми, чтобы скопировать снова')}>
                  {c.text}
                </button>
                <div className="clip-meta tiny">
                  <span className="mono">{new Date(c.at).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}</span>
                  {c.app && <span>· {c.app}</span>}
                  {h ? (
                    <button className="clip-link" onClick={() => void call('open_url', { url: c.url! })} title={c.url!}>
                      <Globe size={11} /> {h}
                    </button>
                  ) : c.title ? (
                    <span className="ellipsis">· {c.title}</span>
                  ) : null}
                  <span className="grow" />
                  <button className="icon-btn sm" onClick={() => void copy(c)} aria-label={tr('Copy', 'Копировать')}><Copy size={12} /></button>
                  <button className={`icon-btn sm ${c.pinned ? 'on' : ''}`} onClick={() => pin(c)} aria-label={tr('Pin', 'Закрепить')}><Pin size={12} /></button>
                  <button className="icon-btn sm" onClick={() => del(c)} aria-label={tr('Delete', 'Удалить')}><Trash2 size={12} /></button>
                </div>
              </motion.div>,
            ];
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
