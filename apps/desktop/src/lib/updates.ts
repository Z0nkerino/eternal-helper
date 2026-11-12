// In-app updates: check on start and every 6 hours (unless turned off), offer a one-click install.
import { call, listen } from './ipc';
import { tNow } from './i18n';
import { toast, useApp } from './store';

let offered = '';

export async function checkForUpdates(manual = false) {
  try {
    const info = await call('update_check');
    useApp.setState({ update: { latest: info.latest, available: info.available, progress: null, error: null } });
    if (info.available && (manual || offered !== info.latest)) {
      offered = info.latest;
      toast(`🆕 ${tNow('upd.available')} ${info.latest}`, { force: true, action: { label: tNow('upd.install'), run: () => void installUpdate() } });
    } else if (manual && !info.available) {
      toast(`✅ ${tNow('upd.latest')}`, { tone: 'ok', force: true });
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
    toast(`⬇️ ${tNow('upd.downloading')}`, { force: true });
    await call('update_install'); // the app restarts into the new version on success
  } catch (e) {
    useApp.setState((s) => ({ update: s.update ? { ...s.update, progress: null, error: String(e) } : s.update }));
    toast(`${tNow('upd.failed')}: ${String(e)}`, { tone: 'error' });
  } finally {
    off();
  }
}

export function startUpdateChecks() {
  const run = () => useApp.getState().settings?.updates.auto !== false && void checkForUpdates();
  const first = setTimeout(run, 15_000);
  const timer = setInterval(run, 6 * 3600_000);
  return () => (clearTimeout(first), clearInterval(timer));
}
