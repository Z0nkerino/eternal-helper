// Built-in modules, described with the same shape third-party plugins will use (@eternal/plugin-sdk).
import { defineModule, type HelperModule } from '@eternal/plugin-sdk';
import { House, MessagesSquare, CalendarDays, Video, ClipboardList, Settings, CloudSun, LayoutGrid, Music2, Clock3, StickyNote, Archive, Bell } from 'lucide-react';
import type { MainTab, Tab } from './lib/store';
import type { Key } from './lib/i18n';
import { HomeTab } from './tabs/HomeTab';
import { AiTab } from './tabs/AiTab';
import { TimeTab } from './tabs/TimeTab';
import { CalendarView } from './library/CalendarView';
import { NotesBoard } from './library/NotesBoard';
import { ShelfView } from './library/ShelfView';
import { NotifyView } from './library/NotifyView';
import { CapturesView } from './library/CapturesView';
import { ClipboardTab } from './tabs/ClipboardTab';
import { SettingsTab } from './tabs/SettingsTab';
import { WeatherTab } from './tabs/WeatherTab';
import { LibraryTab } from './tabs/LibraryTab';
import { MusicTab } from './tabs/MusicTab';

type TabModule = HelperModule & { id: Tab; name: Key };

/** Every screen, for windows opened on their own ("pop out"). */
export const ALL_MODULES: TabModule[] = [
  defineModule<TabModule>({ id: 'home', name: 'tab.home', icon: House, tab: HomeTab }),
  defineModule<TabModule>({ id: 'music', name: 'tab.music', icon: Music2, tab: MusicTab }),
  defineModule<TabModule>({ id: 'time', name: 'tab.time', icon: Clock3, tab: TimeTab }),
  defineModule<TabModule>({ id: 'library', name: 'tab.library', icon: LayoutGrid, tab: LibraryTab }),
  defineModule<TabModule>({ id: 'ai', name: 'tab.ai', icon: MessagesSquare, tab: AiTab }),
  defineModule<TabModule>({ id: 'settings', name: 'tab.settings', icon: Settings, tab: SettingsTab }),
  defineModule<TabModule>({ id: 'weather', name: 'tab.weather', icon: CloudSun, tab: WeatherTab }),
  defineModule<TabModule>({ id: 'calendar', name: 'tab.calendar', icon: CalendarDays, tab: CalendarView }),
  defineModule<TabModule>({ id: 'notes', name: 'tab.notes', icon: StickyNote, tab: NotesBoard as () => JSX.Element }),
  defineModule<TabModule>({ id: 'shelf', name: 'tab.shelf', icon: Archive, tab: ShelfView }),
  defineModule<TabModule>({ id: 'notify', name: 'tab.notify', icon: Bell, tab: NotifyView }),
  defineModule<TabModule>({ id: 'videos', name: 'tab.videos', icon: Video, tab: CapturesView }),
  defineModule<TabModule>({ id: 'text', name: 'tab.text', icon: ClipboardList, tab: ClipboardTab }),
];

/** The island's six tabs. The other screens live inside Library. */
export const MODULES = ALL_MODULES.slice(0, 6) as (TabModule & { id: MainTab })[];
