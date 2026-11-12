// Settings inside the island: every section stacked, plus a button to open them in a window.
import { ExternalLink } from 'lucide-react';
import { call } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { closePanel, useApp } from '../lib/store';
import { Emoji } from '../lib/emoji';
import { SECTIONS } from '../settings/sections';

export function SettingsTab() {
  const tr = useTr();
  const s = useApp((x) => x.settings);
  if (!s) return null;
  return (
    <div className="settings scroll">
      <button className="btn accent open-settings" onClick={() => (closePanel(), void call('open_window', { kind: 'settings' }))}>
        <ExternalLink size={14} /> {tr('Open settings in a window', 'Открыть настройки в окне')}
      </button>
      {SECTIONS.map((x) => (
        <section key={x.id}>
          <h3>
            <Emoji e={x.emoji} size={14} /> {tr(...x.title)}
          </h3>
          <x.Body s={s} />
        </section>
      ))}
    </div>
  );
}
