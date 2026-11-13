// The watery part of opening: drops of liquid glass spill out of the pill, merge with each other (a
// "goo" filter blends nearby drops into one surface) and melt into the island's edges as it grows.
// Plays once per opening, behind the island, and costs nothing afterwards.
import { motion } from 'framer-motion';

const DROPS = [
  { x: -0.46, y: 0.2, r: 26, d: 0 },
  { x: 0.46, y: 0.2, r: 26, d: 0.02 },
  { x: -0.3, y: 0.62, r: 30, d: 0.05 },
  { x: 0.3, y: 0.62, r: 30, d: 0.06 },
  { x: 0, y: 0.86, r: 36, d: 0.08 },
  { x: -0.12, y: 0.4, r: 22, d: 0.03 },
  { x: 0.14, y: 0.36, r: 20, d: 0.04 },
];

export function LiquidBurst({ width }: { width: number }) {
  const w = width + 120;
  const h = 360;
  const cx = w / 2;
  return (
    <svg className="liquid-burst" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <filter id="goo" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="g" />
          <feComposite in="SourceGraphic" in2="g" operator="atop" />
        </filter>
        <radialGradient id="drop-fill" cx="35%" cy="30%" r="75%">
          <stop offset="0" style={{ stopColor: 'rgba(255,255,255,0.55)' }} />
          <stop offset="0.35" style={{ stopColor: 'color-mix(in srgb, var(--cover, var(--accent)) 55%, rgba(255,255,255,0.2))' }} />
          <stop offset="1" style={{ stopColor: 'rgba(10,12,20,0.9)' }} />
        </radialGradient>
      </defs>
      <g filter="url(#goo)">
        {/* The pill's own drop, swelling as the island opens. */}
        <motion.ellipse cx={cx} cy={18} fill="url(#drop-fill)" initial={{ rx: 90, ry: 16, opacity: 0.9 }} animate={{ rx: [90, 160, 40], ry: [16, 40, 10], opacity: [0.9, 0.6, 0] }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.3, 1] }} />
        {DROPS.map((d, i) => (
          <motion.circle
            key={i}
            fill="url(#drop-fill)"
            initial={{ cx, cy: 18, r: 6, opacity: 0 }}
            animate={{ cx: [cx, cx + d.x * width], cy: [18, 18 + d.y * (h - 60)], r: [6, d.r, 0], opacity: [0, 0.85, 0] }}
            transition={{ duration: 0.75, delay: d.d, ease: [0.22, 1, 0.36, 1], times: [0, 0.45, 1] }}
          />
        ))}
      </g>
      {/* A ripple of light spreading through the glass. */}
      <motion.ellipse cx={cx} cy={20} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} initial={{ rx: 40, ry: 10, opacity: 0.8 }} animate={{ rx: width * 0.6, ry: h * 0.55, opacity: 0 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.3, 1] }} />
    </svg>
  );
}
