// Settings inside the island: search, then every section stacked; or open them in a window.
import { ExternalLink, Search } from 'lucide-react';
import { useState } from 'react';
import { call } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { closePanel, useApp } from '../lib/store';
import { Emoji } from '../lib/emoji';
import { searchSections } from '../settings/sections';

export function SettingsTab() {
  const tr = useTr();
  const s = useApp((x) => x.settings);
  const [q, setQ] = useState('');
  if (!s) return null;
  const shown = searchSections(q);
  return (
    <div className="settings scroll">
      <div className="settings-top">
        <label className="settings-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search settings', 'Поиск по настройкам')} aria-label={tr('Search settings', 'Поиск по настройкам')} />
        </label>
        <button className="btn accent" onClick={() => (closePanel(), void call('open_window', { kind: 'settings' }))}>
          <ExternalLink size={14} /> {tr('Open in a window', 'Открыть в окне')}
        </button>
      </div>
      {shown.length === 0 && <p className="muted small">{tr('Nothing found.', 'Ничего не найдено.')}</p>}
      {shown.map((x) => (
        <section key={x.id}>
          <h3>
            <Emoji e={x.emoji} size={14} /> {tr(...x.title)} <span className="h3-desc">· {tr(...x.desc)}</span>
          </h3>
          <x.Body s={s} />
        </section>
      ))}
    </div>
  );
}
