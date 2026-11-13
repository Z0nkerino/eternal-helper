// One widget on the desktop (its own small window, kept below other windows). Hover to see the grip
// (drag it anywhere), the corner to resize it (both are remembered) and the button that takes it off.
import { motion } from 'framer-motion';
import { GripHorizontal, MoveDiagonal2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { call, inTauri } from '../lib/ipc';
import { widget, type WidgetSize } from './widgets';

export function DesktopWidget({ id }: { id: string }) {
  const w = widget(id);
  const saveT = useRef<ReturnType<typeof setTimeout>>();
  const root = useRef<HTMLDivElement>(null);
  // The layout follows the window's size: small, medium, wide or large.
  const [size, setSize] = useState<WidgetSize>(w?.size ?? 's');
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width: W, height: H } = e.contentRect;
      setSize(W >= 520 ? 'w' : W >= 300 && H >= 300 ? 't' : W >= 300 ? 'm' : 's');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!inTauri) return;
    const offs: (() => void)[] = [];
    const later = () => {
      clearTimeout(saveT.current);
      saveT.current = setTimeout(() => void call('desk_save_pos', { id }), 500);
    };
    void getCurrentWindow().onMoved(later).then((f) => offs.push(f));
    void getCurrentWindow().onResized(later).then((f) => offs.push(f));
    return () => offs.forEach((f) => f());
  }, [id]);
  if (!w) return null;
  return (
    <motion.div ref={root} className={`desk desk-${size} w-${size}`} initial={{ opacity: 0, scale: 0.92, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
      <div className="desk-bar">
        <span className="desk-grip" onPointerDown={() => inTauri && void getCurrentWindow().startDragging()} title="Move">
          <GripHorizontal size={14} />
        </span>
        <button className="desk-x" onClick={() => void call('desk_remove', { id })} aria-label="Remove from desktop">
          <X size={12} />
        </button>
      </div>
      <div className="widget-in desk-in">
        <w.Body />
      </div>
      <span className="desk-resize" onPointerDown={(e) => (e.preventDefault(), inTauri && void getCurrentWindow().startResizeDragging('SouthEast'))} title="Resize">
        <MoveDiagonal2 size={12} />
      </span>
    </motion.div>
  );
}
