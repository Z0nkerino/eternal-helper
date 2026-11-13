// Full access: something the user grants in the app, after reading exactly what it does. It keeps the
// island always on (on top of everything, fullscreen apps included), starts the app with the computer,
// and lets Afina use the computer (find and open files, open apps). It can be taken back at any time.
import type { Settings } from './ipc';
import { saveSettings, toast, useApp } from './store';
import { tNow } from './i18n';

export const hasFullAccess = () => !!useApp.getState().settings?.fullAccess?.granted;

export async function grantFullAccess() {
  await saveSettings({ fullAccess: { granted: true, at: Date.now() }, hideInFullscreen: false, autostart: true, afinaTools: { enabled: true } } as Partial<Settings>);
  toast(tNow('access.granted'), { tone: 'ok', force: true });
}

export async function revokeFullAccess() {
  await saveSettings({ fullAccess: { granted: false, at: 0 }, hideInFullscreen: true } as Partial<Settings>);
}
