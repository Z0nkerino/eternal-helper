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
import { DropSplit, useFileDrop } from './DropSplit';
import { LiquidBurst } from './LiquidBurst';

const PANEL_W = 660;
/** Each tab gets the height it needs; the island springs between them. */
const PANEL_H: Record<MainTab, number> = { home: 350, music: 500, time: 486, library: 470, ai: 560, settings: 470 };
const SUB_H: Record<LibSub, number> = { weather: 500, calendar: 470, notes: 500, shelf: 460, notify: 480, videos: 500, text: 470, timer: 452, calc: 452, translate: 500, wifi: 452, radio: 400 };

/** Normal top padding of the open panel when there's no notch to clear. */
const PANEL_PAD = 10;

export type IslandShape = 'island' | 'notch' | 'capsule' | 'mini' | 'frost';
export const ISLAND_SHAPES: IslandShape[] = ['island', 'notch', 'capsule', 'mini', 'frost'];

function useSize(activity: boolean, notch: { width: number; height: number } | null, panel: boolean, tab: MainTab, sub: LibSub | null, p: PanelLayout, homeH: number, shape: IslandShape = 'island', dropping = false) {
  if (dropping) return { w: 470, h: 124, r: 34 };
  // On a notched display the panel grows by the info strip, so the content keeps its full height below it.
  const sheet = useApp.getState().sheet;
  if (panel && useApp.getState().update?.available) return { w: 460, h: 300 + (p.notch ? p.contentTop - PANEL_PAD : 0), r: 30 };
  const base = sheet ? Math.max(470, tab === 'home' ? homeH : PANEL_H[tab]) : tab === 'library' && sub ? SUB_H[sub] : tab === 'home' ? homeH : PANEL_H[tab];
  // Bigger text needs a bit more room; but the panel never grows past the island's window (it would be cut off).
  const font = useApp.getState().settings?.fontScale ?? 1;
  const ui = useApp.getState().settings?.uiScale ?? 1;
  const extra = p.notch ? p.contentTop - PANEL_PAD : 0;
  const room = (typeof innerHeight === 'number' && innerHeight > 200 ? innerHeight : 760) / ui - 24;
  const h = Math.min(Math.round(base * (1 + Math.max(0, font - 1) * 0.6)) + extra, Math.max(300, room));
  if (panel) return { w: PANEL_W, h, r: 30 };
  // Pill "wings" either side of the notch, wide enough for the clock and weather.
  if (notch) return { w: notch.width + (activity ? 260 : 200), h: Math.max(32, notch.height), r: 14 };
  if (shape === 'capsule') return activity ? { w: 320, h: 40, r: 20 } : { w: 236, h: 36, r: 18 };
  if (shape === 'mini') return activity ? { w: 250, h: 32, r: 16 } : { w: 124, h: 26, r: 13 };
  if (shape === 'notch') return activity ? { w: 300, h: 36, r: 16 } : { w: 214, h: 32, r: 14 };
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

/**
 * How the panel's content appears and disappears as the island opens and closes (the island's shape
 * always springs between sizes). All quick and soft; picked in Settings → Personalise.
 */
const EASE = [0.25, 0.1, 0.25, 1] as const;
const OPEN_STYLES = {
  // Like water filling a glass: the content rises out of a soft blur with a slight 3D tilt.
  liquid: {
    initial: { opacity: 0, y: -14, rotateX: -16, scale: 0.97, filter: 'blur(8px)' },
    animate: { opacity: 1, y: 0, rotateX: 0, scale: 1, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 230, damping: 24, delay: 0.05 } },
    exit: { opacity: 0, y: -8, rotateX: 10, scale: 0.97, filter: 'blur(6px)', transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
  },
  // Swings in like a card in 3D.
  depth: {
    initial: { opacity: 0, rotateX: -32, z: -80, y: -20 },
    animate: { opacity: 1, rotateX: 0, z: 0, y: 0, transition: { type: 'spring', stiffness: 200, damping: 22 } },
    exit: { opacity: 0, rotateX: 24, z: -60, transition: { duration: 0.16 } },
  },
  // Like iOS: the shape grows first, the content fades in as it settles.
  morph: {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1, transition: { delay: 0.06, duration: 0.24, ease: EASE } },
    exit: { opacity: 0, scale: 0.97, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } },
  },
  // Revealed from the top down, folded back up when closing.
  unfold: {
    initial: { opacity: 0.4, clipPath: 'inset(0% 0% 100% 0% round 28px)' },
    animate: { opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 28px)', transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } },
    exit: { opacity: 0, clipPath: 'inset(0% 0% 70% 0% round 28px)', transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
  },
  // Settles in from just above, with a hint of spring.
  drop: {
    initial: { opacity: 0, y: -18 },
    animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30, delay: 0.04 } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.12 } },
  },
  // Grows out of the pill.
  zoom: {
    initial: { opacity: 0, scale: 0.86 },
    animate: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 360, damping: 28, delay: 0.03 } },
    exit: { opacity: 0, scale: 0.9, transition: { duration: 0.13 } },
  },
} as const;
type OpenStyle = keyof typeof OPEN_STYLES;

function Panel({ p }: { p: PanelLayout }) {
  const openStyle = useApp((s) => ((s.settings as unknown as { openStyle?: OpenStyle })?.openStyle && (s.settings as unknown as { openStyle: OpenStyle }).openStyle in OPEN_STYLES ? (s.settings as unknown as { openStyle: OpenStyle }).openStyle : 'liquid'));
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
      {...OPEN_STYLES[openStyle]}
      onPointerDown={pinPanel}
    >
      {p.notch && <NotchStrip notch={p.notch} width={PANEL_W} />}
      {required && <UpdateRequired />}
      {!required && p.tabs === 'top' && <Tabs position="top" />}
      <div className="panel-main" style={required ? { display: 'none' } : undefined}>
        {p.tabs === 'side' && <Tabs position="side" />}
        <div className="panel-body" role="tabpanel">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div key={tab} className="panel-anim" custom={dir} initial={{ opacity: 0, x: 18 * dir, rotateY: 6 * dir, filter: 'blur(3px)' }} animate={{ opacity: 1, x: 0, rotateY: 0, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 300, damping: 30 } }} exit={{ opacity: 0, x: -10 * dir, filter: 'blur(3px)', transition: { duration: 0.12, ease: 'easeIn' } }}>
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
  return a === 'notif' ? 'notify' : a === 'afina' ? 'ai' : a === 'timer' ? 'library' : a === 'media' ? 'music' : undefined;
}

/** Opening: a touch of overshoot, like liquid settling; closing stays firm. */
const LIQUID_SPRING = { type: 'spring', stiffness: 230, damping: 21, mass: 0.95 } as const;

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
    const leave = (fromRust = false) => {
      // Moving onto a chat's web view leaves the page but not the island: only Rust's hover counts then.
      if (!fromRust && useApp.getState().chatOpen) return;
      if (!inside && !fromRust) return;
      inside = false;
      clearTimeout(openT);
      const s = useApp.getState();
      if (s.view !== 'panel') return;
      // A pinned panel waits longer, and never closes under the user's typing.
      closeT = setTimeout(() => {
        const now = useApp.getState();
        if (now.view !== 'panel' || inside || (now.pinned && typing())) return;
        // Typing in a chat (its own window, over the panel) keeps it open; otherwise leaving closes it.
        if (now.chatOpen) return void call('chat_focused').then((busy) => !busy && !inside && useApp.getState().view === 'panel' && closePanel());
        closePanel();
      }, s.pinned ? 900 : CLOSE_DELAY);
    };
    // Opened without the cursor on it (the start-up notice, a notification): it closes by itself after a
    // while unless the cursor comes over or it is clicked — otherwise nothing would ever close it.
    let idleT: ReturnType<typeof setTimeout> | undefined;
    const offView = useApp.subscribe((st, prev) => {
      if (st.view === 'panel' && prev.view !== 'panel') {
        clearTimeout(idleT);
        idleT = setTimeout(function check() {
          const now = useApp.getState();
          if (now.view !== 'panel' || inside || now.pinned || now.chatOpen) return;
          closePanel();
        }, 8000);
      }
      if (st.view !== 'panel') clearTimeout(idleT);
    });
    const el = islandRef.current;
    el?.addEventListener('pointerenter', enter);
    const onLeave = () => leave();
    el?.addEventListener('pointerleave', onLeave);
    // A click-through window gets no pointerleave, so Rust also says when the cursor leaves the island.
    const off = listen<boolean>('island://hover', (on) => (on ? undefined : leave(true)));
    return () => {
      clearTimeout(openT);
      clearTimeout(closeT);
      clearTimeout(idleT);
      offView();
      el?.removeEventListener('pointerenter', enter);
      el?.removeEventListener('pointerleave', onLeave);
      off();
    };
  }, [hoverOpen, islandRef]);
}

/**
 * Liquid glass: the island leans toward the cursor, squishes softly when pressed, wobbles like gel when it opens, closes or changes tab, and pulses with the music's beat.
 * Everything runs through CSS variables and individual transform properties, so React never re-renders
 * for it and it composes with the island's own size spring.
 */
function useLiquid(islandRef: React.RefObject<HTMLDivElement>, outerRef: React.RefObject<HTMLDivElement>, beatRef: React.RefObject<HTMLDivElement>) {
  const view = useApp((s) => s.view);
  const tab = useApp((s) => s.tab);
  const level = useApp((s) => (s.settings?.motion === 'reduced' ? 'calm' : s.settings?.motionLevel ?? 'balanced'));
  // A soft gel wobble when it opens, closes or changes tab (not in Calm).
  useEffect(() => {
    const el = outerRef.current;
    if (!el || level === 'calm') return;
    el.classList.remove('gel');
    void el.offsetWidth;
    el.classList.add('gel');
    const id = setTimeout(() => el.classList.remove('gel'), 700);
    return () => clearTimeout(id);
  }, [view, tab, level, outerRef]);
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
    const down = () => outer.style.setProperty('--press', '1');
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
  const shape = useApp((s) => {
    const v = (s.settings as unknown as { islandShape?: IslandShape })?.islandShape;
    return v && ISLAND_SHAPES.includes(v) ? v : 'island';
  });
  const dropping = useApp((s) => s.dropping);
  const moving = useApp((s) => s.moving);
  const chatOpen = useApp((s) => s.chatOpen);
  const homeIds = useHomeWidgets();
  // Home fits its widget rows (66 = tab bar and padding); never shorter than two rows, so the gallery fits.
  const homeH = Math.max(homeHeight(homeIds), 228) + 66;
  const baseSize = useSize(activities.length > 0, notch, panel, tab, libSub, panelLayout(layout, tabsPref, PANEL_W), homeH, shape, dropping);
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
  const dropSide = useFileDrop(islandRef);
  const bottom = !!layout?.bottom;
  // Each opening plays the liquid burst once.
  const opens = useRef(0);
  const wasPanel = useRef(panel);
  if (panel && !wasPanel.current) opens.current++;
  wasPanel.current = panel;
  const liquidOn = useApp((s) => s.settings?.motion !== 'reduced' && (s.settings?.motionLevel ?? 'balanced') !== 'calm');
  const attached = shape === 'notch' && !bottom && !notch;

  // Escape closes; clicking anywhere else (the window loses focus) closes too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePanel();
    // Focus moving into a chat's web view blurs the page but stays in the island.
    const onBlur = () => useApp.getState().view === 'panel' && !useApp.getState().chatOpen && closePanel();
    addEventListener('keydown', onKey);
    addEventListener('blur', onBlur);
    // A click outside while typing in a chat (Rust sees the chat window lose focus).
    const offOutside = listen('island://outside', () => useApp.getState().chatOpen && closePanel());
    // With a chat open, the island closes when another app takes the focus.
    let offFocus: (() => void) | undefined;
    // (Focus moving into the chat's own window doesn't count: it sits over the panel, part of the island.)
    if (inTauri)
      void getCurrentWindow()
        .onFocusChanged(({ payload }) => {
          if (payload || !useApp.getState().chatOpen) return;
          setTimeout(() => void call('chat_focused').then((inChat) => !inChat && useApp.getState().chatOpen && closePanel()), 150);
        })
        .then((f) => (offFocus = f));
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('blur', onBlur);
      offFocus?.();
      offOutside();
    };
  }, []);

  const second = !panel ? activities[1] : undefined;
  const top = (layout?.topInset ?? 0) + (notch || attached ? 0 : 6);
  // Always four corners, so the spring can blend between shapes (a single value can't morph into four).
  const topR = ((notch || attached) && !panel) || (attached && panel) ? 0 : size.r;
  const radius = `${topR}px ${topR}px ${size.r}px ${size.r}px`;

  return (
    <div className={`stage ${bottom ? 'bottom' : ''}`} style={bottom ? { paddingBottom: 6 } : { paddingTop: top }}>
      <div className={`island-row ${chatOpen && panel ? 'chat-open' : ''} ${moving ? 'moving' : ''} shape-${shape} ${attached ? 'attached' : ''} ${panel ? 'is-open' : ''}`}>
        {liquidOn && panel && <LiquidBurst key={opens.current} width={size.w} />}

        {/* A soft glow behind the island: breathes in the cover's colour while music plays. */}
        <motion.span className={`island-glow ${playing ? 'music' : ''} ${activities.length ? 'on' : ''} ${panel ? 'open' : ''}`} initial={false} animate={{ width: size.w, height: size.h }} transition={springs.island} aria-hidden />
        <div className="liquid" ref={outerRef}>
        <div className={`beat-layer ${playing && !panel ? 'on' : ''}`} ref={beatRef}>
        {attached && !panel && (
          <>
            <span className="notch-ear l" aria-hidden />
            <span className="notch-ear r" aria-hidden />
          </>
        )}
        <motion.div
          ref={islandRef}
          className={`island ${panel ? 'open' : ''} ${(notch || attached) && !panel ? 'notch' : ''} ${attached ? 'attached' : ''} ${shape === 'frost' ? 'frost' : ''} ${panel && tinted ? 'tinted' : ''} ${activities.length ? 'live' : ''} ${playing ? 'playing' : ''} ${dropping ? 'dropping' : ''}`}
          initial={false}
          animate={{ width: size.w, height: size.h, borderRadius: radius }}
          transition={panel && liquidOn ? LIQUID_SPRING : springs.island}
          onClick={panel ? undefined : () => (dragged.current ? (dragged.current = false) : openPanel(targetFor(activities[0])))}
          role={panel ? 'dialog' : 'button'}
          aria-label="Eternal Helper"
          tabIndex={panel ? -1 : 0}
          onKeyDown={(e) => !panel && (e.key === 'Enter' || e.key === ' ') && openPanel()}
        >
          <span className="sheen" aria-hidden />
          <span className="rim" aria-hidden />
          {/* The bottom edge lights up and swells with the beat while music plays. */}
          <span className="beat-edge" aria-hidden />
          <AnimatePresence initial={false}>
            {dropping ? (
              <DropSplit key="drop" side={dropSide} />
            ) : panel ? (
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
