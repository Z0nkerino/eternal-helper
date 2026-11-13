// Settings in their own window: search on top, a sidebar of sections, and the section's options.
// Every change applies to the island at once.
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { useTr } from '../lib/i18n';
import { useApp } from '../lib/store';
import { Emoji, Rich } from '../lib/emoji';
import { RELEASE } from '../lib/release';
import { SECTIONS, searchSections } from './sections';
import { TitleBar } from '../components/TitleBar';

export function SettingsWindow() {
  const tr = useTr();
  const s = useApp((x) => x.settings);
  const [active, setActive] = useState(() => location.hash.split('/')[1] || 'personal');
  const [q, setQ] = useState('');
  const toasts = useApp((x) => x.toasts);
  if (!s) return null;
  const found = searchSections(q);
  const shown = q.trim() ? found : [SECTIONS.find((x) => x.id === active) ?? SECTIONS[0]];
  return (
    <div className="settings-window">
      <aside className="settings-nav" role="tablist" aria-orientation="vertical" data-tauri-drag-region>
        <div className="settings-brand">
          <img src="/helper.svg" width={30} height={30} alt="" />
          <div>
            <div className="brand-name">Eternal Helper</div>
            <div className="faint tiny">{RELEASE.name} · {RELEASE.codename}</div>
          </div>
        </div>
        <label className="settings-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search settings', 'Поиск по настройкам')} aria-label={tr('Search settings', 'Поиск по настройкам')} />
          {q && (
            <button className="icon-btn" onClick={() => setQ('')} aria-label={tr('Clear', 'Очистить')}>
              <X size={13} />
            </button>
          )}
        </label>
        {SECTIONS.map((x) => {
          const dim = q.trim() && !found.includes(x);
          return (
            <button key={x.id} data-id={x.id} role="tab" aria-selected={!q && x.id === active} className={`nav-item ${!q && x.id === active ? 'on' : ''} ${dim ? 'dim' : ''}`} onClick={() => (setQ(''), setActive(x.id))}>
              <Emoji e={x.emoji} size={18} />
              <span>{tr(...x.title)}</span>
            </button>
          );
        })}
      </aside>
      <main className="settings-main scroll" role="tabpanel">
        <TitleBar className="floating" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={q.trim() ? `q:${q}` : active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {shown.length === 0 && <p className="muted">{tr('Nothing found. Try other words.', 'Ничего не найдено. Попробуй другие слова.')}</p>}
            {shown.map((section) => (
              <div key={section.id} className="settings-block">
                <h2 data-id={section.id}>
                  <Emoji e={section.emoji} size={22} /> {tr(...section.title)}
                </h2>
                <p className="section-desc">{tr(...section.desc)}</p>
                <section className="settings">
                  <section.Body s={s} />
                </section>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </main>
      <div className="window-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone ?? ''}`}>
            <span>
              <Rich text={t.text} />
            </span>
            {t.action && (
              <button className="toast-action" onClick={t.action.run}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
