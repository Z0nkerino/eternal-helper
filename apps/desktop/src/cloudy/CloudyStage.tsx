// Cloudy's desktop layer: a transparent, click-through window over the work area. Only Cloudy and his
// menu or bubble catch the mouse. He mostly stays at his spot doing little things (blinking, looking
// around, stretching, forming shapes out of his puffs), plays with the cursor (dodges a fast one, leans
// toward a slow one, nuzzles one that rests near him, sometimes chases it), plays with the desktop
// (peeks from the screen edge, naps melted on the taskbar, bounces off the edges, visits the island),
// dissolves into vapour when clicked and puffs back together. Moving costs CPU only while he moves.
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { call, emitEvent, inTauri, listen, type Settings } from '../lib/ipc';
import { withDefaults } from '../lib/defaults';
import { resolveLang } from '../lib/i18n';
import { Emoji, Rich } from '../lib/emoji';
import { EyeOff, House, Moon, MousePointer2, Shapes, Sun as SunIcon, Utensils, Volleyball, type LucideIcon } from 'lucide-react';
import { clampToArea, defaultSpot, heightOf, nextTripIn, planTrip, step, throwVelocity, type Area, type Body } from './brain';
import { cheer, decay, feed, FOODS, loadPet, need, savePet, type FoodId, type Pet } from './pet';
import { CloudyFace, type Expr, type Tint } from './CloudyFace';
import { SHAPE_NAMES, SHOW_SHAPES, type ShapeId } from './shapes';
import { startBeat } from '../lib/beat';
import { chirp } from './sounds';
import { useApp } from '../lib/store';
import { pageTitle, remarkFor, remarkForTrack } from './remarks';

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
export type Anim =
  | 'idle' | 'lean' | 'joy' | 'squish' | 'dangle' | 'droop' | 'spin' | 'shake' | 'chomp' | 'dance' | 'fly' | 'sleep' | 'wiggle' | 'stretch' | 'nope' | 'hop'
  | 'boing' | 'inflate' | 'jelly' | 'flip' | 'sneeze' | 'wave' | 'peek-l' | 'peek-r' | 'nuzzle' | 'reach' | 'shiver' | 'morph' | 'yoga' | 'rollover'
  | 'tilt' | 'shakeoff' | 'widen' | 'lookup';

/** Weather and fun effects drawn around him. */
type Fx = 'rain' | 'snow' | 'rainbow' | 'storm' | null;

type Line = [string, string];
const LINES: Record<string, Line[]> = {
  idle: [['Hi there!','Привет!'], ['Time for some water','Пора попить воды'], ['Stretch a little','Потянись немного'], ['You’re doing great','У тебя отлично получается'], ['Blink a few times','Поморгай немного'], ['I like it here','Мне тут нравится']],
  hungry: [['Could I have a snack?','Можно перекусить?'], ['My tummy is rumbling…','В животике урчит…'], ['A rainbow would be lovely','Радуга была бы кстати']],
  bored: [['So bored… play with me?','Скучно… поиграем?'], ['Psst. Click me','Пс-с. Кликни меня'], ['*sigh*','*вздох*']],
  sleepy: [['So sleepy…','Так спать хочется…'], ['Five more minutes…','Ещё пять минуточек…']],
  fed: [['Yum!','Ням!'], ['Delicious!','Вкуснятина!'], ['Thank you!','Спасибо!']],
  full: [['I’m full!','Я сыт!'], ['Maybe later','Может, попозже']],
  thrown: [['Wheee!','Уи-и-и!'], ['Again! Again!','Ещё! Ещё!']],
  music: [['Ooh, I love this one','О, люблю эту песню']],
  rain: [['It’s raining outside','На улице дождь']],
  tickle: [['Hee-hee! That tickles','Хи-хи! Щекотно']],
  poof: [['Poof!','Пуф!'], ['I’m back!','Я снова тут!'], ['Ta-da!','Та-дам!'], ['Can’t catch vapour','Пар не поймаешь']],
  dodge: [['Missed me!','Не попал!'], ['Whoa, too fast!','Ого, слишком быстро!']],
  chase: [['I’ll get you, cursor!','Догоню тебя, курсор!'], ['Boop!','Буп!']],
  peek: [['Peekaboo!','Ку-ку!']],
  island: [['Hi, island!','Привет, остров!']],
  nuzzle: [['Hehe, hello','Хи-хи, привет']],
  sneeze: [['A-a-achoo!','А-а-апчхи!']],
  hint: [['Click: poof! · Right-click: menu','Клик — пуф! · Правый клик — меню']],
};

const CHATTER_MIN: Record<Settings['cloudy']['chatter'], number> = { never: 0, rare: 18, normal: 7, often: 3 };
const hidden0 = (s: MoodSignal | null, c: { enabled?: boolean }) => !!s?.recording || c.enabled === false;
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
  const [menu, setMenuRaw] = useState(false);
  // The menu ignores close requests for a moment after opening: on Windows the right button's release
  // and other stray events arrive right after it opens and used to shut it at once.
  const menuAt = useRef(0);
  const setMenu = useCallback((v: boolean | ((m: boolean) => boolean)) => {
    setMenuRaw((m) => {
      const next = typeof v === 'function' ? v(m) : v;
      if (next && !m) menuAt.current = performance.now();
      if (!next && m && performance.now() - menuAt.current < 450) return m;
      return next;
    });
  }, []);
  const closeMenuNow = () => setMenuRaw(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setMenuRaw(false);
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  const [dragging, setDragging] = useState(false);
  const [moving, setMoving] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [near, setNear] = useState(false);
  const [flying, setFlying] = useState<Flying[]>([]);
  const [particles, setParticles] = useState<{ id: number; e: string }[]>([]);
  const [shape, setShape] = useState<ShapeId>('cloud');
  const [dissolved, setDissolved] = useState(false);
  const [fx, setFx] = useState<Fx>(null);
  const [reach, setReach] = useState(0);
  const [shift, setShift] = useState(0);
  const shapeTimer = useRef<ReturnType<typeof setTimeout>>();
  const fxTimer = useRef<ReturnType<typeof setTimeout>>();

  const el = useRef<HTMLDivElement>(null);
  const extras = useRef<HTMLDivElement>(null);
  const cfg = settings?.cloudy ?? { enabled: true, size: 72, speed: 1, chatter: 'rare' as const, roam: 'rare' as const, sounds: false };
  const area = useCallback((): Area => ({ width: innerWidth, height: innerHeight, size: cfg.size }), [cfg.size]);
  const spot = useRef({ x: 0, y: 0 });
  const body = useRef<Body>({ x: 0, y: 0, vx: 0, vy: 0, facing: 1, mode: 'rest', trip: null });
  const raf = useRef(0);
  const lastT = useRef(0);
  const tripKind = useRef<'visit' | 'move' | 'ball' | 'dodge' | 'peek' | 'nap' | 'island' | null>(null);
  const lastHit = useRef('');
  const lastSignal = useRef<MoodSignal | null>(null);
  const petRef = useRef(pet);
  petRef.current = pet;
  const lang = resolveLang(settings?.language);
  const level = settings?.motion === 'reduced' ? 'calm' : settings?.motionLevel ?? 'balanced';
  useEffect(() => void (document.documentElement.dataset.level = level), [level]);
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
  const sayText = (text: string, ms = 2600) => {
    lastSay.current = Date.now();
    setBubble(text);
    setTimeout(() => setBubble((b) => (b === text ? null : b)), ms);
  };
  const react = (expr: Expr | undefined, anim: Anim | undefined, ms = 1600) => setFlash({ expr, anim, until: Date.now() + ms });
  /** Forms a shape out of his puffs for a while, then turns back into himself. */
  const formShape = (id: ShapeId, ms = 3800, talk = true) => {
    clearTimeout(shapeTimer.current);
    setShape(id);
    react('joy', 'morph', 900);
    if (talk) {
      const [, en, ru] = SHAPE_NAMES[id];
      sayText(lang === 'ru' ? ru : en, Math.min(ms, 3200));
    }
    shapeTimer.current = setTimeout(() => setShape('cloud'), ms);
  };
  const showFx = (f: Fx, ms = 6000) => {
    clearTimeout(fxTimer.current);
    setFx(f);
    fxTimer.current = setTimeout(() => setFx(null), ms);
  };
  /** Clicked: he scatters into vapour and puffs back together. */
  const poof = () => {
    if (dissolved) return;
    setDissolved(true);
    sound('pop');
    setTimeout(() => {
      setDissolved(false);
      react('joy', 'boing', 1100);
      if (Math.random() < 0.5) say('poof', true, 1800);
    }, 720);
  };
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

  // The cursor, a few times a second: where it is, how fast it moves, and how long it has rested.
  const cursor = useRef({ x: -1, y: -1, t: 0, speed: 0, restSince: 0, dir: 0, flips: [] as number[] });
  const lastDizzy = useRef(0);
  const farSince = useRef(0);
  const lastDodge = useRef(0);
  const lastNuzzle = useRef(0);
  const cursorPlay = useRef<(x: number, y: number, d: number, speed: number) => void>(() => {});
  useEffect(
    () =>
      listen<[number, number]>('cursor://move', ([x, y]) => {
        const c = cursor.current;
        const now = performance.now();
        const moved = c.x < 0 ? 0 : Math.hypot(x - c.x, y - c.y);
        const speed = c.t ? (moved / Math.max(16, now - c.t)) * 1000 : 0;
        if (moved > 3 || c.x < 0) c.restSince = now;
        // Wiggling the cursor back and forth right next to him makes him dizzy.
        const dir = Math.sign(x - c.x);
        if (dir && dir !== c.dir) {
          c.flips = c.flips.filter((t) => now - t < 1200).concat(now);
          c.dir = dir;
        }
        Object.assign(c, { x, y, t: now, speed });
        const b = body.current;
        const cx = b.x + cfg.size / 2;
        const cy = b.y + heightOf(cfg.size) / 2;
        const d = Math.hypot(x - cx, y - cy) || 1;
        setLook({ x: (x - cx) / Math.max(d, 120), y: (y - cy) / Math.max(d, 120) });
        const isNear = d < cfg.size * 1.7;
        setNear(isNear);
        setTilt(isNear ? Math.max(-12, Math.min(12, ((x - cx) / cfg.size) * 10)) : 0);
        // He stretches a little toward a cursor that comes close (−1 left … 1 right).
        setReach(isNear && b.mode === 'rest' ? Math.max(-1, Math.min(1, (x - cx) / (cfg.size * 1.4))) : 0);
        cursorPlay.current(x, y, d, speed);
        // The menu closes by itself when the mouse has wandered far away for a few seconds.
        if (d > cfg.size * 4) {
          if (!farSince.current) farSince.current = now;
          else if (now - farSince.current > 3500) setMenu(false);
        } else farSince.current = 0;
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
          // A little margin around the menu / bubble, so the edges always catch the mouse.
          const x = Math.min(r.x, e.left - 10);
          const y = Math.min(r.y, e.top - 10);
          r = { x, y, w: Math.max(r.x + r.w, e.right + 10) - x, h: Math.max(r.y + r.h, e.bottom + 10) - y };
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

  const goHome = (after: number) =>
    setTimeout(() => {
      if (body.current.mode !== 'rest' || drag.current) return;
      tripKind.current = 'move';
      body.current = planTrip(body.current, area(), Date.now(), { to: spot.current, speed: cfg.speed });
      kick();
    }, after);

  function arrived(at: { x: number; y: number }) {
    const kind = tripKind.current;
    tripKind.current = null;
    if (kind === 'dodge') {
      react('cheeky', 'wiggle', 1200);
      if (Math.random() < 0.5) say('dodge', true, 1800);
      goHome(1500);
      return;
    }
    if (kind === 'peek') {
      // Hide behind the screen edge, peek out, then come back.
      const left = at.x < innerWidth / 2;
      react('curious', left ? 'peek-l' : 'peek-r', 3600);
      setTimeout(() => say('peek', true, 1600), 1800);
      goHome(3900);
      return;
    }
    if (kind === 'nap') {
      // A lazy puddle on the taskbar / Dock for a little while.
      formShape('puddle', 9000, false);
      react('sleep', 'sleep', 9000);
      goHome(9400);
      return;
    }
    if (kind === 'island') {
      react('joy', 'wave', 1800);
      say('island', true, 1800);
      goHome(2200);
      return;
    }
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
  // Keep the menu and speech bubble on screen when he sits near an edge.
  useEffect(() => {
    setShift(0);
    const id = requestAnimationFrame(() => {
      const r = extras.current?.getBoundingClientRect();
      if (!r || !r.width) return;
      setShift(r.right > innerWidth - 8 ? innerWidth - 8 - r.right : r.left < 8 ? 8 - r.left : 0);
    });
    // The clickable area follows the menu once it has finished moving into place.
    const t1 = setTimeout(() => reportHit(true), 120);
    const t2 = setTimeout(() => reportHit(true), 420);
    return () => (cancelAnimationFrame(id), clearTimeout(t1), clearTimeout(t2));
  }, [menu, bubble]);

  const fly = (to: { x: number; y: number } | undefined, kind: NonNullable<typeof tripKind.current>) => {
    if (dragging || sleeping) return;
    setMenu(false);
    tripKind.current = kind;
    body.current = planTrip(body.current, area(), Date.now(), { to, speed: cfg.speed * (kind === 'ball' ? 1.6 : 1) });
    kick();
  };

  // ----- playing with the cursor -----
  cursorPlay.current = (x, y, d, speed) => {
    const b = body.current;
    if (b.mode !== 'rest' || dragging || menu || sleeping || dissolved || hiddenRef.current) return;
    const now = performance.now();
    // A cursor rushing at him: he dodges out of the way, then floats back.
    if (d < cfg.size * 1.15 && speed > 1500 && now - lastDodge.current > 5000) {
      lastDodge.current = now;
      const cx = b.x + cfg.size / 2;
      const cy = b.y + heightOf(cfg.size) / 2;
      const ux = (cx - x) / d;
      const uy = (cy - y) / d;
      body.current = { ...b, vx: ux * 1100, vy: uy * 1100 - 150, mode: 'glide', trip: null };
      tripKind.current = 'dodge';
      react('surprised', 'fly', 600);
      sound('lift');
      kick();
      return;
    }
    // Shaken around him: dizzy.
    if (d < cfg.size * 2 && cursor.current.flips.length >= 6 && now - lastDizzy.current > 8000) {
      lastDizzy.current = now;
      cursor.current.flips = [];
      react('dizzy', 'spin', 2200);
      setTimeout(() => sayText(lang === 'ru' ? 'Голова кружится…' : 'So dizzy…', 1800), 700);
      return;
    }
    // A cursor resting right next to him: a happy nuzzle.
    if (d < cfg.size * 1.1 && now - cursor.current.restSince > 1400 && now - lastNuzzle.current > 25_000) {
      lastNuzzle.current = now;
      react('love', 'nuzzle', 1800);
      burst('💗', 3);
      if (Math.random() < 0.4) say('nuzzle', true, 1800);
    }
  };

  // ----- playing with the desktop -----
  const play = {
    /** Fly to a screen edge and peek out from behind it. */
    peek: () => {
      const a = area();
      const left = Math.random() < 0.5;
      fly({ x: left ? 0 : a.width, y: 80 + Math.random() * (a.height - 240) }, 'peek');
    },
    /** Melt into a puddle on the taskbar / Dock for a nap. */
    nap: () => fly({ x: innerWidth * (0.25 + Math.random() * 0.5), y: innerHeight }, 'nap'),
    /** Bounce off the screen edges like a balloon. */
    bounce: () => {
      if (body.current.mode !== 'rest') return;
      const ang = Math.random() * Math.PI * 2;
      body.current = { ...body.current, vx: Math.cos(ang) * 2200, vy: Math.sin(ang) * 2200, mode: 'glide', trip: null };
      tripKind.current = 'dodge';
      say('thrown', true, 1600);
      kick();
    },
    /** Visit the island at the top of the screen and wave at it. */
    island: () => fly({ x: innerWidth / 2 - cfg.size / 2, y: 70 }, 'island'),
    /** Chase the cursor and boop it. */
    chase: () => {
      const c = cursor.current;
      if (c.x < 0) return;
      say('chase', true, 1800);
      fly({ x: c.x - cfg.size / 2, y: c.y + 14 }, 'visit');
    },
  };
  const hiddenRef = useRef(false);

  // ----- spontaneous trips (rare by default) -----
  useEffect(() => {
    const wait = nextTripIn(cfg.roam);
    if (wait == null) return;
    const id = setTimeout(() => {
      if (body.current.mode === 'rest' && !sleeping && !menu && !signal?.recording && !directed.current) {
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
      if (body.current.mode !== 'rest' || dragging || menu || directed.current) return;
      const r = Math.random();
      if (n === 'hungry') {
        if (r < 0.35) react('hungry', 'shake', 900);
        if (r < 0.15) say('hungry');
      } else if (n === 'bored') {
        if (r < 0.3) react('bored', 'droop', 2600);
        else if (r < 0.4) say('bored');
        else if (r < 0.48) fly(undefined, 'visit'); // bored → go look around
        else if (r < 0.55) formShape('puddle', 4000, false);
        else if (r < 0.62) play.peek();
        else if (r < 0.68) play.chase();
      } else if (n === 'sleepy') {
        if (r < 0.3) (react('yawn', 'stretch', 1800), formShape('tall', 1400, false));
        else if (r < 0.36) play.nap();
        if (petRef.current.energy < 12 || (isNight() && r < 0.2)) setSleeping(true);
      } else {
        const acts: [Expr, Anim, number][] = [
          ['curious', 'lean', 1800], ['wink', 'wiggle', 1100], ['joy', 'hop', 900], ['proud', 'idle', 1600], ['cheeky', 'wiggle', 1200], ['think', 'idle', 1800],
          ['tongue', 'wiggle', 1600], ['joy', 'wave', 1600], ['curious', 'tilt', 1800], ['tongue', 'tilt', 1600], ['squint', 'idle', 1600], ['joy', 'boing', 1000],
          ...(level === 'calm' ? [] : ([['joy', 'jelly', 1200], ['happy', 'inflate', 1600], ['squint', 'shakeoff', 1300], ['joy', 'widen', 1400]] as [Expr, Anim, number][])),
          ...(level === 'lively' ? ([['joy', 'flip', 1100], ['proud', 'yoga', 2400], ['cheeky', 'rollover', 1400], ['happy', 'spin', 1300]] as [Expr, Anim, number][]) : []),
        ];
        if (r < (level === 'lively' ? 0.45 : 0.35)) {
          const [e, a, ms] = pick(acts);
          react(e, a, ms);
          if (a === 'spin' || a === 'flip') sound('joy');
        } else if (r < 0.55) {
          // Form a shape out of his puffs — sometimes one that fits the moment.
          const h = new Date().getHours();
          const fits: ShapeId[] = [signal?.playing ? 'note' : null, signal?.weather === 'rain' ? 'umbrella' : null, h >= 21 || h < 6 ? 'moon' : null, signal?.weather === 'sun' && signal.isDay ? 'sun' : null].filter(Boolean) as ShapeId[];
          formShape(fits.length && Math.random() < 0.5 ? pick(fits) : pick(SHOW_SHAPES));
        } else if (r < 0.6) {
          react('yawn', 'stretch', 1800);
          formShape('tall', 1500, false);
        } else if (r < 0.63) {
          react('surprised', 'sneeze', 1300);
          setTimeout(() => (say('sneeze', true, 1500), poof()), 650);
        } else if (r < 0.66) play.peek();
        else if (r < 0.68) play.chase();
        else if (r < 0.7) play.island();
        else if (r < 0.715) play.bounce();
        else if (r < 0.74 && (signal?.weather === 'rain' || signal?.weather === 'snow' || signal?.weather === 'storm')) {
          // It's raining outside — so it rains from him too, a little.
          showFx(signal.weather === 'snow' ? 'snow' : signal.weather === 'storm' ? 'storm' : 'rain', 5000);
          react('sad', 'idle', 5000);
        }
      }
    }, (level === 'lively' ? 7_000 : level === 'calm' ? 18_000 : 10_000) + Math.random() * (level === 'lively' ? 6_000 : 10_000));
    return () => clearInterval(id);
  }, [n, sleeping, dragging, menu, say, signal, level]);

  // Moving with the music: --beat on his body follows the speakers (or a gentle simulated beat).
  const bodyRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(false);
  playingRef.current = !!signal?.playing && !hidden0(signal, cfg);
  useEffect(() => startBeat(() => bodyRef.current, { playing: () => playingRef.current }), []);

  // When nobody's moving the cursor, his eyes wander around on their own.
  useEffect(() => {
    const id = setInterval(() => {
      if (sleeping || dragging || performance.now() - cursor.current.restSince < 3500) return;
      if (Math.random() < 0.55) setLook({ x: (Math.random() - 0.5) * 1.6, y: (Math.random() - 0.5) * 1.0 });
      else setLook({ x: 0, y: 0 });
    }, 2600);
    return () => clearInterval(id);
  }, [sleeping, dragging]);

  // The island opening: he glances up at it, and sometimes waves.
  useEffect(
    () =>
      listen<{ open: boolean }>('island://state', ({ open }) => {
        if (!open || sleeping || body.current.mode !== 'rest' || directed.current) return;
        const b = body.current;
        setLook({ x: Math.max(-1, Math.min(1, (innerWidth / 2 - b.x) / 400)), y: -1 });
        if (Math.random() < 0.35) react('curious', 'lookup', 1400);
        else if (Math.random() < 0.2) react('joy', 'wave', 1400);
      }),
    [sleeping],
  );

  // Chatter
  useEffect(() => {
    const every = CHATTER_MIN[cfg.chatter];
    if (!every) return;
    const id = setInterval(() => !sleeping && !signal?.recording && !directed.current && say(n === 'fine' ? 'idle' : n), every * 60_000);
    return () => clearInterval(id);
  }, [cfg.chatter, sleeping, signal?.recording, n, say]);

  // Remarks about what's on the screen: the app in front, or the song that just started.
  const media = useApp((s) => s.media);
  const lastFg = useRef('');
  useEffect(() => {
    const every = { never: 0, rare: 240, normal: 100, often: 50 }[cfg.chatter];
    if (!every || !inTauri) return;
    const id = setInterval(async () => {
      if (sleeping || directed.current || Date.now() - lastSay.current < 30_000) return;
      const fg = await call('foreground_app').catch(() => null);
      const key = fg ? `${fg.app}|${pageTitle(fg.title)}` : '';
      if (!fg || key === lastFg.current) return;
      lastFg.current = key;
      const line = remarkFor(fg, lang);
      if (line) {
        sayText(line, 4400);
        react('curious', 'lookup', 1300);
      }
    }, every * 1000);
    return () => clearInterval(id);
  }, [cfg.chatter, sleeping, lang]);
  const trackKey = media?.playing ? `${media.title}|${media.artist}` : '';
  useEffect(() => {
    if (!trackKey || cfg.chatter === 'never' || sleeping) return;
    const t = setTimeout(() => {
      if (Date.now() - lastSay.current < 20_000 || Math.random() > 0.6) return;
      const m = useApp.getState().media;
      const line = remarkForTrack(m ? { title: m.title, artist: m.artist } : null, lang);
      if (line) {
        sayText(line, 4400);
        react('joy', 'dance', 1600);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [trackKey]);

  // ----- signals from the island -----
  useEffect(() => {
    const prev = lastSignal.current;
    lastSignal.current = signal;
    if (!signal || !prev) return;
    if (signal.timerDone !== prev.timerDone) {
      setSleeping(false);
      react('joy', 'spin', 2200);
      formShape('star', 2600, false);
      burst('🔔', 3);
      sound('joy');
    }
    if (signal.error !== prev.error) react('scared', 'shake', 1600);
    if (signal.playing && !prev.playing) (say('music', true, 2500), formShape('note', 2600, false));
    if (signal.weather === 'rain' && prev.weather !== 'rain') (say('rain', true), showFx('rain', 6000));
    if (signal.weather === 'snow' && prev.weather !== 'snow') showFx('snow', 6000);
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
          if (r === 'love') (react('love', 'joy', 2200), burst('💗', 5), formShape('heart', 2400, false));
          else if (r === 'glow') (react('joy', 'hop', 2000), burst('✨', 5), showFx('rainbow', 3200));
          else if (r === 'shiver') (react('shiver', 'shiver', 1600), burst('❄️', 3), showFx('snow', 2400));
          else if (r === 'sparkle') (react('proud', 'spin', 1800), burst('⭐', 5), formShape('star', 2200, false));
          else react('joy', 'jelly', 1600);
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
      else if (kind === 'shape') formShape(pick(SHOW_SHAPES.filter((x) => x !== shapeRef.current)));
      else if (kind === 'poof') poof();
      else if (kind === 'peek' || kind === 'nap' || kind === 'bounce' || kind === 'island' || kind === 'chase') play[kind]();
      else if (kind === 'rainbow') (showFx('rainbow', 4000), react('joy', 'hop', 1600));
    });
    const offH = listen('cloudy://hello', () => broadcast());
    const offE = listen('cloudy://easter', () => (react('love', 'spin', 2500), burst('🎉', 6), say('thrown', true)));
    return () => (offF(), offA(), offH(), offE());
  }, [eat, cfg.size]);

  // ----- what he looks like right now -----
  const shapeRef = useRef(shape);
  shapeRef.current = shape;
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
    if (e.button === 2) {
      e.preventDefault();
      setMenu(true);
      return;
    }
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
      react('tongue', 'spin', 1500);
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
      updatePet(cheer(petRef.current, 'pet'));
      if (menu) return setMenu(false);
      poof();
      try {
        if (!localStorage.getItem('eh.cloudy.hint')) {
          localStorage.setItem('eh.cloudy.hint', '1');
          setTimeout(() => say('hint', true, 4200), 1200);
        }
      } catch {
        /* storage unavailable */
      }
    }, 230);
  };

  const L = (en: string, ru: string) => (lang === 'ru' ? ru : en);
  const menuItems: [LucideIcon, string, () => void][] = [
    [Utensils, L('Feed', 'Покормить'), () => void call('open_window', { kind: 'pet' })],
    [Shapes, L('Shape', 'Фигура'), () => formShape(pick(SHOW_SHAPES.filter((x) => x !== shape)))],
    [Volleyball, L('Ball', 'Мяч'), playBall],
    [MousePointer2, L('Catch me', 'Догонялки'), play.chase],
    [EyeOff, L('Hide', 'Прятки'), play.peek],
    sleeping ? [SunIcon, L('Wake', 'Разбудить'), () => setSleeping(false)] : [Moon, L('Nap', 'Спать'), () => setSleeping(true)],
    [House, L('Room', 'Комната'), () => void call('open_window', { kind: 'pet' })],
  ];

  // Dev preview only: lets a demo page direct Cloudy with postMessage (used to film the app).
  const direct = useRef<(d: Record<string, unknown>) => void>(() => {});
  const directed = useRef(false);
  direct.current = (d) => {
    directed.current = true; // a demo is directing him: no idle surprises
    switch (d.cloudy) {
      case 'shape': return formShape(d.id as ShapeId, (d.ms as number) ?? 2400, false);
      case 'poof': return poof();
      case 'react': return react(d.expr as Expr, d.anim as Anim, (d.ms as number) ?? 1600);
      case 'say': return sayText(d.text as string, (d.ms as number) ?? 2200);
      case 'fly': return fly({ x: d.x as number, y: d.y as number }, 'move');
      case 'fx': return showFx(d.fx as Fx, (d.ms as number) ?? 3000);
      case 'look': return setLook({ x: d.x as number, y: d.y as number });
    }
  };
  useEffect(() => {
    if (inTauri || !import.meta.env.DEV) return;
    const on = (e: MessageEvent) => e.data && typeof e.data === 'object' && 'cloudy' in e.data && direct.current(e.data);
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, []);

  // Browser preview (no desktop shell): ?mood=… shows a look.
  useEffect(() => {
    if (inTauri) return;
    const m = new URLSearchParams(location.search).get('mood') as Expr | null;
    if (m) setBaseExpr(m);
    if (m === 'sleep') setSleeping(true);
    const sh = new URLSearchParams(location.search).get('shape') as ShapeId | null;
    if (sh) setShape(sh);
    const f = new URLSearchParams(location.search).get('fx') as Fx;
    if (f) setFx(f);
  }, []);

  const hidden = !!signal?.recording || cfg.enabled === false;
  hiddenRef.current = hidden;
  const tint: Tint = signal?.weather === 'rain' || signal?.weather === 'storm' || fx === 'storm' ? 'grey' : signal && !signal.isDay ? 'night' : signal?.weather === 'sun' ? 'warm' : 'white';

  return (
    <div className={`cloudy-stage ${hidden ? 'hidden' : ''}`} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onContextMenu={(e) => (e.preventDefault(), setMenu(true))} onPointerDownCapture={(e) => e.button === 2 && e.preventDefault()}>
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
        <div ref={extras} className="cloudy-extras" style={{ bottom: heightOf(cfg.size) + 10, translate: `${shift}px 0` }}>
          <AnimatePresence>
            {menu && (
              <motion.div className="cloudy-menu" initial={{ opacity: 0, y: 10, scale: 0.6 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.8 }} transition={{ type: 'spring', stiffness: 480, damping: 30 }}>
                {menuItems.map(([Icon, label, run], i) => (
                  <motion.button
                    key={label}
                    aria-label={label}
                    onClick={() => (closeMenuNow(), run())}
                    initial={{ opacity: 0, y: 8, scale: 0.5 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.03 * i, type: 'spring', stiffness: 520, damping: 26 }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.86 }}
                  >
                    <Icon size={17} strokeWidth={2} />
                    <span className="cm-tip">{label}</span>
                  </motion.button>
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
        {fx === 'rainbow' && <span className="cl-rainbow" aria-hidden />}
        <div ref={bodyRef} className={`cloudy-body anim-${anim} ${signal?.playing ? 'beat' : ''}`} style={{ ['--tilt' as string]: `${tilt}deg`, ['--dir' as string]: body.current.facing }} onPointerDown={onPointerDown}>
          <div className="cloudy-reach" style={{ ['--reach' as string]: reach }}>
            <CloudyFace expr={expr} look={dragging ? { x: 0, y: 0.8 } : look} size={cfg.size} tint={tint} shape={dragging ? 'cloud' : shape} dissolved={dissolved} headphones={!!media?.playing} />
          </div>
        </div>
        {(fx === 'rain' || fx === 'storm' || fx === 'snow') && (
          <div className={`cl-weather ${fx}`} aria-hidden>
            {Array.from({ length: fx === 'snow' ? 8 : 10 }, (_, i) => (
              <i key={i} style={{ ['--i' as string]: i, left: `${12 + ((i * 41) % 76)}%` }} />
            ))}
          </div>
        )}
        {dissolved && (
          <div className="cl-vapour" aria-hidden>
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} style={{ ['--a' as string]: `${(i / 7) * 360}deg` }} />
            ))}
          </div>
        )}
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
