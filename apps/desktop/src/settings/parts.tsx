import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n';
import { saveSettings, useApp } from '../lib/store';
import { refreshWeather, searchPlaces, type Place } from '../lib/weather';

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <button role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
        <span />
      </button>
    </label>
  );
}

export function Segment<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="setting">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Turns a key press into a Tauri accelerator like "Alt+Space" or "CommandOrControl+Shift+K". */
function accelerator(e: React.KeyboardEvent): string | null {
  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
  const mods = [e.ctrlKey && 'Control', e.metaKey && 'Super', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean);
  return mods.length ? [...mods, key].join('+') : null;
}

export function HotkeyField({ field = 'hotkey', label }: { field?: 'hotkey' | 'shotHotkey'; label?: string }) {
  const t = useT();
  const hotkey = useApp((s) => (field === 'hotkey' ? s.settings?.hotkey : s.settings?.shotHotkey) ?? '');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="setting">
      <span>{label ?? t('set.hotkey')}</span>
      <div className="col-end">
        <button
          className={`btn mono ${listening ? 'accent' : ''}`}
          onClick={() => (setListening(true), setError(''))}
          onBlur={() => setListening(false)}
          onKeyDown={(e) => {
            if (!listening) return;
            e.preventDefault();
            if (e.key === 'Escape') return setListening(false);
            const acc = accelerator(e);
            if (!acc) return;
            setListening(false);
            saveSettings({ [field]: acc }).catch((err) => setError(String(err)));
          }}
        >
          {listening ? t('set.hotkeyHelp') : hotkey}
        </button>
        {error && <span className="error small">{error}</span>}
      </div>
    </div>
  );
}

export function WeatherPlace() {
  const t = useT();
  const w = useApp((s) => s.settings?.weather);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Place[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const id = setTimeout(() => void searchPlaces(q, t.lang).then(setFound).catch(() => setFound([])), 300);
    return () => clearTimeout(id);
  }, [q, t.lang]);
  if (!w) return null;
  const choose = async (p: Place) => {
    setQ('');
    setFound([]);
    await saveSettings({ weather: { ...w, place: p.name, lat: p.latitude, lon: p.longitude } });
    void refreshWeather();
  };
  return (
    <>
      <div className="setting">
        <span>{t('set.city')}</span>
        <div className="col-end">
          <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder={w.place || t('set.citySearch')} aria-label={t('set.citySearch')} />
          {found.length > 0 && (
            <div className="dropdown">
              {found.map((p) => (
                <button key={`${p.latitude},${p.longitude}`} onClick={() => void choose(p)}>
                  {p.name}
                  <span className="faint small"> {[p.admin1, p.country].filter(Boolean).join(', ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <Segment label="°" value={w.unit} options={[['c', '°C'], ['f', '°F']]} onChange={(unit) => void saveSettings({ weather: { ...w, unit } }).then(refreshWeather)} />
    </>
  );
}
