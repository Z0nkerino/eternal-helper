// Cloudy's desktop layer: a transparent, click-through window over the work area. Only Cloudy and his
// menu or bubble catch the mouse. He mostly stays at his spot doing little things (blinking, looking
// around, getting bored or curious), reacts to the cursor, clicks, grabbing and food, and now and then
// takes a lively trip across the screen. Moving costs CPU only while he actually moves.
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { call, emitEvent, inTauri, listen, type Settings } from '../lib/ipc';
import { withDefaults } from '../lib/defaults';
import { resolveLang } from '../lib/i18n';
import { Emoji, Rich } from '../lib/emoji';
import { clampToArea, defaultSpot, heightOf, nextTripIn, planTrip, step, throwVelocity, type Area, type Body } from './brain';
import { cheer, decay, feed, FOODS, loadPet, need, savePet, type FoodId, type Pet } from './pet';
import { CloudyFace, type Expr } from './CloudyFace';
import { chirp } from './sounds';

export interface MoodSignal {
  weather: 'rain' | 'snow' | 'storm' | 'sun' | 'cloudy' | null;
  isDay: boolean;
  playing: boolean;
  recording: boolean;
  thinking: boolean;
  timerDone: number;
  error: number;
}

export interface CloudyState {
  pet: Pet;
  expr: Expr;
  need: ReturnType<typeof need>;
  sleeping: boolean;
}

/** Body animations (CSS classes on the body wrapper). */
export type Anim = 'idle' | 'lean' | 'joy' | 'squish' | 'dangle' | 'droop' | 'spin' | 'shake' | 'chomp' | 'dance' | 'fly' | 'sleep' | 'wiggle' | 'stretch' | 'nope' | 'hop';

type Line = [string, string];
const LINES: Record<string, Line[]> = {
  idle: [['Hi there! ☁️', 'Привет! ☁️'], ['Time for some water 💧', 'Пора попить воды 💧'], ['Stretch a little 🙆', 'Потянись немного 🙆'], ['You’re doing great ✨', 'У тебя отлично получается ✨'], ['Blink a few times 👀', 'Поморгай немного 👀'], ['I like it here 🫶', 'Мне тут нравится 🫶']],
  hungry: [['Could I have a snack? 🥺', 'Можно перекусить? 🥺'], ['My tummy is rumbling… 🍪', 'В животике урчит… 🍪'], ['A rainbow would be lovely 🌈', 'Радуга была бы кстати 🌈']],
  bored: [['So bored… play with me? 🎾', 'Скучно… поиграем? 🎾'], ['Psst. Click me 👉☁️', 'Пс-с. Кликни меня 👉☁️'], ['*sigh* ☁️', '*вздох* ☁️']],
  sleepy: [['So sleepy… 🥱', 'Так спать хочется… 🥱'], ['Five more minutes… 💤', 'Ещё пять минуточек… 💤']],
  fed: [['Yum! 😋', 'Ням! 😋'], ['Delicious! ✨', 'Вкуснятина! ✨'], ['Thank you! 💗', 'Спасибо! 💗']],
  full: [['I’m full! 😌', 'Я сыт! 😌'], ['Maybe later 🙂', 'Может, попозже 🙂']],
  thrown: [['Wheee! 🎈', 'Уи-и-и! 🎈'], ['Again! Again! 🤩', 'Ещё! Ещё! 🤩']],
  music: [['Ooh, I love this one 🎶', 'О, люблю эту песню 🎶']],
  rain: [['It’s raining outside 🌧️', 'На улице дождь 🌧️']],
  tickle: [['Hee-hee! That tickles 😄', 'Хи-хи! Щекотно 😄']],
};

const CHATTER_MIN: Record<Settings['cloudy']['chatter'], number> = { never: 0, rare: 18, normal: 7, often: 3 };
const isNight = () => {
  const h = new Date().getHours();
  return h >= 23 || h < 6;
};
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const SPOT_KEY = 'eh.cloudy.spot';
function loadSpot(a: Area) {
  try {
    const s = JSON.parse(localStorage.getItem(SPOT_KEY) ?? 'null') as { fx: number; fy: number } | null;
    if (s) return clampToArea(s.fx * a.width, s.fy * a.height, a);
  } catch {
    /* ignore */
  }
  return defaultSpot(a);
}
function saveSpot(p: { x: number; y: number }, a: Area) {
  try {
    localStorage.setItem(SPOT_KEY, JSON.stringify({ fx: p.x / a.width, fy: p.y / a.height }));
  } catch {
    /* ignore */
  }
}

interface Flying {
  id: number;
  emoji: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: 'food' | 'ball';
}

export function CloudyStage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [signal, setSignal] = useState<MoodSignal | null>(null);
  const [pet, setPet] = useState<Pet>(() => decay(loadPet()));
  const [baseExpr, setBaseExpr] = useState<Expr>('happy');
  const [baseAnim, setBaseAnim] = useState<Anim>('idle');
  const [flash, setFlash] = useState<{ expr?: Expr; anim?: Anim; until: number } | null>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [moving, setMoving] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [near, setNear] = useState(false);
  const [flying, setFlying] = useState<Flying[]>([]);
  const [particles, setParticles] = useState<{ id: number; e: string }[]>([]);

  const el = useRef<HTMLDivElement>(null);
  const extras = useRef<HTMLDivElement>(null);
  const cfg = settings?.cloudy ?? { enabled: true, size: 72, speed: 1, chatter: 'rare' as const, roam: 'rare' as const, sounds: false };
  const area = useCallback((): Area => ({ width: innerWidth, height: innerHeight, size: cfg.size }), [cfg.size]);
  const spot = useRef({ x: 0, y: 0 });
  const body = useRef<Body>({ x: 0, y: 0, vx: 0, vy: 0, facing: 1, mode: 'rest', trip: null });
  const raf = useRef(0);
  const lastT = useRef(0);
  const tripKind = useRef<'visit' | 'move' | 'ball' | null>(null);
  const lastHit = useRef('');
  const lastSignal = useRef<MoodSignal | null>(null);
  const petRef = useRef(pet);
  petRef.current = pet;
  const lang = resolveLang(settings?.language);
  const sound = (k: Parameters<typeof chirp>[0]) => cfg.sounds && chirp(k);

  // ----- talking & reacting -----
  const lastSay = useRef(0);
  const say = useCallback(
    (kind: keyof typeof LINES, force = false, ms = 3800) => {
      if (!force && Date.now() - lastSay.current < 25_000) return;
      lastSay.current = Date.now();
      const [en, ru] = pick(LINES[kind]);
      setBubble(lang === 'ru' ? ru : en);
      setTimeout(() => setBubble(null), ms);
    },
    [lang],
  );
  const react = (expr: Expr | undefined, anim: Anim | undefined, ms = 1600) => setFlash({ expr, anim, until: Date.now() + ms });
  const burst = (e: string, n = 5) => {
    const items = Array.from({ length: n }, (_, i) => ({ id: Date.now() + i + Math.random(), e }));
    setParticles((p) => [...p, ...items]);
    setTimeout(() => setParticles((p) => p.filter((x) => !items.includes(x))), 1600);
  };

  const updatePet = useCallback((p: Pet) => {
    setPet(p);
    savePet(p);
  }, []);

  // ----- settings, signals, cursor -----
  useEffect(() => {
    void call('get_settings').then((s) => setSettings(withDefaults(s)));
    const offS = listen<Settings>('settings://changed', (s) => setSettings(withDefaults(s)));
    const offM = listen<MoodSignal>('cloudy://mood', setSignal);
    return () => (offS(), offM());
  }, []);

  useEffect(
    () =>
      listen<[number, number]>('cursor://move', ([x, y]) => {
        const b = body.current;
        const cx = b.x + cfg.size / 2;
        const cy = b.y + heightOf(cfg.size) / 2;
        const d = Math.hypot(x - cx, y - cy) || 1;
        setLook({ x: (x - cx) / Math.max(d, 120), y: (y - cy) / Math.max(d, 120) });
        const isNear = d < cfg.size * 1.7;
        setNear(isNear);
        setTilt(isNear ? Math.max(-12, Math.min(12, ((x - cx) / cfg.size) * 10)) : 0);
      }),
    [cfg.size],
  );

  // Place him at his spot once the window size is known — and again whenever it changes. A hidden
  // window can report a zero size at first, so a tiny size is ignored until the real one arrives.
  const placed = useRef(false);
  useEffect(() => {
    if (!settings) return;
    const place = () => {
      if (innerWidth < 200 || innerHeight < 200) return;
      const a = area();
      spot.current = loadSpot(a);
      if (body.current.mode === 'rest' || !placed.current) {
        body.current = { ...body.current, x: spot.current.x, y: spot.current.y, mode: 'rest', trip: null };
        paint();
        reportHit(true);
      }
      if (!placed.current) {
        placed.current = true;
        react('joy', 'wiggle', 1400); // a little hello
      }
    };
    place();
    addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, [!!settings, cfg.size]);

  // Pet stats drift every minute; tell the Cloudy window.
  useEffect(() => {
    const id = setInterval(() => updatePet(decay(petRef.current, Date.now(), sleeping)), 60_000);
    return () => clearInterval(id);
  }, [sleeping, updatePet]);

  // ----- motion loop (only while travelling or gliding) -----
  const paint = () => {
    const b = body.current;
    if (el.current) el.current.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
  };

  const reportHit = useCallback(
    (force = false) => {
      const b = body.current;
      let r = { x: b.x - 6, y: b.y - 6, w: cfg.size + 12, h: heightOf(cfg.size) + 12 };
      if (dragging) r = { x: 0, y: 0, w: innerWidth, h: innerHeight };
      else if (extras.current) {
        const e = extras.current.getBoundingClientRect();
        if (e.width) {
          const x = Math.min(r.x, e.left);
          const y = Math.min(r.y, e.top);
          r = { x, y, w: Math.max(r.x + r.w, e.right) - x, h: Math.max(r.y + r.h, e.bottom) - y };
        }
      }
      if (signal?.recording || cfg.enabled === false) r = { x: 0, y: 0, w: 0, h: 0 };
      const key = [r.x, r.y, r.w, r.h].map(Math.round).join(',');
      if (force || key !== lastHit.current) {
        lastHit.current = key;
        void call('island_set_hit', r);
      }
    },
    [cfg.size, dragging, signal?.recording, cfg.enabled],
  );

  const tick = useRef<(t: number) => void>(() => {});
  const lastReport = useRef(0);
  tick.current = (t: number) => {
    const dt = Math.min(0.05, (t - (lastT.current || t)) / 1000);
    lastT.current = t;
    const r = step(body.current, dt, Date.now(), area(), spot.current, cfg.speed);
    body.current = r.body;
    paint();
    if (t - lastReport.current > 90) {
      lastReport.current = t;
      reportHit();
    }
    if (r.body.mode === 'trip' || r.body.mode === 'glide') {
      raf.current = requestAnimationFrame((x) => tick.current(x));
      return;
    }
    raf.current = 0;
    lastT.current = 0;
    setMoving(false);
    reportHit(true);
    if (r.settled) arrived(r.settled);
  };
  const kick = () => {
    setMoving(true);
    if (!raf.current) raf.current = requestAnimationFrame((x) => tick.current(x));
  };

  function arrived(at: { x: number; y: number }) {
    const kind = tripKind.current;
    tripKind.current = null;
    if (kind === 'visit') {
      // Have a look around, then fly home.
      react('curious', 'hop', 1600);
      setTimeout(() => {
        if (body.current.mode !== 'rest') return;
        tripKind.current = 'move';
        body.current = planTrip(body.current, area(), Date.now(), { to: spot.current, speed: cfg.speed });
        kick();
      }, 1700);
      return;
    }
    if (kind === 'ball') {
      setFlying((f) => f.filter((x) => x.kind !== 'ball'));
      updatePet(cheer(petRef.current, 'play'));
      react('joy', 'spin', 1400);
      burst('✨', 4);
      sound('joy');
      tripKind.current = 'move';
      setTimeout(() => {
        body.current = planTrip(body.current, area(), Date.now(), { to: spot.current, speed: cfg.speed });
        kick();
      }, 1500);
      return;
    }
    spot.current = at;
    saveSpot(at, area());
    react('happy', 'squish', 700);
  }

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0; // a remount (React dev double-mount) can start the loop again
  }, []);
  useEffect(() => reportHit(true), [menu, bubble, dragging, signal?.recording, cfg.size, reportHit]);

  const fly = (to: { x: number; y: number } | undefined, kind: 'visit' | 'move' | 'ball') => {
    if (dragging || sleeping) return;
    setMenu(false);
    tripKind.current = kind;
    body.current = planTrip(body.current, area(), Date.now(), { to, speed: cfg.speed * (kind === 'ball' ? 1.6 : 1) });
    kick();
  };

  // ----- spontaneous trips (rare by default) -----
  useEffect(() => {
    const wait = nextTripIn(cfg.roam);
    if (wait == null) return;
    const id = setTimeout(() => {
      if (body.current.mode === 'rest' && !sleeping && !menu && !signal?.recording) {
        react('joy', undefined, 900);
        fly(undefined, Math.random() < 0.6 ? 'visit' : 'move');
      }
    }, wait);
    return () => clearTimeout(id);
  }, [cfg.roam, sleeping, menu, signal?.recording, moving]);

  // ----- idle life: little things every few seconds -----
  const n = need(pet, isNight());
  useEffect(() => {
    if (sleeping) return;
    const id = setInterval(() => {
      if (body.current.mode !== 'rest' || dragging || menu) return;
      const r = Math.random();
      if (n === 'hungry') {
        if (r < 0.35) react('hungry', 'shake', 900);
        if (r < 0.15) say('hungry');
      } else if (n === 'bored') {
        if (r < 0.3) react('bored', 'droop', 2600);
        else if (r < 0.4) say('bored');
        else if (r < 0.48) fly(undefined, 'visit'); // bored → go look around
      } else if (n === 'sleepy') {
        if (r < 0.3) react('yawn', 'stretch', 1800);
        if (petRef.current.energy < 12 || (isNight() && r < 0.2)) setSleeping(true);
      } else {
        const acts: [Expr, Anim, number][] = [['curious', 'lean', 1800], ['wink', 'wiggle', 1100], ['joy', 'hop', 900], ['proud', 'idle', 1600], ['cheeky', 'wiggle', 1200], ['happy', 'spin', 1300], ['think', 'idle', 1800]];
        if (r < 0.55) {
          const [e, a, ms] = pick(acts);
          react(e, a, ms);
          if (a === 'spin') sound('joy');
        }
      }
    }, 7_000 + Math.random() * 6_000);
    return () => clearInterval(id);
  }, [n, sleeping, dragging, menu, say]);

  // Chatter
  useEffect(() => {
    const every = CHATTER_MIN[cfg.chatter];
    if (!every) return;
    const id = setInterval(() => !sleeping && !signal?.recording && say(n === 'fine' ? 'idle' : n), every * 60_000);
    return () => clearInterval(id);
  }, [cfg.chatter, sleeping, signal?.recording, n, say]);

  // ----- signals from the island -----
  useEffect(() => {
    const prev = lastSignal.current;
    lastSignal.current = signal;
    if (!signal || !prev) return;
    if (signal.timerDone !== prev.timerDone) {
      setSleeping(false);
      react('joy', 'spin', 2200);
      burst('🔔', 3);
      sound('joy');
    }
    if (signal.error !== prev.error) react('scared', 'shake', 1600);
    if (signal.playing && !prev.playing) say('music', true, 2500);
    if (signal.weather === 'rain' && prev.weather !== 'rain') say('rain', true);
  }, [signal]);

  // ----- food & play (from the Cloudy window or the menu) -----
  const eat = useCallback(
    (id: FoodId) => {
      const food = FOODS.find((f) => f.id === id)!;
      const res = feed(petRef.current, id);
      setSleeping(false);
      if (!res.ok) {
        updatePet(res.pet);
        react('proud', 'nope', 1200);
        if (res.reason === 'full') say('full', true, 2200);
        return;
      }
      const b = body.current;
      const to = { x: b.x + cfg.size / 2, y: b.y + heightOf(cfg.size) * 0.7 };
      const from = { x: to.x + (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 120), y: Math.max(20, to.y - 220) };
      const item: Flying = { id: Date.now(), emoji: food.emoji, from, to, kind: 'food' };
      setFlying((f) => [...f, item]);
      react('curious', 'lean', 900);
      setTimeout(() => {
        setFlying((f) => f.filter((x) => x.id !== item.id));
        react('eat', 'chomp', 1300);
        sound('chomp');
        setTimeout(() => {
          updatePet(res.pet);
          const r = food.reaction;
          if (r === 'love') (react('love', 'joy', 2200), burst('💗', 5));
          else if (r === 'glow') (react('joy', 'hop', 2000), burst('✨', 5));
          else if (r === 'shiver') (react('shiver', 'shiver' as Anim, 1600), burst('❄️', 3));
          else if (r === 'sparkle') (react('proud', 'spin', 1800), burst('⭐', 5));
          else react('joy', 'joy', 1600);
          say('fed', true, 2200);
          sound('joy');
        }, 1300);
      }, 850);
    },
    [cfg.size, say, updatePet],
  );

  const playBall = () => {
    setSleeping(false);
    const a = area();
    const to = clampToArea(60 + Math.random() * (a.width - 200), 60 + Math.random() * (a.height - 200), a);
    setFlying((f) => [...f.filter((x) => x.kind !== 'ball'), { id: Date.now(), emoji: '🎾', from: { x: to.x + cfg.size / 2, y: to.y }, to: { x: to.x + cfg.size / 2, y: to.y }, kind: 'ball' }]);
    react('surprised', 'hop', 600);
    setTimeout(() => fly(to, 'ball'), 500);
  };

  useEffect(() => {
    const offF = listen<{ food: FoodId }>('cloudy://feed', ({ food }) => eat(food));
    const offA = listen<{ kind: string }>('cloudy://action', ({ kind }) => {
      if (kind === 'play') playBall();
      else if (kind === 'nap') setSleeping(true);
      else if (kind === 'wake') (setSleeping(false), react('yawn', 'stretch', 1600));
      else if (kind === 'call') fly({ x: innerWidth / 2 - cfg.size / 2, y: innerHeight / 2 - cfg.size / 2 }, 'move');
      else if (kind === 'home') fly(defaultSpot(area()), 'move');
      else if (kind === 'trick') (react('joy', 'spin', 1500), burst('✨', 5), sound('joy'));
    });
    const offH = listen('cloudy://hello', () => broadcast());
    const offE = listen('cloudy://easter', () => (react('love', 'spin', 2500), burst('🎉', 6), say('thrown', true)));
    return () => (offF(), offA(), offH(), offE());
  }, [eat, cfg.size]);

  // ----- what he looks like right now -----
  const now = Date.now();
  const active = flash && flash.until > now ? flash : null;
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), Math.max(0, flash.until - Date.now()));
    return () => clearTimeout(id);
  }, [flash]);

  let expr: Expr = baseExpr;
  let anim: Anim = baseAnim;
  if (dragging) (expr = 'surprised'), (anim = 'dangle');
  else if (moving) (expr = active?.expr ?? 'joy'), (anim = 'fly');
  else if (active) (expr = active.expr ?? expr), (anim = active.anim ?? anim);
  else if (sleeping) (expr = 'sleep'), (anim = 'sleep');
  else if (signal?.thinking) expr = 'think';
  else if (signal?.playing) (expr = 'joy'), (anim = 'dance');
  else if (near) (expr = 'curious'), (anim = 'lean');
  else if (n === 'hungry') expr = 'hungry';
  else if (n === 'bored') (expr = 'bored'), (anim = 'droop');
  else if (n === 'sleepy') expr = 'sleepy';
  else if (signal?.weather === 'rain' || signal?.weather === 'storm') expr = 'sad';
  useEffect(() => {
    setBaseExpr('happy');
    setBaseAnim('idle');
  }, []);

  const broadcast = useCallback(() => {
    const state: CloudyState = { pet: petRef.current, expr, need: n, sleeping };
    void emitEvent('cloudy://state', state);
  }, [expr, n, sleeping]);
  useEffect(() => broadcast(), [pet, expr, sleeping, broadcast]);

  // ----- pointer: hover, click (pet), double-click (tickle), drag & throw -----
  const drag = useRef<{ dx: number; dy: number; moved: boolean; samples: { x: number; y: number; t: number }[] } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const b = body.current;
    drag.current = { dx: e.clientX - b.x, dy: e.clientY - b.y, moved: false, samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }] };
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
      setSleeping(false);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      tripKind.current = null;
      sound('lift');
    }
    body.current = { ...b, x: nx, y: ny, vx: 0, vy: 0, mode: 'drag', trip: null };
    d.samples = [...d.samples.filter((s) => performance.now() - s.t < 90), { x: e.clientX, y: e.clientY, t: performance.now() }];
    setTilt(Math.max(-25, Math.min(25, (e.movementX || 0) * 2)));
    paint();
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      const { vx, vy } = throwVelocity(d.samples);
      setDragging(false);
      setTilt(0);
      body.current = { ...body.current, vx, vy, mode: 'glide' };
      tripKind.current = 'move';
      if (Math.hypot(vx, vy) > 900) (say('thrown', true, 1800), sound('joy'));
      kick();
      return;
    }
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = undefined;
      setMenu(false);
      react('joy', 'spin', 1500);
      say('tickle', true, 2200);
      sound('joy');
      updatePet(cheer(petRef.current, 'pet'));
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = undefined;
      if (sleeping) {
        setSleeping(false);
        react('yawn', 'stretch', 1600);
        return;
      }
      react('joy', 'squish', 700);
      sound('pop');
      updatePet(cheer(petRef.current, 'pet'));
      setMenu((m) => !m);
    }, 230);
  };

  const L = (en: string, ru: string) => (lang === 'ru' ? ru : en);
  const menuItems: [string, string, () => void][] = [
    ['🍽️', L('Feed me', 'Покормить'), () => void call('open_window', { kind: 'pet' })],
    ['🎾', L('Play ball', 'Поиграть в мяч'), playBall],
    sleeping ? ['☀️', L('Wake up', 'Разбудить'), () => setSleeping(false)] : ['💤', L('Take a nap', 'Поспать'), () => setSleeping(true)],
    ['🔮', L('Call Afina', 'Позвать Афину'), () => void emitEvent('island://hotkey')],
    ['⚙️', L('Cloudy’s room', 'Комната Cloudy'), () => void call('open_window', { kind: 'pet' })],
  ];

  // Browser preview (no desktop shell): ?mood=… shows a look.
  useEffect(() => {
    if (inTauri) return;
    const m = new URLSearchParams(location.search).get('mood') as Expr | null;
    if (m) setBaseExpr(m);
    if (m === 'sleep') setSleeping(true);
  }, []);

  const hidden = !!signal?.recording || cfg.enabled === false;
  const tint = signal?.weather === 'rain' || signal?.weather === 'storm' ? 'grey' : active?.anim === 'hop' && flash?.expr === 'joy' ? undefined : signal?.weather === 'sun' && signal.isDay ? 'warm' : undefined;

  return (
    <div className={`cloudy-stage ${hidden ? 'hidden' : ''}`} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onContextMenu={(e) => (e.preventDefault(), setMenu(true))}>
      <AnimatePresence>
        {flying.map((f) => (
          <motion.div
            key={f.id}
            className="cl-flying"
            initial={{ x: f.from.x - 14, y: f.from.y - 14, scale: f.kind === 'ball' ? 0 : 0.6, opacity: 0 }}
            animate={f.kind === 'ball' ? { scale: [0, 1.2, 1], opacity: 1, y: [f.to.y - 14, f.to.y - 34, f.to.y - 14] } : { x: f.to.x - 14, y: [f.from.y - 14, f.from.y - 70, f.to.y - 14], scale: [0.6, 1.1, 0.4], opacity: 1, rotate: 200 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: f.kind === 'ball' ? 0.45 : 0.85, ease: 'easeInOut' }}
          >
            <Emoji e={f.emoji} size={28} />
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={el} className="cloudy" style={{ width: cfg.size }}>
        <div ref={extras} className="cloudy-extras" style={{ bottom: heightOf(cfg.size) + 10 }}>
          <AnimatePresence>
            {menu && (
              <motion.div className="cloudy-menu" initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.94 }} transition={{ type: 'spring', stiffness: 520, damping: 30 }}>
                {menuItems.map(([e, label, run]) => (
                  <button key={label} onClick={() => (setMenu(false), run())}>
                    <Emoji e={e} size={16} /> {label}
                  </button>
                ))}
              </motion.div>
            )}
            {!menu && bubble && (
              <motion.div className="cloudy-bubble" initial={{ opacity: 0, y: 8, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 520, damping: 26 }}>
                <Rich text={bubble} size={15} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className={`cloudy-body anim-${anim}`} style={{ ['--tilt' as string]: `${tilt}deg`, ['--dir' as string]: body.current.facing }} onPointerDown={onPointerDown}>
          <CloudyFace expr={expr} look={dragging ? { x: 0, y: 0.8 } : look} size={cfg.size} tint={tint} />
        </div>
        {sleeping && !dragging && (
          <span className="cl-zzz">
            Z<small>z</small>
            <small>z</small>
          </span>
        )}
        {particles.map((p, i) => (
          <span key={p.id} className="cl-particle" style={{ ['--i' as string]: i, left: `${15 + ((i * 37) % 70)}%` }}>
            <Emoji e={p.e} size={16} />
          </span>
        ))}
      </div>
    </div>
  );
}
