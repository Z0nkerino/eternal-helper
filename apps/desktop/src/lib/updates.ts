// In-app updates: checked soon after start and every 3 hours (unless turned off). A new version is
// announced on its own: a toast with an Install button, a dot on Settings and a pill on Home.
import { call, listen } from './ipc';
import { tNow } from './i18n';
import { openPanel, toast, useApp } from './store';

let offered = '';

export async function checkForUpdates(manual = false) {
  try {
    const info = await call('update_check');
    useApp.setState({ update: { latest: info.latest, available: info.available, progress: null, error: null } });
    if (info.available && (manual || offered !== info.latest)) {
      offered = info.latest;
      if (manual) toast(`${tNow('upd.available')} ${info.latest}`, { force: true, ms: 15_000, action: { label: tNow('upd.install'), run: () => void installUpdate() } });
    } else if (manual && !info.available) {
      toast(tNow('upd.latest'), { tone: 'ok', force: true });
    }
    return info;
  } catch (e) {
    if (manual) toast(`${tNow('upd.failed')}: ${String(e)}`, { tone: 'error' });
    useApp.setState((s) => ({ update: s.update ? { ...s.update, error: String(e) } : { latest: '', available: false, progress: null, error: String(e) } }));
    return null;
  }
}

export async function installUpdate() {
  useApp.setState((s) => ({ update: { latest: s.update?.latest ?? '', available: true, progress: 0, error: null } }));
  const off = listen<number>('update://progress', (p) => useApp.setState((s) => ({ update: s.update ? { ...s.update, progress: p } : s.update })));
  try {
    toast(tNow('upd.downloading'), { force: true });
    await call('update_install'); // the app restarts into the new version on success
  } catch (e) {
    useApp.setState((s) => ({ update: s.update ? { ...s.update, progress: null, error: String(e) } : s.update }));
    toast(`${tNow('upd.failed')}: ${String(e)}`, { tone: 'error' });
  } finally {
    off();
  }
}

/** The version we already sent a system notification about (once per version). */
let notified = '';

export function startUpdateChecks() {
  // Updates are required, so the check always runs: soon after start, then every 30 minutes. A new
  // version brings a system notification and opens the island on the update screen.
  const run = () =>
    void checkForUpdates().then((info) => {
      if (!info?.available) return;
      if (notified !== info.latest) {
        notified = info.latest;
        void call('notify', { title: tNow('upd.notifyTitle'), body: `${tNow('upd.available')} ${info.latest}. ${tNow('upd.notifyBody')}` }).catch(() => undefined);
      }
      if (useApp.getState().view !== 'panel') openPanel('home', { hover: true });
    });
  const first = setTimeout(run, 4_000);
  const timer = setInterval(run, 30 * 60_000);
  return () => (clearTimeout(first), clearInterval(timer));
}
