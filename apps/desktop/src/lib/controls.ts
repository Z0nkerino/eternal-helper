// Control-centre state: read from the system when the Library opens, and every few seconds while open.
import { create } from 'zustand';
import { call } from './ipc';
import { toast } from './store';

export interface Controls {
  volume: number | null;
  muted: boolean | null;
  brightness: number | null;
  dark: boolean | null;
  wifi: boolean | null;
  wifiName: string | null;
  bluetooth: boolean | null;
  can: { volume: boolean; brightness: boolean; dark: boolean; wifiToggle: boolean; wifiScan: boolean; bluetoothToggle: boolean; lock: boolean; sleep: boolean };
}

export const useControls = create<{ c: Controls | null; busy: Record<string, boolean> }>(() => ({ c: null, busy: {} }));

export async function readControls() {
  try {
    useControls.setState({ c: (await call('controls_read')) as unknown as Controls });
  } catch {
    /* not available in the browser mock */
  }
}

/** Optimistically updates the UI, then asks the system; reverts with a message if it refuses. */
export async function setControl<K extends 'volume' | 'muted' | 'brightness' | 'dark' | 'wifi' | 'bluetooth'>(kind: K, value: Controls[K] & (number | boolean)) {
  const prev = useControls.getState().c;
  if (prev) useControls.setState({ c: { ...prev, [kind]: value } });
  useControls.setState((s) => ({ busy: { ...s.busy, [kind]: true } }));
  try {
    await call('controls_set', { kind, value });
  } catch (e) {
    if (prev) useControls.setState({ c: prev });
    const msg = String(e);
    if (msg === 'bluetooth-settings') void call('open_system_settings', { page: 'bluetooth' });
    else toast(msg, { tone: 'warn', force: true });
  } finally {
    useControls.setState((s) => ({ busy: { ...s.busy, [kind]: false } }));
  }
}

export async function systemAction(kind: 'lock' | 'sleep') {
  try {
    await call('controls_set', { kind, value: true });
  } catch (e) {
    toast(String(e), { tone: 'warn', force: true });
  }
}
