// Settings in their own window: a sidebar of sections. Changes apply to the island immediately.
import { useState } from 'react';
import { useTr } from '../lib/i18n';
import { useApp } from '../lib/store';
import { Emoji, Rich } from '../lib/emoji';
import { SECTIONS } from './sections';

export function SettingsWindow() {
  const tr = useTr();
  const s = useApp((x) => x.settings);
  const [active, setActive] = useState(() => location.hash.split('/')[1] || 'general');
  const toasts = useApp((x) => x.toasts);
  if (!s) return null;
  const section = SECTIONS.find((x) => x.id === active) ?? SECTIONS[0];
  return (
    <div className="settings-window">
      <aside className="settings-nav" role="tablist" aria-orientation="vertical">
        <div className="settings-brand">
          <img src="/helper.svg" width={28} height={28} alt="" />
          <div>
            <div className="brand-name">Eternal Helper</div>
            <div className="faint tiny">Eternal Inc.</div>
          </div>
        </div>
        {SECTIONS.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === section.id} className={`nav-item ${x.id === section.id ? 'on' : ''}`} onClick={() => setActive(x.id)}>
            <Emoji e={x.emoji} size={18} />
            <span>{tr(...x.title)}</span>
          </button>
        ))}
      </aside>
      <main className="settings-main scroll" role="tabpanel">
        <h2>
          <Emoji e={section.emoji} size={26} /> {tr(...section.title)}
        </h2>
        <section className="settings">
          <section.Body s={s} />
        </section>
      </main>
      <div className="window-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone ?? ''}`}>
            <span><Rich text={t.text} /></span>
            {t.action && <button className="toast-action" onClick={t.action.run}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
