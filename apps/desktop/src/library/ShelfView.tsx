// The shelf: files dropped on the island, kept in Documents/Eternal Helper/Shelf. Open them, show them in
// their folder, copy them to the Desktop or Downloads, or take them off the shelf.
import { AnimatePresence, motion } from 'framer-motion';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Archive, Download, File, FileText, Film, FolderOpen, Image as ImageIcon, Monitor, Music, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { call, inTauri, listen, type ShelfItem } from '../lib/ipc';
import { useT } from '../lib/i18n';
import { toast, useApp } from '../lib/store';
import { fmtSize } from '../lib/recorder';

const IMG = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
export function iconFor(name: string, dir: boolean) {
  if (dir) return FolderOpen;
  if (IMG.test(name)) return ImageIcon;
  if (/\.(mp4|mov|webm|mkv|avi)$/i.test(name)) return Film;
  if (/\.(mp3|wav|flac|ogg|m4a)$/i.test(name)) return Music;
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return Archive;
  if (/\.(txt|md|pdf|docx?|rtf|odt|xlsx?|pptx?|csv)$/i.test(name)) return FileText;
  return File;
}

export function useShelf() {
  const [items, setItems] = useState<ShelfItem[]>([]);
  const dropping = useApp((s) => s.dropping);
  useEffect(() => {
    const load = () => void call('shelf_list').then((l) => setItems(l ?? []));
    load();
    const off = listen('shelf://changed', load);
    return off;
  }, [dropping]);
  return items;
}

export function ShelfView() {
  const t = useT();
  const ru = t.lang === 'ru';
  const items = useShelf();
  const safe = (p: Promise<unknown>) => p.catch((e) => toast(String(e), { tone: 'error' }));
  const refresh = () => void import('../lib/ipc').then(({ emitEvent }) => emitEvent('shelf://changed'));
  return (
    <div className="shelf">
      <div className="shelf-bar">
        <span className="small faint">{items.length ? (ru ? `${items.length} на полке` : `${items.length} on the shelf`) : ''}</span>
        <span className="grow" />
        <button className="chip-btn" onClick={() => void safe(call('shelf_open', { name: '', reveal: false }))}>
          <FolderOpen size={13} /> {ru ? 'Папка полки' : 'Shelf folder'}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="shelf-empty">
          <motion.div className="shelf-drop-hint" animate={{ y: [0, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
            <Upload size={26} />
          </motion.div>
          <p className="small">{ru ? 'Перетащи файлы на остров — они сохранятся здесь' : 'Drag files onto the island — they’re kept here'}</p>
          <p className="tiny faint">{ru ? 'Копии лежат в «Документы/Eternal Helper/Shelf»' : 'Copies live in Documents/Eternal Helper/Shelf'}</p>
        </div>
      ) : (
        <div className="shelf-grid scroll">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((f, i) => {
              const Icon = iconFor(f.name, f.isDir);
              return (
                <motion.div key={f.name} layout className="shelf-item" initial={{ opacity: 0, scale: 0.7, rotateX: -30 }} animate={{ opacity: 1, scale: 1, rotateX: 0 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ delay: Math.min(i, 12) * 0.02, type: 'spring', stiffness: 400, damping: 28 }}>
                  <button className="shelf-thumb" onDoubleClick={() => void safe(call('shelf_open', { name: f.name, reveal: false }))} title={ru ? 'Двойной клик — открыть' : 'Double-click to open'}>
                    {IMG.test(f.name) && inTauri ? <img src={convertFileSrc(f.path)} alt="" loading="lazy" /> : <Icon size={26} />}
                  </button>
                  <span className="tiny ellipsis shelf-name" title={f.name}>{f.name}</span>
                  <span className="tiny faint">{fmtSize(f.size)}</span>
                  <div className="shelf-actions">
                    <button className="icon-btn" title={ru ? 'Показать в папке' : 'Show in folder'} onClick={() => void safe(call('shelf_open', { name: f.name, reveal: true }))}><FolderOpen size={12} /></button>
                    <button className="icon-btn" title={ru ? 'На рабочий стол' : 'To Desktop'} onClick={() => void safe(call('shelf_export', { name: f.name, to: 'desktop' }).then(() => toast(ru ? 'Скопировано на рабочий стол' : 'Copied to the Desktop', { tone: 'ok' })))}><Monitor size={12} /></button>
                    <button className="icon-btn" title={ru ? 'В Загрузки' : 'To Downloads'} onClick={() => void safe(call('shelf_export', { name: f.name, to: 'downloads' }).then(() => toast(ru ? 'Скопировано в Загрузки' : 'Copied to Downloads', { tone: 'ok' })))}><Download size={12} /></button>
                    <button className="icon-btn" title={ru ? 'Убрать с полки' : 'Remove'} onClick={() => void safe(call('shelf_remove', { name: f.name }).then(refresh))}><Trash2 size={12} /></button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
