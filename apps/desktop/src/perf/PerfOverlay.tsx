// The in-game overlay: a small pill in a corner while a fullscreen app (a game) is in front — frame
// rate, CPU and GPU load, memory and the time. Colours warn when something runs hot. Click-through.
import { useEffect, useState } from 'react';
import { listen } from '../lib/ipc';

interface Stats {
  fps: number | null;
  cpu: number;
  gpu: number | null;
  ram: number;
  ramUsedGb: number;
  ramTotalGb: number;
}

const tone = (v: number, warn = 70, hot = 90) => (v >= hot ? 'hot' : v >= warn ? 'warn' : 'ok');

export function PerfOverlay() {
  const [s, setS] = useState<Stats | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => listen<Stats>('perf://stats', (x) => (setS(x), setNow(new Date()))), []);
  if (!s) return null;
  const items: [string, string, string][] = [];
  if (s.fps != null) items.push(['FPS', String(s.fps), s.fps < 30 ? 'hot' : s.fps < 50 ? 'warn' : 'ok']);
  items.push(['CPU', `${Math.round(s.cpu)}%`, tone(s.cpu)]);
  if (s.gpu != null) items.push(['GPU', `${Math.round(s.gpu)}%`, tone(s.gpu, 85, 97)]);
  items.push(['RAM', `${s.ramUsedGb.toFixed(1)} GB`, tone(s.ram, 80, 92)]);
  items.push(['', now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'time']);
  return (
    <div className="perf">
      {items.slice(0, 5).map(([k, v, t]) => (
        <span key={k || 'time'} className={`perf-item ${t}`}>
          {k && <b>{k}</b>}
          <span className="mono">{v}</span>
        </span>
      ))}
    </div>
  );
}
