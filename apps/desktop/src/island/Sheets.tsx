// Sheets over the open panel: the developer notice (news and updates, shown at start) and the request
// for full access, which spells out what it allows before the user agrees.
import { motion } from 'framer-motion';
import { ArrowDownToLine, Check, Layers, Lightbulb, Megaphone, MonitorUp, Power, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTr } from '../lib/i18n';
import { saveSettings, useApp } from '../lib/store';
import { BUNDLED, fetchNews, type NewsItem } from '../lib/news';
import { grantFullAccess } from '../lib/access';
import { installUpdate } from '../lib/updates';
import { call } from '../lib/ipc';
import { RELEASE } from '../lib/release';

const TAG = { update: [Sparkles, 'Update', 'Обновление'], news: [Megaphone, 'News', 'Новости'], tip: [Lightbulb, 'Tip', 'Совет'] } as const;

function NewsSheet() {
  const tr = useTr();
  const [items, setItems] = useState<NewsItem[]>(BUNDLED);
  const update = useApp((s) => s.update);
  const granted = useApp((s) => !!s.settings?.fullAccess?.granted);
  const atStart = useApp((s) => s.settings?.newsAtStart !== false);
  useEffect(() => void fetchNews().then(setItems), []);
  const close = () => useApp.setState({ sheet: null });
  return (
    <>
      <header className="sheet-head">
        <span className="sheet-badge"><Megaphone size={15} /></span>
        <div className="grow">
          <div className="sheet-title">{tr('From the developer', 'От разработчика')}</div>
          <div className="tiny faint">Eternal Inc. · {RELEASE.name} “{RELEASE.codename}”</div>
        </div>
        <button className="icon-btn" onClick={close} aria-label={tr('Close', 'Закрыть')}><X size={16} /></button>
      </header>
      <div className="sheet-body scroll">
        {update?.available && (
          <button className="sheet-card accent" onClick={() => update.progress == null && void installUpdate()}>
            <ArrowDownToLine size={16} />
            <span className="grow"><b>{tr('A new version is ready', 'Готова новая версия')}: {update.latest}</b><span className="tiny">{update.progress != null ? `${Math.round(update.progress * 100)}%` : tr('Tap to install — the app restarts by itself', 'Нажми, чтобы установить — приложение перезапустится само')}</span></span>
          </button>
        )}
        {!granted && (
          <button className="sheet-card" onClick={() => useApp.setState({ sheet: 'access' })}>
            <ShieldCheck size={16} />
            <span className="grow"><b>{tr('Let Eternal Helper work with your computer', 'Разреши Eternal Helper работать с компьютером')}</b><span className="tiny faint">{tr('Always on top, starts with Windows, Afina can open apps. You decide.', 'Всегда поверх окон, запуск с системой, Афина открывает приложения. Решать тебе.')}</span></span>
          </button>
        )}
        {items.map((n, i) => {
          const [Icon, en, ru] = TAG[n.tag];
          return (
            <motion.article key={n.title} className={`news-item ${n.tag}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i + 0.1, type: 'spring', stiffness: 380, damping: 32 }}>
              <div className="news-meta tiny"><Icon size={12} /> {tr(en, ru)} · {new Date(n.date).toLocaleDateString(tr.lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' })}</div>
              <div className="news-title">{n.title}</div>
              <p className="small muted">{n.body}</p>
            </motion.article>
          );
        })}
      </div>
      <footer className="sheet-foot">
        <label className="row gap tiny faint"><input type="checkbox" checked={atStart} onChange={(e) => void saveSettings({ newsAtStart: e.target.checked })} /> {tr('Show when the app starts', 'Показывать при запуске')}</label>
        <button className="chip-btn accent" onClick={close}><Check size={13} /> {tr('Got it', 'Понятно')}</button>
      </footer>
    </>
  );
}

function AccessSheet() {
  const tr = useTr();
  const mac = useApp((s) => s.layout?.platform === 'macos');
  const os = mac ? 'macOS' : 'Windows';
  const rows: [typeof Layers, string, string][] = [
    [Layers, tr('Always on top', 'Всегда сверху'), tr('The island stays above every window — fullscreen apps and games included — and never hides.', 'Остров остаётся над всеми окнами — даже в полноэкранных приложениях и играх — и никогда не прячется.')],
    [Power, tr(`Starts with ${os}`, `Запуск вместе с ${os}`), tr('It is ready the moment you sign in.', 'Он готов сразу после входа в систему.')],
    [MonitorUp, tr('Works with your apps', 'Работает с приложениями'), tr('Afina can find and open your files and open apps for you (“open Spotify”).', 'Афина может находить и открывать твои файлы и запускать приложения («открой Spotify»).')],
  ];
  return (
    <>
      <header className="sheet-head">
        <span className="sheet-badge access"><ShieldCheck size={15} /></span>
        <div className="grow">
          <div className="sheet-title">{tr('Full access', 'Полный доступ')}</div>
          <div className="tiny faint">{tr('Only with your permission. Turn it off any time in Settings.', 'Только с твоего разрешения. Выключается в Настройках в любой момент.')}</div>
        </div>
        <button className="icon-btn" onClick={() => useApp.setState({ sheet: null })} aria-label={tr('Close', 'Закрыть')}><X size={16} /></button>
      </header>
      <div className="sheet-body">
        {rows.map(([Icon, title, body]) => (
          <div key={title} className="access-row">
            <span className="access-ic"><Icon size={17} /></span>
            <span><b>{title}</b><span className="small muted">{body}</span></span>
          </div>
        ))}
        <p className="tiny faint">{tr('Nothing leaves your computer. Eternal Helper never reads your screen or keystrokes on its own.', 'Ничего не уходит с компьютера. Eternal Helper сам не читает экран и нажатия клавиш.')}</p>
        {mac && <button className="link tiny" onClick={() => void call('open_system_settings', { page: 'accessibility' })}>{tr('macOS may also ask you to allow Eternal Helper in Privacy & Security → Accessibility.', 'macOS может попросить разрешить Eternal Helper в «Конфиденциальность и безопасность → Универсальный доступ».')}</button>}
      </div>
      <footer className="sheet-foot">
        <button className="chip-btn" onClick={() => useApp.setState({ sheet: null })}>{tr('Not now', 'Не сейчас')}</button>
        <button className="chip-btn accent" onClick={() => void grantFullAccess().then(() => useApp.setState({ sheet: null }))}><ShieldCheck size={13} /> {tr('Allow full access', 'Разрешить полный доступ')}</button>
      </footer>
    </>
  );
}

export function Sheet() {
  const sheet = useApp((s) => s.sheet);
  if (!sheet) return null;
  return (
    <motion.div key={sheet} className="sheet" initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
      {sheet === 'news' ? <NewsSheet /> : <AccessSheet />}
    </motion.div>
  );
}
