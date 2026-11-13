// Typed bridge to the Rust side. Outside Tauri (plain `vite` in a browser) a small mock answers, so the
// UI can be developed and screenshot-tested without the desktop shell.
import { invoke as tauriInvoke, type InvokeOptions } from '@tauri-apps/api/core';
import { emit as tauriEmit, listen as tauriListen } from '@tauri-apps/api/event';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface Settings {
  language: 'auto' | 'en' | 'ru';
  monitor: 'primary' | 'cursor';
  hotkey: string;
  autostart: boolean;
  doNotDisturb: boolean;
  hideInFullscreen: boolean;
  accent: string;
  tabsPosition: 'auto' | 'top' | 'bottom' | 'side';
  debugSafeAreas: boolean;
  weather: { place: string; lat: number | null; lon: number | null; unit: 'c' | 'f' };
  planner: { enabled: boolean; port: number; token: string; backupDir: string };
  afina: { enabled: boolean; provider: 'local' | 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'copilot' | 'deepseek' | 'anthropic' | 'openai' | 'ollama' | 'off'; model: string; baseUrl: string };
  afinaTools: { enabled: boolean };
  afinaV2?: boolean;
  // Personalisation (all clamped to safe ranges in lib/defaults.ts)
  name: string;
  uiScale: number;
  fontScale: number;
  islandOpacity: number;
  motion: 'full' | 'reduced';
  clock24: boolean;
  clockSeconds: boolean;
  hiddenTabs: string[];
  /** Open the panel when the cursor rests on the island (no click needed). */
  hoverOpen: boolean;
  /** Widgets on Home, in order. */
  homeWidgets: string[];
  /** The Eternal account shown in Settings and greetings (kept on this computer). */
  account: Account;
  /** Granted by the user: always on top (even over fullscreen apps), Afina may open apps. */
  fullAccess: { granted: boolean; at: number };
  /** Show the developer notice (news and updates) when the app starts. */
  newsAtStart: boolean;
  /** Liquid-glass motion of the island and moving with the music's beat. */
  liquid: { enabled: boolean; beat: boolean };
  shotHotkey: string;
  recording: { audio: 'none' | 'system' | 'system+mic'; folder: string };
  // UI-only preferences (stored by Rust as-is; defaults in lib/defaults.ts)
  theme: 'classic' | 'glass' | 'neon' | 'minimal';
  /** Corner roundness multiplier, 0.5 … 1.4. */
  radius: number;
  carousel: { enabled: boolean; interval: number; items: CarouselItem[] };
  currency: { pairs: [string, string][] };
  clocks: { tz: string; city: string }[];
  cloudy: { enabled: boolean; size: number; speed: number; chatter: 'never' | 'rare' | 'normal' | 'often'; roam: 'stay' | 'rare' | 'sometimes' | 'often'; sounds: boolean };
  music: { startHidden: string[] };
  updates: { auto: boolean };
}

export type CarouselItem = 'time' | 'event' | 'battery' | 'currency' | 'track';

export interface MediaInfo {
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  source: string;
  artwork?: string | null;
  positionMs?: number | null;
  durationMs?: number | null;
}

export interface Notch {
  width: number;
  height: number;
  /** Offset of the notch centre from the screen centre, in points. */
  centerOffset: number;
}

export interface Layout {
  platform: 'windows' | 'macos' | 'linux';
  /** Notch of the display the island is on now; null on Windows and notch-less displays. */
  notch: Notch | null;
  topInset: number;
  nativeRecording: boolean;
  screenWidth: number;
  scale: number;
}

export interface PlannerEvent {
  event: string;
  text: string;
  title: string;
  at: string;
}
export interface PlannerInfo {
  webhookUrl: string;
  listening: boolean;
  recent: PlannerEvent[];
}
export interface PlannerSnapshot {
  file: string;
  exportedAt: string;
  tasksToday: { id: string; title: string; priority: number; top: boolean; start: number | null }[];
  doneToday: number;
  upcoming: { id: string; title: string; start: number; end: number; allDay: boolean; location: string | null }[];
}

export interface Recording {
  id: string;
  title: string;
  path: string;
  size: number;
  durationMs: number;
  createdAt: number;
}

export interface Account {
  signedIn: boolean;
  name: string;
  email: string;
  city: string;
  /** Accent colour of the avatar. */
  color: string;
  bio: string;
  /** When the account was created (ms). */
  since: number;
}

export interface Battery {
  present: boolean;
  percent: number;
  charging: boolean;
  plugged: boolean;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  available: boolean;
  notes: string;
  asset: { url: string; sha256: string; size: number } | null;
}

export interface MusicService {
  id: 'spotify' | 'yandex' | 'soundcloud';
  name: string;
  open: boolean;
  visible: boolean;
}

export interface MusicReport {
  service: MusicService['id'];
  title: string;
  artist: string;
  album: string;
  artwork: string | null;
  playing: boolean;
  positionMs: number | null;
  durationMs: number | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Commands {
  get_settings: [void, Settings];
  set_settings: [{ value: Settings }, Settings];
  patch_settings: [{ patch: Partial<Settings> }, Settings];
  island_layout: [void, Layout];
  island_set_hit: [{ x: number; y: number; w: number; h: number }, void];
  island_set_expanded: [{ expanded: boolean; focus?: boolean }, void];
  media_now: [void, MediaInfo | null];
  media_control: [{ action: 'toggle' | 'next' | 'previous' }, void];
  planner_info: [void, PlannerInfo];
  planner_snapshot: [void, PlannerSnapshot];
  planner_open: [void, void];
  secret_set: [{ name: string; value: string }, void];
  secret_has: [{ name: string }, boolean];
  afina_ask: [{ context: string; history: ChatMessage[] }, string];
  rec_info: [void, { folder: string; native: boolean }];
  rec_begin: [{ ext: string }, string];
  rec_finish: [{ id: string; durationMs: number }, Recording];
  rec_cancel: [{ id: string }, void];
  rec_native_start: [{ mic: boolean }, void];
  rec_native_stop: [void, Recording];
  rec_list: [void, Recording[]];
  rec_rename: [{ path: string; title: string }, void];
  rec_delete: [{ path: string }, void];
  rec_open: [{ path: string; reveal: boolean }, void];
  rec_open_folder: [void, void];
  open_window: [{ kind: string }, void];
  battery: [void, Battery];
  update_check: [void, UpdateInfo];
  update_install: [void, void];
  music_services: [void, MusicService[]];
  music_open: [{ service: string; show: boolean }, void];
  music_hide: [{ service: string }, void];
  music_control: [{ service: string; action: 'toggle' | 'next' | 'previous' }, void];
  music_sign_out: [void, void];
  shot_start: [void, void];
  shot_close: [void, void];
  shot_reveal: [{ path: string }, void];
  controls_read: [void, unknown];
  controls_set: [{ kind: string; value: number | boolean }, void];
  wifi_networks: [void, { ssid: string; signal: number; secure: boolean; known: boolean }[]];
  wifi_connect: [{ ssid: string; password: string | null }, void];
  open_system_settings: [{ page: string }, void];
  afina_launch: [{ name: string }, void];
  afina_find_files: [{ query: string }, FoundFile[]];
  afina_find_text: [{ query: string }, FoundFile[]];
  afina_open: [{ path: string; reveal: boolean }, void];
  ai_services: [void, { id: string; name: string; prefill: boolean }[]];
  ai_open: [{ service: string; prompt: string | null }, boolean];
  open_url: [{ url: string }, void];
  window_ready: [void, void];
  quit: [void, void];
}

export interface FoundFile {
  path: string;
  name: string;
  snippet: string | null;
  modified: number;
}

export function call<K extends keyof Commands>(cmd: K, ...args: Commands[K][0] extends void ? [] : [Commands[K][0]]): Promise<Commands[K][1]> {
  if (!inTauri) return mock(cmd, args[0]) as Promise<Commands[K][1]>;
  return tauriInvoke<Commands[K][1]>(cmd, args[0] as Record<string, unknown> | undefined);
}

/** Sends one recording chunk as a raw binary body (no JSON/base64 overhead). */
export function appendChunk(id: string, bytes: Uint8Array) {
  if (!inTauri) return Promise.resolve();
  const opts: InvokeOptions = { headers: { 'x-rec-id': id } };
  return tauriInvoke('rec_append', bytes, opts);
}

/** Sends an app-wide event to every window (e.g. Cloudy asking the island to open Afina). */
export function emitEvent(event: string, payload?: unknown) {
  return inTauri ? tauriEmit(event, payload) : Promise.resolve();
}

export function listen<T>(event: string, cb: (payload: T) => void): () => void {
  if (!inTauri) return () => {};
  let off: (() => void) | undefined;
  let dead = false;
  void tauriListen<T>(event, (e) => cb(e.payload)).then((u) => (dead ? u() : (off = u)));
  return () => {
    dead = true;
    off?.();
  };
}

// ---------- Browser mock ----------

/**
 * Display presets for checking the layout in a browser: `?emulate=macbook-pro-14` etc.
 * Notch sizes are approximate (points); what matters is that nothing interactive lands inside them.
 */
export const DISPLAY_PRESETS: Record<string, Layout> = {
  'macbook-air-13': { platform: 'macos', notch: { width: 190, height: 32, centerOffset: 0 }, topInset: 0, nativeRecording: true, screenWidth: 1470, scale: 2 },
  'macbook-air-15': { platform: 'macos', notch: { width: 190, height: 32, centerOffset: 0 }, topInset: 0, nativeRecording: true, screenWidth: 1710, scale: 2 },
  'macbook-pro-14': { platform: 'macos', notch: { width: 200, height: 32, centerOffset: 0 }, topInset: 0, nativeRecording: true, screenWidth: 1512, scale: 2 },
  'macbook-pro-16': { platform: 'macos', notch: { width: 200, height: 38, centerOffset: 0 }, topInset: 0, nativeRecording: true, screenWidth: 1728, scale: 2 },
  'mac-no-notch': { platform: 'macos', notch: null, topInset: 25, nativeRecording: true, screenWidth: 1440, scale: 2 },
  'external-monitor': { platform: 'macos', notch: null, topInset: 25, nativeRecording: true, screenWidth: 2560, scale: 1 },
  'windows-100': { platform: 'windows', notch: null, topInset: 0, nativeRecording: false, screenWidth: 1920, scale: 1 },
  'windows-150': { platform: 'windows', notch: null, topInset: 0, nativeRecording: false, screenWidth: 1707, scale: 1.5 },
  'windows-200': { platform: 'windows', notch: null, topInset: 0, nativeRecording: false, screenWidth: 1920, scale: 2 },
};

function emulatedLayout(): Layout {
  const key = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('emulate') ?? '' : '';
  return structuredClone(DISPLAY_PRESETS[key] ?? DISPLAY_PRESETS['windows-100']);
}

const mockSettings: Settings = {
  language: 'auto',
  monitor: 'primary',
  hotkey: 'Alt+Space',
  autostart: false,
  doNotDisturb: false,
  hideInFullscreen: true,
  accent: '#2F6BFF',
  tabsPosition: 'auto',
  debugSafeAreas: false,
  weather: { place: '', lat: null, lon: null, unit: 'c' },
  planner: { enabled: true, port: 45123, token: 'demo-token', backupDir: '' },
  afina: { enabled: true, provider: 'local', model: 'Qwen2.5-1.5B-Instruct', baseUrl: '' },
  recording: { audio: 'system', folder: '' },
} as Settings;
const mockRecs: Recording[] = [
  { id: 'r1', title: 'Recording 2026-11-11 10-02-11', path: '/Videos/Eternal Helper/a.mp4', size: 18_400_000, durationMs: 74_000, createdAt: Date.now() - 3_600_000 },
];

// Dev-only URL overrides for layout checks: ?tabs=bottom&debug=1
if (typeof location !== 'undefined') {
  const q = new URLSearchParams(location.search);
  const tabs = q.get('tabs');
  if (tabs === 'top' || tabs === 'bottom' || tabs === 'side' || tabs === 'auto') mockSettings.tabsPosition = tabs;
  if (q.get('debug') === '1') mockSettings.debugSafeAreas = true;
}

async function mock(cmd: keyof Commands, arg: unknown): Promise<unknown> {
  switch (cmd) {
    case 'get_settings':
      return structuredClone(mockSettings);
    case 'set_settings':
      Object.assign(mockSettings, (arg as { value: Settings }).value);
      return structuredClone(mockSettings);
    case 'patch_settings':
      Object.assign(mockSettings, (arg as { patch: Partial<Settings> }).patch);
      return structuredClone(mockSettings);
    case 'island_layout':
      return emulatedLayout();
    case 'media_now':
      return { title: 'Northern Lights', artist: 'Demo Artist', album: 'Demo', playing: true, source: 'Spotify', positionMs: 42_000, durationMs: 210_000 } satisfies MediaInfo;
    case 'planner_info':
      return { webhookUrl: `http://127.0.0.1:${mockSettings.planner.port}/planner/${mockSettings.planner.token}`, listening: true, recent: [] };
    case 'planner_snapshot':
      throw 'no-folder';
    case 'secret_has':
      return false;
    case 'afina_ask':
      throw 'no-key';
    case 'rec_info':
      return { folder: '~/Videos/Eternal Helper', native: false };
    case 'rec_list':
      return mockRecs;
    case 'rec_begin':
      return 'mock';
    case 'controls_read':
      return { volume: 64, muted: false, brightness: null, dark: true, wifi: true, wifiName: 'Eternal-Wi-Fi', bluetooth: false, can: { volume: true, brightness: false, dark: true, wifiToggle: true, wifiScan: true, bluetoothToggle: true, lock: true, sleep: true } };
    case 'wifi_networks':
      return [{ ssid: 'Eternal-Wi-Fi', signal: 88, secure: true, known: true }, { ssid: 'Cafe Sunrise', signal: 52, secure: false, known: false }, { ssid: 'Neighbours 5G', signal: 31, secure: true, known: false }];
    case 'ai_services':
      return [{ id: 'chatgpt', name: 'ChatGPT', prefill: true }, { id: 'claude', name: 'Claude', prefill: true }, { id: 'gemini', name: 'Gemini', prefill: false }, { id: 'perplexity', name: 'Perplexity', prefill: true }, { id: 'copilot', name: 'Copilot', prefill: true }, { id: 'deepseek', name: 'DeepSeek', prefill: false }];
    case 'afina_find_files':
      throw 'tools-off';
    case 'battery':
      return { present: true, percent: 76, charging: false, plugged: false } satisfies Battery;
    case 'update_check':
      return { current: '0.2.0', latest: '0.2.0', available: false, notes: '', asset: null } satisfies UpdateInfo;
    case 'music_services':
      return [
        { id: 'spotify', name: 'Spotify', open: false, visible: false },
        { id: 'yandex', name: 'Yandex Music', open: false, visible: false },
        { id: 'soundcloud', name: 'SoundCloud', open: false, visible: false },
      ] satisfies MusicService[];
    default:
      return undefined;
  }
}
