// Built-in modules, described with the same shape third-party plugins will use (@eternal/plugin-sdk).
import { defineModule, type HelperModule } from '@eternal/plugin-sdk';
import { House, Sparkles, CalendarCheck, Video, Type, Settings, CloudSun } from 'lucide-react';
import type { Tab } from './lib/store';
import type { Key } from './lib/i18n';
import { HomeTab } from './tabs/HomeTab';
import { AfinaTab } from './tabs/AfinaTab';
import { PlannerTab } from './tabs/PlannerTab';
import { VideosTab } from './tabs/VideosTab';
import { TextTab } from './tabs/TextTab';
import { SettingsTab } from './tabs/SettingsTab';
import { WeatherTab } from './tabs/WeatherTab';

type TabModule = HelperModule & { id: Tab; name: Key };

export const MODULES: TabModule[] = [
  defineModule<TabModule>({ id: 'home', name: 'tab.home', icon: House, tab: HomeTab }),
  defineModule<TabModule>({ id: 'afina', name: 'tab.afina', icon: Sparkles, tab: AfinaTab }),
  defineModule<TabModule>({ id: 'weather', name: 'tab.weather', icon: CloudSun, tab: WeatherTab }),
  defineModule<TabModule>({ id: 'planner', name: 'tab.planner', icon: CalendarCheck, tab: PlannerTab }),
  defineModule<TabModule>({ id: 'videos', name: 'tab.videos', icon: Video, tab: VideosTab }),
  defineModule<TabModule>({ id: 'text', name: 'tab.text', icon: Type, tab: TextTab }),
  defineModule<TabModule>({ id: 'settings', name: 'tab.settings', icon: Settings, tab: SettingsTab }),
];
