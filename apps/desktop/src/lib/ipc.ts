// Typed bridge to the Rust side. Outside Tauri (plain `vite` in a browser) a small mock answers, so the
// UI can be developed and screenshot-tested without the desktop shell.
import { invoke as tauriInvoke, type InvokeOptions } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface Settings {
  language: 'auto' | 'en' | 'ru';
  monitor: 'primary' | 'cursor';
  hotkey: string;
  autostart: boolean;
  doNotDisturb: boolean;
  hideInFullscreen: boolean;
  accent: string;
  weather: { place: string; lat: number | null; lon: number | null; unit: 'c' | 'f' };
  planner: { enabled: boolean; port: number; token: string; backupDir: string };
  afina: { enabled: boolean; provider: 'anthropic' | 'openai' | 'ollama' | 'off'; model: string; baseUrl: string };
  recording: { audio: 'none' | 'system' | 'system+mic'; folder: string };
}

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

export interface Layout {
  platform: 'windows' | 'macos' | 'linux';
  notch: { width: number; height: number } | null;
  topInset: number;
  nativeRecording: boolean;
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Commands {
  get_settings: [void, Settings];
  set_settings: [{ value: Settings }, Settings];
  island_layout: [void, Layout];
  island_set_hit: [{ x: number; y: number; w: number; h: number }, void];
  island_set_expanded: [{ expanded: boolean }, void];
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
  quit: [void, void];
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

const mockSettings: Settings = {
  language: 'auto',
  monitor: 'primary',
  hotkey: 'Alt+Space',
  autostart: false,
  doNotDisturb: false,
  hideInFullscreen: true,
  accent: '#2F6BFF',
  weather: { place: '', lat: null, lon: null, unit: 'c' },
  planner: { enabled: true, port: 45123, token: 'demo-token', backupDir: '' },
  afina: { enabled: true, provider: 'anthropic', model: 'claude-opus-5-5', baseUrl: '' },
  recording: { audio: 'system', folder: '' },
};
const mockRecs: Recording[] = [
  { id: 'r1', title: 'Recording 2026-11-11 10-02-11', path: '/Videos/Eternal Helper/a.mp4', size: 18_400_000, durationMs: 74_000, createdAt: Date.now() - 3_600_000 },
];

async function mock(cmd: keyof Commands, arg: unknown): Promise<unknown> {
  switch (cmd) {
    case 'get_settings':
      return structuredClone(mockSettings);
    case 'set_settings':
      Object.assign(mockSettings, (arg as { value: Settings }).value);
      return structuredClone(mockSettings);
    case 'island_layout':
      return { platform: 'windows', notch: null, topInset: 0, nativeRecording: false } satisfies Layout;
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
    default:
      return undefined;
  }
}
