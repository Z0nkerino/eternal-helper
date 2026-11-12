// The strip beside the notch when the panel is open on a notched Mac: information only, never buttons.
// Left of the notch: time and weather. Right of it: indicators for what's going on.
import { colors } from '@eternal/ui';
import { useT } from '../lib/i18n';
import { useApp, recElapsed, timerLeft } from '../lib/store';
import { weatherEmoji } from '../lib/weather';
import type { Rect } from '../lib/safeArea';
import { Equalizer, fmtClock, useNow } from './bits';
import { fmtTime } from '../lib/time';
import { useActivities } from './Pill';

export function NotchStrip({ notch, width }: { notch: Rect; width: number }) {
  const t = useT();
  const now = useNow();
  const weather = useApp((s) => s.weather);
  const timer = useApp((s) => s.timer);
  const rec = useApp((s) => s.rec);
  const media = useApp((s) => s.media);
  const planner = useApp((s) => s.planner);
  const activities = useActivities();
  const time = fmtTime(now);
  const day = new Date(now).toLocaleDateString(t.lang === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short', day: 'numeric' });
  const gap = 10;

  return (
    <div className="notch-strip" style={{ height: notch.h }} aria-hidden>
      <div className="strip-side left" style={{ width: notch.x - gap }}>
        <span className="mono">{time}</span>
        <span className="faint">{day}</span>
        {weather && (
          <span>
            {weatherEmoji(weather.code, weather.isDay)} <span className="mono">{weather.temp}°</span>
          </span>
        )}
      </div>
      <div className="strip-side right" style={{ left: notch.x + notch.w + gap, width: width - (notch.x + notch.w + gap) }}>
        {activities.includes('rec') && (
          <span className="row gap">
            <span className="rec-dot" /> <span className="mono">{fmtClock(recElapsed(rec, now))}</span>
          </span>
        )}
        {timer && <span className="mono" style={{ color: colors.warn }}>⏱ {fmtClock(timerLeft(timer, now))}</span>}
        {media?.playing && <Equalizer playing color={colors.accent2} />}
        {planner && planner.tasksToday.length > 0 && <span>📋 {planner.tasksToday.length}</span>}
      </div>
    </div>
  );
}
