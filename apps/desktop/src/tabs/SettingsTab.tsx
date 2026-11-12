import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { call, inTauri, type Settings } from '../lib/ipc';
import { useT } from '../lib/i18n';
import { saveSettings, toast, useApp } from '../lib/store';
import { refreshWeather, searchPlaces, type Place } from '../lib/weather';

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <button role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
        <span />
      </button>
    </label>
  );
}

function Segment<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
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

function HotkeyField() {
  const t = useT();
  const hotkey = useApp((s) => s.settings?.hotkey ?? '');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="setting">
      <span>{t('set.hotkey')}</span>
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
            saveSettings({ hotkey: acc }).catch((err) => setError(String(err)));
          }}
        >
          {listening ? t('set.hotkeyHelp') : hotkey}
        </button>
        {error && <span className="error small">{error}</span>}
      </div>
    </div>
  );
}

function WeatherPlace() {
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

const MODEL_HINT: Record<Settings['afina']['provider'], string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-…',
  ollama: 'llama3.2',
  off: '',
};

function AfinaSettings() {
  const t = useT();
  const a = useApp((s) => s.settings?.afina);
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => {
    if (a) void call('secret_has', { name: `afina-${a.provider}` }).then(setHasKey);
  }, [a?.provider]);
  if (!a) return null;
  const patch = (p: Partial<Settings['afina']>) => void saveSettings({ afina: { ...a, ...p } });
  return (
    <>
      <Segment
        label={t('set.provider')}
        value={a.provider}
        options={[['anthropic', 'Claude'], ['openai', 'OpenAI API'], ['ollama', 'Ollama'], ['off', t('off')]]}
        onChange={(provider) => patch({ provider, model: MODEL_HINT[provider].includes('…') ? '' : MODEL_HINT[provider] })}
      />
      {a.provider !== 'off' && (
        <>
          <div className="setting">
            <span>{t('set.model')}</span>
            <input className="field" value={a.model} placeholder={MODEL_HINT[a.provider]} onChange={(e) => patch({ model: e.target.value })} aria-label={t('set.model')} />
          </div>
          {a.provider !== 'anthropic' && (
            <div className="setting">
              <span>{t('set.baseUrl')}</span>
              <input className="field" value={a.baseUrl} placeholder={a.provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com'} onChange={(e) => patch({ baseUrl: e.target.value })} aria-label={t('set.baseUrl')} />
            </div>
          )}
          <div className="setting">
            <span>{t('set.key')}</span>
            <form
              className="row gap"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await call('secret_set', { name: `afina-${a.provider}`, value: key.trim() });
                  setHasKey(!!key.trim());
                  setKey('');
                  toast(t('set.keySaved'), { tone: 'ok', force: true });
                } catch (err) {
                  toast(String(err), { tone: 'error' });
                }
              }}
            >
              <input className="field" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? '••••••••' : a.provider === 'anthropic' ? 'sk-ant-…' : ''} aria-label={t('set.key')} />
              <button className="btn" type="submit">{t('set.save')}</button>
            </form>
          </div>
        </>
      )}
    </>
  );
}

export function SettingsTab() {
  const t = useT();
  const s = useApp((x) => x.settings);
  if (!s) return null;
  const pickFolder = async () => {
    const dir = inTauri ? await open({ directory: true }) : null;
    if (typeof dir === 'string') await saveSettings({ recording: { ...s.recording, folder: dir } });
  };
  return (
    <div className="settings scroll">
      <section>
        <h3>{t('set.general')}</h3>
        <Segment label={t('set.language')} value={s.language} options={[['auto', 'Auto'], ['ru', 'Русский'], ['en', 'English']]} onChange={(language) => void saveSettings({ language })} />
        <Segment label={t('set.monitor')} value={s.monitor} options={[['primary', t('set.monitor.primary')], ['cursor', t('set.monitor.cursor')]]} onChange={(monitor) => void saveSettings({ monitor })} />
        <Segment
          label={t('set.tabs')}
          value={s.tabsPosition}
          options={[['auto', t('set.tabs.auto')], ['top', t('set.tabs.top')], ['bottom', t('set.tabs.bottom')], ['side', t('set.tabs.side')]]}
          onChange={(tabsPosition) => void saveSettings({ tabsPosition })}
        />
        <p className="faint small setting-help">{t('set.tabsHelp')}</p>
        <HotkeyField />
        <Switch label={t('set.autostart')} on={s.autostart} onChange={(autostart) => void saveSettings({ autostart })} />
        <Switch label={t('set.dnd')} on={s.doNotDisturb} onChange={(doNotDisturb) => void saveSettings({ doNotDisturb })} />
        <Switch label={t('set.fullscreen')} on={s.hideInFullscreen} onChange={(hideInFullscreen) => void saveSettings({ hideInFullscreen })} />
      </section>
      <section>
        <h3>{t('set.afina')}</h3>
        <AfinaSettings />
      </section>
      <section>
        <h3>{t('set.weather')}</h3>
        <WeatherPlace />
      </section>
      <section>
        <h3>{t('set.recordings')}</h3>
        <div className="setting">
          <span>{t('rec.folder')}</span>
          <button className="link small ellipsis" onClick={() => void pickFolder()}>
            {s.recording.folder || (t.lang === 'ru' ? 'Видео / Eternal Helper' : 'Videos / Eternal Helper')}
          </button>
        </div>
      </section>
      <section>
        <h3>{t('set.planner')}</h3>
        <div className="setting">
          <span>{t('set.port')}</span>
          <input
            className="field mono"
            type="number"
            min={1024}
            max={65535}
            defaultValue={s.planner.port}
            onBlur={(e) => {
              const port = parseInt(e.target.value, 10);
              if (port >= 1024 && port <= 65535 && port !== s.planner.port) void saveSettings({ planner: { ...s.planner, port } });
            }}
            aria-label={t('set.port')}
          />
        </div>
      </section>
      <section>
        <h3>{t('set.dev')}</h3>
        <Switch label={t('set.safeAreas')} on={s.debugSafeAreas} onChange={(debugSafeAreas) => void saveSettings({ debugSafeAreas })} />
      </section>
      <section className="about">
        <img src="/eternal-inc.svg" width={28} height={28} alt="" />
        <div>
          <div>Eternal Helper 0.1.1</div>
          <div className="faint small">© 2026 Eternal Inc. · Universal Planner · Afina</div>
        </div>
        <div className="grow" />
        <button className="btn" onClick={() => void call('quit')}>{t('set.quit')}</button>
      </section>
    </div>
  );
}
