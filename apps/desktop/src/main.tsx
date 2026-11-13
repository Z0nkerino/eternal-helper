import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { Island } from './island/Island';
import { SettingsWindow } from './settings/SettingsWindow';
import { PopOut } from './settings/PopOut';
import { CloudyStage, type MoodSignal } from './cloudy/CloudyStage';
import { PetWindow } from './cloudy/PetWindow';
import { ShotEditor } from './shot/ShotEditor';
import { VideoEditor } from './video/VideoEditor';
import { PerfOverlay } from './perf/PerfOverlay';
import { DesktopWidget } from './home/DesktopWidget';
import { call, emitEvent, inTauri, listen, type Layout, type MediaInfo, type Settings } from './lib/ipc';
import { closePanel, openPanel, openSheet, saveSettings, showHud, tickTimer, toast, useApp, type Hud, type Tab } from './lib/store';
import { useControls } from './lib/controls';
import { refreshWeather, weatherScene } from './lib/weather';
import { startPlannerSync } from './lib/planner';
import { setSystemMedia, startMusicSync } from './lib/music';
import { startBattery } from './lib/battery';
import { startUpdateChecks } from './lib/updates';
import { withDefaults } from './lib/defaults';
import { applyTheme } from './lib/theme';
import { chime } from './island/bits';
import { tNow } from './lib/i18n';
import { RELEASE } from './lib/release';
import './styles.css';

type View = { kind: 'island' } | { kind: 'settings' } | { kind: 'panel'; tab: Tab } | { kind: 'cloudy' } | { kind: 'pet' } | { kind: 'shot' } | { kind: 'video'; path: string } | { kind: 'perf' } | { kind: 'desk'; id: string };

function currentView(): View {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('settings')) return { kind: 'settings' };
  if (h.startsWith('panel/')) return { kind: 'panel', tab: h.slice(6) as Tab };
  if (h === 'cloudy') return { kind: 'cloudy' };
  if (h === 'pet') return { kind: 'pet' };
  if (h === 'shot') return { kind: 'shot' };
  if (h === 'perf') return { kind: 'perf' };
  if (h.startsWith('desk/')) return { kind: 'desk', id: h.slice(5) };
  if (h.startsWith('video/')) return { kind: 'video', path: decodeURIComponent(h.slice(6)) };
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
  // The pet and settings windows don't show weather or the Planner: skip the network work there.
  if (view.kind === 'island' || view.kind === 'panel' || view.kind === 'desk') {
    void refreshWeather();
    setInterval(() => void refreshWeather(), 30 * 60_000);
    startPlannerSync();
  }
  if (!inTauri && new URLSearchParams(location.search).get('demo') === '1') {
    const { demoWeather, demoPlanner } = await import('./lib/demo');
    const apply = () => useApp.setState((s) => ({ weather: demoWeather(), planner: demoPlanner(), settings: s.settings && { ...s.settings, weather: { ...s.settings.weather, place: 'Saint Petersburg' } } }));
    apply();
    setTimeout(apply, 600); // after the mock's own (empty) Planner refresh
  }
}

/** Island-only duties: the hotkey, timers, battery toasts, updates, Cloudy's signals. */
function bootIsland() {
  // The global shortcut opens Home (press again to close).
  listen('island://hotkey', () => {
    const s = useApp.getState();
    if (s.view === 'panel' && s.tab === 'home' && !s.sheet) return closePanel();
    openPanel('home');
  });
  listen<string>('island://open', (tab) => openPanel(tab as Tab));
  // Live system events (volume, brightness, Caps Lock, downloads) show in the pill.
  listen<Hud>('hud://event', (h) => {
    showHud(h);
    if (h.kind === 'volume') useControls.setState((s) => (s.c ? { c: { ...s.c, volume: h.value, muted: h.muted } } : s));
    if (h.kind === 'brightness') useControls.setState((s) => (s.c ? { c: { ...s.c, brightness: h.value } } : s));
  });
  // Messages from other windows (screenshot copied, errors from the Rust side…).
  listen<string>('island://toast', (text) => toast(text, { force: true }));
  listen<string>('island://shot-saved', (path) =>
    toast(tNow('shot.saved'), { tone: 'ok', force: true, ms: 6000, action: { label: tNow('rec.edit'), run: () => void call('shot_edit', { path }) } }),
  );

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

  // The developer notice: news and updates from Eternal Inc., shown at start (it can be turned off).
  if (useApp.getState().settings?.newsAtStart !== false) setTimeout(() => openSheet('news', { hover: true }), 1400);

  // A one-time hello for this release, with its theme song.
  try {
    // (The developer notice already says what's new, so the toast only shows when the notice is off.)
    if (localStorage.getItem('eh.seen') !== RELEASE.name && useApp.getState().settings?.newsAtStart === false) {
      localStorage.setItem('eh.seen', RELEASE.name);
      setTimeout(
        () =>
          toast(tNow('rel.welcome'), {
            force: true,
            action: { label: tNow('rel.play'), run: () => void import('./radio/player').then((r) => r.select(0)) },
          }),
        2500,
      );
    }
  } catch {
    /* storage unavailable */
  }

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

  // Cloudy glances up when the island opens.
  let wasOpen = false;
  useApp.subscribe((st) => {
    const open = st.view === 'panel';
    if (open !== wasOpen) {
      wasOpen = open;
      void emitEvent('island://state', { open, tab: st.tab });
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

// Dev preview only: lets a demo page direct the island with postMessage (used to film the app).
if (!inTauri && import.meta.env.DEV) {
  addEventListener('message', (e) => {
    const d = e.data as Record<string, string> | null;
    if (!d || typeof d !== 'object' || !('island' in d)) return;
    if (d.island === 'open') openPanel(d.tab as Tab, { hover: true });
    else if (d.island === 'close') closePanel();
    else if (d.island === 'clear') useApp.setState({ toasts: [] });
    else if (d.island === 'toast') toast(d.text, { force: true, tone: 'ok' });
    else if (d.island === 'hud') showHud(JSON.parse(d.text) as Hud);
    else if (d.island === 'update') useApp.setState({ update: { latest: '0.6.1', available: true, progress: null, error: d.text || null } });
    else if (d.island === 'click') [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === d.text)?.click();
    else if (d.island === 'ask') {
      const input = document.querySelector<HTMLInputElement>('.composer input');
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, d.text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => document.querySelector<HTMLButtonElement>('.composer .send')?.click(), 50);
    }
  });
}

const view = currentView();
if (view.kind === 'cloudy' || view.kind === 'perf') {
  document.documentElement.dataset.view = view.kind;
} else {
  void bootCommon(view).then(() => {
    if (view.kind === 'island') bootIsland();
    else startBattery(false);
  });
}

function Motion({ children }: { children: React.ReactNode }) {
  const reduced = useApp((s) => s.settings?.motion === 'reduced');
  return <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>{children}</MotionConfig>;
}

function Root() {
  switch (view.kind) {
    case 'settings':
      return <SettingsWindow />;
    case 'panel':
      return <PopOut tab={view.tab} />;
    case 'cloudy':
      return <CloudyStage />;
    case 'pet':
      return <PetWindow />;
    case 'shot':
      return <ShotEditor />;
    case 'video':
      return <VideoEditor path={view.path} />;
    case 'perf':
      return <PerfOverlay />;
    case 'desk':
      return <DesktopWidget id={view.id} />;
    default:
      return <Island />;
  }
}

// The island and Cloudy are only shown once their page has rendered, so Windows never flashes an empty
// window at start-up. (Animation frames don't run in a hidden window, so this waits for React's first
// commit instead.)
function ReadySignal() {
  React.useEffect(() => {
    if (!inTauri || (view.kind !== 'island' && view.kind !== 'cloudy')) return;
    const id = setTimeout(() => void call('window_ready'), 60);
    return () => clearTimeout(id);
  }, []);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Motion>
      <Root />
      <ReadySignal />
    </Motion>
  </React.StrictMode>,
);
