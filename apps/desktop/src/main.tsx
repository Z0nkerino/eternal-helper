import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { Island } from './island/Island';
import { SettingsWindow } from './settings/SettingsWindow';
import { PopOut } from './settings/PopOut';
import { CloudyStage, type MoodSignal } from './cloudy/CloudyStage';
import { call, emitEvent, inTauri, listen, type Layout, type MediaInfo, type Settings } from './lib/ipc';
import { closePanel, openPanel, saveSettings, tickTimer, toast, useApp, type Tab } from './lib/store';
import { refreshWeather, weatherScene } from './lib/weather';
import { startPlannerSync } from './lib/planner';
import { setSystemMedia, startMusicSync } from './lib/music';
import { startBattery } from './lib/battery';
import { startUpdateChecks } from './lib/updates';
import { withDefaults } from './lib/defaults';
import { applyTheme } from './lib/theme';
import { chime } from './island/bits';
import { tNow } from './lib/i18n';
import './styles.css';

type View = { kind: 'island' } | { kind: 'settings' } | { kind: 'panel'; tab: Tab } | { kind: 'cloudy' };

function currentView(): View {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('settings')) return { kind: 'settings' };
  if (h.startsWith('panel/')) return { kind: 'panel', tab: h.slice(6) as Tab };
  if (h === 'cloudy') return { kind: 'cloudy' };
  return { kind: 'island' };
}

/** State every app window shares: settings, theme, media, weather, Planner. */
async function bootCommon(view: View) {
  const [settings, layout, media] = await Promise.all([call('get_settings'), call('island_layout'), call('media_now')]);
  useApp.setState({ settings: withDefaults(settings), layout });
  setSystemMedia(media);
  applyTheme(useApp.getState().settings);
  document.documentElement.dataset.platform = layout.platform;
  document.documentElement.dataset.view = view.kind;

  listen<MediaInfo | null>('media://changed', setSystemMedia);
  listen<Settings>('settings://changed', (s) => {
    const next = withDefaults(s);
    useApp.setState({ settings: next });
    applyTheme(next);
  });
  // Moving to another display (or closing the lid) can add or remove a notch.
  listen<Layout>('island://layout', (layout) => useApp.setState({ layout }));
  startMusicSync();
  void refreshWeather();
  setInterval(() => void refreshWeather(), 30 * 60_000);
  startPlannerSync();
  if (!inTauri && new URLSearchParams(location.search).get('demo') === '1') {
    const { demoWeather, demoPlanner } = await import('./lib/demo');
    const apply = () => useApp.setState((s) => ({ weather: demoWeather(), planner: demoPlanner(), settings: s.settings && { ...s.settings, weather: { ...s.settings.weather, place: 'Москва' } } }));
    apply();
    setTimeout(apply, 600); // after the mock's own (empty) Planner refresh
  }
}

/** Island-only duties: the hotkey, timers, battery toasts, updates, Cloudy's signals. */
function bootIsland() {
  // The global shortcut opens Afina, ready to type — she doubles as the command palette.
  listen('island://hotkey', () => {
    const s = useApp.getState();
    if (s.view === 'panel' && s.tab === 'afina') return closePanel();
    openPanel('afina');
    useApp.setState((x) => ({ focusAfina: x.focusAfina + 1 }));
  });
  listen<string>('island://open', (tab) => openPanel(tab as Tab));

  setInterval(() => {
    tickTimer(Date.now(), (label) => {
      chime();
      // A focus session muted toasts; turn them back on when it ends.
      if (label === 'focus') void saveSettings({ doNotDisturb: false });
      toast(tNow('timer.done'), { tone: 'ok', force: true });
    });
  }, 1000);

  startBattery(true);
  startUpdateChecks();

  // Music players the user wants ready in the background.
  for (const service of useApp.getState().settings?.music.startHidden ?? []) void call('music_open', { service, show: false });

  // Tell Cloudy what's going on, only when it changes.
  let last = '';
  useApp.subscribe((s) => {
    const w = s.weather;
    const scene = w ? weatherScene(w) : null;
    const signal: MoodSignal = {
      weather: !w ? null : scene === 'rain' ? 'rain' : scene === 'snow' ? 'snow' : scene === 'storm' ? 'storm' : scene === 'cloudy' ? 'cloudy' : 'sun',
      isDay: w?.isDay ?? true,
      playing: !!s.media?.playing,
      recording: s.rec.status !== 'idle',
      thinking: s.afinaThinking,
      timerDone: s.pulse.timer,
      error: s.pulse.error,
    };
    const key = JSON.stringify(signal);
    if (key !== last) {
      last = key;
      void emitEvent('cloudy://mood', signal);
    }
  });

  // ↑↑↓↓←→←→BA while the island is open: a secret for Cloudy.
  const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let pos = 0;
  addEventListener('keydown', (e) => {
    pos = e.key.toLowerCase() === code[pos].toLowerCase() ? pos + 1 : e.key === code[0] ? 1 : 0;
    if (pos === code.length) {
      pos = 0;
      void emitEvent('cloudy://easter');
    }
  });
}

const view = currentView();
if (view.kind === 'cloudy') {
  document.documentElement.dataset.view = 'cloudy';
} else {
  void bootCommon(view).then(() => {
    if (view.kind === 'island') bootIsland();
    else startBattery(false);
  });
}

function Root() {
  switch (view.kind) {
    case 'settings':
      return <SettingsWindow />;
    case 'panel':
      return <PopOut tab={view.tab} />;
    case 'cloudy':
      return <CloudyStage />;
    default:
      return <Island />;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <Root />
    </MotionConfig>
  </React.StrictMode>,
);
