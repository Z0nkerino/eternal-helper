// Battery level once a minute, with gentle toasts at 100% (charging) and 20% / 10% (on battery).
import { call } from './ipc';
import { tNow } from './i18n';
import { toast, useApp } from './store';

let lastAlert = '';

export function startBattery(alerts = true) {
  const read = async () => {
    const b = await call('battery').catch(() => null);
    useApp.setState({ battery: b });
    if (!b?.present || !alerts) return;
    const key = b.charging || b.plugged ? (b.percent >= 100 ? 'full' : '') : b.percent <= 10 ? 'ten' : b.percent <= 20 ? 'low' : '';
    if (key && key !== lastAlert) {
      if (key === 'full') toast(`🔋 ${tNow('bat.full')}`, { tone: 'ok' });
      else toast(`🪫 ${tNow('bat.low')} ${b.percent}%`, { tone: 'warn', force: key === 'ten' });
    }
    lastAlert = key;
  };
  void read();
  const t = setInterval(() => void read(), 60_000);
  return () => clearInterval(t);
}
