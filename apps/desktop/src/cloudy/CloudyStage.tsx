// Cloudy's window: a transparent, click-through layer over the desktop's work area. Only Cloudy (and his
// menu or speech bubble) catch the mouse. He walks along the bottom edge, can be dragged and thrown, looks
// at the cursor, steps out of its way and reacts to what happens in Eternal Helper.
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { call, emitEvent, inTauri, listen, type Settings } from '../lib/ipc';
import { withDefaults } from '../lib/defaults';
import { resolveLang } from '../lib/i18n';
import { Rich } from '../lib/emoji';
import { avoidCursor, decide, heightOf, step, throwVelocity, type Body } from './brain';
import { CloudyFace, type Mood } from './CloudyFace';

export interface MoodSignal {
  weather: 'rain' | 'snow' | 'storm' | 'sun' | 'cloudy' | null;
  isDay: boolean;
  playing: boolean;
  recording: boolean;
  thinking: boolean;
  timerDone: number;
  error: number;
}

const CHATTER_MIN: Record<Settings['cloudy']['chatter'], number> = { never: 0, rare: 25, normal: 10, often: 4 };

const PHRASES: [string, string][] = [
  ['Time for some water 💧', 'Пора попить воды 💧'],
  ['Stretch your back! 🙆', 'Потянись немного! 🙆'],
  ['You’re doing great ✨', 'У тебя отлично получается ✨'],
  ['Blink a few times 👀', 'Поморгай немного 👀'],
  ['How about a short break? ☕', 'Может, небольшой перерыв? ☕'],
  ['I like it here ☁️', 'Мне тут нравится ☁️'],
  ['Psst… Afina knows your plans 🔮', 'Пс-с… Афина знает твои планы 🔮'],
];

const isNight = () => {
  const h = new Date().getHours();
  return h >= 23 || h < 6;
};

export function CloudyStage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [signal, setSignal] = useState<MoodSignal | null>(null);
  const [action, setAction] = useState<Body['action']>('idle');
  const [facing, setFacing] = useState<1 | -1>(1);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [flash, setFlash] = useState<{ mood: Mood; until: number } | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState(false);

  const el = useRef<HTMLDivElement>(null);
  const extras = useRef<HTMLDivElement>(null);
  const body = useRef<Body>({ x: 160, y: 0, vx: 0, vy: 0, facing: 1, action: 'fall', until: 0 });
  const cursor = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef(0);
  const decideTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastHit = useRef('');
  const lastSignal = useRef<MoodSignal | null>(null);

  const cfg = settings?.cloudy ?? { enabled: true, size: 64, speed: 1, chatter: 'rare' as const };
  const lang = resolveLang(settings?.language);
  const say = useCallback((en: string, ru: string, ms = 4200) => {
    setBubble(lang === 'ru' ? ru : en);
    setTimeout(() => setBubble(null), ms);
  }, [lang]);
  const react = (mood: Mood, ms = 2500) => setFlash({ mood, until: Date.now() + ms });

  const env = useCallback(
    () => ({ width: innerWidth, height: innerHeight, size: cfg.size, speed: cfg.speed, now: Date.now(), night: isNight(), music: !!signal?.playing }),
    [cfg.size, cfg.speed, signal?.playing],
  );

  // ----- Settings and signals from the island -----
  useEffect(() => {
    void call('get_settings').then((s) => setSettings(withDefaults(s)));
    const offS = listen<Settings>('settings://changed', (s) => setSettings(withDefaults(s)));
    const offM = listen<MoodSignal>('cloudy://mood', setSignal);
    const offC = listen<[number, number]>('cursor://move', ([x, y]) => {
      cursor.current = { x, y };
      const b = body.current;
      const cx = b.x + cfg.size / 2;
      const cy = b.y + heightOf(cfg.size) / 2;
      const d = Math.hypot(x - cx, y - cy) || 1;
      setLook({ x: (x - cx) / Math.max(d, 140), y: (y - cy) / Math.max(d, 140) });
    });
    return () => (offS(), offM(), offC());
  }, [cfg.size]);

  // Browser preview only: ?mood=rain|sun|music|think|sleep to see each look without the desktop app.
  useEffect(() => {
    if (inTauri) return;
    const m = new URLSearchParams(location.search).get('mood');
    if (!m) return;
    const base: MoodSignal = { weather: null, isDay: true, playing: false, recording: false, thinking: false, timerDone: 0, error: 0 };
    if (m === 'sleep') {
      body.current = { ...body.current, action: 'sleep', until: Date.now() + 60_000 };
      setAction('sleep');
    }
    setSignal({ ...base, weather: m === 'rain' ? 'rain' : m === 'sun' ? 'sun' : null, playing: m === 'music', thinking: m === 'think' });
  }, []);

  // One-off reactions when a signal changes.
  useEffect(() => {
    const prev = lastSignal.current;
    lastSignal.current = signal;
    if (!signal || !prev) return;
    if (signal.timerDone !== prev.timerDone) {
      react('ring', 3000);
      body.current = { ...body.current, vy: -720, action: 'fall' };
      kick();
      say('Ding! Time’s up 🔔', 'Дзынь! Время вышло 🔔');
    }
    if (signal.error !== prev.error) react('scared', 2200);
    if (signal.playing && !prev.playing) say('Ooh, music! 🎶', 'О, музыка! 🎶', 2500);
    if (signal.weather === 'rain' && prev.weather !== 'rain') say('It’s raining outside 🌧️', 'На улице дождь 🌧️');
  }, [signal]);

  // ----- Motion loop (runs only while moving) -----
  const reportHit = useCallback(
    (force = false) => {
      const b = body.current;
      let r = { x: b.x - 6, y: b.y - 6, w: cfg.size + 12, h: heightOf(cfg.size) + 12 };
      if (dragging) r = { x: 0, y: 0, w: innerWidth, h: innerHeight };
      else if (extras.current) {
        const e = extras.current.getBoundingClientRect();
        if (e.width) {
          const x = Math.min(r.x, e.left), y = Math.min(r.y, e.top);
          r = { x, y, w: Math.max(r.x + r.w, e.right) - x, h: Math.max(r.y + r.h, e.bottom) - y };
        }
      }
      if (signal?.recording) r = { x: 0, y: 0, w: 0, h: 0 };
      const key = [r.x, r.y, r.w, r.h].map(Math.round).join(',');
      if (force || key !== lastHit.current) {
        lastHit.current = key;
        void call('island_set_hit', r);
      }
    },
    [cfg.size, dragging, signal?.recording],
  );

  const paint = () => {
    const b = body.current;
    if (el.current) el.current.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
  };

  const tick = useRef<(t: number) => void>(() => {});
  const lastT = useRef(0);
  const lastReport = useRef(0);
  tick.current = (t: number) => {
    const dt = Math.min(0.05, (t - (lastT.current || t)) / 1000);
    lastT.current = t;
    let b = avoidCursor(body.current, cursor.current, cfg.size);
    b = step(b, dt, env());
    body.current = b;
    paint();
    if (b.facing !== facing) setFacing(b.facing);
    if (b.action !== action) setAction(b.action);
    if (t - lastReport.current > 100) {
      lastReport.current = t;
      reportHit();
    }
    if (b.action === 'walk' || b.action === 'fall' || b.action === 'dance') raf.current = requestAnimationFrame((x) => tick.current(x));
    else {
      raf.current = 0;
      lastT.current = 0;
      reportHit();
      schedule();
    }
  };

  function kick() {
    if (!raf.current) raf.current = requestAnimationFrame((x) => tick.current(x));
  }

  function schedule() {
    clearTimeout(decideTimer.current);
    const wait = Math.max(200, body.current.until - Date.now());
    decideTimer.current = setTimeout(() => {
      if (body.current.action === 'drag') return;
      body.current = decide(body.current, env());
      setAction(body.current.action);
      if (body.current.action === 'sleep' && isNight()) react('yawn', 1800);
      kick();
    }, wait);
  }

  useEffect(() => {
    paint();
    kick();
    const onResize = () => kick();
    addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0; // so a remount (React dev double-mount) can start the loop again
      clearTimeout(decideTimer.current);
      removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => reportHit(true), [menu, bubble, dragging, signal?.recording, cfg.size]);

  // Music starts → dance now; music stops → back to normal.
  useEffect(() => {
    if (body.current.action === 'drag' || body.current.action === 'fall') return;
    body.current = { ...body.current, until: 0 };
    body.current = decide(body.current, env());
    setAction(body.current.action);
    kick();
  }, [signal?.playing]);

  // ----- Chatter -----
  useEffect(() => {
    const every = CHATTER_MIN[cfg.chatter];
    if (!every) return;
    const id = setInterval(() => {
      if (body.current.action === 'sleep' || signal?.recording) return;
      const [en, ru] = PHRASES[Math.floor(Math.random() * PHRASES.length)];
      say(en, ru, 5000);
    }, every * 60_000);
    return () => clearInterval(id);
  }, [cfg.chatter, signal?.recording, say]);

  // ----- Easter egg: the Konami code (typed while the island is open) -----
  useEffect(
    () =>
      listen('cloudy://easter', () => {
        react('giggle', 3000);
        body.current = { ...body.current, vy: -900, action: 'fall' };
        kick();
        say('You found my secret! 🎉', 'Ты нашёл мой секрет! 🎉');
      }),
    [say],
  );

  // ----- Pointer: drag & throw, click → menu, double-click → giggle -----
  const drag = useRef<{ dx: number; dy: number; moved: boolean; samples: { x: number; y: number; t: number }[]; downAt: number } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();

  const onPointerDown = (e: React.PointerEvent) => {
    const b = body.current;
    drag.current = { dx: e.clientX - b.x, dy: e.clientY - b.y, moved: false, samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }], downAt: Date.now() };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const b = body.current;
    const nx = e.clientX - d.dx;
    const ny = e.clientY - d.dy;
    if (!d.moved && Math.hypot(nx - b.x, ny - b.y) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      setMenu(false);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      clearTimeout(decideTimer.current);
    }
    body.current = { ...b, x: nx, y: ny, vx: 0, vy: 0, action: 'drag' };
    setAction('drag');
    d.samples = [...d.samples.filter((s) => performance.now() - s.t < 90), { x: e.clientX, y: e.clientY, t: performance.now() }];
    paint();
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      const { vx, vy } = throwVelocity(d.samples);
      body.current = { ...body.current, vx, vy, action: 'fall' };
      setDragging(false);
      if (Math.hypot(vx, vy) > 900) say('Wheee! 🎢', 'Уи-и-и! 🎢', 1800);
      kick();
      return;
    }
    // A click: wait a moment to see if it's a double-click.
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = undefined;
      setMenu(false);
      react('giggle', 2400);
      say('Hee-hee! That tickles 😄', 'Хи-хи! Щекотно 😄', 2400);
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = undefined;
      body.current = { ...body.current, vy: -480, action: 'fall' };
      kick();
      setMenu((m) => !m);
    }, 240);
  };

  // ----- What face to make -----
  const now = Date.now();
  let mood: Mood = 'happy';
  if (flash && flash.until > now) mood = flash.mood;
  else if (dragging) mood = 'surprised';
  else if (action === 'sleep') mood = 'sleep';
  else if (signal?.thinking) mood = 'think';
  else if (signal?.playing) mood = 'dance';
  else if (signal?.weather === 'rain' || signal?.weather === 'storm') mood = 'rainy';
  else if (signal?.weather === 'sun' && signal.isDay) mood = 'sunny';
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), Math.max(0, flash.until - Date.now()));
    return () => clearTimeout(id);
  }, [flash]);

  const hidden = !!signal?.recording;
  const gray = mood === 'rainy';
  const menuItems: [string, string, string, () => void][] = [
    action === 'sleep'
      ? ['☀️', 'Wake up', 'Проснуться', () => ((body.current = { ...body.current, action: 'idle', until: Date.now() + 1500 }), setAction('idle'), kick())]
      : ['💤', 'Take a nap', 'Поспать', () => ((body.current = { ...body.current, action: 'sleep', until: Date.now() + 10 * 60_000 }), setAction('sleep'))],
    ['🔮', 'Call Afina', 'Позвать Афину', () => void emitEvent('island://hotkey')],
    ['🏝️', 'Open the island', 'Открыть остров', () => void emitEvent('island://open', 'home')],
    ['🙈', 'Turn Cloudy off', 'Выключить Cloudy', () => settings && void call('set_settings', { value: { ...settings, cloudy: { ...settings.cloudy, enabled: false } } })],
  ];

  return (
    <div className={`cloudy-stage ${hidden ? 'hidden' : ''}`} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div ref={el} className={`cloudy act-${action} ${gray ? 'gray' : ''}`} style={{ width: cfg.size }}>
        <div ref={extras} className="cloudy-extras" style={{ bottom: heightOf(cfg.size) + 8 }}>
          <AnimatePresence>
            {menu && (
              <motion.div className="cloudy-menu" initial={{ opacity: 0, y: 6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}>
                {menuItems.map(([e, en, ru, run]) => (
                  <button key={en} onClick={() => (setMenu(false), run())}>
                    <Rich text={`${e} ${lang === 'ru' ? ru : en}`} size={15} />
                  </button>
                ))}
              </motion.div>
            )}
            {!menu && bubble && (
              <motion.div className="cloudy-bubble" initial={{ opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                <Rich text={bubble} size={15} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="cloudy-body" style={{ transform: `scaleX(${facing})` }} onPointerDown={onPointerDown}>
          <CloudyFace mood={mood} look={{ x: look.x * facing, y: look.y }} size={cfg.size} />
        </div>
        {mood === 'dance' && <span className="cl-note">♪</span>}
        {mood === 'sleep' && <span className="cl-zzz">Z<small>z</small><small>z</small></span>}
        {mood === 'ring' && <span className="cl-bell">🔔</span>}
      </div>
    </div>
  );
}
