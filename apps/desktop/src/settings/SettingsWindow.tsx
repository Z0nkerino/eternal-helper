// Settings in their own window (see SettingsUI.tsx): categories at the side, the open page beside them.
// Every change applies to the island at once.
import { useApp } from '../lib/store';
import { Rich } from '../lib/emoji';
import { TitleBar } from '../components/TitleBar';
import { SettingsPages } from './SettingsUI';

export function SettingsWindow() {
  const toasts = useApp((x) => x.toasts);
  return (
    <div className="settings-window v2">
      <TitleBar className="floating" />
      <SettingsPages />
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
