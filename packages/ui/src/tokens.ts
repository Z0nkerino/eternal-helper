/** Eternal Helper design tokens. Shared by the island and any plugin UI. */
export const colors = {
  pill: '#000000',
  surface: '#0E0E10',
  surface2: '#17171A',
  line: 'rgba(255,255,255,0.08)',
  text: '#F5F5F7',
  muted: 'rgba(245,245,247,0.62)',
  faint: 'rgba(245,245,247,0.38)',
  /** Eternal Inc. brand pair, shared with Universal Planner and Afina. */
  accent: '#2F6BFF',
  accent2: '#FF4FA3',
  danger: '#FF453A',
  ok: '#32D74B',
  warn: '#FFD60A',
} as const;

export const radii = { pill: 22, card: 26, control: 14, chip: 999 } as const;

/** Spring presets; framer-motion respects the system "reduce motion" via <MotionConfig reducedMotion="user">. */
export const springs = {
  island: { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 },
  soft: { type: 'spring', stiffness: 260, damping: 28 },
  snappy: { type: 'spring', stiffness: 600, damping: 38 },
} as const;
