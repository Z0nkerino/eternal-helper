// One store for the island: settings, which view is open, live activities and toasts.
import { create } from 'zustand';
import { call, type Layout, type MediaInfo, type PlannerEvent, type PlannerSnapshot, type Settings } from './ipc';

export type Tab = 'home' | 'afina' | 'planner' | 'videos' | 'text' | 'settings';
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
  code: number;
  isDay: boolean;
  daily: { date: string; max: number; min: number; code: number }[];
  at: number;
}

interface AppState {
  settings: Settings | null;
  layout: Layout | null;
  view: View;
  tab: Tab;
  /** Bumped to ask the Afina input to take focus. */
  focusAfina: number;
  media: MediaInfo | null;
  timer: TimerState | null;
  rec: RecState;
  afinaThinking: boolean;
  planner: PlannerSnapshot | null;
  plannerError: string | null;
  plannerFlash: PlannerEvent | null;
  weather: WeatherNow | null;
  toasts: Toast[];
}

export const useApp = create<AppState>(() => ({
  settings: null,
  layout: null,
  view: 'idle',
  tab: 'home',
  focusAfina: 0,
  media: null,
  timer: null,
  rec: { status: 'idle', startedAt: 0, pausedMs: 0, pausedAt: 0, native: false },
  afinaThinking: false,
  planner: null,
  plannerError: null,
  plannerFlash: null,
  weather: null,
  toasts: [],
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
    set({ timer: null });
    onDone(t.label);
  }
}

export function recElapsed(r: RecState, now = Date.now()) {
  if (r.status === 'idle' || r.status === 'starting') return 0;
  const pausedNow = r.status === 'paused' ? now - r.pausedAt : 0;
  return Math.max(0, now - r.startedAt - r.pausedMs - pausedNow);
}
