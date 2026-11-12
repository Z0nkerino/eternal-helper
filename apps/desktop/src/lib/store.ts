// One store for the island: settings, which view is open, live activities and toasts.
import { create } from 'zustand';
import { withDefaults } from './defaults';
import { call, type Battery, type Layout, type MediaInfo, type MusicReport, type PlannerEvent, type PlannerSnapshot, type Settings } from './ipc';

export type Tab = 'home' | 'music' | 'library' | 'afina' | 'planner' | 'videos' | 'text' | 'weather' | 'settings';
/** The island has four tabs; the other screens live inside Library. */
export type MainTab = 'home' | 'music' | 'library' | 'afina' | 'settings';
export type LibSub = 'weather' | 'planner' | 'videos' | 'text' | 'timer' | 'calc' | 'translate' | 'wifi' | 'radio';
export const MAIN_TABS: MainTab[] = ['home', 'music', 'library', 'afina', 'settings'];
const IN_LIBRARY: Tab[] = ['weather', 'planner', 'videos', 'text'];
export type View = 'idle' | 'panel';

export interface Toast {
  id: number;
  text: string;
  tone?: 'ok' | 'warn' | 'error';
  action?: { label: string; run: () => void };
  /** How long it stays (ms). */
  ms?: number;
}

export interface TimerState {
  endsAt: number;
  totalMs: number;
  label: string;
  /** Set while paused: how much time was left. */
  pausedLeft?: number;
}

export type RecStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'saving';
export interface RecState {
  status: RecStatus;
  startedAt: number;
  /** Time spent paused so far, so the pill timer and saved duration skip it. */
  pausedMs: number;
  pausedAt: number;
  native: boolean;
}

export interface WeatherNow {
  temp: number;
  feels: number;
  code: number;
  isDay: boolean;
  humidity: number;
  /** km/h (mph when °F is chosen is not converted: Open-Meteo returns km/h by default). */
  wind: number;
  windDir: number;
  pressure: number;
  precipitation: number;
  aqi: number | null;
  hourly: { time: number; temp: number; code: number; rain: number; isDay: boolean }[];
  daily: { date: string; max: number; min: number; code: number; sunrise: number; sunset: number; uv: number; rain: number; rainSum: number }[];
  at: number;
}

export type MediaSource = { kind: 'system' } | { kind: 'web'; service: MusicReport['service'] } | { kind: 'radio' };

interface AppState {
  settings: Settings | null;
  layout: Layout | null;
  view: View;
  tab: MainTab;
  /** The screen open inside Library (null = its main page). */
  libSub: LibSub | null;
  /** Opened by resting the cursor on the island; becomes pinned (keyboard focus) on the first click. */
  pinned: boolean;
  /** When the panel last closed, to reopen on the same tab soon after. */
  closedAt: number;
  /** Bumped to ask the Afina input to take focus. */
  focusAfina: number;
  /** What the island shows: the system's media session or a signed-in web player, whichever is playing. */
  media: MediaInfo | null;
  mediaSource: MediaSource;
  /** When `media.positionMs` was read, to move the progress bar between updates. */
  mediaAt: number;
  systemMedia: MediaInfo | null;
  webMusic: Partial<Record<MusicReport['service'], MusicReport>>;
  battery: Battery | null;
  /** Shown in Settings → Updates and as a toast. */
  update: { latest: string; available: boolean; progress: number | null; error: string | null } | null;
  timer: TimerState | null;
  rec: RecState;
  afinaThinking: boolean;
  planner: PlannerSnapshot | null;
  plannerError: string | null;
  plannerFlash: PlannerEvent | null;
  weather: WeatherNow | null;
  toasts: Toast[];
  /** Counters Cloudy reacts to (a timer finished, something went wrong). */
  pulse: { timer: number; error: number };
}

export const useApp = create<AppState>(() => ({
  settings: null,
  layout: null,
  view: 'idle',
  tab: 'home',
  libSub: null,
  pinned: false,
  closedAt: 0,
  focusAfina: 0,
  media: null,
  mediaSource: { kind: 'system' },
  mediaAt: 0,
  systemMedia: null,
  webMusic: {},
  battery: null,
  update: null,
  timer: null,
  rec: { status: 'idle', startedAt: 0, pausedMs: 0, pausedAt: 0, native: false },
  afinaThinking: false,
  planner: null,
  plannerError: null,
  plannerFlash: null,
  weather: null,
  toasts: [],
  pulse: { timer: 0, error: 0 },
}));

const set = useApp.setState;
const get = useApp.getState;

/** Opens the panel. `hover`: opened by the cursor resting on it, so it doesn't take the keyboard. */
export function openPanel(tab?: Tab, opts: { hover?: boolean } = {}) {
  const hover = !!opts.hover;
  set((s) => {
    const into = tab && IN_LIBRARY.includes(tab) ? { tab: 'library' as const, libSub: tab as LibSub } : tab ? { tab: tab as MainTab } : {};
    return { view: 'panel', pinned: s.view === 'panel' ? s.pinned || !hover : !hover, ...into };
  });
  void call('island_set_expanded', { expanded: true, focus: get().pinned });
}

/** Opens a screen inside Library. */
export function openLibrary(sub: LibSub | null) {
  set({ libSub: sub });
  if (get().view !== 'panel') openPanel('library');
  else set({ tab: 'library' });
}

/** The user clicked inside a hover-opened panel: now it may take the keyboard (typing to Afina…). */
export function pinPanel() {
  if (get().view !== 'panel' || get().pinned) return;
  set({ pinned: true });
  void call('island_set_expanded', { expanded: true, focus: true });
}

export function closePanel() {
  if (get().view === 'idle') return;
  set({ view: 'idle', pinned: false, closedAt: Date.now() });
  void call('island_set_expanded', { expanded: false });
}

/** Screenshots shouldn't include the open panel: close it and let it animate away first. */
export async function takeScreenshot() {
  const open = get().view === 'panel';
  closePanel();
  if (open) await new Promise((r) => setTimeout(r, 320));
  try {
    await call('shot_start');
  } catch (e) {
    toast(String(e), { tone: 'error' });
  }
}

export function togglePanel() {
  if (get().view === 'panel') closePanel();
  else openPanel();
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = get().settings;
  if (!cur) return;
  const next = { ...cur, ...patch };
  set({ settings: next });
  try {
    // Only the changed keys go to the app, so windows saving at once don't overwrite each other.
    set({ settings: withDefaults(await call('patch_settings', { patch })) });
  } catch (e) {
    set({ settings: cur });
    throw e;
  }
}

let toastId = 0;
export function toast(text: string, opts: Omit<Toast, 'id' | 'text'> & { force?: boolean } = {}) {
  // "Do not disturb" mutes toasts, except errors the user needs to see.
  if (get().settings?.doNotDisturb && !opts.force && opts.tone !== 'error') return;
  if (opts.tone === 'error') set((s) => ({ pulse: { ...s.pulse, error: s.pulse.error + 1 } }));
  const t: Toast = { id: ++toastId, text, tone: opts.tone, action: opts.action };
  set((s) => ({ toasts: [...s.toasts.slice(-2), t] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), opts.ms ?? (opts.action ? 6000 : 3200));
}

export function dismissToast(id: number) {
  set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
}

// ---------- Timer ----------

export function startTimer(minutes: number, label = '') {
  const totalMs = Math.round(minutes * 60_000);
  set({ timer: { endsAt: Date.now() + totalMs, totalMs, label } });
}

export function stopTimer() {
  set({ timer: null });
}

export function pauseTimer() {
  const t = get().timer;
  if (t && t.pausedLeft == null) set({ timer: { ...t, pausedLeft: Math.max(0, t.endsAt - Date.now()) } });
}

export function resumeTimer() {
  const t = get().timer;
  if (t && t.pausedLeft != null) set({ timer: { ...t, endsAt: Date.now() + t.pausedLeft, pausedLeft: undefined } });
}

/** Adds time to the running (or paused) timer. */
export function addToTimer(ms: number) {
  const t = get().timer;
  if (!t) return;
  set({ timer: { ...t, endsAt: t.endsAt + ms, totalMs: t.totalMs + ms, pausedLeft: t.pausedLeft != null ? t.pausedLeft + ms : undefined } });
}

/** Time left on the timer, honouring pauses. */
export const timerLeft = (t: TimerState, now = Date.now()) => (t.pausedLeft != null ? t.pausedLeft : Math.max(0, t.endsAt - now));

/** Called once a second by the island clock. */
export function tickTimer(now: number, onDone: (label: string) => void) {
  const t = get().timer;
  if (t && t.pausedLeft == null && now >= t.endsAt) {
    set((s) => ({ timer: null, pulse: { ...s.pulse, timer: s.pulse.timer + 1 } }));
    onDone(t.label);
  }
}

export function recElapsed(r: RecState, now = Date.now()) {
  if (r.status === 'idle' || r.status === 'starting') return 0;
  const pausedNow = r.status === 'paused' ? now - r.pausedAt : 0;
  return Math.max(0, now - r.startedAt - r.pausedMs - pausedNow);
}
