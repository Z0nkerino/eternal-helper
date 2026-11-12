// Island themes and accent colour, applied as CSS variables so every window follows the settings live.
import type { Settings } from './ipc';
import { safeAccent } from './defaults';

export const THEMES: Settings['theme'][] = ['classic', 'glass', 'neon', 'minimal'];
export const ACCENTS = ['#2F6BFF', '#FF4FA3', '#FFB020', '#32D74B', '#8B5CF6', '#00C7BE', '#FF453A', '#F5F5F7'];

export function applyTheme(s: Settings | null) {
  if (!s) return;
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.dataset.motion = s.motion;
  root.style.setProperty('--accent', safeAccent(s.accent));
  root.style.setProperty('--radius-scale', String(s.radius));
  root.style.setProperty('--ui-scale', String(s.uiScale));
  root.style.setProperty('--island-alpha', String(s.islandOpacity));
  root.style.fontSize = `${13 * s.fontScale}px`;
}
