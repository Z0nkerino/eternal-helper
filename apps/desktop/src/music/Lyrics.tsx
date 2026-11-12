// Synced lyrics that scroll smoothly: the sung line glides to the middle and lights up, the others fade
// with distance. The list moves with one GPU transform, so it stays smooth even on slow machines.
import { useLayoutEffect, useRef, useState } from 'react';
import { currentLine, type LyricLine } from '../lib/lyrics';

export function Lyrics({ lines, pos }: { lines: LyricLine[]; pos: number }) {
  const idx = currentLine(lines, pos + 250);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(0);
  useLayoutEffect(() => {
    const el = list.current?.children[Math.max(0, idx)] as HTMLElement | undefined;
    const h = box.current?.clientHeight ?? 0;
    if (el) setY(h * 0.4 - el.offsetTop - el.offsetHeight / 2);
  }, [idx, lines]);
  // How far through the current line we are (0..1), for a soft progress glow.
  const cur = lines[idx];
  const nextAt = lines[idx + 1]?.at ?? (cur ? cur.at + 4000 : 0);
  const p = cur ? Math.max(0, Math.min(1, (pos + 250 - cur.at) / Math.max(1, nextAt - cur.at))) : 0;
  return (
    <div className="lyrics-box" ref={box}>
      <div className="lyrics-list" ref={list} style={{ transform: `translate3d(0, ${y}px, 0)` }}>
        {lines.map((l, i) => (
          <p key={i} className={`ly ${i === idx ? 'on' : i < idx ? 'past' : ''}`} style={{ ['--d' as string]: Math.min(4, Math.abs(i - idx)), ['--p' as string]: i === idx ? p : 0 }}>
            {l.text || '♪'}
          </p>
        ))}
      </div>
    </div>
  );
}
