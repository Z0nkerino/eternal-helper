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

/** Values the user just changed are kept for a moment, so a slow system reading can't jump them back. */
const held: Partial<Record<keyof Controls, number>> = {};

export async function readControls() {
  try {
    const fresh = (await call('controls_read')) as unknown as Controls;
    const cur = useControls.getState().c;
    const now = Date.now();
    if (cur) for (const k of Object.keys(held) as (keyof Controls)[]) if ((held[k] ?? 0) > now) (fresh as unknown as Record<string, unknown>)[k] = cur[k];
    useControls.setState({ c: fresh });
  } catch {
    /* not available in the browser mock */
  }
}

const timers: Record<string, { last: number; t?: ReturnType<typeof setTimeout>; v?: number }> = {};
/**
 * For sliders: the UI follows the finger at once, the system gets the value at a steady pace (volume
 * every 60 ms, brightness every 200 ms — it is slower to change) and always the final value.
 */
export function slideControl(kind: 'volume' | 'brightness', value: number) {
  const v = Math.round(Math.max(0, Math.min(100, value)));
  held[kind] = Date.now() + 2500;
  if (kind === 'volume') held.muted = Date.now() + 2500;
  useControls.setState((s) => (s.c ? { c: { ...s.c, [kind]: v, ...(kind === 'volume' && v > 0 ? { muted: false } : {}) } } : s));
  const gap = kind === 'volume' ? 60 : 200;
  const st = (timers[kind] ??= { last: 0 });
  st.v = v;
  const send = () => {
    st.last = Date.now();
    st.t = undefined;
    void call('controls_set', { kind, value: st.v! }).catch((e) => toast(String(e), { tone: 'warn', force: true }));
    if (kind === 'volume' && v > 0 && useControls.getState().c?.muted) void call('controls_set', { kind: 'muted', value: false });
  };
  const wait = gap - (Date.now() - st.last);
  if (wait <= 0) send();
  else if (!st.t) st.t = setTimeout(send, wait);
}

/** Optimistically updates the UI, then asks the system; reverts with a message if it refuses. */
export async function setControl<K extends 'volume' | 'muted' | 'brightness' | 'dark' | 'wifi' | 'bluetooth'>(kind: K, value: Controls[K] & (number | boolean)) {
  const prev = useControls.getState().c;
  held[kind] = Date.now() + 2500;
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
