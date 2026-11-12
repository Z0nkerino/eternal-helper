// A panel tab opened in its own window ("pop out").
import { ALL_MODULES } from '../modules';
import { useT } from '../lib/i18n';
import { useApp } from '../lib/store';
import { Rich } from '../lib/emoji';
import type { Tab } from '../lib/store';

export function PopOut({ tab }: { tab: Tab }) {
  const t = useT();
  const m = ALL_MODULES.find((x) => x.id === tab) ?? ALL_MODULES[0];
  const Body = m.tab!;
  const Icon = m.icon!;
  const toasts = useApp((x) => x.toasts);
  return (
    <div className="popout">
      <header className="popout-head">
        <Icon size={16} /> <span>{t(m.name)}</span>
      </header>
      <div className="popout-body">
        <Body />
      </div>
      <div className="window-toasts" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast ${x.tone ?? ''}`}>
            <span><Rich text={x.text} /></span>
            {x.action && <button className="toast-action" onClick={x.action.run}>{x.action.label}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
