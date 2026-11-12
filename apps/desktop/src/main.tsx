import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { Island } from './island/Island';
import { call, listen, type Layout, type MediaInfo, type Settings } from './lib/ipc';
import { closePanel, openPanel, saveSettings, tickTimer, toast, useApp } from './lib/store';
import { refreshWeather } from './lib/weather';
import { startPlannerSync } from './lib/planner';
import { chime } from './island/bits';
import { tNow } from './lib/i18n';
import './styles.css';

async function boot() {
  const [settings, layout, media] = await Promise.all([call('get_settings'), call('island_layout'), call('media_now')]);
  useApp.setState({ settings, layout, media });
  document.documentElement.dataset.platform = layout.platform;

  listen<MediaInfo | null>('media://changed', (media) => useApp.setState({ media }));
  listen<Settings>('settings://changed', (settings) => useApp.setState({ settings }));
  // Moving to another display (or closing the lid) can add or remove a notch.
  listen<Layout>('island://layout', (layout) => useApp.setState({ layout }));
  // The global shortcut opens Afina, ready to type — she doubles as the command palette.
  listen('island://hotkey', () => {
    const s = useApp.getState();
    if (s.view === 'panel' && s.tab === 'afina') return closePanel();
    openPanel('afina');
    useApp.setState((x) => ({ focusAfina: x.focusAfina + 1 }));
  });
  listen<string>('island://open', (tab) => openPanel(tab as never));

  setInterval(() => {
    tickTimer(Date.now(), (label) => {
      chime();
      // A focus session muted toasts; turn them back on when it ends.
      if (label === 'focus') void saveSettings({ doNotDisturb: false });
      toast(tNow('timer.done'), { tone: 'ok', force: true });
    });
  }, 1000);

  void refreshWeather();
  setInterval(() => void refreshWeather(), 30 * 60_000);
  startPlannerSync();
}

void boot();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <Island />
    </MotionConfig>
  </React.StrictMode>,
);
