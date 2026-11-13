// A large, iOS-style slider: the whole pill is the track, the fill follows the finger smoothly, and the
// mouse wheel and arrow keys work too.
import { useRef, useState, type ReactNode } from 'react';

export function BigSlider({ icon, value, onChange, label, disabled, note }: { icon: ReactNode; value: number | null; onChange: (v: number) => void; label: string; disabled?: boolean; note?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const v = value ?? 0;
  const at = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100));
  };
  if (disabled) {
    return (
      <div className="bigslider disabled">
        <span className="bs-icon">{icon}</span>
        <span className="small faint bs-note">{note}</span>
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className={`bigslider ${drag ? 'drag' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
        onChange(at(e.clientX));
      }}
      onPointerMove={(e) => drag && onChange(at(e.clientX))}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onWheel={(e) => onChange(v + (e.deltaY < 0 ? 4 : -4))}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), onChange(v + 5));
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), onChange(v - 5));
      }}
    >
      <div className="bs-fill" style={{ transform: `scaleX(${v / 100})` }} />
      <span className="bs-icon">{icon}</span>
      <span className="bs-val mono">{Math.round(v)}</span>
    </div>
  );
}
