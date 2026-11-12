// The Eternal account: who you are in the app (name, e-mail, city, a few words), with the services you
// have connected. It is kept on this computer — there is no Eternal Inc. server to sign in to yet.
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, CalendarCheck, LogOut, Mail, MapPin, Music2, Pencil } from 'lucide-react';
import { useState } from 'react';
import type { Account as Acc, Settings } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { saveSettings, toast, useApp } from '../lib/store';
import { SPB } from '../lib/defaults';
import { SERVICE_NAMES } from '../lib/music';

const COLORS = ['#2f6bff', '#ff4fa3', '#8b5cf6', '#22c55e', '#f59e0b', '#06b6d4', '#ef4444'];
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
const okEmail = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function Avatar({ a, size = 44 }: { a: Pick<Acc, 'name' | 'color'>; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, ['--av' as string]: a.color }}>
      {initials(a.name)}
    </span>
  );
}

function Form({ a, onDone, first }: { a: Acc; onDone: () => void; first: boolean }) {
  const tr = useTr();
  const [d, setD] = useState({ name: a.name, email: a.email, city: a.city || SPB.place.split(',')[0], bio: a.bio, color: a.color });
  const valid = d.name.trim().length > 0 && okEmail(d.email.trim());
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const next: Acc = { ...a, ...d, name: d.name.trim().slice(0, 40), email: d.email.trim().slice(0, 80), city: d.city.trim().slice(0, 60), bio: d.bio.slice(0, 140), signedIn: true, since: a.since || Date.now() };
    void saveSettings({ account: next, name: next.name.split(' ')[0] } as Partial<Settings>).then(() => toast(first ? tr(`Welcome, ${next.name.split(' ')[0]}!`, `Добро пожаловать, ${next.name.split(' ')[0]}!`) : tr('Profile saved', 'Профиль сохранён'), { tone: 'ok', force: true }));
    onDone();
  };
  return (
    <form className="acc-form" onSubmit={submit}>
      <div className="acc-colors">
        <Avatar a={{ name: d.name || '?', color: d.color }} size={52} />
        <div className="row gap">
          {COLORS.map((c) => (
            <button type="button" key={c} className={`acc-color ${d.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setD({ ...d, color: c })} aria-label={c} />
          ))}
        </div>
      </div>
      <label className="acc-field"><span>{tr('Name', 'Имя')}</span><input className="field" required maxLength={40} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder={tr('Your name', 'Как тебя зовут')} autoFocus /></label>
      <label className="acc-field"><span>E-mail</span><input className={`field ${okEmail(d.email.trim()) ? '' : 'bad'}`} type="email" maxLength={80} value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="name@example.com" /></label>
      <label className="acc-field"><span>{tr('City', 'Город')}</span><input className="field" maxLength={60} value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} /></label>
      <label className="acc-field"><span>{tr('About you', 'О себе')}</span><input className="field" maxLength={140} value={d.bio} onChange={(e) => setD({ ...d, bio: e.target.value })} placeholder={tr('A few words (optional)', 'Пара слов (необязательно)')} /></label>
      <div className="row gap acc-actions">
        <button className="btn accent" type="submit" disabled={!valid}>{first ? tr('Create account', 'Создать аккаунт') : tr('Save', 'Сохранить')}</button>
        {!first && <button className="btn" type="button" onClick={onDone}>{tr('Cancel', 'Отмена')}</button>}
      </div>
      <p className="tiny faint">{tr('Your profile is kept on this computer and used for greetings, the weather and Afina.', 'Профиль хранится на этом компьютере — для приветствий, погоды и Афины.')}</p>
    </form>
  );
}

export function AccountSection({ s }: { s: Settings }) {
  const tr = useTr();
  const a = s.account;
  const [editing, setEditing] = useState(false);
  const web = useApp((x) => x.webMusic);
  const planner = useApp((x) => !!x.planner);
  if (!a.signedIn || editing) return <Form a={a} first={!a.signedIn} onDone={() => setEditing(false)} />;
  const since = new Date(a.since || Date.now()).toLocaleDateString(tr.lang === 'ru' ? 'ru-RU' : 'en-US', { month: 'long', year: 'numeric' });
  const connected: [typeof Music2, string, boolean][] = [
    [CalendarCheck, 'Universal Planner', planner],
    ...(Object.keys(SERVICE_NAMES) as (keyof typeof SERVICE_NAMES)[]).map((k): [typeof Music2, string, boolean] => [Music2, SERVICE_NAMES[k], !!web[k]]),
    [Bot, `Afina · ${s.afina.provider === 'local' ? tr('on this computer', 'на компьютере') : s.afina.provider}`, s.afina.enabled],
  ];
  return (
    <AnimatePresence mode="wait">
      <motion.div key="card" className="acc-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
        <div className="acc-head" style={{ ['--av' as string]: a.color }}>
          <Avatar a={a} size={58} />
          <div className="grow">
            <div className="acc-name">{a.name}</div>
            {a.bio && <div className="small muted">{a.bio}</div>}
            <div className="acc-meta tiny faint">
              {a.email && <span><Mail size={11} /> {a.email}</span>}
              {a.city && <span><MapPin size={11} /> {a.city}</span>}
              <span>{tr('Member since', 'С нами с')} {since}</span>
            </div>
          </div>
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label={tr('Edit profile', 'Изменить профиль')}><Pencil size={15} /></button>
        </div>
        <div className="section-title">{tr('Connected', 'Подключено')}</div>
        <div className="acc-links">
          {connected.map(([Icon, name, on]) => (
            <div key={name} className={`acc-link ${on ? 'on' : ''}`}>
              <Icon size={14} />
              <span className="grow ellipsis">{name}</span>
              <span className="tiny">{on ? tr('Connected', 'Подключено') : tr('Not connected', 'Не подключено')}</span>
            </div>
          ))}
        </div>
        <button className="btn acc-out" onClick={() => void saveSettings({ account: { ...a, signedIn: false } } as Partial<Settings>)}>
          <LogOut size={14} /> {tr('Sign out', 'Выйти')}
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
