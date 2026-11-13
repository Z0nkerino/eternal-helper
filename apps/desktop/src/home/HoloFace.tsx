// The face widget: an emoji-like face made of many glowing dots, like a hologram. Its eyes follow the
// mouse anywhere on the screen, it blinks, blushes when you hover or click it, vibes with the music
// (bobbing to the beat, ^^ eyes, shifting colours), glances up when you switch tabs in the island and
// reacts to which tab it is, and gets sleepy late at night. Drawn on a canvas, only while visible.
import { useEffect, useRef } from 'react';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import { inTauri, listen } from '../lib/ipc';
import { useApp } from '../lib/store';

type Mood = 'happy' | 'vibe' | 'wow' | 'think' | 'love' | 'sleepy' | 'curious';
const TAB_MOOD: Record<string, Mood> = { home: 'happy', music: 'vibe', time: 'wow', library: 'curious', ai: 'think', settings: 'curious' };

export function HoloFace() {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef({ lx: 0, ly: 0, tx: 0, ty: 0, blink: 0, nextBlink: 2000, blush: 0, mood: 'happy' as Mood, moodUntil: 0, hover: false, hearts: [] as { x: number; y: number; t: number }[], beat: 0 });

  // Mood from the island's tab (a short reaction), the beat from the speakers.
  useEffect(() => {
    const offTab = listen<{ open: boolean; tab: string }>('island://state', ({ open, tab }) => {
      const s = st.current;
      if (!open) return;
      s.mood = TAB_MOOD[tab] ?? 'happy';
      s.moodUntil = performance.now() + 2600;
      s.ty = -1;
    });
    const offBeat = listen<number>('audio://level', (v) => (st.current.beat = Math.max(st.current.beat * 0.8, v)));
    return () => (offTab(), offBeat());
  }, []);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let alive = true;
    let poll = 0;
    // Where the cursor is, relative to the face: anywhere on screen in the app, inside the page in a browser.
    const fromPoint = (x: number, y: number) => {
      const r = cv.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.max(120, Math.hypot(x - cx, y - cy));
      st.current.tx = ((x - cx) / d) * Math.min(1, d / 300);
      st.current.ty = ((y - cy) / d) * Math.min(1, d / 300);
    };
    const onMove = (e: PointerEvent) => fromPoint(e.clientX, e.clientY);
    addEventListener('pointermove', onMove);
    // The window's position and scale rarely change: read them once a second, the cursor more often.
    let win: { x: number; y: number; k: number } | null = null;
    let winAt = 0;
    const pollCursor = async () => {
      if (!alive || !inTauri) return;
      try {
        if (!win || performance.now() - winAt > 1000) {
          const [p, k] = await Promise.all([getCurrentWindow().outerPosition(), getCurrentWindow().scaleFactor()]);
          win = { x: p.x, y: p.y, k };
          winAt = performance.now();
        }
        const c = await cursorPosition();
        fromPoint((c.x - win.x) / win.k, (c.y - win.y) / win.k);
      } catch {
        /* window gone */
      }
      poll = window.setTimeout(pollCursor, document.hidden ? 1000 : 80);
    };
    void pollCursor();

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const s = st.current;
      const dpr = devicePixelRatio || 1;
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr)) (cv.width = Math.round(W * dpr)), (cv.height = Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const app = useApp.getState();
      const playing = !!app.media?.playing;
      const hour = new Date().getHours();
      let mood: Mood = now < s.moodUntil ? s.mood : playing ? 'vibe' : hour >= 23 || hour < 6 ? 'sleepy' : s.hover ? 'love' : 'happy';
      if (s.hearts.length && mood === 'happy') mood = 'love';
      // Eyes glide toward the target; blinking every few seconds.
      s.lx += (s.tx - s.lx) * 0.12;
      s.ly += (s.ty - s.ly) * 0.12;
      if (now > s.nextBlink) (s.blink = 1), (s.nextBlink = now + 2200 + Math.random() * 3500);
      s.blink = Math.max(0, s.blink - 0.09);
      s.blush += ((s.hover || mood === 'love' ? 1 : 0) - s.blush) * 0.08;
      s.beat *= 0.92;
      const beat = playing ? Math.max(s.beat, 0.25 + 0.25 * Math.sin(now / 240)) : 0;

      const R = Math.min(W, H) * 0.42;
      const bob = mood === 'vibe' ? Math.sin(now / 260) * R * 0.05 + beat * R * 0.05 : Math.sin(now / 1400) * R * 0.02;
      const cx = W / 2;
      const cy = H / 2 + bob;
      const step = Math.max(4.2, R / 13);
      const hue = mood === 'vibe' ? (185 + Math.sin(now / 900) * 60 + 360) % 360 : 188;
      const eyeOpen = mood === 'sleepy' ? 0.25 : Math.max(0.08, 1 - Math.sin(Math.min(1, s.blink) * Math.PI));
      const ex = s.lx * R * 0.16;
      const ey = s.ly * R * 0.12;
      const eyes = [cx - R * 0.36 + ex, cx + R * 0.36 + ex];
      const eyeY = cy - R * 0.18 + ey;
      const happyEyes = mood === 'vibe' || mood === 'love';
      const mouthW = mood === 'wow' ? R * 0.18 : R * 0.5;
      const mouthY = cy + R * 0.36 + ey * 0.4;
      const flicker = 0.9 + Math.sin(now / 70) * 0.05 + (Math.random() < 0.01 ? -0.3 : 0);
      ctx.globalCompositeOperation = 'lighter';

      for (let y = -R; y <= R; y += step) {
        // A scanline that slides down the face now and then.
        const scan = Math.abs(((now / 22) % (R * 3)) - R - (y + R)) < step * 0.6 ? 0.25 : 0;
        for (let x = -R; x <= R; x += step) {
          const d = Math.hypot(x, y);
          if (d > R) continue;
          const px = cx + x;
          const py = cy + y;
          let a = 0.1 + (d > R - step * 1.2 ? 0.45 : 0) + scan;
          let size = step * 0.2;
          let h = hue;
          // Eyes.
          for (const e of eyes) {
            const dx = (px - e) / (R * 0.15);
            const dy = (py - eyeY) / (R * 0.22 * eyeOpen);
            if (happyEyes) {
              const arc = Math.abs(Math.hypot(px - e, py - (eyeY + R * 0.08)) - R * 0.15);
              if (arc < step * 0.6 && py < eyeY + R * 0.06) (a = 1), (size = step * 0.34);
            } else if (dx * dx + dy * dy <= 1) (a = 1), (size = step * 0.36);
          }
          // Mouth: a smile, an "o" or a wavy line when thinking.
          if (mood === 'wow') {
            const o = Math.abs(Math.hypot((px - cx) / 1, (py - mouthY) / 1.2) - mouthW * 0.7);
            if (o < step * 0.55) (a = 1), (size = step * 0.32);
          } else if (mood === 'think') {
            if (Math.abs(px - cx) < mouthW * 0.7 && Math.abs(py - (mouthY + Math.sin((px - cx) / (R * 0.12)) * R * 0.03)) < step * 0.5) (a = 1), (size = step * 0.3);
          } else if (mood === 'sleepy') {
            if (Math.abs(px - cx) < mouthW * 0.4 && Math.abs(py - mouthY) < step * 0.5) (a = 0.8), (size = step * 0.3);
          } else {
            const curve = mouthY - R * 0.12 + ((px - cx) / mouthW) ** 2 * -R * 0.02;
            const smile = Math.abs(Math.hypot(px - cx, py - (curve - R * 0.32)) - R * 0.56);
            if (smile < step * 0.55 && py > mouthY - R * 0.14 && Math.abs(px - cx) < mouthW) (a = 1), (size = step * 0.32);
          }
          // Cheeks when blushing.
          if (s.blush > 0.05) {
            for (const e of eyes) {
              const c = Math.hypot(px - (e + (e < cx ? -R * 0.06 : R * 0.06)), py - (eyeY + R * 0.34));
              if (c < R * 0.15) (h = 335), (a = Math.max(a, 0.75 * s.blush)), (size = Math.max(size, step * 0.28));
            }
          }
          a *= flicker;
          ctx.fillStyle = `hsla(${h}, 100%, ${h === 335 ? 72 : 68}%, ${Math.min(1, a)})`;
          ctx.shadowColor = `hsla(${h}, 100%, 60%, ${a > 0.8 ? 0.9 : 0})`;
          ctx.shadowBlur = a > 0.8 ? step * 1.2 : 0;
          ctx.beginPath();
          ctx.arc(px, py, size * (1 + (a > 0.9 ? beat * 0.4 : 0)), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Sleepy z's and love hearts, also made of light.
      ctx.shadowBlur = 8;
      ctx.font = `${Math.round(R * 0.28)}px sans-serif`;
      if (mood === 'sleepy') {
        const t = (now / 1500) % 1;
        ctx.fillStyle = `hsla(${hue}, 100%, 75%, ${1 - t})`;
        ctx.fillText('z', cx + R * 0.7 + t * 10, cy - R * 0.7 - t * 20);
      }
      s.hearts = s.hearts.filter((p) => now - p.t < 1400);
      for (const p of s.hearts) {
        const t = (now - p.t) / 1400;
        ctx.fillStyle = `hsla(335, 100%, 70%, ${1 - t})`;
        ctx.fillText('♥', p.x, p.y - t * R * 0.8);
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    raf = requestAnimationFrame(draw);
    const vis = () => (document.hidden ? cancelAnimationFrame(raf) : (raf = requestAnimationFrame(draw)));
    document.addEventListener('visibilitychange', vis);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(poll);
      removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="holo-face"
      onPointerEnter={() => (st.current.hover = true)}
      onPointerLeave={() => (st.current.hover = false)}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        st.current.hearts.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() });
        st.current.blush = 1;
      }}
      aria-label="Face"
    />
  );
}
