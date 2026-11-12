// The island: one black shape that springs between the pill, a live activity and the full panel.
import { AnimatePresence, motion } from 'framer-motion';
import { springs } from '@eternal/ui';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { MODULES } from '../modules';
import { call } from '../lib/ipc';
import { closePanel, dismissToast, openPanel, useApp, type Tab } from '../lib/store';
import { panelLayout, type PanelLayout } from '../lib/safeArea';
import { Bubble, PillContent, useActivities } from './Pill';
import { Tabs } from './Tabs';
import { NotchStrip } from './NotchStrip';
import { SafeAreaOverlay } from './SafeAreaOverlay';
import { Rich } from '../lib/emoji';
import { recentTracks } from '../lib/recent';

const PANEL_W = 720;
/** Each tab gets the height it needs; the island springs between them. */
const PANEL_H: Record<Tab, number> = { home: 372, afina: 470, planner: 420, videos: 420, text: 360, weather: 476, settings: 476 };

/** Normal top padding of the open panel when there's no notch to clear. */
const PANEL_PAD = 10;

function useSize(activity: boolean, notch: { width: number; height: number } | null, panel: boolean, tab: Tab, p: PanelLayout) {
  // On a notched display the panel grows by the info strip, so the content keeps its full height below it.
  // Home grows by one row when there's a "Recently played" strip to show.
  const extra = tab === 'home' && recentTracks().length > 1 ? 88 : 0;
  if (panel) return { w: PANEL_W, h: PANEL_H[tab] + extra + (p.notch ? p.contentTop - PANEL_PAD : 0), r: 28 };
  // Pill "wings" either side of the notch, wide enough for the clock and weather.
  if (notch) return { w: notch.width + (activity ? 260 : 200), h: Math.max(32, notch.height), r: 14 };
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

function Panel({ p }: { p: PanelLayout }) {
  const tab = useApp((s) => s.tab);
  const Active = MODULES.find((m) => m.id === tab)?.tab ?? MODULES[0].tab!;
  return (
    <motion.div
      className={`panel tabs-${p.tabs}`}
      style={{ paddingTop: p.notch ? p.contentTop : PANEL_PAD }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.08 } }}
      exit={{ opacity: 0, transition: { duration: 0.08 } }}
    >
      {p.notch && <NotchStrip notch={p.notch} width={PANEL_W} />}
      {p.tabs === 'top' && <Tabs position="top" />}
      <div className="panel-main">
        {p.tabs === 'side' && <Tabs position="side" />}
        <div className="panel-body" role="tabpanel">
          <Active />
        </div>
      </div>
      {p.tabs === 'bottom' && <Tabs position="bottom" />}
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
            <span>
              <Rich text={x.text} />
            </span>
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
  const tabsPref = useApp((s) => s.settings?.tabsPosition);
  const debug = useApp((s) => !!s.settings?.debugSafeAreas);
  const radiusScale = useApp((s) => s.settings?.radius ?? 1);
  const tinted = useApp((s) => s.tab === 'home' && !!s.media?.artwork);
  const baseSize = useSize(activities.length > 0, notch, panel, tab, panelLayout(layout, tabsPref, PANEL_W));
  const size = { ...baseSize, r: Math.round(baseSize.r * radiusScale) };
  const p = panelLayout(layout, tabsPref, size.w);
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
          className={`island ${panel ? 'open' : ''} ${notch && !panel ? 'notch' : ''} ${panel && tinted ? 'tinted' : ''}`}
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
              <Panel key="panel" p={p} />
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
        {debug && <SafeAreaOverlay p={p} width={size.w} height={size.h} panel={panel} />}
      </div>
      <Toasts innerRef={toastRef} />
    </div>
  );
}
