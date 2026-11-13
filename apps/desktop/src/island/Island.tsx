// The island: one black shape that springs between the pill, a live activity and the full panel.
import { AnimatePresence, motion } from 'framer-motion';
import { springs } from '@eternal/ui';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { MODULES } from '../modules';
import { call, inTauri, listen } from '../lib/ipc';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { closePanel, dismissToast, openPanel, pinPanel, useApp, type LibSub, type MainTab } from '../lib/store';
import { panelLayout, type PanelLayout } from '../lib/safeArea';
import { Bubble, PillContent, useActivities } from './Pill';
import { Tabs } from './Tabs';
import { Boundary } from '../components/Boundary';
import { Sheet, UpdateRequired } from './Sheets';
import { useHomeWidgets } from '../tabs/HomeTab';
import { homeHeight } from '../home/widgets';
import { useCoverTint } from '../music/hooks';
import { startBeat } from '../lib/beat';
import { useRadio } from '../radio/player';
import { NotchStrip } from './NotchStrip';
import { SafeAreaOverlay } from './SafeAreaOverlay';
import { Rich } from '../lib/emoji';

const PANEL_W = 660;
/** Each tab gets the height it needs; the island springs between them. */
const PANEL_H: Record<MainTab, number> = { home: 350, music: 420, library: 404, ai: 300, settings: 470 };
const SUB_H: Record<LibSub, number> = { weather: 500, planner: 452, videos: 452, text: 470, timer: 452, calc: 452, translate: 480, wifi: 452, radio: 400 };

/** Normal top padding of the open panel when there's no notch to clear. */
const PANEL_PAD = 10;

function useSize(activity: boolean, notch: { width: number; height: number } | null, panel: boolean, tab: MainTab, sub: LibSub | null, p: PanelLayout, homeH: number) {
  // On a notched display the panel grows by the info strip, so the content keeps its full height below it.
  const sheet = useApp.getState().sheet;
  if (panel && useApp.getState().update?.available) return { w: 460, h: 300 + (p.notch ? p.contentTop - PANEL_PAD : 0), r: 30 };
  const h = sheet ? Math.max(470, tab === 'home' ? homeH : PANEL_H[tab]) : tab === 'library' && sub ? SUB_H[sub] : tab === 'home' ? homeH : PANEL_H[tab];
  if (panel) return { w: PANEL_W, h: h + (p.notch ? p.contentTop - PANEL_PAD : 0), r: 30 };
  // Pill "wings" either side of the notch, wide enough for the clock and weather.
  if (notch) return { w: notch.width + (activity ? 260 : 200), h: Math.max(32, notch.height), r: 14 };
  return activity ? { w: 290, h: 38, r: 19 } : { w: 200, h: 34, r: 17 };
}

/** Tells Rust which part of the window is clickable; everything else passes clicks through. */
function useHitArea(refs: React.RefObject<HTMLElement>[]) {
  const pressing = useApp((s) => s.pressing);
  useLayoutEffect(() => {
    let last = '';
    const report = () => {
      // While the mouse button is held on the island (starting a drag), the whole window keeps the mouse,
      // so moving off the small pill doesn't hand the press to the desktop underneath.
      if (useApp.getState().pressing) {
        const key = `all:${innerWidth}x${innerHeight}`;
        if (key !== last) (last = key), void call('island_set_hit', { x: 0, y: 0, w: innerWidth, h: innerHeight });
        return;
      }
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
  }, [pressing, ...refs.map((r) => r.current)]);
}

function Panel({ p }: { p: PanelLayout }) {
  const tab = useApp((s) => s.tab);
  const required = useApp((s) => !!s.update?.available);
  const Active = MODULES.find((m) => m.id === tab)?.tab ?? MODULES[0].tab!;
  const prev = useRef(tab);
  // Content slides the way the tabs move, like paging on iOS.
  const dir = MODULES.findIndex((m) => m.id === tab) >= MODULES.findIndex((m) => m.id === prev.current) ? 1 : -1;
  useEffect(() => void (prev.current = tab), [tab]);
  return (
    <motion.div
      className={`panel tabs-${p.tabs}`}
      style={{ paddingTop: p.notch ? p.contentTop : PANEL_PAD }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1, transition: { delay: 0.06, duration: 0.24, ease: [0.25, 0.1, 0.25, 1] } }}
      exit={{ opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
      onPointerDown={pinPanel}
    >
      {p.notch && <NotchStrip notch={p.notch} width={PANEL_W} />}
      {required && <UpdateRequired />}
      {!required && p.tabs === 'top' && <Tabs position="top" />}
      <div className="panel-main" style={required ? { display: 'none' } : undefined}>
        {p.tabs === 'side' && <Tabs position="side" />}
        <div className="panel-body" role="tabpanel">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div key={tab} className="panel-anim" custom={dir} initial={{ opacity: 0, x: 8 * dir }} animate={{ opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] } }} exit={{ opacity: 0, transition: { duration: 0.1, ease: 'easeIn' } }}>
              <Boundary name={tab}>
                <Active />
              </Boundary>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {!required && p.tabs === 'bottom' && <Tabs position="bottom" />}
      <AnimatePresence>
        <Sheet />
      </AnimatePresence>
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
            initial={{ opacity: 0, y: -12, scale: 0.94 }}
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
  return a === 'rec' ? 'videos' : a === 'afina' ? 'ai' : a === 'planner' ? 'planner' : a === 'timer' ? 'library' : a === 'media' ? 'music' : undefined;
}

const OPEN_DELAY = 250;
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
      if (s.view === 'panel' || !hoverOpen || s.moving) return;
      openT = setTimeout(() => {
        // Pressing the pill (to drag it) cancels opening.
        if (useApp.getState().moving || useApp.getState().pressing) return;
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

/**
 * Liquid glass: the island leans toward the cursor, squishes when pressed (with a ripple of light where
 * you touched), wobbles like gel when it opens, closes or changes tab, and pulses with the music's beat.
 * Everything runs through CSS variables and individual transform properties, so React never re-renders
 * for it and it composes with the island's own size spring.
 */
function useLiquid(islandRef: React.RefObject<HTMLDivElement>, outerRef: React.RefObject<HTMLDivElement>, beatRef: React.RefObject<HTMLDivElement>) {
  const on = useApp((s) => (s.settings as unknown as { liquid?: { enabled?: boolean } })?.liquid?.enabled !== false && s.settings?.motion !== 'reduced');
  useEffect(() => {
    const el = islandRef.current;
    const outer = outerRef.current;
    if (!el || !outer || !on) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const nx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width / 2)));
        const ny = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (r.height / 2)));
        // An open panel only leans a little; the small pill follows the cursor more.
        const k = useApp.getState().view === 'panel' ? 0.35 : 1;
        outer.style.setProperty('--jx', (nx * k).toFixed(3));
        outer.style.setProperty('--jy', (ny * k).toFixed(3));
        outer.style.setProperty('--hov', '1');
      });
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      outer.style.setProperty('--jx', '0');
      outer.style.setProperty('--jy', '0');
      outer.style.setProperty('--hov', '0');
      outer.style.setProperty('--press', '0');
    };
    const down = (e: PointerEvent) => {
      outer.style.setProperty('--press', '1');
      const r = el.getBoundingClientRect();
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.style.left = `${e.clientX - r.left}px`;
      dot.style.top = `${e.clientY - r.top}px`;
      el.appendChild(dot);
      setTimeout(() => dot.remove(), 750);
    };
    const up = () => outer.style.setProperty('--press', '0');
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', down);
    addEventListener('pointerup', up);
    const offHover = listen<boolean>('island://hover', (h) => !h && leave());
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', down);
      removeEventListener('pointerup', up);
      offHover();
    };
  }, [islandRef, outerRef, on]);
  // The beat.
  useEffect(() => {
    if (!on) return;
    return startBeat(() => beatRef.current, {
      playing: () => !!useApp.getState().media?.playing && useApp.getState().settings?.liquid?.beat !== false,
      local: () => {
        if (useApp.getState().mediaSource.kind !== 'radio') return null;
        const lv = useRadio.getState().levels;
        return lv.length ? Math.min(1, (lv[0] * 1.4 + lv[1]) / 2) : null;
      },
    });
  }, [beatRef, on]);
}

/**
 * Grab the closed pill and drag it anywhere: the whole island window moves with the system's own drag,
 * and where it is dropped is saved (dropped near the top centre, it goes back home).
 */
function useMovable(islandRef: React.RefObject<HTMLDivElement>) {
  const moved = useRef(false);
  useEffect(() => {
    const el = islandRef.current;
    if (!el || !inTauri) return;
    let start: { x: number; y: number } | null = null;
    let offMoved: (() => void) | undefined;
    let saveT: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      const r = el.getBoundingClientRect();
      void call('island_save_pos', { px: r.left + r.width / 2, py: r.top }).finally(() => setTimeout(() => useApp.setState({ moving: false, pressing: false }), 200));
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // The open island can be grabbed by its tab bar (anywhere that isn't a button).
      const t = e.target as HTMLElement;
      if (useApp.getState().view === 'panel' && (!t.closest('.tabbar') || t.closest('button'))) return;
      start = { x: e.clientX, y: e.clientY };
      moved.current = false;
      useApp.setState({ pressing: true });
    };
    const move = (e: PointerEvent) => {
      if (!start || moved.current || Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      moved.current = true;
      start = null;
      useApp.setState({ moving: true });
      if (useApp.getState().view === 'panel') closePanel();
      const win = getCurrentWindow();
      // Save once the window stops moving (macOS returns from startDragging at once; Windows when dropped).
      void win.onMoved(() => (clearTimeout(saveT), (saveT = setTimeout(save, 450)))).then((f) => (offMoved = f));
      void win.startDragging().then(() => (clearTimeout(saveT), (saveT = setTimeout(save, 120))));
      setTimeout(() => offMoved?.(), 8000);
    };
    const up = () => {
      start = null;
      // During a drag the window keeps the mouse until the new place is saved.
      if (useApp.getState().pressing && !useApp.getState().moving) useApp.setState({ pressing: false });
    };
    el.addEventListener('pointerdown', down);
    // Movement is followed on the whole window: a quick flick leaves the pill at once.
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('blur', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('blur', up);
      offMoved?.();
      clearTimeout(saveT);
    };
  }, [islandRef]);
  return moved;
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
  useApp((s) => s.sheet); // re-size when a sheet opens or closes
  useApp((s) => !!s.update?.available);
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
  const playing = useApp((s) => !!s.media?.playing);
  const art = useApp((s) => s.media?.artwork);
  useCoverTint(playing ? art : null);
  const homeIds = useHomeWidgets();
  // Home fits its widget rows (66 = tab bar and padding); never shorter than two rows, so the gallery fits.
  const homeH = Math.max(homeHeight(homeIds), 228) + 66;
  const baseSize = useSize(activities.length > 0, notch, panel, tab, libSub, panelLayout(layout, tabsPref, PANEL_W), homeH);
  const size = { ...baseSize, r: Math.round(baseSize.r * radiusScale) };
  const p = panelLayout(layout, tabsPref, size.w);
  const islandRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  useHitArea([islandRef, bubbleRef, toastRef]);
  useHoverOpen(islandRef, activities[0]);
  useSheen(islandRef);
  const outerRef = useRef<HTMLDivElement>(null);
  const beatRef = useRef<HTMLDivElement>(null);
  useLiquid(islandRef, outerRef, beatRef);
  const dragged = useMovable(islandRef);
  const bottom = !!layout?.bottom;

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
    <div className={`stage ${bottom ? 'bottom' : ''}`} style={bottom ? { paddingBottom: 6 } : { paddingTop: top }}>
      <div className="island-row">
        {/* A soft glow behind the island: breathes in the cover's colour while music plays. */}
        <motion.span className={`island-glow ${playing ? 'music' : ''} ${activities.length ? 'on' : ''} ${panel ? 'open' : ''}`} initial={false} animate={{ width: size.w, height: size.h }} transition={springs.island} aria-hidden />
        <div className="liquid" ref={outerRef}>
        <div className={`beat-layer ${playing ? 'on' : ''}`} ref={beatRef}>
        <motion.div
          ref={islandRef}
          className={`island ${panel ? 'open' : ''} ${notch && !panel ? 'notch' : ''} ${panel && tinted ? 'tinted' : ''} ${activities.length ? 'live' : ''}`}
          initial={false}
          animate={{ width: size.w, height: size.h, borderRadius: notch && !panel ? `0px 0px ${size.r}px ${size.r}px` : size.r }}
          transition={springs.island}
          onClick={panel ? undefined : () => (dragged.current ? (dragged.current = false) : openPanel(targetFor(activities[0])))}
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
              <motion.div key={activities[0] ?? 'idle'} className="pill-content" initial={{ opacity: 0, scale: 0.9, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -4 }} transition={{ type: 'spring', stiffness: 500, damping: 34 }}>
                <PillContent activity={activities[0]} notch={notch ? notch.width : 0} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        </div>
        </div>
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
