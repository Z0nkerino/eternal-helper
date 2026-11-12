// Cloudy: a simple, clean little cloud — one soft white silhouette, black oval eyes and an oval mouth.
// The silhouette is made of 16 puffs (one shared gradient, so they merge into a single shape) that can
// glide into other shapes (see shapes.ts) or scatter like vapour when he dissolves.
// Every feature is drawn once and only scaled or faded between expressions, so changes are smooth.
import { useId } from 'react';
import { SHAPES, scatter, type ShapeId } from './shapes';

export type Expr =
  | 'happy' | 'joy' | 'curious' | 'bored' | 'sleepy' | 'sleep' | 'hungry' | 'eat' | 'love' | 'surprised'
  | 'scared' | 'think' | 'sad' | 'yawn' | 'shiver' | 'wink' | 'proud' | 'cheeky' | 'tongue';

const INK = '#16181d';
const EYE_L = 48;
const EYE_R = 72;
const EYE_Y = 56;
const MOUTH_Y = 67;

/** How an eye looks: an open oval (scaled by `open`), a happy ^ arc, or closed (a soft ∪ line). */
type Eye = 'open' | 'happy' | 'closed';
interface Look {
  eyes: [Eye, Eye];
  open: number;
  /** Eye size multiplier. */
  big?: number;
  /** Mouth oval scale (1 = small calm oval). */
  mouth: [number, number];
  tongue?: boolean;
  cheeks?: boolean;
  /** Eyes glance up (thinking). */
  up?: boolean;
}

const LOOKS: Record<Expr, Look> = {
  happy: { eyes: ['open', 'open'], open: 1, mouth: [1, 0.8] },
  joy: { eyes: ['happy', 'happy'], open: 1, mouth: [1.45, 1.35], cheeks: true },
  curious: { eyes: ['open', 'open'], open: 1, big: 1.15, mouth: [0.65, 0.75] },
  bored: { eyes: ['open', 'open'], open: 0.42, mouth: [1.1, 0.35] },
  sleepy: { eyes: ['open', 'open'], open: 0.28, mouth: [0.8, 0.5] },
  sleep: { eyes: ['closed', 'closed'], open: 0, mouth: [0.55, 0.45] },
  hungry: { eyes: ['open', 'open'], open: 1, big: 1.1, mouth: [1.2, 1], tongue: true },
  eat: { eyes: ['happy', 'happy'], open: 1, mouth: [1.35, 1.25], cheeks: true },
  love: { eyes: ['happy', 'happy'], open: 1, mouth: [1, 0.9], cheeks: true },
  surprised: { eyes: ['open', 'open'], open: 1, big: 1.2, mouth: [0.95, 1.55] },
  scared: { eyes: ['open', 'open'], open: 1, big: 1.1, mouth: [1.25, 0.55] },
  think: { eyes: ['open', 'open'], open: 0.85, mouth: [0.6, 0.55], up: true },
  sad: { eyes: ['open', 'open'], open: 0.8, mouth: [0.9, 0.45] },
  yawn: { eyes: ['closed', 'closed'], open: 0, mouth: [1.1, 1.9] },
  shiver: { eyes: ['open', 'open'], open: 0.7, mouth: [1.25, 0.4] },
  wink: { eyes: ['open', 'happy'], open: 1, mouth: [1.05, 0.85] },
  proud: { eyes: ['happy', 'happy'], open: 1, mouth: [1.1, 0.7] },
  cheeky: { eyes: ['open', 'happy'], open: 1, mouth: [1, 0.85], tongue: true },
  tongue: { eyes: ['happy', 'happy'], open: 1, mouth: [1, 0.9], tongue: true, cheeks: true },
};

function OneEye({ cx, mode, open, big, dx, dy }: { cx: number; mode: Eye; open: number; big: number; dx: number; dy: number }) {
  const show = (m: Eye) => ({ opacity: mode === m ? 1 : 0 });
  return (
    <g className="cf-eye" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
      <g className={mode === 'open' ? 'cf-blink' : ''} style={{ transformOrigin: `${cx}px ${EYE_Y}px` }}>
        <ellipse className="cf-eye-oval" cx={cx} cy={EYE_Y} rx={3.7} ry={5.1} fill={INK} style={{ ...show('open'), transform: `scale(${big}, ${big * Math.max(0.08, open)})`, transformOrigin: `${cx}px ${EYE_Y}px` }} />
      </g>
      <path className="cf-line cf-eye-arc" d={`M${cx - 4.6} ${EYE_Y + 1.8} Q${cx} ${EYE_Y - 4.6} ${cx + 4.6} ${EYE_Y + 1.8}`} style={show('happy')} />
      <path className="cf-line cf-eye-arc" d={`M${cx - 4.6} ${EYE_Y - 0.6} Q${cx} ${EYE_Y + 4} ${cx + 4.6} ${EYE_Y - 0.6}`} style={show('closed')} />
    </g>
  );
}

function Face({ expr, look }: { expr: Expr; look: { x: number; y: number } }) {
  const l = LOOKS[expr] ?? LOOKS.happy;
  const dx = look.x * 2.6;
  const dy = (l.up ? -2.2 : 0) + look.y * 1.8;
  return (
    <>
      <OneEye cx={EYE_L} mode={l.eyes[0]} open={l.open} big={l.big ?? 1} dx={dx} dy={dy} />
      <OneEye cx={EYE_R} mode={l.eyes[1]} open={l.open} big={l.big ?? 1} dx={dx} dy={dy} />
      <g style={{ transform: `translate(${dx * 0.5}px, ${dy * 0.4}px)` }} className="cf-mouth-wrap">
        <g className={expr === 'eat' ? 'cf-chomp' : ''} style={{ transformOrigin: `60px ${MOUTH_Y}px` }}>
          <ellipse className="cf-mouth" cx="60" cy={MOUTH_Y} rx="3.4" ry="2.6" fill={INK} style={{ transform: `scale(${l.mouth[0]}, ${l.mouth[1]})`, transformOrigin: `60px ${MOUTH_Y}px` }} />
        </g>
        {/* Tongue: tucked away inside the mouth until he sticks it out. */}
        <path className="cf-tongue" d={`M56.6 ${MOUTH_Y + 0.5} h6.8 v2.6 a3.4 3.4 0 0 1 -6.8 0 Z`} style={{ transform: l.tongue ? 'translateY(0) scaleY(1)' : 'translateY(-2px) scaleY(0)', opacity: l.tongue ? 1 : 0, transformOrigin: `60px ${MOUTH_Y}px` }} />
      </g>
      <g className="cf-cheeks" style={{ opacity: l.cheeks ? 1 : 0 }}>
        <ellipse cx="39" cy="64" rx="4.2" ry="2.4" />
        <ellipse cx="81" cy="64" rx="4.2" ry="2.4" />
      </g>
    </>
  );
}

const TINTS = {
  white: ['#ffffff', '#e8eef7'],
  grey: ['#eef1f5', '#c3cad6'],
  warm: ['#fffdf7', '#f5e6cf'],
  night: ['#f1f3ff', '#cdd3f2'],
} as const;
export type Tint = keyof typeof TINTS;

export function CloudyFace({ expr, look, size, tint = 'white', shape = 'cloud', dissolved = false }: { expr: Expr; look: { x: number; y: number }; size: number; tint?: Tint; shape?: ShapeId; dissolved?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const [top, bottom] = TINTS[tint];
  const sh = SHAPES[shape] ?? SHAPES.cloud;
  const [fx, fy, fs] = sh.face;
  return (
    <svg className={`cloudy-svg expr-${expr} shape-${shape} ${dissolved ? 'dissolved' : ''}`} viewBox="0 0 122 96" width={size} height={size * 0.8} aria-hidden>
      <defs>
        {/* One gradient for the whole cloud, so the puffs read as one clean shape: white on top, a soft shade below. */}
        <linearGradient id={`body-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="90">
          <stop offset="0.35" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <g className="cf-puffs" fill={`url(#body-${uid})`}>
        {sh.puffs.map((p, i) => {
          const [dx, dy] = dissolved ? scatter(p, i) : [0, 0];
          return <circle key={i} className="puff" r="10" style={{ transform: `translate(${p[0] + dx}px, ${p[1] + dy}px) scale(${dissolved ? 0.2 : p[2] / 10})`, opacity: dissolved ? 0 : 1, transitionDelay: `${(dissolved ? i % 5 : (i * 7) % 16) * 18}ms` }} />;
        })}
      </g>
      <g className="cf-face" style={{ transform: `translate(${fx - 60}px, ${fy - 61}px) scale(${dissolved ? 0 : fs})`, opacity: dissolved || fs === 0 ? 0 : 1 }}>
        <Face expr={expr} look={look} />
      </g>
    </svg>
  );
}
