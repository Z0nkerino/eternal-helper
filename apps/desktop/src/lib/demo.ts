// Sample data for the browser mock (`?demo=1`): lets the UI be checked without network or the desktop shell.
import type { WeatherNow } from './store';
import type { PlannerSnapshot } from './ipc';

export function demoWeather(now = Date.now()): WeatherNow {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const codes = [0, 1, 2, 3, 61, 2, 0];
  return {
    temp: 14, feels: 12, code: 2, isDay: true, humidity: 64, wind: 14, windDir: 220, pressure: 1012, precipitation: 0, aqi: 23,
    hourly: Array.from({ length: 25 }, (_, i) => ({ time: start.getTime() + i * 3600_000, temp: 14 + Math.round(Math.sin(i / 4) * 4), code: [2, 2, 3, 61, 61, 3, 2, 1, 0][i % 9], rain: [0, 10, 30, 70, 60, 20, 0, 0, 0][i % 9], isDay: ((start.getHours() + i) % 24) > 6 && ((start.getHours() + i) % 24) < 19 })),
    daily: codes.map((code, i) => ({ date: new Date(day.getTime() + i * 86_400_000).toISOString().slice(0, 10), code, max: 16 + (i % 3), min: 8 + (i % 2), sunrise: day.getTime() + i * 86_400_000 + 7 * 3600_000, sunset: day.getTime() + i * 86_400_000 + 17.5 * 3600_000, uv: 3 + i, rain: i === 4 ? 80 : 10, rainSum: 0 })),
    at: now,
  };
}

export function demoPlanner(now = Date.now()): PlannerSnapshot {
  const at = (h: number, m = 0) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d.getTime(); };
  return {
    file: 'universal-planner-demo.json', exportedAt: '', doneToday: 2,
    tasksToday: [
      { id: '1', title: 'Отправить отчёт', priority: 2, top: true, start: null },
      { id: '2', title: 'Спортзал', priority: 0, top: false, start: at(19) },
    ],
    upcoming: [{ id: 'e', title: 'Созвон с командой', start: Math.max(now + 3600_000, at(15)), end: Math.max(now + 7200_000, at(16)), allDay: false, location: null }],
  };
}
