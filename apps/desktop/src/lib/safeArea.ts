// Safe zones of the island. The notch is a forbidden rectangle: no button, tab or toast may ever be
// drawn inside it. Pure functions, so the rules are unit-tested (see safeArea.test.ts).
import type { Layout, Settings } from './ipc';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type TabsPosition = 'top' | 'bottom' | 'side';

/** Minimum gap between the bottom of the notch and anything interactive below it. */
export const NOTCH_GAP = 8;

export function resolveTabs(pref: Settings['tabsPosition'] | undefined, hasNotch: boolean): TabsPosition {
  if (!pref || pref === 'auto') return hasNotch ? 'bottom' : 'top';
  return pref;
}

/** The notch rectangle relative to an island of width `islandW` whose top edge touches the screen top. */
export function notchRect(layout: Layout | null, islandW: number): Rect | null {
  const n = layout?.notch;
  if (!n) return null;
  return { x: islandW / 2 + n.centerOffset - n.width / 2, y: 0, w: n.width, h: n.height };
}

export interface PanelLayout {
  tabs: TabsPosition;
  /** Height of the info-only strip beside the notch (0 without a notch). */
  strip: number;
  /** Space above the tabs/content so they start at least NOTCH_GAP below the notch. */
  contentTop: number;
  notch: Rect | null;
}

export function panelLayout(layout: Layout | null, pref: Settings['tabsPosition'] | undefined, islandW: number): PanelLayout {
  const notch = notchRect(layout, islandW);
  const strip = notch ? Math.ceil(notch.h) : 0;
  return { tabs: resolveTabs(pref, !!notch), strip, contentTop: notch ? strip + NOTCH_GAP : 0, notch };
}

export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
