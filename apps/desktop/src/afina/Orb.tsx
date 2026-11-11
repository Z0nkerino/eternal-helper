import { motion } from 'framer-motion';
import { colors } from '@eternal/ui';

/** Afina's orb — the same blue/pink pair as in Universal Planner, drawn in CSS so it costs nothing at idle. */
export function Orb({ size = 18, thinking = false }: { size?: number; thinking?: boolean }) {
  const [a, b] = [colors.accent, colors.accent2];
  return (
    <motion.span
      aria-hidden
      className="orb"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 34% 38%, ${a}f2, transparent 56%), radial-gradient(circle at 68% 64%, ${b}e6, transparent 54%), radial-gradient(circle, #ffffff30, #ffffff0a)`,
        boxShadow: `inset 0 1px 3px #ffffffb0, 0 0 ${size * 0.6}px ${a}66`,
      }}
      animate={thinking ? { scale: [1, 1.12, 1], rotate: [0, 180, 360] } : { scale: [1, 1.04, 1] }}
      transition={{ duration: thinking ? 1.2 : 4, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
