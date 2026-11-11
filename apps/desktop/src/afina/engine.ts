// Afina in the island: a small, deterministic, bilingual engine for what the island can do itself
// (time, weather, timers, recording, Universal Planner). Anything else goes to the language model, if
// the user added a key. Same persona as Afina in Universal Planner — one assistant across Eternal Inc. apps.
import type { PlannerSnapshot } from '../lib/ipc';
import type { WeatherNow } from '../lib/store';
import { calc, fixLayout } from '../lib/text';
import { describeWeather } from '../lib/weather';
import type { Lang } from '../lib/i18n';

export interface AfinaReply {
  text: string;
  chips?: string[];
  /** false = not understood here; let the language model try. */
  handled: boolean;
}

export interface AfinaWorld {
  now: Date;
  weather: WeatherNow | null;
  place: string;
  planner: PlannerSnapshot | null;
  timerEndsAt: number | null;
  recording: boolean;
  actions: {
    startTimer: (minutes: number, label: string) => void;
    stopTimer: () => void;
    startRecording: () => void;
    stopRecording: () => void;
    openPlanner: () => void;
    openTab: (tab: 'videos' | 'planner' | 'settings' | 'text') => void;
    setDnd: (on: boolean) => void;
  };
}

export function detectLang(s: string, fallback: Lang): Lang {
  const cyr = (s.match(/[а-яё]/gi) ?? []).length;
  const lat = (s.match(/[a-z]/gi) ?? []).length;
  return cyr > lat ? 'ru' : lat > cyr ? 'en' : fallback;
}

const L = (lang: Lang, en: string, ru: string) => (lang === 'ru' ? ru : en);

/** 1 минута / 2 минуты / 5 минут. */
export function plural(lang: Lang, n: number, en: [string, string], ru: [string, string, string]) {
  if (lang === 'en') return `${n} ${n === 1 ? en[0] : en[1]}`;
  const a = n % 10;
  const b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? ru[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? ru[1] : ru[2]}`;
}

const fmtTime = (d: Date | number, lang: Lang) => new Date(d).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });

const UNIT = /(сек\w*|s|sec\w*|час\w*|h|hours?|hrs?|мин\w*|m|min\w*)?/;
const TIMER = new RegExp(String.raw`(?:таймер|timer|засеки|напомни через|remind me in)\D{0,12}(\d+(?:[.,]\d+)?)\s*` + UNIT.source, 'i');
const FOCUS = new RegExp(String.raw`(?:фокус|focus|pomodoro|помидор)\D{0,12}(\d+)?`, 'i');

function minutesFrom(n: string, unit = ''): number {
  const v = parseFloat(n.replace(',', '.'));
  if (/^(s|сек|sec)/i.test(unit)) return v / 60;
  if (/^(h|час|hour|hr)/i.test(unit)) return v * 60;
  return v;
}

function plannerToday(w: AfinaWorld, lang: Lang): AfinaReply {
  const p = w.planner;
  if (!p) {
    return {
      handled: true,
      text: L(lang, 'I can’t see your Universal Planner yet. Open the Planner tab here to connect it — it takes a minute.', 'Я пока не вижу ваш Universal Planner. Откройте вкладку «Планер» здесь, чтобы подключить его — это минута.'),
      chips: [L(lang, 'Open Planner tab', 'Открой вкладку Планер')],
    };
  }
  if (!p.tasksToday.length) {
    const done = p.doneToday ? L(lang, ` You finished ${plural(lang, p.doneToday, ['task', 'tasks'], ['задачу', 'задачи', 'задач'])} today — nice.`, ` Сегодня вы уже закрыли ${plural(lang, p.doneToday, ['task', 'tasks'], ['задачу', 'задачи', 'задач'])} — отлично.`) : '';
    return { handled: true, text: L(lang, 'Nothing left for today.', 'На сегодня задач не осталось.') + done };
  }
  const list = p.tasksToday.slice(0, 5).map((t) => `• ${t.title}${t.start ? ` (${fmtTime(t.start, lang)})` : ''}`).join('\n');
  const more = p.tasksToday.length > 5 ? L(lang, `\n…and ${p.tasksToday.length - 5} more.`, `\n…и ещё ${p.tasksToday.length - 5}.`) : '';
  const head = L(lang, `You have ${plural(lang, p.tasksToday.length, ['task', 'tasks'], ['задача', 'задачи', 'задач'])} today:`, `На сегодня ${plural(lang, p.tasksToday.length, ['task', 'tasks'], ['задача', 'задачи', 'задач'])}:`);
  return { handled: true, text: `${head}\n${list}${more}`, chips: [L(lang, 'What’s next?', 'Что дальше?'), L(lang, 'Open Planner', 'Открой Планер')] };
}

function nextEvent(w: AfinaWorld, lang: Lang): AfinaReply {
  const e = w.planner?.upcoming[0];
  if (!w.planner) return plannerToday(w, lang);
  if (!e) return { handled: true, text: L(lang, 'No events in the next 7 days.', 'В ближайшие 7 дней событий нет.') };
  const day = new Date(e.start);
  const today = new Date(w.now);
  const sameDay = day.toDateString() === today.toDateString();
  const when = e.allDay
    ? L(lang, sameDay ? 'today' : `on ${day.toLocaleDateString('en-US', { weekday: 'long' })}`, sameDay ? 'сегодня' : day.toLocaleDateString('ru-RU', { weekday: 'long' }))
    : `${sameDay ? L(lang, 'today at ', 'сегодня в ') : day.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'long' }) + ', '}${fmtTime(e.start, lang)}`;
  return { handled: true, text: L(lang, `Next up: ${e.title}, ${when}.`, `Дальше: ${e.title}, ${when}.`) + (e.location ? ` 📍 ${e.location}` : '') };
}

type Rule = [RegExp, (m: RegExpMatchArray, w: AfinaWorld, lang: Lang, text: string) => AfinaReply];

const RULES: Rule[] = [
  [/^(привет|здравствуй|hi|hello|hey|добрый (день|вечер)|доброе утро)\b/i, (_m, w, lang) => {
    const h = w.now.getHours();
    const part = h < 5 ? L(lang, 'Good night', 'Доброй ночи') : h < 12 ? L(lang, 'Good morning', 'Доброе утро') : h < 18 ? L(lang, 'Good afternoon', 'Добрый день') : L(lang, 'Good evening', 'Добрый вечер');
    return { handled: true, text: `${part}! ${L(lang, 'How can I help?', 'Чем помочь?')}`, chips: [L(lang, 'What’s today?', 'Что сегодня?'), L(lang, 'Weather', 'Погода')] };
  }],
  [/^(help|помощь|что ты умеешь|what can you do)/i, (_m, _w, lang) => ({
    handled: true,
    text: L(lang, 'I can show today’s Planner tasks and next event, tell the time and weather, set timers and focus sessions, start or stop a screen recording, do quick maths and fix a wrong keyboard layout. With an AI key I can answer anything else.', 'Я покажу задачи из Планера и ближайшее событие, скажу время и погоду, поставлю таймер или фокус, начну и остановлю запись экрана, посчитаю и исправлю раскладку. С ключом ИИ отвечу на что угодно.'),
    chips: [L(lang, 'Timer 5 minutes', 'Таймер 5 минут'), L(lang, 'Start recording', 'Начни запись'), L(lang, 'What’s today?', 'Что сегодня?')],
  })],
  [/(останови|стоп|выключи|stop|end|finish)\W+.*(запис|record)|^(stop|стоп) (rec|запис)/i, (_m, w, lang) => {
    if (!w.recording) return { handled: true, text: L(lang, 'Nothing is being recorded.', 'Сейчас ничего не записывается.') };
    w.actions.stopRecording();
    return { handled: true, text: L(lang, 'Stopped. Saving the video to your recordings.', 'Остановила. Сохраняю видео в записи.') };
  }],
  [/(начни|запусти|включи|start|begin)\W+.*(запис|record)|(record|запиши) (my |the )?(screen|экран)/i, (_m, w, lang) => {
    if (w.recording) return { handled: true, text: L(lang, 'Already recording.', 'Запись уже идёт.') };
    w.actions.startRecording();
    return { handled: true, text: L(lang, 'Starting the recording — pick a screen or window. Stop it from the pill.', 'Начинаю запись — выберите экран или окно. Остановить можно на пилюле.') };
  }],
  [/(мои |my )?(записи|видео|recordings|videos)$/i, (_m, w, lang) => {
    w.actions.openTab('videos');
    return { handled: true, text: L(lang, 'Here are your recordings.', 'Вот ваши записи.') };
  }],
  [/(stop|cancel|отмени|останови|сбрось).{0,10}(timer|таймер)/i, (_m, w, lang) => {
    if (!w.timerEndsAt) return { handled: true, text: L(lang, 'No timer is running.', 'Таймер не запущен.') };
    w.actions.stopTimer();
    return { handled: true, text: L(lang, 'Timer stopped.', 'Таймер остановлен.') };
  }],
  [TIMER, (m, w, lang) => {
    const min = minutesFrom(m[1], m[2]);
    if (!(min > 0) || min > 24 * 60) return { handled: true, text: L(lang, 'Timers go from a second to 24 hours.', 'Таймер — от секунды до 24 часов.') };
    w.actions.startTimer(min, '');
    const label = min < 1 ? plural(lang, Math.round(min * 60), ['second', 'seconds'], ['секунду', 'секунды', 'секунд']) : plural(lang, Math.round(min), ['minute', 'minutes'], ['минуту', 'минуты', 'минут']);
    return { handled: true, text: L(lang, `Timer set for ${label}. It’s running in the pill.`, `Поставила таймер на ${label}. Он идёт в пилюле.`) };
  }],
  [FOCUS, (m, w, lang) => {
    const min = m[1] ? parseInt(m[1], 10) : 25;
    w.actions.startTimer(min, 'focus');
    w.actions.setDnd(true);
    return { handled: true, text: L(lang, `Focus for ${min} min. I’ve muted toasts until it ends.`, `Фокус на ${min} мин. Я заглушила тосты до конца.`) };
  }],
  [/(который час|сколько времени|what time|the time)/i, (_m, w, lang) => ({ handled: true, text: L(lang, `It’s ${fmtTime(w.now, lang)}.`, `Сейчас ${fmtTime(w.now, lang)}.`) })],
  [/(какое сегодня число|какой сегодня день|what(['’]| i)?s the date|what day is it|today's date)/i, (_m, w, lang) => ({
    handled: true,
    text: w.now.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  })],
  [/(погод|weather|temperature|температур|холодно|жарко|зонт|umbrella)/i, (_m, w, lang) => {
    if (!w.weather) return { handled: true, text: L(lang, 'Choose your city in Settings → Weather and I’ll keep an eye on it.', 'Выберите город в Настройках → Погода, и я буду следить за погодой.'), chips: [L(lang, 'Open settings', 'Открой настройки')] };
    const d = describeWeather(w.weather.code, lang);
    const today = w.weather.daily[0];
    const range = today ? L(lang, ` Today ${today.min}…${today.max}°.`, ` Сегодня ${today.min}…${today.max}°.`) : '';
    return { handled: true, text: `${w.place ? w.place + ': ' : ''}${w.weather.temp}°, ${d.label.toLowerCase()}.${range}` };
  }],
  [/(open|открой|запусти).{0,4}(universal )?(planner|планер|планировщик)$/i, (_m, w, lang) => {
    w.actions.openPlanner();
    return { handled: true, text: L(lang, 'Opening Universal Planner.', 'Открываю Universal Planner.') };
  }],
  [/(вкладк\w* планер|planner tab)/i, (_m, w, lang) => {
    w.actions.openTab('planner');
    return { handled: true, text: L(lang, 'Here’s the Planner tab.', 'Вот вкладка «Планер».') };
  }],
  [/(открой настройки|open settings|настройки$|settings$)/i, (_m, w, lang) => {
    w.actions.openTab('settings');
    return { handled: true, text: L(lang, 'Settings are open.', 'Открыла настройки.') };
  }],
  [/(следующ\w* (встреч|событи)|ближайш\w* (встреч|событи)|next (event|meeting)|что дальше|what['’]?s next|calendar|календар)/i, (_m, w, lang) => nextEvent(w, lang)],
  [/(задач|дела|to-?dos?|tasks|что сегодня|план на сегодня|what['’]?s (on )?today|my day|мой день)/i, (_m, w, lang) => plannerToday(w, lang)],
  [/(не беспокоить|do not disturb|dnd)\s*(вкл|on|включи)?/i, (m, w, lang) => {
    const off = /(выкл|off|отключи|выключи)/i.test(m.input ?? '');
    w.actions.setDnd(!off);
    return { handled: true, text: off ? L(lang, 'Toasts are back on.', 'Тосты снова включены.') : L(lang, 'Do not disturb is on.', 'Режим «Не беспокоить» включён.') };
  }],
  [/^(исправь раскладку|раскладка|fix layout)[:\s]+(.+)$/is, (m, _w, lang) => ({ handled: true, text: L(lang, `Fixed: ${fixLayout(m[2])}`, `Исправила: ${fixLayout(m[2])}`) })],
];

export function respond(input: string, w: AfinaWorld, uiLang: Lang): AfinaReply {
  const text = input.trim();
  const lang = detectLang(text, uiLang);
  if (!text) return { handled: true, text: '' };

  const math = text.replace(/^(сколько будет|посчитай|calculate|what is|what['’]s)\s*/i, '').replace(/[=?]\s*$/, '');
  const v = calc(math);
  if (v !== null && /[+\-*/^%×÷]/.test(math)) return { handled: true, text: `${math.replace(/\s+/g, ' ')} = ${v.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 10 })}` };

  for (const [re, run] of RULES) {
    const m = text.match(re);
    if (m) return run(m, w, lang, text);
  }
  return { handled: false, text: '' };
}

/** What the language model is told about the user's day. Kept short and factual. */
export function contextFor(w: AfinaWorld, lang: Lang): string {
  const lines = [`Local time: ${w.now.toString()}`, `UI language: ${lang}`];
  if (w.weather) lines.push(`Weather${w.place ? ` in ${w.place}` : ''}: ${w.weather.temp}°, ${describeWeather(w.weather.code, 'en').label}`);
  if (w.planner) {
    lines.push(`Universal Planner tasks today (${w.planner.tasksToday.length} open, ${w.planner.doneToday} done): ${w.planner.tasksToday.map((t) => t.title).join('; ') || 'none'}`);
    const ev = w.planner.upcoming.slice(0, 3).map((e) => `${e.title} at ${new Date(e.start).toString()}`);
    if (ev.length) lines.push(`Upcoming events: ${ev.join('; ')}`);
  } else lines.push('Universal Planner: not connected');
  if (w.timerEndsAt) lines.push(`A timer ends at ${new Date(w.timerEndsAt).toTimeString()}`);
  if (w.recording) lines.push('A screen recording is in progress');
  return lines.join('\n');
}
