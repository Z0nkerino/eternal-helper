// Developer overlay ("Show safe areas"): draws the notch, the info strip and the interactive safe zone
// over the island, so layouts can be checked on any display. Never intercepts clicks.
import type { PanelLayout } from '../lib/safeArea';

export function SafeAreaOverlay({ p, width, height, panel }: { p: PanelLayout; width: number; height: number; panel: boolean }) {
  return (
    <div className="safe-overlay" style={{ width, height, left: `calc(50% - ${width / 2}px)` }} aria-hidden>
      {p.notch && (
        <>
          <div className="sa-notch" style={{ left: p.notch.x, top: p.notch.y, width: p.notch.w, height: p.notch.h }}>
            notch {Math.round(p.notch.w)}×{Math.round(p.notch.h)}
          </div>
          {panel && <div className="sa-strip" style={{ top: 0, height: p.strip }} />}
        </>
      )}
      {panel && (
        <div className="sa-safe" style={{ top: p.contentTop, bottom: 0 }}>
          safe · tabs: {p.tabs}
        </div>
      )}
    </div>
  );
}
