/**
 * Eternal Helper plugin API (v0, basic).
 *
 * A module can add a panel tab, a live activity and commands for Afina / the command palette.
 * Built-in modules use this same shape. Third-party plugins (a folder with manifest.json + a JS
 * module, run in an isolated iframe) will plug into it in a later stage.
 */
import type { ComponentType } from 'react';

export type Permission = 'network' | 'clipboard' | 'notifications' | 'planner' | 'recordings';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  entry: string;
  permissions: Permission[];
}

export interface Activity {
  /** Unique per module, e.g. 'media' or 'timer'. */
  id: string;
  /** Higher wins the centre of the pill; the runner-up becomes the side bubble. */
  priority: number;
  /** Compact content shown left / right of the pill. */
  left: ComponentType;
  right?: ComponentType;
  /** Optional tap action (otherwise the panel opens). */
  onPress?: () => void;
}

export interface Command {
  id: string;
  /** Words that trigger it, in any language the module supports. */
  match: RegExp;
  run: (input: string, m: RegExpMatchArray) => Promise<string | void> | string | void;
}

export interface HelperModule {
  id: string;
  /** Translation key or plain name. */
  name: string;
  icon?: ComponentType<{ size?: number | string }>;
  tab?: ComponentType;
  commands?: Command[];
}

export const defineModule = <T extends HelperModule>(m: T): T => m;
