// Cloudy's room: his own little room (the window shows the real sky and weather, the lamp glows at night,
// the bowl fills as he eats, he naps in his bed), how he feels, food, games, and how he behaves.
import { motion } from 'framer-motion';
import { TitleBar } from '../components/TitleBar';
import { useEffect, useState } from 'react';
import { call, emitEvent, listen } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { saveSettings, toast, useApp } from '../lib/store';
import { weatherScene } from '../lib/weather';
import { Emoji, Rich } from '../lib/emoji';
import { Segment, Switch } from '../settings/parts';
import { type Expr } from './CloudyFace';
import { Cloudy3D, type Trick } from './Cloudy3D';
import { FOOD_COOLDOWN, FOODS, level, loadPet, need, type Pet } from './pet';
import type { CloudyState } from './CloudyStage';

function Bar({ emoji, label, value, color }: { emoji: string; label: string; value: number; color: string }) {
  return (
    <div className="pet-bar">
      <div className="row between small">
        <span className="row gap">
          <Emoji e={emoji} size={16} /> {label}
        </span>
        <span className="mono faint">{Math.round(value)}%</span>
      </div>
      <div className="pet-track">
        <motion.div className="pet-fill" style={{ background: color }} initial={false} animate={{ width: `${value}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
    </div>
  );
}

/** His room: wall and window that follow the time of day and the weather, a rug, a bed, a lamp, a plant. */
function Room({ state, expr }: { state: CloudyState; expr: Expr }) {
  // Click him in his room and he does a trick.
  const [trick, setTrick] = useState<{ kind: Trick; n: number } | null>(null);
  const tricks: Trick[] = ['spin', 'flip', 'roll', 'hop', 'twirl'];
  const weather = useApp((s) => s.weather);
  const playing = useApp((s) => !!s.media?.playing);
  const h = new Date().getHours();
  const time = h >= 21 || h < 6 ? 'night' : h < 9 ? 'morning' : h >= 18 ? 'evening' : 'day';
  const scene = weather ? weatherScene(weather) : 'sun';
  const full = state.pet.fullness;
  return (
    <div className={`room ${time} w-${scene} ${state.sleeping ? 'sleeping' : ''}`}>
      <div className="room-wall">
        <div className="room-window">
          <div className="room-sky">
            {time === 'night' && <span className="room-moon" />}
            {time !== 'night' && scene !== 'rain' && scene !== 'storm' && <span className="room-sun" />}
            {(scene === 'cloudy' || scene === 'rain' || scene === 'storm') && <><span className="room-cloud a" /><span className="room-cloud b" /></>}
            {(scene === 'rain' || scene === 'storm') && <span className="room-rain" />}
            {scene === 'snow' && <span className="room-snow" />}
            {time === 'night' && <span className="room-stars" />}
          </div>
          <span className="room-frame" />
        </div>
        <span className="room-picture" />
        <span className="room-shelf"><i /><i /><i /></span>
      </div>
      <div className="room-floor" />
      <span className="room-rug" />
      <span className="room-bed" />
      <span className="room-plant"><i /><i /><i /></span>
      <span className={`room-lamp ${time === 'night' || time === 'evening' ? 'on' : ''}`} />
      <span className="room-bowl"><i style={{ height: `${Math.max(8, full)}%` }} /></span>
      <motion.div onClick={() => setTrick((x) => ({ kind: tricks[(x?.n ?? 0) % tricks.length], n: (x?.n ?? 0) + 1 }))} title="✨" className={`room-cloudy cloudy-body anim-${state.sleeping ? 'sleep' : expr === 'eat' ? 'chomp' : expr === 'joy' || expr === 'love' ? 'joy' : 'idle'} ${playing ? 'beat' : ''}`} animate={state.sleeping ? { x: 112, y: 46, scale: 0.8 } : { x: 0, y: [0, -8, 0], scale: 1 }} transition={state.sleeping ? { type: 'spring', stiffness: 80, damping: 16 } : { y: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } }}>
        <Cloudy3D expr={state.sleeping ? 'sleep' : expr} look={{ x: 0, y: 0 }} size={120} headphones={playing && !state.sleeping} playful={!state.sleeping} trick={trick} />
      </motion.div>
      {state.sleeping && <span className="room-zzz">z<i>z</i><b>z</b></span>}
    </div>
  );
}

export function PetWindow() {
  const tr = useTr();
  const settings = useApp((s) => s.settings);
  const [state, setState] = useState<CloudyState>(() => {
    const pet = loadPet();
    return { pet, expr: 'happy', need: need(pet, false), sleeping: false };
  });
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const off = listen<CloudyState>('cloudy://state', setState);
    void emitEvent('cloudy://hello');
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => (off(), clearInterval(id));
  }, []);

  if (!settings) return null;
  const c = settings.cloudy;
  const p: Pet = state.pet;
  const set = (patch: Partial<typeof c>) => void saveSettings({ cloudy: { ...c, ...patch } });
  const act = (kind: string) => void emitEvent('cloudy://action', { kind });
  const status: Record<CloudyState['need'], [string, string, string]> = {
    hungry: ['🥺', 'Cloudy is hungry', 'Cloudy проголодался'],
    bored: ['🥱', 'Cloudy is bored — play with him', 'Cloudy скучает — поиграй с ним'],
    sleepy: ['😴', 'Cloudy is sleepy', 'Cloudy хочет спать'],
    fine: ['😊', 'Cloudy is happy', 'Cloudy доволен'],
  };
  const [se, sen, sru] = state.sleeping ? ['💤', 'Cloudy is sleeping', 'Cloudy спит'] : status[state.need];
  const lvl = level(p);
  const expr: Expr = state.expr;

  return (
    <div className="pet-window scroll">
      <TitleBar className="floating" />
      <Room state={state} expr={expr} />
      <header className="pet-hero room-head">
        <div className="pet-title">
          <h1>Cloudy</h1>
          <div className="small muted">
            <Rich text={`${se} ${tr(sen, sru)}`} size={15} />
          </div>
          <div className="pet-level small">
            <Emoji e="💞" size={15} /> {tr('Friendship level', 'Уровень дружбы')} {lvl}
            <div className="pet-track thin">
              <div className="pet-fill" style={{ width: `${p.love % 100}%`, background: 'linear-gradient(90deg,#ff7eb3,#ffb3d1)' }} />
            </div>
          </div>
        </div>
        <button className="btn accent" onClick={() => void call('desk_add', { id: 'cloudy' }).then(() => toast(tr('Cloudy is on your desktop now', 'Cloudy теперь на рабочем столе'), { tone: 'ok', force: true })).catch((e) => toast(String(e), { tone: 'error' }))}>
          <Emoji e="🖥️" size={15} /> {tr('Put on the desktop', 'На рабочий стол')}
        </button>
      </header>

      <section className="pet-card">
        <Bar emoji="🍽️" label={tr('Fullness', 'Сытость')} value={p.fullness} color="linear-gradient(90deg,#ffb020,#ffd66b)" />
        <Bar emoji="💗" label={tr('Happiness', 'Настроение')} value={p.happiness} color="linear-gradient(90deg,#ff4fa3,#ff9bd0)" />
        <Bar emoji="⚡" label={tr('Energy', 'Энергия')} value={p.energy} color="linear-gradient(90deg,#2f6bff,#7fb0ff)" />
        <div className="faint tiny">{tr(`Fed ${p.fed} times`, `Покормлен ${p.fed} раз`)}</div>
      </section>

      <section className="pet-card">
        <h3>{tr('Food', 'Еда')}</h3>
        <div className="food-grid">
          {FOODS.map((f) => {
            const wait = Math.max(0, FOOD_COOLDOWN - (Date.now() - (p.lastFood[f.id] ?? 0)));
            return (
              <motion.button key={f.id} className="food" whileHover={{ y: -3 }} whileTap={{ scale: 0.92 }} disabled={wait > 0} onClick={() => void emitEvent('cloudy://feed', { food: f.id })}>
                <Emoji e={f.emoji} size={34} />
                <span className="small">{tr(...f.name)}</span>
                <span className="tiny faint">{wait > 0 ? `${Math.ceil(wait / 1000)} ${tr('s', 'с')}` : `+${f.fullness} 🍽 · +${f.happiness} 💗`}</span>
              </motion.button>
            );
          })}
        </div>
      </section>

      <section className="pet-card">
        <h3>{tr('Play', 'Игры')}</h3>
        <div className="pet-actions">
          <button className="btn" onClick={() => act('play')}><Emoji e="🎾" size={16} /> {tr('Throw a ball', 'Бросить мяч')}</button>
          <button className="btn" onClick={() => act('trick')}><Emoji e="✨" size={16} /> {tr('Do a trick', 'Трюк')}</button>
          <button className="btn" onClick={() => act('call')}><Emoji e="🧭" size={16} /> {tr('Come here', 'Ко мне')}</button>
          <button className="btn" onClick={() => act('home')}><Emoji e="🏠" size={16} /> {tr('Go to your spot', 'На место')}</button>
          {state.sleeping ? (
            <button className="btn" onClick={() => act('wake')}><Emoji e="☀️" size={16} /> {tr('Wake up', 'Разбудить')}</button>
          ) : (
            <button className="btn" onClick={() => act('nap')}><Emoji e="💤" size={16} /> {tr('Nap time', 'Поспать')}</button>
          )}
        </div>
      </section>

      <section className="pet-card settings">
        <h3>{tr('How Cloudy behaves', 'Как ведёт себя Cloudy')}</h3>
        <Switch label={tr('Show Cloudy on the desktop', 'Показывать Cloudy на рабочем столе')} on={c.enabled} onChange={(enabled) => set({ enabled })} />
        <div className="setting">
          <span>{tr('Size', 'Размер')}</span>
          <input type="range" min={48} max={120} step={2} value={c.size} onChange={(e) => set({ size: parseInt(e.target.value, 10) })} aria-label={tr('Size', 'Размер')} />
        </div>
        <div className="setting">
          <span>{tr('Speed', 'Скорость')}</span>
          <input type="range" min={0.5} max={2} step={0.1} value={c.speed} onChange={(e) => set({ speed: parseFloat(e.target.value) })} aria-label={tr('Speed', 'Скорость')} />
        </div>
        <Segment
          label={tr('Wanders around', 'Гуляет по экрану')}
          value={c.roam}
          options={[['stay', tr('Stays', 'Сидит')], ['rare', tr('Rarely', 'Редко')], ['sometimes', tr('Sometimes', 'Иногда')], ['often', tr('Often', 'Часто')]]}
          onChange={(roam) => set({ roam })}
        />
        <Segment
          label={tr('Talks', 'Разговаривает')}
          value={c.chatter}
          options={[['never', tr('Never', 'Молчит')], ['rare', tr('Rarely', 'Редко')], ['normal', tr('Sometimes', 'Иногда')], ['often', tr('Often', 'Часто')]]}
          onChange={(chatter) => set({ chatter })}
        />
        <Switch label={tr('Cute sounds', 'Милые звуки')} on={c.sounds} onChange={(sounds) => set({ sounds })} />
        <p className="faint small setting-help">
          {tr(
            'Drag Cloudy to give him a new spot or throw him. Click to pet him, double-click to tickle, right-click for his menu. He gets hungry over the day, bored when ignored and sleepy at night.',
            'Перетащи Cloudy на новое место или подбрось. Клик — погладить, двойной клик — пощекотать, правый клик — меню. За день он проголодается, без внимания заскучает, а ночью захочет спать.',
          )}
        </p>
      </section>
    </div>
  );
}
