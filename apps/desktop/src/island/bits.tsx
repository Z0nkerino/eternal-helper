import { motion } from 'framer-motion';
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { describeWeather } from '../lib/weather';
import type { Lang } from '../lib/i18n';

export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export function WeatherIcon({ code, size = 14, lang }: { code: number; size?: number; lang: Lang }) {
  const Icon = { sun: Sun, 'cloud-sun': CloudSun, cloud: Cloud, fog: CloudFog, rain: CloudRain, snow: CloudSnow, storm: CloudLightning }[describeWeather(code, lang).icon];
  return <Icon size={size} aria-hidden />;
}

/** Three bars that bounce while music plays. */
export function Equalizer({ playing, color = 'currentColor' }: { playing: boolean; color?: string }) {
  return (
    <span className="eq" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          style={{ background: color }}
          animate={playing ? { scaleY: [0.35, 1, 0.5, 0.85, 0.35] } : { scaleY: 0.3 }}
          transition={playing ? { duration: 0.9 + i * 0.17, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        />
      ))}
    </span>
  );
}

/** Thin ring that empties as a timer runs out. */
export function Ring({ progress, size = 16, color }: { progress: number; size?: number; color: string }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ffffff22" strokeWidth={2.5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
    </svg>
  );
}

export const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

/** A short, soft two-note chime for "time's up", made with WebAudio (no sound files). */
export function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.65);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* no audio device */
  }
}
