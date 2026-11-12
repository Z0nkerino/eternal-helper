// Cloudy: a real little cumulus made of soft, shaded puffs with fluffy edges, two eyes and a mouth.
// The puffs can glide into other shapes (see shapes.ts) or scatter like vapour when he dissolves.
// Expressions only change the eyes and mouth; body motion lives in CSS (see .cloudy-* in styles.css).
import { useId } from 'react';
import { SHAPES, scatter, type ShapeId } from './shapes';
export type Expr =
  | 'happy' | 'joy' | 'curious' | 'bored' | 'sleepy' | 'sleep' | 'hungry' | 'eat' | 'love' | 'surprised'
  | 'scared' | 'think' | 'sad' | 'yawn' | 'shiver' | 'wink' | 'proud' | 'cheeky';

const INK = '#2b3245';
const EYE_L = 47;
const EYE_R = 73;
const EYE_Y = 56;

function Eyes({ expr, look }: { expr: Expr; look: { x: number; y: number } }) {
  const dx = look.x * 2.4;
  const dy = look.y * 1.8;
  const dot = (cx: number, rx = 4.4, ry = 5.6, shine = true) => (
    <g key={cx}>
      <ellipse cx={cx + dx} cy={EYE_Y + dy} rx={rx} ry={ry} fill={INK} />
      {shine && <circle cx={cx + dx + rx * 0.35} cy={EYE_Y + dy - ry * 0.4} r={Math.max(1, rx * 0.32)} fill="#fff" />}
    </g>
  );
  const arc = (cx: number, up = true) => <path key={cx} d={up ? `M${cx - 5} ${EYE_Y + 2} Q${cx} ${EYE_Y - 5} ${cx + 5} ${EYE_Y + 2}` : `M${cx - 5} ${EYE_Y - 1} Q${cx} ${EYE_Y + 5} ${cx + 5} ${EYE_Y - 1}`} className="cf-line" />;
  const lid = (cx: number, open: number) => <path key={cx} d={`M${cx - 4.6 + dx} ${EYE_Y + dy} a4.6 ${5.6 * open} 0 0 0 9.2 0 Z`} fill={INK} />;
  switch (expr) {
    case 'joy':
    case 'love':
    case 'proud':
      return <>{[arc(EYE_L), arc(EYE_R)]}</>;
    case 'sleep':
    case 'yawn':
      return <>{[arc(EYE_L, false), arc(EYE_R, false)]}</>;
    case 'wink':
    case 'cheeky':
      return <>{[dot(EYE_L), arc(EYE_R)]}</>;
    case 'bored':
      return <>{[lid(EYE_L, 0.75), lid(EYE_R, 0.75)]}</>;
    case 'sleepy':
      return <>{[lid(EYE_L, 0.5), lid(EYE_R, 0.5)]}</>;
    case 'curious':
      return <>{[dot(EYE_L, 5.1, 6.4), dot(EYE_R, 5.1, 6.4)]}</>;
    case 'hungry':
      return <>{[dot(EYE_L, 5.4, 6.2), dot(EYE_R, 5.4, 6.2)]}</>;
    case 'surprised':
      return <>{[dot(EYE_L, 5.6, 6.6, false), dot(EYE_R, 5.6, 6.6, false)]}</>;
    case 'scared':
      return <>{[dot(EYE_L, 5.2, 6.2, false), dot(EYE_R, 5.2, 6.2, false)]}</>;
    case 'shiver':
      return (
        <>
          <path d={`M${EYE_L - 4} ${EYE_Y - 3} L${EYE_L + 3} ${EYE_Y} L${EYE_L - 4} ${EYE_Y + 3}`} className="cf-line" />
          <path d={`M${EYE_R + 4} ${EYE_Y - 3} L${EYE_R - 3} ${EYE_Y} L${EYE_R + 4} ${EYE_Y + 3}`} className="cf-line" />
        </>
      );
    case 'think':
      return <g className="cf-roll">{[dot(EYE_L), dot(EYE_R)]}</g>;
    case 'eat':
      return <>{[arc(EYE_L), arc(EYE_R)]}</>;
    default:
      return <>{[dot(EYE_L), dot(EYE_R)]}</>;
  }
}

const MOUTH: Record<Expr, JSX.Element> = {
  happy: <path d="M54 66 Q60 71.5 66 66" className="cf-line" />,
  joy: <path d="M52.5 64.5 Q60 75 67.5 64.5 Z" className="cf-fill" />,
  curious: <ellipse cx="60" cy="67.5" rx="2.6" ry="3" className="cf-fill" />,
  bored: <path d="M55 68 L65 68" className="cf-line" />,
  sleepy: <path d="M56 68 Q60 69.5 64 68" className="cf-line" />,
  sleep: <ellipse cx="60" cy="68" rx="1.8" ry="1.4" className="cf-fill" />,
  hungry: <path d="M54 68 Q57 66 60 68 Q63 70 66 68" className="cf-line" />,
  eat: <ellipse className="cf-fill cf-chomp" cx="60" cy="67" rx="5.5" ry="5" />,
  love: <path d="M52.5 64.5 Q60 75 67.5 64.5 Z" className="cf-fill" />,
  surprised: <ellipse cx="60" cy="68" rx="3.6" ry="4.4" className="cf-fill" />,
  scared: <path d="M53 69 Q56 66 59 69 Q62 72 65 69 Q66.5 68 67 68.5" className="cf-line" />,
  think: <path d="M56 68 Q61 66.5 65 67.5" className="cf-line" />,
  sad: <path d="M54 69.5 Q60 64.5 66 69.5" className="cf-line" />,
  yawn: <ellipse cx="60" cy="68" rx="4" ry="5.6" className="cf-fill" />,
  shiver: <path d="M53 68 L55.5 66 L58 68 L60.5 66 L63 68 L65.5 66 L67 67.5" className="cf-line" />,
  wink: <path d="M53.5 65.5 Q60 72 66.5 65.5" className="cf-line" />,
  proud: <path d="M53 65.5 Q60 71 67 65.5" className="cf-line" />,
  cheeky: <path d="M54 66 Q60 71 66 65 L66.5 68" className="cf-line" />,
};

const TINTS = {
  white: ['#ffffff', '#f4f7fc', '#d3dbe9', '#b9c4d8'],
  grey: ['#e9edf3', '#cfd6e0', '#9fa9b9', '#848fa1'],
  warm: ['#fffdf6', '#fff3dc', '#f3d6ae', '#e2bd92'],
  night: ['#e6e9ff', '#c9cff2', '#8f98c9', '#737db0'],
} as const;
export type Tint = keyof typeof TINTS;

export function CloudyFace({ expr, look, size, tint = 'white', shape = 'cloud', dissolved = false }: { expr: Expr; look: { x: number; y: number }; size: number; tint?: Tint; shape?: ShapeId; dissolved?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const [hi, mid, low, base] = TINTS[tint];
  const sh = SHAPES[shape] ?? SHAPES.cloud;
  const [fx, fy, fs] = sh.face;
  return (
    <svg className={`cloudy-svg expr-${expr} shape-${shape} ${dissolved ? 'dissolved' : ''}`} viewBox="0 0 122 96" width={size} height={size * 0.8} aria-hidden>
      <defs>
        {/* Lit from the top-left: bright crown, soft grey-blue underside — that's what makes it look round. */}
        <radialGradient id={`pf-${uid}`} cx="0.38" cy="0.3" r="0.75">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.45" stopColor={mid} />
          <stop offset="0.85" stopColor={low} />
          <stop offset="1" stopColor={base} />
        </radialGradient>
        <linearGradient id={`base-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={low} stopOpacity="0" />
          <stop offset="1" stopColor={base} stopOpacity="0.55" />
        </linearGradient>
        {/* Fluffy, slightly torn edges instead of a clean outline. */}
        <filter id={`fluff-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="0.35" />
        </filter>
      </defs>
      <g className="cf-puffs" filter={`url(#fluff-${uid})`}>
        {sh.puffs.map((p, i) => {
          const [dx, dy] = dissolved ? scatter(p, i) : [0, 0];
          return (
            <g key={i} className="puff" style={{ transform: `translate(${p[0] + dx}px, ${p[1] + dy}px) scale(${dissolved ? 0.2 : p[2] / 10})`, opacity: dissolved ? 0 : 1, transitionDelay: `${(dissolved ? i % 5 : (i * 7) % 16) * 18}ms` }}>
              <circle r="10" fill={`url(#pf-${uid})`} />
            </g>
          );
        })}
        {shape === 'cloud' && <ellipse className="cf-base" cx="60" cy="80" rx="46" ry="9" fill={`url(#base-${uid})`} style={{ opacity: dissolved ? 0 : 1 }} />}
      </g>
      <g className="cf-face" style={{ transform: `translate(${fx - 60}px, ${fy - 61}px) scale(${dissolved ? 0 : fs})`, opacity: dissolved || fs === 0 ? 0 : 1 }}>
        <g className={expr === 'sleep' || expr === 'joy' || expr === 'love' ? '' : 'cf-blink'}>
          <Eyes expr={expr} look={look} />
        </g>
        <g className="cf-mouth">{MOUTH[expr]}</g>
        {(expr === 'love' || expr === 'joy' || expr === 'proud' || expr === 'eat') && (
          <g className="cf-cheeks">
            <ellipse cx="40" cy="65" rx="4" ry="2.4" />
            <ellipse cx="80" cy="65" rx="4" ry="2.4" />
          </g>
        )}
      </g>
    </svg>
  );
}
