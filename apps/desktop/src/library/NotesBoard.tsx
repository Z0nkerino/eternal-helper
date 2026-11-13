// Notes as a board: sticky notes you can drag anywhere, recolour, tilt a little and edit in place.
// Saved with the settings, so the board looks the same in the island and on the desktop widget.
import { AnimatePresence, motion } from 'framer-motion';
import { Pin, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { readExtra, saveExtra, uid, useExtra } from '../lib/extra';

export interface Note {
  id: string;
  x: number; // 0..1 of the board's width
  y: number; // 0..1 of the board's height
  text: string;
  color: string;
  rot: number;
  pinned?: boolean;
}
const COLORS = ['#ffe27a', '#ffb3c7', '#a8e6ff', '#b9f6ca', '#d7c2ff', '#ffd0a1'];
const save = (n: Note[]) => saveExtra('notes', n);

export function useNotes() {
  return useExtra<Note[]>('notes', []);
}

export function NotesBoard({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const ru = t.lang === 'ru';
  const notes = useNotes();
  const board = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [top, setTop] = useState<string | null>(null);
  const update = (id: string, patch: Partial<Note>) => void save(readExtra<Note[]>('notes', []).map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const add = () => {
    const id = uid();
    const n = readExtra<Note[]>('notes', []);
    void save([...n, { id, x: 0.08 + ((n.length * 0.17) % 0.7), y: 0.1 + ((n.length * 0.23) % 0.55), text: '', color: COLORS[n.length % COLORS.length], rot: Math.round((Math.random() - 0.5) * 6) }]);
    setEditing(id);
    setTop(id);
  };
  const W = compact ? 120 : 150;

  return (
    <div className={`notes ${compact ? 'compact' : ''}`}>
      <div className="notes-board" ref={board}>
        {notes.length === 0 && (
          <div className="notes-empty">
            <p className="small faint">{ru ? 'Доска пуста. Добавь первую заметку.' : 'The board is empty. Add your first note.'}</p>
          </div>
        )}
        <AnimatePresence>
          {notes.map((n) => (
            <motion.div
              key={n.id}
              className={`note ${n.pinned ? 'pinned' : ''}`}
              style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%`, width: W, background: n.color, zIndex: top === n.id ? 5 : n.pinned ? 2 : 1 }}
              initial={{ opacity: 0, scale: 0.5, rotate: n.rot - 20, y: -30 }}
              animate={{ opacity: 1, scale: 1, rotate: n.rot, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, rotate: n.rot + 25, y: 40 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              drag={!n.pinned && editing !== n.id}
              dragConstraints={board}
              dragMomentum={false}
              dragElastic={0.08}
              whileDrag={{ scale: 1.08, rotate: 0, boxShadow: '0 22px 40px rgba(0,0,0,.45)', cursor: 'grabbing' }}
              onPointerDown={() => setTop(n.id)}
              onDragEnd={(_, info) => {
                const b = board.current?.getBoundingClientRect();
                if (!b) return;
                update(n.id, { x: Math.max(0, Math.min(1 - W / b.width, n.x + info.offset.x / b.width)), y: Math.max(0, Math.min(0.85, n.y + info.offset.y / b.height)) });
              }}
            >
              <div className="note-bar">
                <button className={`note-ic ${n.pinned ? 'on' : ''}`} onClick={() => update(n.id, { pinned: !n.pinned })} aria-label={ru ? 'Закрепить' : 'Pin'}>
                  <Pin size={11} />
                </button>
                <span className="note-colors">
                  {COLORS.map((c) => <button key={c} style={{ background: c }} className={c === n.color ? 'on' : ''} onClick={() => update(n.id, { color: c })} aria-label={c} />)}
                </span>
                <button className="note-ic" onClick={() => void save(readExtra<Note[]>('notes', []).filter((x) => x.id !== n.id))} aria-label={ru ? 'Удалить' : 'Delete'}>
                  <Trash2 size={11} />
                </button>
              </div>
              {editing === n.id ? (
                <textarea autoFocus defaultValue={n.text} maxLength={400} onBlur={(e) => (update(n.id, { text: e.target.value }), setEditing(null))} onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget as HTMLTextAreaElement).blur()} placeholder={ru ? 'Напиши что-нибудь…' : 'Write something…'} />
              ) : (
                <p className="note-text" onDoubleClick={() => setEditing(n.id)} onClick={() => !n.text && setEditing(n.id)}>
                  {n.text || <span className="note-ph">{ru ? 'Двойной клик — редактировать' : 'Double-click to edit'}</span>}
                </p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <motion.button className="notes-add" onClick={add} whileHover={{ scale: 1.08, rotate: 90 }} whileTap={{ scale: 0.9 }} aria-label={ru ? 'Новая заметка' : 'New note'}>
        <Plus size={18} />
      </motion.button>
    </div>
  );
}
