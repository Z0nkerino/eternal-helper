// Settings the UI keeps for itself (notes, calendar events, music volume…), stored with the other settings
// so every window (the island, desktop widgets, pop-outs) sees the same values.
import type { Settings } from './ipc';
import { saveSettings, useApp } from './store';

export function useExtra<T>(key: string, fallback: T): T {
  return useApp((s) => ((s.settings as unknown as Record<string, unknown> | null)?.[key] as T | undefined) ?? fallback);
}

export function readExtra<T>(key: string, fallback: T): T {
  return ((useApp.getState().settings as unknown as Record<string, unknown> | null)?.[key] as T | undefined) ?? fallback;
}

export function saveExtra(key: string, value: unknown) {
  return saveSettings({ [key]: value } as unknown as Partial<Settings>);
}

export const uid = () => Math.random().toString(36).slice(2, 10);
