// A panel tab opened in its own window ("pop out"): our own title bar, roomy padding, a soft fade-in.
import { motion } from 'framer-motion';
import { ALL_MODULES } from '../modules';
import { useT } from '../lib/i18n';
import { useApp } from '../lib/store';
import { Rich } from '../lib/emoji';
import type { Tab } from '../lib/store';
import { TitleBar } from '../components/TitleBar';
import { Boundary } from '../components/Boundary';

export function PopOut({ tab }: { tab: Tab }) {
  const t = useT();
  const m = ALL_MODULES.find((x) => x.id === tab) ?? ALL_MODULES[0];
  const Body = m.tab!;
  const Icon = m.icon!;
  const toasts = useApp((x) => x.toasts);
  return (
    <div className="popout">
      <TitleBar>
        <span className="popout-ic"><Icon size={14} /></span>
        <span>{t(m.name)}</span>
      </TitleBar>
      <motion.div className="popout-body" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}>
        <Boundary name={m.id}>
          <Body />
        </Boundary>
      </motion.div>
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
