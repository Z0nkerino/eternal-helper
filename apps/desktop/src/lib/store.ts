// One store for the island: settings, which view is open, live activities and toasts.
import { create } from 'zustand';
import { call, type Battery, type Layout, type MediaInfo, type MusicReport, type PlannerEvent, type PlannerSnapshot, type Settings } from './ipc';

export type Tab = 'home' | 'afina' | 'planner' | 'videos' | 'text' | 'weather' | 'settings';
export type View = 'idle' | 'panel';

export interface Toast {
  id: number;
  text: string;
  tone?: 'ok' | 'warn' | 'error';
  action?: { label: string; run: () => void };
}

export interface TimerState {
  endsAt: number;
  totalMs: number;
  label: string;
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

export type MediaSource = { kind: 'system' } | { kind: 'web'; service: MusicReport['service'] };

interface AppState {
  settings: Settings | null;
  layout: Layout | null;
  view: View;
  tab: Tab;
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

export function openPanel(tab?: Tab) {
  set((s) => ({ view: 'panel', tab: tab ?? s.tab }));
  void call('island_set_expanded', { expanded: true });
}

export function closePanel() {
  set({ view: 'idle' });
  void call('island_set_expanded', { expanded: false });
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
    set({ settings: await call('set_settings', { value: next }) });
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
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), opts.action ? 6000 : 3200);
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

/** Called once a second by the island clock. */
export function tickTimer(now: number, onDone: (label: string) => void) {
  const t = get().timer;
  if (t && now >= t.endsAt) {
    set((s) => ({ timer: null, pulse: { ...s.pulse, timer: s.pulse.timer + 1 } }));
    onDone(t.label);
  }
}

export function recElapsed(r: RecState, now = Date.now()) {
  if (r.status === 'idle' || r.status === 'starting') return 0;
  const pausedNow = r.status === 'paused' ? now - r.pausedAt : 0;
  return Math.max(0, now - r.startedAt - r.pausedMs - pausedNow);
}
