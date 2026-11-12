// The island: one black shape that springs between the pill, a live activity and the full panel.
import { AnimatePresence, motion } from 'framer-motion';
import { springs } from '@eternal/ui';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { MODULES } from '../modules';
import { call, listen } from '../lib/ipc';
import { closePanel, dismissToast, openPanel, pinPanel, useApp, type LibSub, type MainTab } from '../lib/store';
import { panelLayout, type PanelLayout } from '../lib/safeArea';
import { Bubble, PillContent, useActivities } from './Pill';
import { Tabs } from './Tabs';
import { NotchStrip } from './NotchStrip';
import { SafeAreaOverlay } from './SafeAreaOverlay';
import { Rich } from '../lib/emoji';

const PANEL_W = 660;
/** Each tab gets the height it needs; the island springs between them. */
const PANEL_H: Record<MainTab, number> = { home: 350, library: 404, afina: 452, settings: 460 };
const SUB_H: Record<LibSub, number> = { weather: 500, planner: 452, videos: 452, text: 400, timer: 452, calc: 452, translate: 420, wifi: 452, radio: 400 };

/** Normal top padding of the open panel when there's no notch to clear. */
const PANEL_PAD = 10;

function useSize(activity: boolean, notch: { width: number; height: number } | null, panel: boolean, tab: MainTab, sub: LibSub | null, p: PanelLayout) {
  // On a notched display the panel grows by the info strip, so the content keeps its full height below it.
  const h = tab === 'library' && sub ? SUB_H[sub] : PANEL_H[tab];
  if (panel) return { w: PANEL_W, h: h + (p.notch ? p.contentTop - PANEL_PAD : 0), r: 30 };
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
  const prev = useRef(tab);
  // Content slides the way the tabs move, like paging on iOS.
  const dir = MODULES.findIndex((m) => m.id === tab) >= MODULES.findIndex((m) => m.id === prev.current) ? 1 : -1;
  useEffect(() => void (prev.current = tab), [tab]);
  return (
    <motion.div
      className={`panel tabs-${p.tabs}`}
      style={{ paddingTop: p.notch ? p.contentTop : PANEL_PAD }}
      initial={{ opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transition: { delay: 0.06, duration: 0.26, ease: [0.2, 0.9, 0.25, 1] } }}
      exit={{ opacity: 0, scale: 0.97, filter: 'blur(4px)', transition: { duration: 0.1 } }}
      onPointerDown={pinPanel}
    >
      {p.notch && <NotchStrip notch={p.notch} width={PANEL_W} />}
      {p.tabs === 'top' && <Tabs position="top" />}
      <div className="panel-main">
        {p.tabs === 'side' && <Tabs position="side" />}
        <div className="panel-body" role="tabpanel">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} className="panel-anim" custom={dir} initial={{ opacity: 0, x: 18 * dir, filter: 'blur(4px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -12 * dir, filter: 'blur(3px)' }} transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}>
              <Active />
            </motion.div>
          </AnimatePresence>
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

/** Where a live activity's details are. */
function targetFor(a: string | undefined): Parameters<typeof openPanel>[0] {
  return a === 'rec' ? 'videos' : a === 'afina' ? 'afina' : a === 'planner' ? 'planner' : a === 'timer' ? 'library' : undefined;
}

const OPEN_DELAY = 140;
const CLOSE_DELAY = 420;

/**
 * Opens the panel when the cursor rests on the island and closes it when the cursor leaves, without
 * taking the keyboard from the app in front. A click inside "pins" it: then it stays until you click
 * elsewhere, press Escape, or leave it while not typing.
 */
function useHoverOpen(islandRef: React.RefObject<HTMLDivElement>, activity: string | undefined) {
  const hoverOpen = useApp((s) => s.settings?.hoverOpen ?? true);
  const activityRef = useRef(activity);
  activityRef.current = activity;
  useEffect(() => {
    let openT: ReturnType<typeof setTimeout> | undefined;
    let closeT: ReturnType<typeof setTimeout> | undefined;
    let inside = false;
    const typing = () => {
      const a = document.activeElement;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable);
    };
    const enter = () => {
      if (inside) return;
      inside = true;
      clearTimeout(closeT);
      const s = useApp.getState();
      if (s.view === 'panel' || !hoverOpen) return;
      openT = setTimeout(() => {
        // Back on the same tab if it was closed a moment ago; otherwise Home (or the live activity).
        const recent = Date.now() - useApp.getState().closedAt < 20_000;
        openPanel(targetFor(activityRef.current) ?? (recent ? undefined : 'home'), { hover: true });
      }, OPEN_DELAY);
    };
    const leave = () => {
      if (!inside) return;
      inside = false;
      clearTimeout(openT);
      const s = useApp.getState();
      if (s.view !== 'panel') return;
      // A pinned panel waits longer, and never closes under the user's typing.
      closeT = setTimeout(() => {
        const now = useApp.getState();
        if (now.view === 'panel' && !inside && !(now.pinned && typing())) closePanel();
      }, s.pinned ? 900 : CLOSE_DELAY);
    };
    const el = islandRef.current;
    el?.addEventListener('pointerenter', enter);
    el?.addEventListener('pointerleave', leave);
    // A click-through window gets no pointerleave, so Rust also says when the cursor leaves the island.
    const off = listen<boolean>('island://hover', (on) => (on ? undefined : leave()));
    return () => {
      clearTimeout(openT);
      clearTimeout(closeT);
      el?.removeEventListener('pointerenter', enter);
      el?.removeEventListener('pointerleave', leave);
      off();
    };
  }, [hoverOpen, islandRef]);
}

/** A soft light that follows the cursor across the island, set through CSS variables (no re-render). */
function useSheen(ref: React.RefObject<HTMLDivElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    };
    el.addEventListener('pointermove', move);
    return () => (el.removeEventListener('pointermove', move), cancelAnimationFrame(raf));
  }, [ref]);
}

export function Island() {
  const view = useApp((s) => s.view);
  const tab = useApp((s) => s.tab);
  const libSub = useApp((s) => s.libSub);
  const rawLayout = useApp((s) => s.layout);
  const uiScale = useApp((s) => s.settings?.uiScale ?? 1);
  // The island may be scaled (Settings → Personalise); the notch keeps its real size, so in the
  // island's own (scaled) coordinates it is smaller or larger by the same factor.
  const layout = rawLayout && uiScale !== 1 ? { ...rawLayout, topInset: rawLayout.topInset / uiScale, notch: rawLayout.notch && { width: rawLayout.notch.width / uiScale, height: rawLayout.notch.height / uiScale, centerOffset: rawLayout.notch.centerOffset / uiScale } } : rawLayout;
  const activities = useActivities();
  const panel = view === 'panel';
  const notch = layout?.notch ?? null;
  const tabsPref = useApp((s) => s.settings?.tabsPosition);
  const debug = useApp((s) => !!s.settings?.debugSafeAreas);
  const radiusScale = useApp((s) => s.settings?.radius ?? 1);
  const tinted = useApp((s) => s.tab === 'home' && !!s.media?.artwork);
  const baseSize = useSize(activities.length > 0, notch, panel, tab, libSub, panelLayout(layout, tabsPref, PANEL_W));
  const size = { ...baseSize, r: Math.round(baseSize.r * radiusScale) };
  const p = panelLayout(layout, tabsPref, size.w);
  const islandRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  useHitArea([islandRef, bubbleRef, toastRef]);
  useHoverOpen(islandRef, activities[0]);
  useSheen(islandRef);

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
          className={`island ${panel ? 'open' : ''} ${notch && !panel ? 'notch' : ''} ${panel && tinted ? 'tinted' : ''} ${activities.length ? 'live' : ''}`}
          initial={false}
          animate={{ width: size.w, height: size.h, borderRadius: notch && !panel ? `0px 0px ${size.r}px ${size.r}px` : size.r }}
          transition={springs.island}
          whileHover={panel ? undefined : { scale: 1.045, y: 1 }}
          whileTap={panel ? undefined : { scale: 0.97 }}
          onClick={panel ? undefined : () => openPanel(targetFor(activities[0]))}
          role={panel ? 'dialog' : 'button'}
          aria-label="Eternal Helper"
          tabIndex={panel ? -1 : 0}
          onKeyDown={(e) => !panel && (e.key === 'Enter' || e.key === ' ') && openPanel()}
        >
          <span className="sheen" aria-hidden />
          <span className="rim" aria-hidden />
          <AnimatePresence initial={false}>
            {panel ? (
              <Panel key="panel" p={p} />
            ) : (
              <motion.div key={activities[0] ?? 'idle'} className="pill-content" initial={{ opacity: 0, filter: 'blur(4px)', scale: 0.92 }} animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }} exit={{ opacity: 0, filter: 'blur(4px)', scale: 0.92 }} transition={{ duration: 0.2 }}>
                <PillContent activity={activities[0]} notch={notch ? notch.width : 0} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        <AnimatePresence>
          {second && (
            <motion.div ref={bubbleRef} className="side-bubble" style={{ left: `calc(50% + ${size.w / 2 + 8}px)`, height: size.h, width: size.h }} initial={{ scale: 0, opacity: 0, x: -20 }} animate={{ scale: 1, opacity: 1, x: 0 }} exit={{ scale: 0, opacity: 0, x: -20 }} transition={springs.island} onClick={() => openPanel(targetFor(second))}>
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
