// The panel's four tabs as an iOS-style segmented control: a glass pill slides to the active tab and a
// softer one follows the cursor. Placed on top, at the bottom or as a side column (away from a notch).
import { motion } from 'framer-motion';
import { ExternalLink, X } from 'lucide-react';
import { springs } from '@eternal/ui';
import { useState } from 'react';
import { MODULES } from '../modules';
import { useT, useTr } from '../lib/i18n';
import { call } from '../lib/ipc';
import { closePanel, openPanel, useApp } from '../lib/store';
import type { TabsPosition } from '../lib/safeArea';

export function Tabs({ position }: { position: TabsPosition }) {
  const t = useT();
  const tr = useTr();
  const tab = useApp((s) => s.tab);
  const libSub = useApp((s) => s.libSub);
  const [hover, setHover] = useState<string | null>(null);
  const side = position === 'side';

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = side ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = MODULES.findIndex((m) => m.id === tab);
    const next = MODULES[(i + (e.key === keys[1] ? 1 : MODULES.length - 1)) % MODULES.length];
    openPanel(next.id);
    requestAnimationFrame(() => (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  };

  return (
    <nav className={`tabbar tabbar-${position}`}>
      <div className="seg" role="tablist" aria-orientation={side ? 'vertical' : 'horizontal'} onKeyDown={onKeyDown} onMouseLeave={() => setHover(null)}>
        {MODULES.map((m) => {
          const Icon = m.icon!;
          const on = tab === m.id;
          const label = t(m.name);
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={on}
              aria-label={label}
              title={side ? label : undefined}
              tabIndex={on ? 0 : -1}
              className={`seg-tab ${on ? 'on' : ''}`}
              onClick={() => (on && m.id === 'library' && libSub ? useApp.setState({ libSub: null }) : openPanel(m.id))}
              onMouseEnter={() => setHover(m.id)}
            >
              {hover === m.id && !on && <motion.span layoutId="seg-hover" className="seg-hover" transition={springs.snappy} />}
              {on && <motion.span layoutId="seg-pill" className="seg-pill" transition={springs.snappy} />}
              <Icon size={15} aria-hidden />
              {!side && <span className="seg-label">{label}</span>}
            </button>
          );
        })}
      </div>
      <div className="tabbar-actions">
        <button className="icon-btn" aria-label={tr('Open in a window', 'Открыть в отдельном окне')} title={tr('Open in a window', 'Открыть в отдельном окне')} onClick={() => (closePanel(), void call('open_window', { kind: tab === 'library' && libSub && ['weather', 'planner', 'videos', 'text'].includes(libSub) ? libSub : tab }))}>
          <ExternalLink size={14} />
        </button>
        <button className="icon-btn" aria-label={t('close')} onClick={closePanel}>
          <X size={15} />
        </button>
      </div>
    </nav>
  );
}
