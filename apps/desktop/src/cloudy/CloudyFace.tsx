// Cloudy: a soft white cloud with two dot eyes and a small mouth. All drawing is our own SVG; loops are
// CSS animations (compositor-driven), so an idle Cloudy costs next to nothing.
export type Mood = 'happy' | 'sunny' | 'rainy' | 'dance' | 'sleep' | 'think' | 'scared' | 'surprised' | 'giggle' | 'yawn' | 'ring';

const MOUTH: Record<Mood, JSX.Element> = {
  happy: <path d="M50 61.5 Q60 71 70 61.5" className="mouth-wide" />,
  sunny: <path d="M51 61 Q60 72 69 61 Z" className="mouth-fill" />,
  rainy: <path d="M54 66 Q60 61 66 66" />,
  dance: <path d="M52 62 Q60 71 68 62 Z" className="mouth-fill" />,
  sleep: <ellipse cx="60" cy="65" rx="2.4" ry="1.6" className="mouth-fill" />,
  think: <path d="M55 65 L65 63" />,
  scared: <ellipse cx="60" cy="66" rx="4" ry="5" className="mouth-fill" />,
  surprised: <ellipse cx="60" cy="65" rx="3.2" ry="4" className="mouth-fill" />,
  giggle: <path d="M51 61 Q60 73 69 61 Z" className="mouth-fill" />,
  yawn: <ellipse cx="60" cy="66" rx="4.5" ry="6" className="mouth-fill" />,
  ring: <path d="M52 61 Q60 71 68 61 Z" className="mouth-fill" />,
};

export function CloudyFace({ mood, look, size }: { mood: Mood; look: { x: number; y: number }; size: number }) {
  const closed = mood === 'sleep' || mood === 'giggle';
  const big = mood === 'scared' || mood === 'surprised';
  const px = look.x * 2.6;
  const py = look.y * 2;
  return (
    <svg className={`cloudy-svg mood-${mood}`} viewBox="0 0 120 94" width={size} height={size * 0.78} aria-hidden>
      <defs>
        <radialGradient id="cl-body" cx="45%" cy="35%" r="70%">
          <stop offset="0" stopColor="var(--cl-top)" />
          <stop offset="1" stopColor="var(--cl-bottom)" />
        </radialGradient>
        <radialGradient id="cl-glow">
          <stop offset="0" stopColor="#FFD60A" stopOpacity=".55" />
          <stop offset="1" stopColor="#FFD60A" stopOpacity="0" />
        </radialGradient>
      </defs>
      {mood === 'sunny' && <circle className="cl-glow" cx="60" cy="50" r="58" fill="url(#cl-glow)" />}
      <ellipse className="cl-shadow" cx="60" cy="90" rx="34" ry="3.5" />
      <g className="cl-body-group">
        <path
          className="cl-body"
          d="M30 80 C13 80 7 66 14 56 C7 42 21 29 36 33 C40 16 63 9 75 24 C89 17 106 30 101 47 C114 53 111 79 94 80 Z"
          fill="url(#cl-body)"
        />
        {/* cheeks */}
        <ellipse cx="40" cy="62" rx="5.5" ry="3.2" className="cl-cheek" />
        <ellipse cx="80" cy="62" rx="5.5" ry="3.2" className="cl-cheek" />
        {/* eyes */}
        <g className={closed ? '' : 'cl-blink'}>
          {closed ? (
            <>
              <path className="cl-line" d="M43 53 Q48 57 53 53" />
              <path className="cl-line" d="M67 53 Q72 57 77 53" />
            </>
          ) : (
            <g className={mood === 'think' ? 'cl-roll' : ''} style={{ transform: mood === 'think' ? undefined : `translate(${px}px, ${py}px)` }}>
              <ellipse cx="48" cy="53" rx={big ? 5.4 : 4.2} ry={big ? 6 : 4.8} className="cl-eye" />
              <ellipse cx="72" cy="53" rx={big ? 5.4 : 4.2} ry={big ? 6 : 4.8} className="cl-eye" />
              <circle cx="49.4" cy="51.4" r="1.3" fill="#fff" />
              <circle cx="73.4" cy="51.4" r="1.3" fill="#fff" />
            </g>
          )}
        </g>
        <g className="cl-mouth">{MOUTH[mood]}</g>
        {mood === 'scared' && <path className="cl-sweat" d="M96 36 q4 6 0 9 q-4 -3 0 -9z" />}
      </g>
      {mood === 'rainy' && (
        <g className="cl-rain">
          {[34, 50, 66, 82].map((x, i) => (
            <line key={x} x1={x} y1="84" x2={x - 2} y2="92" style={{ animationDelay: `${i * 0.23}s` }} />
          ))}
        </g>
      )}
    </svg>
  );
}
