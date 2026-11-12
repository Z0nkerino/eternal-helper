// The panel's tab bar: icons with a label on hover (the active tab shows its label in the pill),
// placed on top, at the bottom or as a side column. Too many tabs scroll sideways with faded edges.
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { springs } from '@eternal/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MODULES } from '../modules';
import { useT } from '../lib/i18n';
import { closePanel, openPanel, useApp } from '../lib/store';
import type { TabsPosition } from '../lib/safeArea';

export function Tabs({ position }: { position: TabsPosition }) {
  const t = useT();
  const tab = useApp((s) => s.tab);
  const scroller = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ start: false, end: false });
  // One tooltip for the whole bar, drawn outside the scroller so it is never clipped.
  const [tip, setTip] = useState<{ label: string; x: number; y: number } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout>>();
  const showTip = (el: HTMLElement, label: string) => {
    clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => {
      const nav = el.closest('nav')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setTip({ label, x: side ? r.right - nav.left + 8 : r.left - nav.left + r.width / 2, y: side ? r.top - nav.top + r.height / 2 : 0 });
    }, 250);
  };
  const hideTip = () => {
    clearTimeout(tipTimer.current);
    setTip(null);
  };
  const side = position === 'side';

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const [pos, size, view] = side ? [el.scrollTop, el.scrollHeight, el.clientHeight] : [el.scrollLeft, el.scrollWidth, el.clientWidth];
    setFade({ start: pos > 2, end: pos + view < size - 2 });
  }, [side]);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (scroller.current) ro.observe(scroller.current);
    return () => ro.disconnect();
  }, [measure]);

  // Keep the active tab in view when it changes (keyboard, Afina, tray menu…).
  useEffect(() => {
    scroller.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = side ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = MODULES.findIndex((m) => m.id === tab);
    const next = MODULES[(i + (e.key === keys[1] ? 1 : MODULES.length - 1)) % MODULES.length];
    openPanel(next.id);
    requestAnimationFrame(() => scroller.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  };

  return (
    <nav className={`tabbar tabbar-${position}`}>
      <div
        ref={scroller}
        className={`tabs-scroll ${fade.start ? 'fade-start' : ''} ${fade.end ? 'fade-end' : ''}`}
        role="tablist"
        aria-orientation={side ? 'vertical' : 'horizontal'}
        onScroll={() => (measure(), hideTip())}
        onKeyDown={onKeyDown}
        onWheel={(e) => {
          // A plain mouse wheel scrolls the row sideways.
          if (!side && scroller.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) scroller.current.scrollLeft += e.deltaY;
        }}
      >
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
              tabIndex={on ? 0 : -1}
              className={`tab ${on ? 'on' : ''}`}
              onClick={() => (hideTip(), openPanel(m.id))}
              onMouseEnter={(e) => !on && showTip(e.currentTarget, label)}
              onMouseLeave={hideTip}
              onFocus={(e) => !on && showTip(e.currentTarget, label)}
              onBlur={hideTip}
            >
              {on && <motion.span layoutId="tab-pill" className="tab-pill" transition={springs.snappy} />}
              <Icon size={16} aria-hidden />
              {on && !side && <span className="tab-label">{label}</span>}
            </button>
          );
        })}
      </div>
      {tip && (
        <span className={`tab-tip tip-${position}`} style={side ? { left: tip.x, top: tip.y } : { left: tip.x }} aria-hidden>
          {tip.label}
        </span>
      )}
      <button className="icon-btn tab-close" aria-label={t('close')} onClick={closePanel}>
        <X size={16} />
      </button>
    </nav>
  );
}
