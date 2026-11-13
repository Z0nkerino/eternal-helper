// Settings, redone: a profile card and search on top, the categories as colourful glass cards, and each
// category's options on its own page that slides in (with a back button). The island shows it compactly;
// the Settings window shows the categories as a sidebar beside the open page.
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ExternalLink, Search, X } from 'lucide-react';
import { useState } from 'react';
import { call, type Settings } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { closePanel, saveSettings, useApp } from '../lib/store';
import { LIMITS } from '../lib/defaults';
import { RELEASE } from '../lib/release';
import { SECTIONS, searchSections, type Section } from './sections';

function Tile({ x, size = 30 }: { x: Section; size?: number }) {
  const Icon = x.icon;
  return (
    <span className="set-tile" style={{ ['--c' as string]: x.color, width: size, height: size }}>
      <Icon size={size * 0.55} />
    </span>
  );
}

function Profile({ s, compact }: { s: Settings; compact?: boolean }) {
  const tr = useTr();
  const name = s.name || s.account?.name || '';
  return (
    <div className={`set-profile ${compact ? 'compact' : ''}`}>
      <span className="set-avatar">{(name || 'E').slice(0, 1).toUpperCase()}</span>
      <div className="grow set-profile-text">
        <input className="set-name" maxLength={LIMITS.nameLength} value={s.name} placeholder={tr('Your name', 'Твоё имя')} onChange={(e) => void saveSettings({ name: e.target.value.slice(0, LIMITS.nameLength) })} aria-label={tr('Your name', 'Имя')} />
        <span className="tiny faint">Eternal Helper {RELEASE.name} «{RELEASE.codename}»</span>
      </div>
    </div>
  );
}

function Page({ x, s, onBack }: { x: Section; s: Settings; onBack?: () => void }) {
  const tr = useTr();
  return (
    <motion.div key={x.id} className="set-page" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
      <header className="set-page-head">
        {onBack && (
          <button className="icon-btn" onClick={onBack} aria-label={tr('Back', 'Назад')}>
            <ChevronLeft size={18} />
          </button>
        )}
        <Tile x={x} size={28} />
        <div className="grow">
          <div className="set-page-title">{tr(...x.title)}</div>
          <div className="tiny faint">{tr(...x.desc)}</div>
        </div>
      </header>
      <motion.div className="set-group" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, type: 'spring', stiffness: 340, damping: 30 }}>
        <x.Body s={s} />
      </motion.div>
    </motion.div>
  );
}

function SearchBox({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  const tr = useTr();
  return (
    <label className="settings-search set-search">
      <Search size={14} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search settings', 'Поиск по настройкам')} aria-label={tr('Search settings', 'Поиск по настройкам')} />
      {q && (
        <button className="icon-btn" onClick={() => setQ('')} aria-label={tr('Clear', 'Очистить')}>
          <X size={13} />
        </button>
      )}
    </label>
  );
}

/** Settings inside the island. */
export function SettingsIsland() {
  const tr = useTr();
  const s = useApp((x) => x.settings);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  if (!s) return null;
  const found = q.trim() ? searchSections(q) : null;
  const page = SECTIONS.find((x) => x.id === open);
  return (
    <div className="set-island">
      <AnimatePresence mode="popLayout" initial={false}>
        {page ? (
          <div key="page" className="set-scroll scroll">
            <Page x={page} s={s} onBack={() => setOpen(null)} />
          </div>
        ) : (
          <motion.div key="home" className="set-scroll scroll" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
            <div className="set-top">
              <Profile s={s} compact />
              <button className="chip-btn" onClick={() => (closePanel(), void call('open_window', { kind: 'settings' }))} title={tr('Open in a window', 'Открыть в окне')}>
                <ExternalLink size={13} /> {tr('Window', 'В окне')}
              </button>
            </div>
            <SearchBox q={q} setQ={setQ} />
            {found ? (
              found.length ? (
                found.map((x) => (
                  <div key={x.id} className="set-found">
                    <div className="set-found-head"><Tile x={x} size={22} /> {tr(...x.title)}</div>
                    <div className="set-group"><x.Body s={s} /></div>
                  </div>
                ))
              ) : (
                <p className="muted small">{tr('Nothing found. Try other words.', 'Ничего не найдено. Попробуй другие слова.')}</p>
              )
            ) : (
              <div className="set-cats">
                {SECTIONS.map((x, i) => (
                  <motion.button key={x.id} className="set-cat" onClick={() => setOpen(x.id)} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: i * 0.03, type: 'spring', stiffness: 420, damping: 30 }} style={{ ['--c' as string]: x.color }}>
                    <Tile x={x} />
                    <span className="grow set-cat-text">
                      <span className="set-cat-title">{tr(...x.title)}</span>
                      <span className="tiny faint ellipsis">{tr(...x.desc)}</span>
                    </span>
                    <ChevronRight size={15} className="faint" />
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Settings in their own window: categories down the side, the open page beside them. */
export function SettingsPages() {
  const tr = useTr();
  const s = useApp((x) => x.settings);
  const [active, setActive] = useState(() => {
    const h = location.hash.split('/')[1];
    return SECTIONS.some((x) => x.id === h) ? h : 'look';
  });
  const [q, setQ] = useState('');
  if (!s) return null;
  const found = q.trim() ? searchSections(q) : null;
  const page = SECTIONS.find((x) => x.id === active) ?? SECTIONS[0];
  return (
    <div className="set-window">
      <aside className="set-side" data-tauri-drag-region>
        <Profile s={s} />
        <SearchBox q={q} setQ={setQ} />
        <nav className="set-nav" role="tablist" aria-orientation="vertical">
          {SECTIONS.map((x) => {
            const on = !found && x.id === active;
            return (
              <button key={x.id} role="tab" aria-selected={on} className={`set-nav-item ${on ? 'on' : ''} ${found && !found.includes(x) ? 'dim' : ''}`} onClick={() => (setQ(''), setActive(x.id))}>
                {on && <motion.span layoutId="set-nav-pill" className="set-nav-pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                <Tile x={x} size={26} />
                <span>{tr(...x.title)}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="set-main scroll">
        <AnimatePresence mode="wait" initial={false}>
          {found ? (
            <motion.div key={`q:${q}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {found.length === 0 && <p className="muted">{tr('Nothing found. Try other words.', 'Ничего не найдено. Попробуй другие слова.')}</p>}
              {found.map((x) => (
                <div key={x.id} className="set-found">
                  <div className="set-found-head"><Tile x={x} size={24} /> {tr(...x.title)}</div>
                  <div className="set-group"><x.Body s={s} /></div>
                </div>
              ))}
            </motion.div>
          ) : (
            <Page key={page.id} x={page} s={s} />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
