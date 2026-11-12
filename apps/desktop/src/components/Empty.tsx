// Empty states: an illustration (3D emoji), a short title and a hint — never just "No data".
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Emoji } from '../lib/emoji';

export function Empty({ emoji, title, hint, action }: { emoji: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <motion.div className="empty-art" animate={{ y: [0, -5, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
        <Emoji e={emoji} size={56} />
      </motion.div>
      <div className="empty-title">{title}</div>
      {hint && <div className="muted small empty-hint">{hint}</div>}
      {action}
    </div>
  );
}
