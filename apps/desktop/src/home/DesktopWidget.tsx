// One widget on the desktop (its own small window, kept below other windows). Hover to see the grip
// (drag it anywhere — the spot is remembered) and the button that takes it off the desktop.
import { motion } from 'framer-motion';
import { GripHorizontal, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { call, inTauri } from '../lib/ipc';
import { widget } from './widgets';

export function DesktopWidget({ id }: { id: string }) {
  const w = widget(id);
  const saveT = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void) | undefined;
    void getCurrentWindow()
      .onMoved(() => {
        clearTimeout(saveT.current);
        saveT.current = setTimeout(() => void call('desk_save_pos', { id }), 500);
      })
      .then((f) => (off = f));
    return () => off?.();
  }, [id]);
  if (!w) return null;
  return (
    <motion.div className={`desk desk-${w.size}`} initial={{ opacity: 0, scale: 0.92, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
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
    </motion.div>
  );
}
