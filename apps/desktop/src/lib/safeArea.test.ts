import { DISPLAY_PRESETS } from './ipc';
import { intersects, NOTCH_GAP, notchRect, panelLayout, resolveTabs } from './safeArea';

describe('safe areas', () => {
  it('puts tabs at the bottom on notched displays by default', () => {
    expect(resolveTabs('auto', true)).toBe('bottom');
    expect(resolveTabs('auto', false)).toBe('top');
    expect(resolveTabs('side', true)).toBe('side');
  });

  it('places the notch centred on the island, honouring an offset', () => {
    const l = { ...DISPLAY_PRESETS['macbook-pro-14'], notch: { width: 200, height: 32, centerOffset: 6 } };
    expect(notchRect(l, 720)).toEqual({ x: 266, y: 0, w: 200, h: 32 });
    expect(notchRect(DISPLAY_PRESETS['windows-150'], 720)).toBeNull();
  });

  it('keeps everything interactive at least 8px below the notch on every preset', () => {
    for (const [name, layout] of Object.entries(DISPLAY_PRESETS)) {
      for (const pref of ['auto', 'top', 'bottom', 'side'] as const) {
        const p = panelLayout(layout, pref, 720);
        // The first interactive row starts at contentTop and spans the full panel width.
        const firstRow = { x: 0, y: p.contentTop, w: 720, h: 34 };
        if (p.notch) {
          expect(intersects(firstRow, p.notch), `${name}/${pref}`).toBe(false);
          expect(p.contentTop - (p.notch.y + p.notch.h)).toBeGreaterThanOrEqual(NOTCH_GAP);
        } else {
          expect(p.strip, name).toBe(0);
        }
      }
    }
  });
});
