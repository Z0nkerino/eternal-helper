import { useEffect, useState } from 'react';
import { call, type Settings } from '../lib/ipc';
import { useT } from '../lib/i18n';
import { openChat, saveSettings, toast, useApp } from '../lib/store';
import { refreshWeather, searchPlaces, type Place } from '../lib/weather';
import { Emoji } from '../lib/emoji';
import { MODELS, checkSupport, explainLlm, loadModel, removeModel, setBaseModel, switchModel, useLlm } from '../afina/llm';

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

type Provider = Settings['afina']['provider'];
const DEV: Provider[] = ['anthropic', 'openai', 'ollama'];
const DEV_HINT: Partial<Record<Provider, string>> = { anthropic: 'claude-opus-5-5', openai: 'gpt-…', ollama: 'llama3.2' };
const ACCOUNTS: { id: Provider; name: string; emoji: string }[] = [
  { id: 'chatgpt', name: 'ChatGPT', emoji: '🟢' },
  { id: 'claude', name: 'Claude', emoji: '🟠' },
  { id: 'gemini', name: 'Gemini', emoji: '🔷' },
  { id: 'perplexity', name: 'Perplexity', emoji: '🔵' },
  { id: 'copilot', name: 'Copilot', emoji: '🟣' },
  { id: 'deepseek', name: 'DeepSeek', emoji: '🐳' },
];

/** Afina's brain: on-device model (default, like in Universal Planner), an AI account, or (for developers) an API key. */
export function AfinaSettings() {
  const t = useT();
  const a = useApp((s) => s.settings?.afina);
  const toolsOn = useApp((s) => !!s.settings?.afinaTools?.enabled);
  const llm = useLlm();
  const [dev, setDev] = useState(false);
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const lang = t.lang;
  const tr = (en: string, ru: string) => (lang === 'ru' ? ru : en);
  useEffect(() => {
    if (a) void call('secret_has', { name: `afina-${a.provider}` }).then(setHasKey);
    if (a?.provider === 'local') {
      setBaseModel(a.model);
      void checkSupport();
    }
  }, [a?.provider, a?.model]);
  if (!a) return null;
  const patch = (p: Partial<Settings['afina']>) => void saveSettings({ afina: { ...a, ...p } });
  const isLocal = a.provider === 'local';
  const isDev = DEV.includes(a.provider);

  return (
    <>
      <div className="setting column">
        <span>{tr('Afina’s brain', 'Мозг Афины')}</span>
        <div className="brain-picks">
          <button className={`brain ${isLocal ? 'on' : ''}`} onClick={() => patch({ provider: 'local', model: MODELS.some((m) => m.id === a.model) ? a.model : MODELS[0].id })}>
            <Emoji e="🔮" size={22} />
            <span>
              <b>{tr('On this computer', 'На этом компьютере')}</b>
              <span className="tiny faint">{tr('Free, private, works offline — the same engine as Afina in Universal Planner', 'Бесплатно, приватно, без интернета — тот же движок, что у Афины в Universal Planner')}</span>
            </span>
          </button>
          <div className="accounts">
            {ACCOUNTS.map((x) => (
              <button key={x.id} className={`account ${a.provider === x.id ? 'on' : ''}`} onClick={() => patch({ provider: x.id })}>
                <Emoji e={x.emoji} size={16} /> {x.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLocal && (
        <div className="setting column">
          <div className="row between">
            <span>{tr('On-device model', 'Модель на устройстве')}</span>
            <span className={`status ${llm.status === 'ready' ? 'ok' : llm.status === 'unsupported' || llm.status === 'error' ? 'warn' : ''}`}>
              {llm.status === 'ready' ? tr('Ready', 'Готова') : llm.status === 'downloading' ? `${Math.round(llm.progress * 100)}%` : llm.installed ? tr('Downloaded', 'Скачана') : llm.status === 'unsupported' ? tr('Not supported', 'Не поддерживается') : tr('Not downloaded', 'Не скачана')}
            </span>
          </div>
          {(llm.status === 'unsupported' || llm.status === 'error') && <p className="faint small">{explainLlm(llm.reason, lang)}</p>}
          <div className="models">
            {MODELS.map((m) => (
              <button key={m.id} className={`model ${a.model === m.id ? 'on' : ''}`} onClick={() => (patch({ model: m.id }), void switchModel(m.id))}>
                <span>{m.label}</span>
                <span className="tiny faint">{m.size} · {tr(m.note[0], m.note[1])}</span>
              </button>
            ))}
          </div>
          {llm.status === 'downloading' ? (
            <div className="progress"><div style={{ width: `${llm.progress * 100}%`, transition: 'width .3s' }} /></div>
          ) : (
            <div className="row gap">
              {llm.status !== 'unsupported' && llm.status !== 'ready' && (
                <button className="btn accent" onClick={() => void loadModel()}>{llm.installed ? tr('Load now', 'Загрузить') : tr('Download', 'Скачать')}</button>
              )}
              {llm.installed && <button className="btn" onClick={() => void removeModel()}>{tr('Remove from this computer', 'Удалить с компьютера')}</button>}
            </div>
          )}
        </div>
      )}

      {ACCOUNTS.some((x) => x.id === a.provider) && (
        <div className="setting">
          <span className="small muted">
            {tr('Sign in once in the service’s own window — no API key needed. Afina opens it with your question filled in.', 'Войди один раз в окне самого сервиса — API-ключ не нужен. Афина открывает его уже с твоим вопросом.')}
          </span>
          <button className="btn accent" onClick={() => openChat(a.provider)}>{tr('Open & sign in', 'Открыть и войти')}</button>
        </div>
      )}

      <Switch label={tr('Let Afina use this computer (find files and text in your folders, take screenshots, search the web)', 'Разрешить Афине пользоваться компьютером (искать файлы и текст в папках, делать скриншоты, искать в интернете)')} on={toolsOn} onChange={(enabled) => void saveSettings({ afinaTools: { enabled } } as never)} />

      <button className="link small dev-toggle" onClick={() => setDev(!dev)}>{dev || isDev ? '▾' : '▸'} {tr('For developers: use your own API key', 'Для разработчиков: свой API-ключ')}</button>
      {(dev || isDev) && (
        <>
          <Segment label={t('set.provider')} value={isDev ? a.provider : 'local'} options={[['local', '—'], ['anthropic', 'Claude API'], ['openai', 'OpenAI API'], ['ollama', 'Ollama']]} onChange={(provider) => patch({ provider, model: DEV_HINT[provider]?.includes('…') ? '' : DEV_HINT[provider] ?? a.model })} />
          {isDev && (
            <>
              <div className="setting">
                <span>{t('set.model')}</span>
                <input className="field" value={a.model} placeholder={DEV_HINT[a.provider]} onChange={(e) => patch({ model: e.target.value })} aria-label={t('set.model')} />
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
                  <input className="field" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? '••••••••' : ''} aria-label={t('set.key')} />
                  <button className="btn" type="submit">{t('set.save')}</button>
                </form>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
