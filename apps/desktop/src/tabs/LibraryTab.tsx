// Library: the control centre and every tool. Toggles and sliders on top, a grid of apps below.
// Apps with their own screen (Weather, Planner, Recordings, Timer…) slide in from the right.
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sun, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useEffect } from 'react';
import { call, emitEvent } from '../lib/ipc';
import type { LibSub } from '../lib/store';
import { useTr } from '../lib/i18n';
import { openLibrary, openPanel, saveSettings, takeScreenshot, timerLeft, useApp } from '../lib/store';
import { toggleRecording } from '../lib/recorder';
import { readControls, setControl, slideControl, systemAction, useControls } from '../lib/controls';
import { BigSlider } from '../components/BigSlider';
import { Emoji } from '../lib/emoji';
import { fmtClock, useNow } from '../island/bits';
import { RadioCard } from '../radio/RadioCard';
import { TimerView } from '../library/TimerView';
import { CalcView } from '../library/CalcView';
import { TranslateView } from '../library/TranslateView';
import { WifiView } from '../library/WifiView';
import { WeatherTab } from './WeatherTab';
import { PlannerTab } from './PlannerTab';
import { CapturesView } from '../library/CapturesView';
import { ClipboardTab } from './ClipboardTab';


function Toggle({ emoji, label, sub, on, onClick, onMore }: { emoji: string; label: string; sub?: string; on: boolean | null; onClick: () => void; onMore?: () => void }) {
  return (
    <motion.div className={`cc-toggle ${on ? 'on' : ''} ${on == null ? 'na' : ''}`} whileTap={{ scale: 0.95 }} layout>
      <button className="cc-main" onClick={onClick} aria-pressed={!!on}>
        <span className="cc-icon">
          <Emoji e={emoji} size={20} />
        </span>
        <span className="cc-text">
          <span className="small">{label}</span>
          {sub && <span className="tiny cc-sub ellipsis">{sub}</span>}
        </span>
      </button>
      {onMore && (
        <button className="cc-more" onClick={onMore} aria-label={`${label} …`}>
          <ChevronRight size={14} />
        </button>
      )}
    </motion.div>
  );
}

function Tool({ emoji, label, sub, onClick, hot, i = 0 }: { emoji: string; label: string; sub?: string; onClick: () => void; hot?: boolean; i?: number }) {
  return (
    <motion.button
      className={`lib-tool ${hot ? 'hot' : ''}`}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.8, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.018 * i, type: 'spring', stiffness: 520, damping: 30 }}
      whileHover={{ y: -3, scale: 1.04 }}
      whileTap={{ scale: 0.9 }}
    >
      <Emoji e={emoji} size={26} />
      <span className="small">{label}</span>
      {sub && <span className="tiny faint mono">{sub}</span>}
    </motion.button>
  );
}

const TITLES: Record<LibSub, [string, string, string]> = {
  weather: ['🌤️', 'Weather', 'Погода'],
  planner: ['🗓️', 'Planner', 'Планер'],
  videos: ['🎬', 'Captures', 'Снимки и записи'],
  text: ['📋', 'Clipboard', 'Буфер обмена'],
  timer: ['⏱️', 'Timer', 'Таймер'],
  calc: ['🧮', 'Calculator', 'Калькулятор'],
  translate: ['🌐', 'Translator', 'Переводчик'],
  wifi: ['📶', 'Wi-Fi', 'Wi-Fi'],
  radio: ['📻', 'Eternal Radio', 'Eternal Radio'],
};

function SubView({ sub }: { sub: LibSub }) {
  switch (sub) {
    case 'weather':
      return <WeatherTab />;
    case 'planner':
      return <PlannerTab />;
    case 'videos':
      return <CapturesView />;
    case 'text':
      return <ClipboardTab />;
    case 'timer':
      return <TimerView />;
    case 'calc':
      return <CalcView />;
    case 'translate':
      return <TranslateView />;
    case 'wifi':
      return <WifiView />;
    case 'radio':
      return <RadioCard />;
  }
}

export function LibraryTab() {
  const tr = useTr();
  const sub = useApp((s) => s.libSub);
  const c = useControls((s) => s.c);
  const dnd = useApp((s) => s.settings?.doNotDisturb ?? false);
  const timer = useApp((s) => s.timer);
  const rec = useApp((s) => s.rec.status);
  const planner = useApp((s) => s.planner);
  const weather = useApp((s) => s.weather);
  const now = useNow(1000);

  // System controls are read when the page shows, then now and then (reading them isn't free).
  useEffect(() => {
    if (sub) return;
    void readControls();
    const id = setInterval(() => void readControls(), 15_000);
    return () => clearInterval(id);
  }, [sub]);

  const volIcon = c?.muted || c?.volume === 0 ? <VolumeX size={16} /> : (c?.volume ?? 0) < 50 ? <Volume1 size={16} /> : <Volume2 size={16} />;
  const tools: Parameters<typeof Tool>[0][] = [
    { emoji: '🌤️', label: tr('Weather', 'Погода'), sub: weather ? `${weather.temp}°` : undefined, onClick: () => openLibrary('weather') },
    { emoji: '🗓️', label: tr('Planner', 'Планер'), sub: planner ? `${planner.tasksToday.length}` : undefined, onClick: () => openLibrary('planner') },
    { emoji: '⏱️', label: tr('Timer', 'Таймер'), sub: timer ? fmtClock(timerLeft(timer, now)) : undefined, onClick: () => openLibrary('timer'), hot: !!timer },
    { emoji: '📷', label: tr('Screenshot', 'Скриншот'), onClick: () => void takeScreenshot() },
    { emoji: '🎥', label: rec === 'idle' ? tr('Record', 'Запись') : tr('Stop rec', 'Стоп'), onClick: toggleRecording, hot: rec !== 'idle' },
    { emoji: '🎬', label: tr('Captures', 'Снимки'), onClick: () => openLibrary('videos') },
    { emoji: '📻', label: tr('Radio', 'Радио'), onClick: () => openPanel('music') },
    { emoji: '🧮', label: tr('Calculator', 'Калькулятор'), onClick: () => openLibrary('calc') },
    { emoji: '🌐', label: tr('Translator', 'Переводчик'), onClick: () => openLibrary('translate') },
    { emoji: '📋', label: tr('Clipboard', 'Буфер'), onClick: () => openLibrary('text') },
    { emoji: '☁️', label: 'Cloudy', onClick: () => void call('open_window', { kind: 'pet' }) },
    { emoji: '🤖', label: tr('AI', 'ИИ'), onClick: () => (openPanel('ai'), useApp.setState((s) => ({ focusAfina: s.focusAfina + 1 }))) },
    { emoji: '🔐', label: tr('Lock', 'Блокировка'), onClick: () => void systemAction('lock') },
    { emoji: '💤', label: tr('Sleep', 'Сон'), onClick: () => void systemAction('sleep') },
  ];

  return (
    <div className="library">
      <AnimatePresence mode="popLayout" initial={false}>
        {sub ? (
          <motion.div key={sub} className="lib-sub" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
            <header className="lib-sub-head">
              <button className="icon-btn" onClick={() => openLibrary(null)} aria-label={tr('Back', 'Назад')}>
                <ChevronLeft size={18} />
              </button>
              <Emoji e={TITLES[sub][0]} size={20} />
              <span className="lib-sub-title">{tr(TITLES[sub][1], TITLES[sub][2])}</span>
            </header>
            <div className={`lib-sub-body sub-${sub}`}>
              <SubView sub={sub} />
            </div>
          </motion.div>
        ) : (
          <motion.div key="main" className="lib-main scroll" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
            <div className="cc-grid">
              <Toggle emoji="📶" label="Wi-Fi" sub={c?.wifi ? c.wifiName ?? tr('On', 'Вкл') : tr('Off', 'Выкл')} on={c?.wifi ?? null} onClick={() => c && void setControl('wifi', !c.wifi)} onMore={() => openLibrary('wifi')} />
              <Toggle
                emoji="🔵"
                label="Bluetooth"
                sub={c?.bluetooth == null ? tr('Settings', 'Настройки') : c.bluetooth ? tr('On', 'Вкл') : tr('Off', 'Выкл')}
                on={c?.bluetooth ?? null}
                onClick={() => (c?.can.bluetoothToggle && c.bluetooth != null ? void setControl('bluetooth', !c.bluetooth) : void call('open_system_settings', { page: 'bluetooth' }))}
              />
              <Toggle emoji="🌓" label={tr('Dark mode', 'Тёмная тема')} sub={c?.dark ? tr('On', 'Вкл') : tr('Off', 'Выкл')} on={c?.dark ?? null} onClick={() => c && void setControl('dark', !c.dark)} />
              <Toggle emoji="🔕" label={tr('Do not disturb', 'Не беспокоить')} sub={dnd ? tr('On', 'Вкл') : tr('Off', 'Выкл')} on={dnd} onClick={() => void saveSettings({ doNotDisturb: !dnd })} />
            </div>

            <div className="cc-sliders">
              <BigSlider icon={<button className="bs-mute" onPointerDown={(e) => e.stopPropagation()} onClick={() => c && void setControl('muted', !c.muted)} aria-label={tr('Mute', 'Без звука')}>{volIcon}</button>} label={tr('Volume', 'Громкость')} value={c?.muted ? 0 : c?.volume ?? null} onChange={(v) => slideControl('volume', v)} />
              <BigSlider
                icon={<Sun size={16} />}
                label={tr('Brightness', 'Яркость')}
                value={c?.brightness ?? null}
                disabled={c?.brightness == null}
                onChange={(v) => slideControl('brightness', v)}
                note={
                  <span>
                    {tr('This screen doesn’t let apps change brightness.', 'Этот экран не даёт приложениям менять яркость.')}{' '}
                    <button className="link" onClick={() => void call('open_system_settings', { page: 'display' })}>{tr('Display settings', 'Настройки экрана')}</button>
                  </span>
                }
              />
            </div>

            <div className="lib-tools">
              {tools.map((x, i) => (
                <Tool key={x.emoji} {...x} i={i} />
              ))}
            </div>
            <button className="link tiny lib-cloudy-link" onClick={() => void emitEvent('cloudy://action', { kind: 'call' })}>
              {tr('Call Cloudy to the middle of the screen', 'Позвать Cloudy в центр экрана')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
