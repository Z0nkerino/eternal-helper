// All settings, in sections. The same sections appear stacked in the island's Settings tab and with a
// sidebar in the separate Settings window. Every change is saved at once and the island updates live.
import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { call, inTauri, type CarouselItem, type MusicService, type Settings } from '../lib/ipc';
import { useT, useTr } from '../lib/i18n';
import { saveSettings, useApp } from '../lib/store';
import { ACCENTS, THEMES } from '../lib/theme';
import { CAROUSEL_ITEMS } from '../lib/defaults';
import { checkForUpdates, installUpdate } from '../lib/updates';
import { Emoji } from '../lib/emoji';
import { AfinaSettings, HotkeyField, Segment, Switch, WeatherPlace } from './parts';

type S = Settings;
const patch = <K extends keyof S>(key: K, cur: S[K], p: Partial<S[K]>) => void saveSettings({ [key]: { ...(cur as object), ...p } } as Partial<S>);

function General({ s }: { s: S }) {
  const t = useT();
  return (
    <>
      <Segment label={t('set.language')} value={s.language} options={[['auto', 'Auto'], ['ru', 'Русский'], ['en', 'English']]} onChange={(language) => void saveSettings({ language })} />
      <Segment label={t('set.monitor')} value={s.monitor} options={[['primary', t('set.monitor.primary')], ['cursor', t('set.monitor.cursor')]]} onChange={(monitor) => void saveSettings({ monitor })} />
      <HotkeyField />
      <Switch label={t('set.autostart')} on={s.autostart} onChange={(autostart) => void saveSettings({ autostart })} />
      <Switch label={t('set.dnd')} on={s.doNotDisturb} onChange={(doNotDisturb) => void saveSettings({ doNotDisturb })} />
      <Switch label={t('set.fullscreen')} on={s.hideInFullscreen} onChange={(hideInFullscreen) => void saveSettings({ hideInFullscreen })} />
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
      <Switch label={tr('Cloudy walks on the desktop', 'Cloudy гуляет по рабочему столу')} on={c.enabled} onChange={(enabled) => patch('cloudy', c, { enabled })} />
      {c.enabled && (
        <>
          <div className="setting">
            <span>{tr('Size', 'Размер')}</span>
            <input type="range" min={40} max={110} step={2} value={c.size} onChange={(e) => patch('cloudy', c, { size: parseInt(e.target.value, 10) })} aria-label={tr('Size', 'Размер')} />
          </div>
          <div className="setting">
            <span>{tr('Speed', 'Скорость')}</span>
            <input type="range" min={0.3} max={2.5} step={0.1} value={c.speed} onChange={(e) => patch('cloudy', c, { speed: parseFloat(e.target.value) })} aria-label={tr('Speed', 'Скорость')} />
          </div>
          <Segment
            label={tr('Speech bubbles', 'Реплики')}
            value={c.chatter}
            options={[['never', tr('Never', 'Никогда')], ['rare', tr('Rarely', 'Редко')], ['normal', tr('Sometimes', 'Иногда')], ['often', tr('Often', 'Часто')]]}
            onChange={(chatter) => patch('cloudy', c, { chatter })}
          />
          <p className="faint small setting-help">
            {tr('Drag and throw Cloudy, click for a menu, double-click for a surprise. He hides in fullscreen apps and while you record the screen.', 'Cloudy можно перетаскивать и бросать, клик — меню, двойной клик — сюрприз. Он прячется в полноэкранных приложениях и во время записи экрана.')}
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
          <div>Eternal Helper {__APP_VERSION__}</div>
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
  return (
    <div className="setting about-row">
      <img src="/eternal-inc.svg" width={28} height={28} alt="" />
      <div className="grow">
        <div>Eternal Helper {__APP_VERSION__}</div>
        <div className="faint small">© 2026 Eternal Inc. · Universal Planner · Afina · Cloudy</div>
      </div>
      <button className="btn" onClick={() => void call('quit')}>{t('set.quit')}</button>
    </div>
  );
}

export interface Section {
  id: string;
  emoji: string;
  title: [string, string];
  Body: (p: { s: S }) => JSX.Element;
}

export const SECTIONS: Section[] = [
  { id: 'general', emoji: '⚙️', title: ['General', 'Общие'], Body: General },
  { id: 'appearance', emoji: '🎨', title: ['Appearance', 'Внешний вид'], Body: Appearance },
  { id: 'afina', emoji: '🔮', title: ['Afina & AI', 'Afina и ИИ'], Body: () => <AfinaSettings /> },
  { id: 'music', emoji: '🎧', title: ['Music accounts', 'Музыка'], Body: Music },
  { id: 'today', emoji: '🌤️', title: ['Weather & Today', 'Погода и «Сегодня»'], Body: WeatherToday },
  { id: 'cloudy', emoji: '☁️', title: ['Cloudy', 'Cloudy'], Body: Cloudy },
  { id: 'recordings', emoji: '🎬', title: ['Recordings', 'Записи'], Body: Recordings },
  { id: 'planner', emoji: '🗓️', title: ['Universal Planner', 'Universal Planner'], Body: Planner },
  { id: 'updates', emoji: '🔄', title: ['Updates', 'Обновления'], Body: Updates },
  { id: 'developer', emoji: '🛠️', title: ['For developers', 'Для разработчиков'], Body: Developer },
  { id: 'about', emoji: '💙', title: ['About', 'О программе'], Body: () => <About /> },
];
