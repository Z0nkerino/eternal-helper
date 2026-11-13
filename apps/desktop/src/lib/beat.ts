// Moving with the music. On Windows the app hears the speakers' real level (`audio://level` from Rust);
// Eternal Radio supplies its own levels; anything else gets a gentle simulated beat. The result is
// written straight into CSS variables (--beat: a pulse that jumps on each beat and fades, --lvl: the
// smoothed loudness), so animations follow the music without re-rendering React.
import { listen } from './ipc';

export interface BeatSource {
  playing: () => boolean;
  /** A local level 0..1 when one is known (e.g. Eternal Radio's analyser). */
  local?: () => number | null;
}

export function startBeat(el: () => HTMLElement | null, src: BeatSource): () => void {
  let heard = 0;
  let heardAt = 0;
  const off = listen<number>('audio://level', (v) => {
    heard = Math.min(1, v * 1.4);
    heardAt = performance.now();
  });
  let raf = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let lvl = 0;
  let avg = 0.1;
  let pulse = 0;
  let lastBeat = 0;
  let last = performance.now();

  const frame = (t: number) => {
    const node = el();
    if (!node || !src.playing()) {
      node?.style.setProperty('--beat', '0');
      node?.style.setProperty('--lvl', '0');
      raf = 0;
      idle = setTimeout(loop, 400);
      return;
    }
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    let raw: number;
    const local = src.local?.();
    if (t - heardAt < 300) raw = heard;
    else if (local != null) raw = local;
    else {
      // ~104 BPM: a soft kick on every beat, a little sway in between.
      const ph = ((t / 1000) * 1.73) % 1;
      raw = 0.18 + 0.7 * Math.pow(1 - ph, 6) + 0.06 * Math.sin(t / 310);
    }
    lvl += (raw - lvl) * Math.min(1, dt * 12);
    avg += (raw - avg) * Math.min(1, dt * 1.6);
    if (raw > avg * 1.3 && raw > 0.12 && t - lastBeat > 260) {
      lastBeat = t;
      pulse = Math.min(1, 0.55 + (raw - avg) * 1.6);
    }
    pulse = Math.max(0, pulse - dt * 3.2);
    node.style.setProperty('--beat', pulse.toFixed(3));
    node.style.setProperty('--lvl', lvl.toFixed(3));
    raf = requestAnimationFrame(frame);
  };
  const loop = () => {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  loop();
  return () => {
    off();
    cancelAnimationFrame(raf);
    clearTimeout(idle);
  };
}
