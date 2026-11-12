// Built-in modules, described with the same shape third-party plugins will use (@eternal/plugin-sdk).
import { defineModule, type HelperModule } from '@eternal/plugin-sdk';
import { House, Sparkles, CalendarCheck, Video, Type, Settings, CloudSun, LayoutGrid, Music2 } from 'lucide-react';
import type { MainTab, Tab } from './lib/store';
import type { Key } from './lib/i18n';
import { HomeTab } from './tabs/HomeTab';
import { AfinaTab } from './tabs/AfinaTab';
import { PlannerTab } from './tabs/PlannerTab';
import { VideosTab } from './tabs/VideosTab';
import { TextTab } from './tabs/TextTab';
import { SettingsTab } from './tabs/SettingsTab';
import { WeatherTab } from './tabs/WeatherTab';
import { LibraryTab } from './tabs/LibraryTab';
import { MusicTab } from './tabs/MusicTab';

type TabModule = HelperModule & { id: Tab; name: Key };

/** Every screen, for windows opened on their own ("pop out"). */
export const ALL_MODULES: TabModule[] = [
  defineModule<TabModule>({ id: 'home', name: 'tab.home', icon: House, tab: HomeTab }),
  defineModule<TabModule>({ id: 'music', name: 'tab.music', icon: Music2, tab: MusicTab }),
  defineModule<TabModule>({ id: 'library', name: 'tab.library', icon: LayoutGrid, tab: LibraryTab }),
  defineModule<TabModule>({ id: 'afina', name: 'tab.afina', icon: Sparkles, tab: AfinaTab }),
  defineModule<TabModule>({ id: 'settings', name: 'tab.settings', icon: Settings, tab: SettingsTab }),
  defineModule<TabModule>({ id: 'weather', name: 'tab.weather', icon: CloudSun, tab: WeatherTab }),
  defineModule<TabModule>({ id: 'planner', name: 'tab.planner', icon: CalendarCheck, tab: PlannerTab }),
  defineModule<TabModule>({ id: 'videos', name: 'tab.videos', icon: Video, tab: VideosTab }),
  defineModule<TabModule>({ id: 'text', name: 'tab.text', icon: Type, tab: TextTab }),
];

/** The island's five tabs. Weather, Planner, Recordings and Text live inside Library. */
export const MODULES = ALL_MODULES.slice(0, 5) as (TabModule & { id: MainTab })[];
