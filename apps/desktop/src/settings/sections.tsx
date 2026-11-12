// All settings, in sections. The same sections appear stacked in the island's Settings tab and with a
// sidebar in the separate Settings window. Every change is saved at once and the island updates live.
import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { call, inTauri, type CarouselItem, type MusicService, type Settings } from '../lib/ipc';
import { useT, useTr } from '../lib/i18n';
import { saveSettings, useApp } from '../lib/store';
import { ACCENTS, THEMES } from '../lib/theme';
import { CAROUSEL_ITEMS, LIMITS, safeAccent } from '../lib/defaults';
import { MODULES } from '../modules';
import { checkForUpdates, installUpdate } from '../lib/updates';
import { Emoji } from '../lib/emoji';
import { RELEASE } from '../lib/release';
import { AfinaSettings, HotkeyField, Segment, Switch, WeatherPlace } from './parts';

type S = Settings;
const patch = <K extends keyof S>(key: K, cur: S[K], p: Partial<S[K]>) => void saveSettings({ [key]: { ...(cur as object), ...p } } as Partial<S>);

function General({ s }: { s: S }) {
  const t = useT();
  return (
    <>
      <Segment label={t('set.language')} value={s.language} options={[['auto', 'Auto'], ['ru', 'Русский'], ['en', 'English']]} onChange={(language) => void saveSettings({ language })} />
      <Segment label={t('set.monitor')} value={s.monitor} options={[['primary', t('set.monitor.primary')], ['cursor', t('set.monitor.cursor')]]} onChange={(monitor) => void saveSettings({ monitor })} />
      <HotkeyField label={t.lang === 'ru' ? 'Остров и Афина' : 'Island & Afina'} />
      <HotkeyField field="shotHotkey" label={t.lang === 'ru' ? 'Скриншот' : 'Screenshot'} />
      <Switch label={t('set.autostart')} on={s.autostart} onChange={(autostart) => void saveSettings({ autostart })} />
      <Switch label={t('set.dnd')} on={s.doNotDisturb} onChange={(doNotDisturb) => void saveSettings({ doNotDisturb })} />
      <Switch label={t('set.fullscreen')} on={s.hideInFullscreen} onChange={(hideInFullscreen) => void saveSettings({ hideInFullscreen })} />
    </>
  );
}

function Range({ label, value, set, range, step, fmt }: { label: string; value: number; set: (v: number) => void; range: readonly [number, number]; step: number; fmt: (v: number) => string }) {
  return (
    <div className="setting">
      <span>{label}</span>
      <div className="row gap">
        <input type="range" min={range[0]} max={range[1]} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} aria-label={label} />
        <span className="mono small range-val">{fmt(value)}</span>
      </div>
    </div>
  );
}

function Personalise({ s }: { s: S }) {
  const t = useT();
  const tr = useTr();
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const optional = MODULES.filter((m) => m.id !== 'home' && m.id !== 'settings');
  const visible = MODULES.length - s.hiddenTabs.length;
  return (
    <>
      <div className="setting">
        <span>{tr('What should we call you?', 'Как к тебе обращаться?')}</span>
        <input className="field" maxLength={LIMITS.nameLength} value={s.name} placeholder={tr('Your name (optional)', 'Имя (необязательно)')} onChange={(e) => void saveSettings({ name: e.target.value.slice(0, LIMITS.nameLength) })} aria-label={tr('Your name', 'Имя')} />
      </div>
      <Range label={tr('Island size', 'Размер острова')} value={s.uiScale} set={(uiScale) => void saveSettings({ uiScale })} range={LIMITS.uiScale} step={0.05} fmt={pct} />
      <Range label={tr('Text size', 'Размер текста')} value={s.fontScale} set={(fontScale) => void saveSettings({ fontScale })} range={LIMITS.fontScale} step={0.05} fmt={pct} />
      <Range label={tr('Island opacity', 'Непрозрачность острова')} value={s.islandOpacity} set={(islandOpacity) => void saveSettings({ islandOpacity })} range={LIMITS.islandOpacity} step={0.02} fmt={pct} />
      <Segment label={tr('Clock', 'Часы')} value={s.clock24 ? '24' : '12'} options={[['24', '24 h'], ['12', '12 h AM/PM']]} onChange={(v) => void saveSettings({ clock24: v === '24' })} />
      <Switch label={tr('Show seconds', 'Показывать секунды')} on={s.clockSeconds} onChange={(clockSeconds) => void saveSettings({ clockSeconds })} />
      <Segment label={tr('Animations', 'Анимации')} value={s.motion} options={[['full', tr('Smooth & lively', 'Плавные и живые')], ['reduced', tr('Reduced', 'Минимум')]]} onChange={(motion) => void saveSettings({ motion })} />
      <div className="setting column">
        <span>{tr('Tabs in the panel', 'Вкладки в панели')}</span>
        <div className="tab-picks">
          {optional.map((m) => {
            const Icon = m.icon!;
            const on = !s.hiddenTabs.includes(m.id);
            return (
              <label key={m.id} className={`tab-pick ${on ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  // Keep at least 4 tabs so the panel stays useful.
                  disabled={on && visible <= 4}
                  onChange={() => void saveSettings({ hiddenTabs: on ? [...s.hiddenTabs, m.id] : s.hiddenTabs.filter((x) => x !== m.id) })}
                />
                <Icon size={14} /> {t(m.name)}
              </label>
            );
          })}
        </div>
        <span className="tiny faint">{tr('Home and Settings always stay. At least 4 tabs.', 'Главная и Настройки остаются всегда. Минимум 4 вкладки.')}</span>
      </div>
      <div className="setting">
        <span className="faint small">{tr('Back to how it came', 'Вернуть как было')}</span>
        <button className="btn" onClick={() => void saveSettings({ name: '', uiScale: 1, fontScale: 1, islandOpacity: 1, motion: 'full', clockSeconds: false, hiddenTabs: [] })}>{tr('Reset', 'Сбросить')}</button>
      </div>
    </>
  );
}

const ITEM_NAMES: Record<CarouselItem, [string, string, string]> = {
  time: ['🕐', 'Time + weather', 'Время + погода'],
  event: ['📅', 'Next event', 'Ближайшее событие'],
  battery: ['🔋', 'Battery', 'Батарея'],
  currency: ['💱', 'Currency', 'Курс валют'],
  track: ['🎵', 'Current track', 'Текущий трек'],
};

function Appearance({ s }: { s: S }) {
  const t = useT();
  const tr = useTr();
  const themeNames: Record<S['theme'], [string, string]> = { classic: ['Classic', 'Классика'], glass: ['Liquid Glass', 'Liquid Glass'], neon: ['Neon', 'Неон'], minimal: ['Minimal', 'Минимал'] };
  const items = s.carousel.items;
  const move = (i: number, d: number) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    patch('carousel', s.carousel, { items: next });
  };
  return (
    <>
      <div className="setting">
        <span>{tr('Island theme', 'Тема острова')}</span>
        <div className="theme-picks" role="radiogroup">
          {THEMES.map((th) => (
            <button key={th} role="radio" aria-checked={s.theme === th} className={`theme-pick theme-${th} ${s.theme === th ? 'on' : ''}`} onClick={() => void saveSettings({ theme: th })}>
              <span className="theme-swatch" />
              <span className="small">{tr(...themeNames[th])}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="setting">
        <span>{tr('Accent colour', 'Акцентный цвет')}</span>
        <div className="swatches" role="radiogroup">
          {ACCENTS.map((c) => (
            <button key={c} role="radio" aria-checked={s.accent === c} aria-label={c} className={`swatch ${s.accent.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }} onClick={() => void saveSettings({ accent: c })} />
          ))}
          <label className={`swatch custom ${ACCENTS.some((c) => c.toLowerCase() === s.accent.toLowerCase()) ? '' : 'on'}`} title={tr('Your own colour', 'Свой цвет')} style={{ background: ACCENTS.includes(s.accent) ? 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' : safeAccent(s.accent) }}>
            <input type="color" value={safeAccent(s.accent)} onChange={(e) => void saveSettings({ accent: safeAccent(e.target.value) })} aria-label={tr('Your own colour', 'Свой цвет')} />
          </label>
        </div>
      </div>
      <div className="setting">
        <span>{tr('Corner roundness', 'Скругление углов')}</span>
        <input type="range" min={0.5} max={1.4} step={0.05} value={s.radius} onChange={(e) => void saveSettings({ radius: parseFloat(e.target.value) })} aria-label={tr('Corner roundness', 'Скругление углов')} />
      </div>
      <Segment
        label={t('set.tabs')}
        value={s.tabsPosition}
        options={[['auto', t('set.tabs.auto')], ['top', t('set.tabs.top')], ['bottom', t('set.tabs.bottom')], ['side', t('set.tabs.side')]]}
        onChange={(tabsPosition) => void saveSettings({ tabsPosition })}
      />
      <p className="faint small setting-help">{t('set.tabsHelp')}</p>
      <Switch label={tr('Rotating widgets in the pill', 'Карусель виджетов в пилюле')} on={s.carousel.enabled} onChange={(enabled) => patch('carousel', s.carousel, { enabled })} />
      {s.carousel.enabled && (
        <>
          <div className="setting">
            <span>{tr('Switch every', 'Переключать каждые')}</span>
            <div className="row gap">
              <input type="range" min={3} max={20} step={1} value={s.carousel.interval} onChange={(e) => patch('carousel', s.carousel, { interval: parseInt(e.target.value, 10) })} aria-label={tr('Seconds', 'Секунды')} />
              <span className="mono small">{s.carousel.interval} {tr('s', 'с')}</span>
            </div>
          </div>
          <div className="setting column">
            <span>{tr('Widgets and order', 'Виджеты и порядок')}</span>
            <ul className="order-list">
              {CAROUSEL_ITEMS.map((it) => {
                const on = items.includes(it);
                const i = items.indexOf(it);
                return (
                  <li key={it} className={on ? '' : 'off'}>
                    <input type="checkbox" checked={on} onChange={() => patch('carousel', s.carousel, { items: on ? items.filter((x) => x !== it) : [...items, it] })} aria-label={tr(ITEM_NAMES[it][1], ITEM_NAMES[it][2])} />
                    <Emoji e={ITEM_NAMES[it][0]} size={16} />
                    <span className="grow">{tr(ITEM_NAMES[it][1], ITEM_NAMES[it][2])}</span>
                    {on && (
                      <>
                        <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={tr('Move up', 'Выше')}>
                          <ArrowUp size={14} />
                        </button>
                        <button className="icon-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={tr('Move down', 'Ниже')}>
                          <ArrowDown size={14} />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </>
  );
}

const SERVICE_EMOJI: Record<MusicService['id'], string> = { spotify: '🟢', yandex: '🟡', soundcloud: '🟠' };

function Music({ s }: { s: S }) {
  const tr = useTr();
  const [list, setList] = useState<MusicService[]>([]);
  const web = useApp((x) => x.webMusic);
  const reload = () => void call('music_services').then(setList);
  useEffect(() => {
    reload();
    const id = setInterval(reload, 2000);
    return () => clearInterval(id);
  }, []);
  const startHidden = s.music.startHidden;
  return (
    <>
      <p className="faint small setting-help">
        {tr(
          'Sign in on the service’s own page in a player window — Eternal Helper never sees your password. The island then shows what plays there and controls it. Closing the player window keeps the music playing. Apps like the Spotify or Yandex Music desktop apps are picked up automatically through the system, without signing in here.',
          'Вход — на странице самого сервиса в окне плеера, пароль Eternal Helper не видит. После входа остров показывает, что там играет, и управляет воспроизведением. Если закрыть окно плеера, музыка продолжит играть. Приложения Spotify или Яндекс Музыки для компьютера остров видит сам, через систему, без входа здесь.',
        )}
      </p>
      {list.map((m) => {
        const now = web[m.id];
        return (
          <div className="setting" key={m.id}>
            <span className="row gap">
              <Emoji e={SERVICE_EMOJI[m.id]} size={14} />
              <span>
                <div>{m.id === 'yandex' ? tr('Yandex Music', 'Яндекс Музыка') : m.name}</div>
                <div className="faint small ellipsis" style={{ maxWidth: 260 }}>
                  {now?.title ? `${now.playing ? '▶' : '⏸'} ${now.title} — ${now.artist}` : m.open ? tr('Player is open', 'Плеер открыт') : tr('Not connected', 'Не подключено')}
                </div>
              </span>
            </span>
            <div className="row gap">
              <label className="small faint row gap" title={tr('Start the player hidden when Eternal Helper starts', 'Запускать плеер скрытым вместе с Eternal Helper')}>
                <input type="checkbox" checked={startHidden.includes(m.id)} onChange={(e) => patch('music', s.music, { startHidden: e.target.checked ? [...startHidden, m.id] : startHidden.filter((x) => x !== m.id) })} />
                {tr('at start', 'при запуске')}
              </label>
              {m.visible ? (
                <button className="btn" onClick={() => void call('music_hide', { service: m.id }).then(reload)}>{tr('Hide', 'Скрыть')}</button>
              ) : (
                <button className="btn accent" onClick={() => void call('music_open', { service: m.id, show: true }).then(reload)}>
                  {m.open ? tr('Show player', 'Показать плеер') : tr('Sign in', 'Войти')}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div className="setting">
        <span className="faint small">{tr('Signs you out of all three services on this computer.', 'Выход из всех трёх сервисов на этом компьютере.')}</span>
        <button className="btn" onClick={() => void call('music_sign_out').then(reload)}>{tr('Sign out', 'Выйти')}</button>
      </div>
    </>
  );
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'RUB', 'CNY', 'JPY', 'TRY', 'AED', 'KZT', 'UAH', 'BYN', 'GEL', 'CHF', 'PLN', 'INR', 'BTC'];
const CITIES: { tz: string; city: string }[] = [
  { tz: 'Europe/Moscow', city: 'Москва' }, { tz: 'Europe/London', city: 'London' }, { tz: 'Europe/Berlin', city: 'Berlin' }, { tz: 'Asia/Dubai', city: 'Dubai' },
  { tz: 'Asia/Tokyo', city: 'Tokyo' }, { tz: 'Asia/Shanghai', city: 'Shanghai' }, { tz: 'Asia/Almaty', city: 'Almaty' }, { tz: 'Asia/Yekaterinburg', city: 'Екатеринбург' },
  { tz: 'Asia/Novosibirsk', city: 'Новосибирск' }, { tz: 'Asia/Vladivostok', city: 'Владивосток' }, { tz: 'Europe/Istanbul', city: 'Istanbul' }, { tz: 'America/New_York', city: 'New York' },
  { tz: 'America/Los_Angeles', city: 'Los Angeles' }, { tz: 'Australia/Sydney', city: 'Sydney' }, { tz: 'Asia/Kolkata', city: 'Delhi' }, { tz: 'Asia/Tbilisi', city: 'Tbilisi' },
];

function WeatherToday({ s }: { s: S }) {
  const tr = useTr();
  const pairs = s.currency.pairs;
  const setPair = (i: number, k: 0 | 1, v: string) => patch('currency', s.currency, { pairs: pairs.map((p, j) => (j === i ? ((k === 0 ? [v, p[1]] : [p[0], v]) as [string, string]) : p)) });
  return (
    <>
      <WeatherPlace />
      <div className="setting column">
        <span>{tr('Currency pairs', 'Валютные пары')}</span>
        {pairs.map((p, i) => (
          <div key={i} className="row gap">
            <select className="field narrow" value={p[0]} onChange={(e) => setPair(i, 0, e.target.value)} aria-label={tr('From', 'Из')}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            →
            <select className="field narrow" value={p[1]} onChange={(e) => setPair(i, 1, e.target.value)} aria-label={tr('To', 'В')}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className="icon-btn" onClick={() => patch('currency', s.currency, { pairs: pairs.filter((_, j) => j !== i) })} aria-label={tr('Remove', 'Убрать')}>
              <X size={14} />
            </button>
          </div>
        ))}
        {pairs.length < 4 && (
          <button className="btn" onClick={() => patch('currency', s.currency, { pairs: [...pairs, ['USD', 'EUR']] })}>
            <Plus size={14} /> {tr('Add pair', 'Добавить пару')}
          </button>
        )}
        <span className="faint tiny">
          {tr('Rates by', 'Курсы:')} <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">ExchangeRate-API</a>
        </span>
      </div>
      <div className="setting column">
        <span>{tr('World clocks', 'Мировые часы')}</span>
        {s.clocks.map((c, i) => (
          <div key={c.tz + i} className="row gap">
            <select className="field" value={c.tz} onChange={(e) => void saveSettings({ clocks: s.clocks.map((x, j) => (j === i ? CITIES.find((k) => k.tz === e.target.value) ?? x : x)) })} aria-label={tr('City', 'Город')}>
              {[c, ...CITIES.filter((k) => k.tz !== c.tz)].map((k) => <option key={k.tz} value={k.tz}>{k.city}</option>)}
            </select>
            <button className="icon-btn" onClick={() => void saveSettings({ clocks: s.clocks.filter((_, j) => j !== i) })} aria-label={tr('Remove', 'Убрать')}>
              <X size={14} />
            </button>
          </div>
        ))}
        {s.clocks.length < 3 && (
          <button className="btn" onClick={() => void saveSettings({ clocks: [...s.clocks, CITIES.find((k) => !s.clocks.some((c) => c.tz === k.tz))!] })}>
            <Plus size={14} /> {tr('Add city', 'Добавить город')}
          </button>
        )}
      </div>
    </>
  );
}

function Recordings({ s }: { s: S }) {
  const t = useT();
  const pick = async () => {
    const dir = inTauri ? await open({ directory: true }) : null;
    if (typeof dir === 'string') patch('recording', s.recording, { folder: dir });
  };
  return (
    <>
      <div className="setting">
        <span>{t('rec.folder')}</span>
        <button className="link small ellipsis" onClick={() => void pick()}>
          {s.recording.folder || (t.lang === 'ru' ? 'Видео / Eternal Helper' : 'Videos / Eternal Helper')}
        </button>
      </div>
      <Segment
        label={t('rec.audio')}
        value={s.recording.audio}
        options={[['none', t('rec.audio.none')], ['system', t('rec.audio.system')], ['system+mic', t('rec.audio.mic')]]}
        onChange={(audio) => patch('recording', s.recording, { audio })}
      />
    </>
  );
}

function Planner({ s }: { s: S }) {
  const t = useT();
  return (
    <div className="setting">
      <span>{t('set.port')}</span>
      <input
        className="field mono narrow"
        type="number"
        min={1024}
        max={65535}
        defaultValue={s.planner.port}
        onBlur={(e) => {
          const port = parseInt(e.target.value, 10);
          if (port >= 1024 && port <= 65535 && port !== s.planner.port) patch('planner', s.planner, { port });
        }}
        aria-label={t('set.port')}
      />
    </div>
  );
}

function Cloudy({ s }: { s: S }) {
  const tr = useTr();
  const c = s.cloudy;
  return (
    <>
      <div className="setting">
        <span className="small muted">{tr('Feed Cloudy, play with him and set how he behaves in his own window.', 'Покорми Cloudy, поиграй с ним и настрой его поведение в его окне.')}</span>
        <button className="btn accent" onClick={() => void call('open_window', { kind: 'pet' })}>☁️ {tr('Cloudy’s room', 'Комната Cloudy')}</button>
      </div>
      <Switch label={tr('Cloudy lives on the desktop', 'Cloudy живёт на рабочем столе')} on={c.enabled} onChange={(enabled) => patch('cloudy', c, { enabled })} />
      {c.enabled && (
        <>
          <div className="setting">
            <span>{tr('Size', 'Размер')}</span>
            <input type="range" min={48} max={120} step={2} value={c.size} onChange={(e) => patch('cloudy', c, { size: parseInt(e.target.value, 10) })} aria-label={tr('Size', 'Размер')} />
          </div>
          <div className="setting">
            <span>{tr('Speed', 'Скорость')}</span>
            <input type="range" min={0.5} max={2} step={0.1} value={c.speed} onChange={(e) => patch('cloudy', c, { speed: parseFloat(e.target.value) })} aria-label={tr('Speed', 'Скорость')} />
          </div>
          <Segment
            label={tr('Wanders around', 'Гуляет по экрану')}
            value={c.roam}
            options={[['stay', tr('Stays', 'Сидит')], ['rare', tr('Rarely', 'Редко')], ['sometimes', tr('Sometimes', 'Иногда')], ['often', tr('Often', 'Часто')]]}
            onChange={(roam) => patch('cloudy', c, { roam })}
          />
          <Segment
            label={tr('Speech bubbles', 'Реплики')}
            value={c.chatter}
            options={[['never', tr('Never', 'Никогда')], ['rare', tr('Rarely', 'Редко')], ['normal', tr('Sometimes', 'Иногда')], ['often', tr('Often', 'Часто')]]}
            onChange={(chatter) => patch('cloudy', c, { chatter })}
          />
          <p className="faint small setting-help">
            {tr('Drag Cloudy to a new spot or throw him; click to pet, double-click to tickle, right-click for his menu. He hides in fullscreen apps and while you record.', 'Перетащи Cloudy на новое место или подбрось; клик — погладить, двойной клик — пощекотать, правый клик — меню. Он прячется в полноэкранных приложениях и во время записи.')}
          </p>
        </>
      )}
    </>
  );
}

function Updates({ s }: { s: S }) {
  const tr = useTr();
  const u = useApp((x) => x.update);
  const [checking, setChecking] = useState(false);
  return (
    <>
      <div className="setting">
        <span>
          <div>Eternal Helper {RELEASE.name} · {RELEASE.codename}</div>
          <div className="faint small">
            {u?.progress != null
              ? `${tr('Downloading', 'Скачивание')} ${Math.round(u.progress * 100)}%`
              : u?.available
                ? `${tr('Version', 'Версия')} ${u.latest} ${tr('is ready to install', 'готова к установке')}`
                : u && !u.error
                  ? tr('You have the latest version', 'У тебя последняя версия')
                  : u?.error
                    ? u.error
                    : tr('Updates come from GitHub Releases', 'Обновления приходят из GitHub Releases')}
          </div>
          {u?.progress != null && (
            <div className="progress" style={{ marginTop: 6 }}>
              <div style={{ width: `${u.progress * 100}%`, transition: 'width .2s' }} />
            </div>
          )}
        </span>
        {u?.available ? (
          <button className="btn accent" disabled={u.progress != null} onClick={() => void installUpdate()}>{tr('Update and restart', 'Обновить и перезапустить')}</button>
        ) : (
          <button className="btn" disabled={checking} onClick={() => (setChecking(true), void checkForUpdates(true).finally(() => setChecking(false)))}>
            {checking ? '…' : tr('Check now', 'Проверить')}
          </button>
        )}
      </div>
      <Switch label={tr('Check for updates automatically', 'Проверять обновления автоматически')} on={s.updates.auto} onChange={(auto) => patch('updates', s.updates, { auto })} />
    </>
  );
}

function Developer({ s }: { s: S }) {
  const t = useT();
  return <Switch label={t('set.safeAreas')} on={s.debugSafeAreas} onChange={(debugSafeAreas) => void saveSettings({ debugSafeAreas })} />;
}

function About() {
  const t = useT();
  const tr = useTr();
  return (
    <div className="setting about-row">
      <img src="/eternal-inc.svg" width={28} height={28} alt="" />
      <div className="grow">
        <div>Eternal Helper {RELEASE.name} «{RELEASE.codename}»</div>
        <div className="faint small">© 2026 Eternal Inc. · Universal Planner · Afina · Cloudy · {tr('build', 'сборка')} {__APP_VERSION__}</div>
      </div>
      <button className="btn" onClick={() => void call('quit')}>{t('set.quit')}</button>
    </div>
  );
}

export interface Section {
  id: string;
  emoji: string;
  title: [string, string];
  /** One line under the title saying what's inside. */
  desc: [string, string];
  /** Extra words for search, both languages. */
  keywords: string;
  Body: (p: { s: S }) => JSX.Element;
}

export const SECTIONS: Section[] = [
  { id: 'personal', emoji: '✨', title: ['Personalise', 'Под себя'], desc: ['Your name, sizes, clock, animations and tabs', 'Имя, размеры, часы, анимации и вкладки'], keywords: 'name size scale text font opacity clock 24 seconds animation motion tabs имя размер текст шрифт прозрачность часы секунды анимация вкладки', Body: Personalise },
  { id: 'appearance', emoji: '🎨', title: ['Appearance', 'Внешний вид'], desc: ['Theme, colour, corners and the widgets in the pill', 'Тема, цвет, углы и виджеты в пилюле'], keywords: 'theme glass neon minimal accent colour color corner radius carousel widgets тема стекло неон цвет акцент углы карусель виджеты', Body: Appearance },
  { id: 'general', emoji: '⚙️', title: ['General', 'Общие'], desc: ['Language, monitor, shortcuts and start-up', 'Язык, монитор, горячие клавиши и запуск'], keywords: 'language monitor shortcut hotkey screenshot autostart login dnd fullscreen язык монитор клавиши скриншот автозапуск не беспокоить', Body: General },
  { id: 'afina', emoji: '🔮', title: ['Afina & AI', 'Afina и ИИ'], desc: ['Afina’s brain, AI accounts and computer access', 'Мозг Афины, ИИ-аккаунты и доступ к компьютеру'], keywords: 'ai brain model webllm chatgpt claude gemini perplexity copilot deepseek files tools ии мозг модель файлы', Body: () => <AfinaSettings /> },
  { id: 'music', emoji: '🎧', title: ['Music accounts', 'Музыка'], desc: ['Spotify, Yandex Music and SoundCloud', 'Spotify, Яндекс Музыка и SoundCloud'], keywords: 'spotify yandex soundcloud music player музыка плеер яндекс', Body: Music },
  { id: 'today', emoji: '🌤️', title: ['Weather & Today', 'Погода и «Сегодня»'], desc: ['City, currency pairs and world clocks', 'Город, валюты и мировые часы'], keywords: 'weather city currency rates clocks time zone погода город валюта курс часы пояс', Body: WeatherToday },
  { id: 'cloudy', emoji: '☁️', title: ['Cloudy', 'Cloudy'], desc: ['Your desktop cloud: size, speed and chatter', 'Облачко на рабочем столе: размер, скорость, реплики'], keywords: 'cloudy pet cloud feed облачко питомец кормить', Body: Cloudy },
  { id: 'recordings', emoji: '🎬', title: ['Recordings', 'Записи'], desc: ['Where videos go and which sound is recorded', 'Куда сохраняются видео и какой звук пишется'], keywords: 'record video screen folder sound microphone запись видео экран папка звук микрофон', Body: Recordings },
  { id: 'planner', emoji: '🗓️', title: ['Universal Planner', 'Universal Planner'], desc: ['The local connection to your planner', 'Подключение к планеру'], keywords: 'planner webhook port backup планер порт', Body: Planner },
  { id: 'updates', emoji: '🔄', title: ['Updates', 'Обновления'], desc: ['Check for and install new versions', 'Проверка и установка новых версий'], keywords: 'update version release обновление версия', Body: Updates },
  { id: 'developer', emoji: '🛠️', title: ['For developers', 'Для разработчиков'], desc: ['Debug overlays', 'Отладка'], keywords: 'debug safe area notch отладка вырез', Body: Developer },
  { id: 'about', emoji: '💙', title: ['About', 'О программе'], desc: ['Version and credits', 'Версия и авторы'], keywords: 'about version eternal inc о программе версия', Body: () => <About /> },
];

/** Sections matching a search (title, description or keywords, either language). */
export function searchSections(q: string): Section[] {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return SECTIONS;
  return SECTIONS.filter((x) => {
    const hay = `${x.title.join(' ')} ${x.desc.join(' ')} ${x.keywords}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
