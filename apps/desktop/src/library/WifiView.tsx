// Wi-Fi: networks around (Windows), connect with a password right here; on macOS join by name.
import { Lock, RefreshCw, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { call } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { toast } from '../lib/store';
import { readControls, useControls } from '../lib/controls';

type Net = { ssid: string; signal: number; secure: boolean; known: boolean };

export function WifiView() {
  const tr = useTr();
  const c = useControls((s) => s.c);
  const [nets, setNets] = useState<Net[] | null>(null);
  const [scanError, setScanError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const scan = () => {
    setNets(null);
    void call('wifi_networks').then(setNets).catch((e) => (String(e) === 'scan-unavailable' ? setScanError(true) : (setNets([]), toast(String(e), { tone: 'warn' }))));
  };
  useEffect(scan, []);

  const connect = async (ssid: string, password: string | null) => {
    setBusy(true);
    try {
      await call('wifi_connect', { ssid, password });
      toast(`📶 ${tr('Connecting to', 'Подключаюсь к')} ${ssid}`, { tone: 'ok', force: true });
      setOpen(null);
      setPw('');
      setTimeout(() => void readControls(), 4000);
    } catch (e) {
      toast(String(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wifi">
      <div className="row between">
        <span className="small muted">{c?.wifiName ? `${tr('Connected to', 'Подключено к')} ${c.wifiName}` : tr('Not connected', 'Не подключено')}</span>
        {!scanError && (
          <button className="icon-btn" aria-label={tr('Rescan', 'Обновить')} onClick={scan}>
            <RefreshCw size={14} />
          </button>
        )}
      </div>
      {scanError ? (
        <form className="wifi-join" onSubmit={(e) => (e.preventDefault(), name && void connect(name, pw || null))}>
          <p className="faint small">{tr('macOS only lets apps list networks with Location access, so join a network by its name here:', 'macOS показывает список сетей только с доступом к геолокации, поэтому подключись по имени сети:')}</p>
          <input className="field" placeholder={tr('Network name', 'Имя сети')} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="field" type="password" placeholder={tr('Password', 'Пароль')} value={pw} onChange={(e) => setPw(e.target.value)} />
          <div className="row gap">
            <button className="btn accent" disabled={!name || busy}>{tr('Join', 'Подключиться')}</button>
            <button type="button" className="btn" onClick={() => void call('open_system_settings', { page: 'wifi' })}>{tr('Wi-Fi settings', 'Настройки Wi-Fi')}</button>
          </div>
        </form>
      ) : nets == null ? (
        <div className="faint small">{tr('Looking for networks…', 'Ищу сети…')}</div>
      ) : (
        <ul className="nets">
          {nets.map((n) => (
            <li key={n.ssid} className={open === n.ssid ? 'open' : ''}>
              <button className="net" onClick={() => (n.secure && !n.known ? setOpen(open === n.ssid ? null : n.ssid) : void connect(n.ssid, null))}>
                <Wifi size={15} style={{ opacity: 0.35 + n.signal / 150 }} />
                <span className="grow ellipsis">{n.ssid}</span>
                {c?.wifiName === n.ssid && <span className="tiny status ok">{tr('connected', 'подключено')}</span>}
                {n.known && c?.wifiName !== n.ssid && <span className="tiny faint">{tr('saved', 'сохранена')}</span>}
                {n.secure && <Lock size={12} className="faint" />}
                <span className="tiny faint mono">{n.signal}%</span>
              </button>
              {open === n.ssid && (
                <form className="net-pw" onSubmit={(e) => (e.preventDefault(), void connect(n.ssid, pw))}>
                  <input className="field" type="password" autoFocus placeholder={tr('Password', 'Пароль')} value={pw} onChange={(e) => setPw(e.target.value)} />
                  <button className="btn accent" disabled={pw.length < 8 || busy}>{tr('Connect', 'Подключить')}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
