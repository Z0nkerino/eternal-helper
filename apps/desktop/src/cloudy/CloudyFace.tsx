// Cloudy: a little 3D cloud — a few big soft puffs lit from the top left (a glossy highlight, a cool
// shade underneath), two big black rounded-rectangle eyes and a small mouth. He wears headphones while
// music plays.
// The silhouette is made of 16 puffs (one shared gradient, so they merge into a single shape) that can
// glide into other shapes (see shapes.ts) or scatter like vapour when he dissolves.
// Every feature is drawn once and only scaled or faded between expressions, so changes are smooth.
import { useId } from 'react';
import { SHAPES, scatter, type ShapeId } from './shapes';

export type Expr =
  | 'happy' | 'joy' | 'curious' | 'bored' | 'sleepy' | 'sleep' | 'hungry' | 'eat' | 'love' | 'surprised'
  | 'scared' | 'think' | 'sad' | 'yawn' | 'shiver' | 'wink' | 'proud' | 'cheeky' | 'tongue' | 'dizzy' | 'squint';

const INK = '#16181d';
const EYE_L = 49;
const EYE_R = 73;
const EYE_Y = 57;
const MOUTH_Y = 69;
/** Eye size: a tall rectangle with soft, oval corners. */
const EW = 8.8;
const EH = 14.6;
const ER = 4.1;

/** How an eye looks: an open oval (scaled by `open`), a happy ^ arc, or closed (a soft ∪ line). */
export type Eye = 'open' | 'happy' | 'closed' | 'dizzy';
export interface Look {
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

export const LOOKS: Record<Expr, Look> = {
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
  dizzy: { eyes: ['dizzy', 'dizzy'], open: 1, mouth: [0.9, 0.6] },
  squint: { eyes: ['open', 'open'], open: 0.45, mouth: [1.2, 0.5] },
};

function OneEye({ cx, mode, open, big, dx, dy }: { cx: number; mode: Eye; open: number; big: number; dx: number; dy: number }) {
  const show = (m: Eye) => ({ opacity: mode === m ? 1 : 0 });
  return (
    <g className="cf-eye" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
      <g className={mode === 'open' ? 'cf-blink' : ''} style={{ transformOrigin: `${cx}px ${EYE_Y}px` }}>
        <rect className="cf-eye-oval" x={cx - EW / 2} y={EYE_Y - EH / 2} width={EW} height={EH} rx={ER} fill={INK} style={{ ...show('open'), transform: `scale(${big}, ${big * Math.max(0.1, open)})`, transformOrigin: `${cx}px ${EYE_Y}px` }} />
      </g>
      <path className="cf-line cf-eye-arc" d={`M${cx - 4.8} ${EYE_Y + 2} Q${cx} ${EYE_Y - 4.8} ${cx + 4.8} ${EYE_Y + 2}`} style={show('happy')} />
      <path className="cf-line cf-eye-arc" d={`M${cx - 4.8} ${EYE_Y - 0.4} Q${cx} ${EYE_Y + 4.2} ${cx + 4.8} ${EYE_Y - 0.4}`} style={show('closed')} />
      <rect className="cf-dizzy" x={cx - 3.4} y={EYE_Y - 3.4} width={6.8} height={6.8} rx={1.8} fill="none" stroke={INK} strokeWidth={2.2} style={{ ...show('dizzy'), transformOrigin: `${cx}px ${EYE_Y}px` }} />
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
          <rect className="cf-mouth" x="57" y={MOUTH_Y - 2} width="6" height="4" rx="2" fill={INK} style={{ transform: `scale(${l.mouth[0]}, ${l.mouth[1]})`, transformOrigin: `60px ${MOUTH_Y}px` }} />
        </g>
        {/* Tongue: tucked away inside the mouth until he sticks it out. */}
        <path className="cf-tongue" d={`M57.4 ${MOUTH_Y + 0.6} h5.2 v2.4 a2.6 2.6 0 0 1 -5.2 0 Z`} style={{ transform: l.tongue ? 'translateY(0) scaleY(1)' : 'translateY(-2px) scaleY(0)', opacity: l.tongue ? 1 : 0, transformOrigin: `60px ${MOUTH_Y}px` }} />
      </g>
      <g className="cf-cheeks" style={{ opacity: l.cheeks ? 1 : 0 }}>
        <ellipse cx="40" cy="66" rx="3.6" ry="2" />
        <ellipse cx="82" cy="66" rx="3.6" ry="2" />
      </g>
    </>
  );
}

const TINTS = {
  white: ['#ffffff', '#eef2f8'],
  grey: ['#eef1f5', '#c3cad6'],
  warm: ['#fffdf7', '#f5e6cf'],
  night: ['#f1f3ff', '#cdd3f2'],
} as const;
export type Tint = keyof typeof TINTS;

/** Headphones he puts on while music plays (only in his own cloud shape). */
function Headphones({ uid, on }: { uid: string; on: boolean }) {
  return (
    <g className={`cf-phones ${on ? 'on' : ''}`} aria-hidden>
      <defs>
        <linearGradient id={`cup-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3f4c" />
          <stop offset="1" stopColor="#14161c" />
        </linearGradient>
      </defs>
      <path className="cf-band" d="M24 60 C22 14, 100 14, 98 60" fill="none" stroke="#1b1d24" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M27 50 C30 22, 92 22, 95 50" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="1.2" strokeLinecap="round" />
      <g className="cf-cup l">
        <rect x="15" y="50" width="14" height="22" rx="6" fill={`url(#cup-${uid})`} />
        <rect x="17.5" y="53" width="4" height="16" rx="2" fill="var(--cover, #5b8cff)" opacity="0.9" />
      </g>
      <g className="cf-cup r">
        <rect x="93" y="50" width="14" height="22" rx="6" fill={`url(#cup-${uid})`} />
        <rect x="100.5" y="53" width="4" height="16" rx="2" fill="var(--cover, #5b8cff)" opacity="0.9" />
      </g>
    </g>
  );
}

export function CloudyFace({ expr, look, size, tint = 'white', shape = 'cloud', dissolved = false, headphones = false }: { expr: Expr; look: { x: number; y: number }; size: number; tint?: Tint; shape?: ShapeId; dissolved?: boolean; headphones?: boolean }) {
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
        <radialGradient id={`vol-${uid}`} gradientUnits="userSpaceOnUse" cx="48" cy="34" r="74">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#6d7ba8" stopOpacity="0.38" />
        </radialGradient>
        <radialGradient id={`under-${uid}`}>
          <stop offset="0" stopColor="#7b8bc0" stopOpacity="0.45" />
          <stop offset="1" stopColor="#7b8bc0" stopOpacity="0" />
        </radialGradient>
        <filter id={`soft-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {(() => {
        const circles = sh.puffs.map((p, i) => {
          const [dx, dy] = dissolved ? scatter(p, i) : [0, 0];
          return <circle key={i} className="puff" r="10" style={{ transform: `translate(${p[0] + dx}px, ${p[1] + dy}px) scale(${dissolved ? 0.2 : p[2] / 10})`, opacity: dissolved ? 0 : 1, transitionDelay: `${(dissolved ? i % 5 : (i * 7) % 16) * 18}ms` }} />;
        });
        return (
          <>
            {/* The silhouette again as a mask, so the 3D shading below covers exactly his shape. */}
            <mask id={`sil-${uid}`} maskUnits="userSpaceOnUse" x="-20" y="-20" width="162" height="136">
              <g fill="#fff">{circles}</g>
            </mask>
            <g className="cf-puffs" fill={`url(#body-${uid})`}>{circles}</g>
            <g mask={`url(#sil-${uid})`} className="cf-volume">
              {/* Light from the top left: a soft sphere-like falloff, a glossy highlight and a cool shade underneath. */}
              <rect x="-20" y="-20" width="162" height="136" fill={`url(#vol-${uid})`} />
              <ellipse cx="46" cy="34" rx="20" ry="11" fill="#fff" opacity="0.75" filter={`url(#soft-${uid})`} />
              <ellipse cx="61" cy="96" rx="52" ry="18" fill={`url(#under-${uid})`} />
            </g>
          </>
        );
      })()}
      {shape === 'cloud' && !dissolved && <Headphones uid={uid} on={headphones} />}
      <g className="cf-face" style={{ transform: `translate(${fx - 60}px, ${fy - 61}px) scale(${dissolved ? 0 : fs})`, opacity: dissolved || fs === 0 ? 0 : 1 }}>
        <Face expr={expr} look={look} />
      </g>
    </svg>
  );
}
