// One store for the island: settings, which view is open, live activities and toasts.
import { create } from 'zustand';
import { withDefaults } from './defaults';
import { call, type Battery, type Layout, type MediaInfo, type MusicReport, type PcNotification, type PlannerEvent, type PlannerSnapshot, type Settings } from './ipc';

export type Tab = 'home' | 'music' | 'time' | 'library' | 'ai' | 'calendar' | 'notes' | 'shelf' | 'notify' | 'videos' | 'text' | 'weather' | 'settings';
/** The island's main tabs; the other screens live inside Library. */
export type MainTab = 'home' | 'music' | 'time' | 'library' | 'ai' | 'settings';
export type LibSub = 'weather' | 'calendar' | 'notes' | 'shelf' | 'notify' | 'videos' | 'text' | 'timer' | 'calc' | 'translate' | 'wifi' | 'radio';
export const MAIN_TABS: MainTab[] = ['home', 'music', 'time', 'library', 'ai', 'settings'];
const IN_LIBRARY: Tab[] = ['weather', 'calendar', 'notes', 'shelf', 'notify', 'videos', 'text'];
export type View = 'idle' | 'panel';

export type Hud =
  | { kind: 'volume'; value: number; muted: boolean }
  | { kind: 'brightness'; value: number }
  | { kind: 'caps'; on: boolean }
  | { kind: 'download'; name: string; path: string; done: boolean; size: number };

let hudTimer: ReturnType<typeof setTimeout> | undefined;
/** Shows a live event in the pill; it fades after a moment (a finished download stays a little longer). */
export function showHud(h: Hud) {
  clearTimeout(hudTimer);
  useApp.setState({ hud: h });
  const ms = h.kind === 'download' ? (h.done ? 5000 : 6000) : 1700;
  hudTimer = setTimeout(() => useApp.setState({ hud: null }), ms);
}

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
  /** A live system event shown in the pill for a moment (volume, brightness, Caps Lock, a download). */
  hud: Hud | null;
  /** The user is dragging the island to a new place. */
  moving: boolean;
  /** The mouse button is held on the island (it keeps the mouse until released). */
  pressing: boolean;
  /** A sheet over the panel: the developer notice or the full-access request. */
  sheet: 'news' | 'access' | null;
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
  /** A chat to show in the Chats tab (from Home, Cloudy or a live activity), with an optional question. */
  chatRequest: { service: string; prompt: string | null; n: number } | null;
  /** Notifications from other apps on this PC (this session only, newest first). */
  notifications: PcNotification[];
  /** A chat's web view is showing over the panel (the island keeps the mouse and keyboard for it). */
  chatOpen: boolean;
  /** The newest notification, shown in the pill for a few seconds. */
  notifFlash: PcNotification | null;
  /** Files are being dragged over the island. */
  dropping: boolean;
  /** The music app's own volume (0..1), separate from the system volume; null when unknown. */
  musicVolume: number | null;
}

export const useApp = create<AppState>(() => ({
  settings: null,
  layout: null,
  view: 'idle',
  tab: 'home',
  libSub: null,
  pinned: false,
  closedAt: 0,
  sheet: null,
  hud: null,
  moving: false,
  pressing: false,
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
  chatRequest: null,
  notifications: [],
  notifFlash: null,
  chatOpen: false,
  dropping: false,
  musicVolume: null,
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

/** Opens a chat (AI or messenger) inside the island, with the question filled in where the service allows. */
export function openChat(service: string, prompt: string | null = null) {
  set((s) => ({ chatRequest: { service, prompt, n: (s.chatRequest?.n ?? 0) + 1 } }));
  openPanel('ai');
  pinPanel();
}

/** Opens a sheet (developer notice, full-access request) over the panel. */
export function openSheet(sheet: 'news' | 'access', opts: { hover?: boolean } = {}) {
  if (get().view !== 'panel') openPanel('home', opts);
  set({ sheet });
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
  set({ view: 'idle', pinned: false, closedAt: Date.now(), sheet: null });
  void call('chat_hide');
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

// ---------- Notifications from other apps ----------

let notifTimer: ReturnType<typeof setTimeout> | undefined;
/** A notification arrived from another app: keep it in the list and flash it in the pill. */
export function pushNotification(n: PcNotification) {
  set((s) => ({ notifications: [n, ...s.notifications.filter((x) => x.id !== n.id)].slice(0, 60) }));
  if (get().settings?.doNotDisturb) return;
  clearTimeout(notifTimer);
  set({ notifFlash: n });
  notifTimer = setTimeout(() => set({ notifFlash: null }), 6000);
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
