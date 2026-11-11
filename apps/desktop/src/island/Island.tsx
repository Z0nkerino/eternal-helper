// The island: one black shape that springs between the pill, a live activity and the full panel.
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { springs } from '@eternal/ui';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { MODULES } from '../modules';
import { call } from '../lib/ipc';
import { useT } from '../lib/i18n';
import { closePanel, dismissToast, openPanel, useApp, type Tab } from '../lib/store';
import { Bubble, PillContent, useActivities } from './Pill';

const PANEL_W = 720;
/** Each tab gets the height it needs; the island springs between them. */
const PANEL_H: Record<Tab, number> = { home: 336, afina: 470, planner: 420, videos: 420, text: 360, settings: 476 };

function useSize(activity: boolean, notch: { width: number; height: number } | null, panel: boolean, tab: Tab) {
  if (panel) return { w: PANEL_W, h: PANEL_H[tab], r: 28 };
  if (notch) return { w: notch.width + (activity ? 220 : 160), h: Math.max(32, notch.height), r: 14 };
  return activity ? { w: 290, h: 38, r: 19 } : { w: 200, h: 34, r: 17 };
}

/** Tells Rust which part of the window is clickable; everything else passes clicks through. */
function useHitArea(refs: React.RefObject<HTMLElement>[]) {
  useLayoutEffect(() => {
    let last = '';
    const report = () => {
      const rects = refs.map((r) => r.current?.getBoundingClientRect()).filter((r): r is DOMRect => !!r && r.width > 0);
      if (!rects.length) return;
      const x = Math.min(...rects.map((r) => r.left)) - 4;
      const y = Math.min(...rects.map((r) => r.top)) - 4;
      const w = Math.max(...rects.map((r) => r.right)) + 4 - x;
      const h = Math.max(...rects.map((r) => r.bottom)) + 4 - y;
      const key = [x, y, w, h].map(Math.round).join(',');
      if (key !== last) {
        last = key;
        void call('island_set_hit', { x, y, w, h });
      }
    };
    const ro = new ResizeObserver(report);
    refs.forEach((r) => r.current && ro.observe(r.current));
    report();
    return () => ro.disconnect();
  });
}

function Panel() {
  const t = useT();
  const tab = useApp((s) => s.tab);
  const Active = MODULES.find((m) => m.id === tab)?.tab ?? MODULES[0].tab!;
  return (
    <motion.div className="panel" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.08 } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>
      <nav className="tabs" role="tablist">
        {MODULES.map((m) => {
          const Icon = m.icon!;
          return (
            <button key={m.id} role="tab" aria-selected={tab === m.id} className={tab === m.id ? 'on' : ''} onClick={() => openPanel(m.id)}>
              <Icon size={15} />
              <span>{t(m.name)}</span>
              {tab === m.id && <motion.span layoutId="tab-pill" className="tab-pill" transition={springs.snappy} />}
            </button>
          );
        })}
        <div className="grow" />
        <button className="icon-btn" aria-label={t('close')} onClick={closePanel}>
          <X size={16} />
        </button>
      </nav>
      <div className="panel-body" role="tabpanel">
        <Active />
      </div>
    </motion.div>
  );
}

function Toasts({ innerRef }: { innerRef: React.RefObject<HTMLDivElement> }) {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" ref={innerRef} aria-live="polite">
      <AnimatePresence>
        {toasts.map((x) => (
          <motion.div
            key={x.id}
            layout
            className={`toast ${x.tone ?? ''}`}
            initial={{ opacity: 0, y: -18, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.94 }}
            transition={springs.soft}
          >
            <span>{x.text}</span>
            {x.action && (
              <button
                className="toast-action"
                onClick={() => {
                  x.action!.run();
                  dismissToast(x.id);
                }}
              >
                {x.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Island() {
  const view = useApp((s) => s.view);
  const tab = useApp((s) => s.tab);
  const layout = useApp((s) => s.layout);
  const activities = useActivities();
  const panel = view === 'panel';
  const notch = layout?.notch ?? null;
  const size = useSize(activities.length > 0, notch, panel, tab);
  const islandRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  useHitArea([islandRef, bubbleRef, toastRef]);

  // Escape closes; clicking anywhere else (the window loses focus) closes too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePanel();
    const onBlur = () => useApp.getState().view === 'panel' && closePanel();
    addEventListener('keydown', onKey);
    addEventListener('blur', onBlur);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('blur', onBlur);
    };
  }, []);

  const second = !panel ? activities[1] : undefined;
  const top = (layout?.topInset ?? 0) + (notch ? 0 : 6);

  return (
    <div className="stage" style={{ paddingTop: top }}>
      <div className="island-row">
        <motion.div
          ref={islandRef}
          className={`island ${panel ? 'open' : ''} ${notch && !panel ? 'notch' : ''}`}
          initial={false}
          animate={{ width: size.w, height: size.h, borderRadius: notch && !panel ? `0px 0px ${size.r}px ${size.r}px` : size.r }}
          transition={springs.island}
          whileHover={panel ? undefined : { scale: 1.03 }}
          onClick={panel ? undefined : () => openPanel(activities[0] === 'rec' ? 'videos' : activities[0] === 'afina' ? 'afina' : activities[0] === 'planner' ? 'planner' : undefined)}
          role={panel ? 'dialog' : 'button'}
          aria-label="Eternal Helper"
          tabIndex={panel ? -1 : 0}
        >
          <AnimatePresence initial={false}>
            {panel ? (
              <Panel key="panel" />
            ) : (
              <motion.div key={activities[0] ?? 'idle'} className="pill-content" initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, filter: 'blur(4px)' }} transition={{ duration: 0.18 }}>
                <PillContent activity={activities[0]} notch={notch ? notch.width : 0} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        <AnimatePresence>
          {second && (
            <motion.div ref={bubbleRef} className="side-bubble" style={{ left: `calc(50% + ${size.w / 2 + 8}px)`, height: size.h, width: size.h }} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={springs.island} onClick={() => openPanel()}>
              <Bubble activity={second} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Toasts innerRef={toastRef} />
    </div>
  );
}
