// Library: the control centre and a shelf of tools. Toggles and sliders on top, tools below,
// Eternal Radio at the bottom. Tools with their own screen slide in from the right.
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sun, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { call, emitEvent } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { openPanel, saveSettings, timerLeft, toast, useApp } from '../lib/store';
import { toggleRecording } from '../lib/recorder';
import { readControls, setControl, systemAction, useControls } from '../lib/controls';
import { Emoji } from '../lib/emoji';
import { fmtClock, useNow } from '../island/bits';
import { RadioCard } from '../radio/RadioCard';
import { TimerView } from '../library/TimerView';
import { CalcView } from '../library/CalcView';
import { TranslateView } from '../library/TranslateView';
import { WifiView } from '../library/WifiView';

type Sub = 'timer' | 'calc' | 'translate' | 'wifi' | null;

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

function Slider({ icon, value, onChange, label, disabled, note }: { icon: ReactNode; value: number | null; onChange: (v: number) => void; label: string; disabled?: boolean; note?: ReactNode }) {
  const [local, setLocal] = useState<number | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>();
  const v = local ?? value ?? 0;
  return (
    <div className={`cc-slider ${disabled ? 'disabled' : ''}`}>
      <span className="cc-slider-icon">{icon}</span>
      {disabled ? (
        <span className="small faint grow">{note}</span>
      ) : (
        <>
          <div className="cc-range" style={{ ['--v' as string]: `${v}%` }}>
            <input
              type="range"
              min={0}
              max={100}
              value={v}
              aria-label={label}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setLocal(n);
                clearTimeout(t.current);
                t.current = setTimeout(() => (onChange(n), setLocal(null)), 120);
              }}
            />
          </div>
          <span className="mono tiny faint cc-pct">{Math.round(v)}%</span>
        </>
      )}
    </div>
  );
}

function Tool({ emoji, label, sub, onClick, hot }: { emoji: string; label: string; sub?: string; onClick: () => void; hot?: boolean }) {
  return (
    <motion.button className={`lib-tool ${hot ? 'hot' : ''}`} onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.93 }}>
      <Emoji e={emoji} size={26} />
      <span className="small">{label}</span>
      {sub && <span className="tiny faint mono">{sub}</span>}
    </motion.button>
  );
}

export function LibraryTab() {
  const tr = useTr();
  const [sub, setSub] = useState<Sub>(null);
  const c = useControls((s) => s.c);
  const dnd = useApp((s) => s.settings?.doNotDisturb ?? false);
  const timer = useApp((s) => s.timer);
  const rec = useApp((s) => s.rec.status);
  const planner = useApp((s) => s.planner);
  const now = useNow(1000);

  useEffect(() => {
    void readControls();
    const id = setInterval(() => void readControls(), 8000);
    return () => clearInterval(id);
  }, []);

  const titles: Record<Exclude<Sub, null>, [string, string, string]> = {
    timer: ['⏱️', 'Timer', 'Таймер'],
    calc: ['🧮', 'Calculator', 'Калькулятор'],
    translate: ['🌐', 'Translator', 'Переводчик'],
    wifi: ['📶', 'Wi-Fi', 'Wi-Fi'],
  };
  const shot = () => void call('shot_start').catch((e) => toast(String(e), { tone: 'error' }));
  const volIcon = c?.muted || c?.volume === 0 ? <VolumeX size={16} /> : (c?.volume ?? 0) < 50 ? <Volume1 size={16} /> : <Volume2 size={16} />;

  return (
    <div className="library">
      <AnimatePresence mode="popLayout" initial={false}>
        {sub ? (
          <motion.div key={sub} className="lib-sub" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
            <header className="lib-sub-head">
              <button className="icon-btn" onClick={() => setSub(null)} aria-label={tr('Back', 'Назад')}>
                <ChevronLeft size={18} />
              </button>
              <Emoji e={titles[sub][0]} size={20} />
              <span className="lib-sub-title">{tr(titles[sub][1], titles[sub][2])}</span>
            </header>
            <div className="lib-sub-body">
              {sub === 'timer' && <TimerView />}
              {sub === 'calc' && <CalcView />}
              {sub === 'translate' && <TranslateView />}
              {sub === 'wifi' && <WifiView />}
            </div>
          </motion.div>
        ) : (
          <motion.div key="main" className="lib-main scroll" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
            <div className="cc-grid">
              <Toggle emoji="📶" label="Wi-Fi" sub={c?.wifi ? c.wifiName ?? tr('On', 'Вкл') : tr('Off', 'Выкл')} on={c?.wifi ?? null} onClick={() => c && void setControl('wifi', !c.wifi)} onMore={() => setSub('wifi')} />
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
              <Slider icon={<button className="icon-btn" onClick={() => c && void setControl('muted', !c.muted)} aria-label={tr('Mute', 'Без звука')}>{volIcon}</button>} label={tr('Volume', 'Громкость')} value={c?.muted ? 0 : c?.volume ?? null} onChange={(v) => void setControl('volume', v)} />
              <Slider
                icon={<Sun size={16} />}
                label={tr('Brightness', 'Яркость')}
                value={c?.brightness ?? null}
                disabled={c?.brightness == null}
                onChange={(v) => void setControl('brightness', v)}
                note={
                  <span>
                    {tr('Brightness: use your keyboard keys', 'Яркость: используй клавиши на клавиатуре')}{' '}
                    <button className="link" onClick={() => void call('open_system_settings', { page: 'display' })}>{tr('Display settings', 'Настройки экрана')}</button>
                  </span>
                }
              />
            </div>

            <div className="lib-tools">
              <Tool emoji="⏱️" label={tr('Timer', 'Таймер')} sub={timer ? fmtClock(timerLeft(timer, now)) : undefined} onClick={() => setSub('timer')} hot={!!timer} />
              <Tool emoji="📷" label={tr('Screenshot', 'Скриншот')} onClick={shot} />
              <Tool emoji="🎥" label={rec === 'idle' ? tr('Record', 'Запись') : tr('Stop rec', 'Стоп')} onClick={toggleRecording} hot={rec !== 'idle'} />
              <Tool emoji="🧮" label={tr('Calculator', 'Калькулятор')} onClick={() => setSub('calc')} />
              <Tool emoji="🌐" label={tr('Translator', 'Переводчик')} onClick={() => setSub('translate')} />
              <Tool emoji="🗓️" label={tr('Planner', 'Планер')} sub={planner ? `${planner.tasksToday.length}` : undefined} onClick={() => openPanel('planner')} />
              <Tool emoji="🔮" label="Afina" onClick={() => (openPanel('afina'), useApp.setState((s) => ({ focusAfina: s.focusAfina + 1 })))} />
              <Tool emoji="☁️" label="Cloudy" onClick={() => void call('open_window', { kind: 'pet' })} />
              <Tool emoji="🌤️" label={tr('Weather', 'Погода')} onClick={() => openPanel('weather')} />
              <Tool emoji="🔤" label={tr('Text tools', 'Текст')} onClick={() => openPanel('text')} />
              <Tool emoji="🔐" label={tr('Lock', 'Блокировка')} onClick={() => void systemAction('lock')} />
              <Tool emoji="💤" label={tr('Sleep', 'Сон')} onClick={() => void systemAction('sleep')} />
            </div>

            <RadioCard compact />
            <button className="link tiny lib-cloudy-link" onClick={() => void emitEvent('cloudy://action', { kind: 'call' })}>
              {tr('Call Cloudy to the middle of the screen', 'Позвать Cloudy в центр экрана')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
