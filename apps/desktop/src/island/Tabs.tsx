// The panel's four tabs as an iOS-style segmented control: a glass pill slides to the active tab and a
// softer one follows the cursor. Placed on top, at the bottom or as a side column (away from a notch).
import { motion } from 'framer-motion';
import { ExternalLink, X } from 'lucide-react';
import { springs } from '@eternal/ui';
import { useLayoutEffect, useRef, useState } from 'react';
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
  const update = useApp((s) => !!s.update?.available);
  const side = position === 'side';
  // When all six labels don't fit (longer words in Russian, bigger text), only the active tab keeps its
  // label and the others show just their icon — the bar never spills out of the island.
  const seg = useRef<HTMLDivElement>(null);
  const font = useApp((s) => s.settings?.fontScale ?? 1);
  const [compact, setCompact] = useState(false);
  const labels = MODULES.map((m) => t(m.name)).join('|');
  useLayoutEffect(() => {
    const el = seg.current;
    const bar = el?.parentElement;
    if (!el || !bar || side) return;
    // The width all labels need, measured from the text itself (not the bar, which is still growing
    // while the island opens), compared with the room the bar has now.
    const ctx = document.createElement('canvas').getContext('2d');
    const check = () => {
      const tab = el.querySelector<HTMLElement>('.seg-tab');
      if (!ctx || !tab) return;
      const cs = getComputedStyle(tab);
      ctx.font = `500 ${cs.fontSize} ${cs.fontFamily}`;
      const need = labels.split('|').reduce((n, l) => n + ctx.measureText(l).width + 15 + 6 + 26 + 2, 8);
      const actions = bar.querySelector<HTMLElement>('.tabbar-actions')?.offsetWidth ?? 0;
      setCompact(need > bar.clientWidth - actions - 12);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [labels, font, side]);
  const SUBS = ['weather', 'calendar', 'notes', 'shelf', 'notify', 'videos', 'text'];

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
      <div ref={seg} className={`seg ${compact ? 'compact' : ''}`} role="tablist" aria-orientation={side ? 'vertical' : 'horizontal'} onKeyDown={onKeyDown} onMouseLeave={() => setHover(null)}>
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
              title={side || (compact && !on) ? label : undefined}
              tabIndex={on ? 0 : -1}
              className={`seg-tab ${on ? 'on' : ''}`}
              onClick={() => (on && m.id === 'library' && libSub ? useApp.setState({ libSub: null }) : openPanel(m.id))}
              onMouseEnter={() => setHover(m.id)}
            >
              {hover === m.id && !on && <motion.span layoutId="seg-hover" className="seg-hover" transition={springs.snappy} />}
              {on && <motion.span layoutId="seg-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }} />}
              <Icon size={15} aria-hidden />
              {!side && !(compact && !on) && <span className="seg-label">{label}</span>}
              {m.id === 'settings' && update && <span className="seg-dot" aria-label="update" />}
            </button>
          );
        })}
      </div>
      <div className="tabbar-actions">
        {/* Chats live over the panel, so they have no window of their own; Library tools without a screen stay in the island. */}
        {tab !== 'ai' && (
          <button className="icon-btn" aria-label={tr('Open in a window', 'Открыть в отдельном окне')} title={tr('Open in a window', 'Открыть в отдельном окне')} onClick={() => (closePanel(), void call('open_window', { kind: tab === 'library' && libSub && SUBS.includes(libSub) ? libSub : tab }).catch(() => undefined))}>
            <ExternalLink size={14} />
          </button>
        )}
        <button className="icon-btn" aria-label={t('close')} onClick={closePanel}>
          <X size={15} />
        </button>
      </div>
    </nav>
  );
}
