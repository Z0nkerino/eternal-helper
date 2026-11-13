// Drop split: drag files over the island and it opens into two halves — keep them on the shelf, or copy
// them to the Desktop. The half under the cursor swells like liquid; letting go does it.
import { motion } from 'framer-motion';
import { Archive, Monitor } from 'lucide-react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useEffect, useRef, useState } from 'react';
import { call, emitEvent, inTauri } from '../lib/ipc';
import { trNow, useTr } from '../lib/i18n';
import { openLibrary, toast, useApp } from '../lib/store';

export type DropSide = 'shelf' | 'desktop' | null;

/** Follows files dragged over the island; returns which half the cursor is over. */
export function useFileDrop(islandRef: React.RefObject<HTMLDivElement>) {
  const [side, setSide] = useState<DropSide>(null);
  const paths = useRef<string[]>([]);
  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void) | undefined;
    let dead = false;
    const sideAt = (x: number, y: number): DropSide => {
      const r = islandRef.current?.getBoundingClientRect();
      if (!r) return null;
      const cx = x / devicePixelRatio;
      const cy = y / devicePixelRatio;
      if (cy > r.bottom + 40) return null;
      return cx < r.left + r.width / 2 ? 'shelf' : 'desktop';
    };
    void getCurrentWebview()
      .onDragDropEvent(async (e) => {
        const p = e.payload;
        if (p.type === 'enter') {
          paths.current = p.paths;
          useApp.setState({ dropping: true });
          setSide(sideAt(p.position.x, p.position.y));
        } else if (p.type === 'over') {
          setSide(sideAt(p.position.x, p.position.y));
        } else if (p.type === 'drop') {
          const where = sideAt(p.position.x, p.position.y) ?? 'shelf';
          const list = p.paths.length ? p.paths : paths.current;
          useApp.setState({ dropping: false });
          setSide(null);
          try {
            if (where === 'shelf') {
              const n = await call('shelf_add', { paths: list });
              void emitEvent('shelf://changed');
              toast(trNow(`Added to the shelf: ${n}`, `На полке: +${n}`), { tone: 'ok', force: true, action: { label: trNow('Open', 'Открыть'), run: () => openLibrary('shelf') } });
            } else {
              const n = await call('files_to_desktop', { paths: list });
              toast(trNow(`Copied to the Desktop: ${n}`, `Скопировано на рабочий стол: ${n}`), { tone: 'ok', force: true });
            }
          } catch (err) {
            toast(String(err), { tone: 'error' });
          }
        } else {
          useApp.setState({ dropping: false });
          setSide(null);
        }
      })
      .then((f) => (dead ? f() : (off = f)));
    return () => {
      dead = true;
      off?.();
    };
  }, [islandRef]);
  return side;
}

export function DropSplit({ side }: { side: DropSide }) {
  const tr = useTr();
  const half = (id: 'shelf' | 'desktop', Icon: typeof Archive, title: string, sub: string) => (
    <motion.div className={`drop-half ${side === id ? 'on' : ''}`} animate={{ flexGrow: side === id ? 1.5 : 1 }} transition={{ type: 'spring', stiffness: 380, damping: 26 }}>
      {side === id && <motion.span layoutId="drop-blob" className="drop-blob" transition={{ type: 'spring', stiffness: 420, damping: 30 }} />}
      <motion.span className="drop-ic" animate={side === id ? { y: [0, -5, 0], scale: 1.12 } : { y: 0, scale: 1 }} transition={side === id ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 }}>
        <Icon size={22} />
      </motion.span>
      <span className="small">{title}</span>
      <span className="tiny faint">{sub}</span>
    </motion.div>
  );
  return (
    <motion.div className="drop-split" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
      {half('shelf', Archive, tr('Keep on the shelf', 'На полку'), tr('A copy stays in the island', 'Копия останется в острове'))}
      <span className="drop-sep" />
      {half('desktop', Monitor, tr('Copy to Desktop', 'На рабочий стол'), tr('Drop to copy', 'Отпусти, чтобы скопировать'))}
    </motion.div>
  );
}
