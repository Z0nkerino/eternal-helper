// Data for the "Today" card and the pill carousel: currency rates, world clocks, holidays, fact of the day.
import { systemRegion } from './defaults';
import type { Lang } from './i18n';

// ---------- Currency (ExchangeRate-API open access, no key; attribution shown in Settings) ----------

const rates = new Map<string, { at: number; rates: Record<string, number> }>();

export async function rate(from: string, to: string): Promise<number | null> {
  const cached = rates.get(from);
  if (!cached || Date.now() - cached.at > 2 * 3600_000) {
    try {
      const r = (await (await fetch(`https://open.er-api.com/v6/latest/${from}`)).json()) as { result: string; rates?: Record<string, number> };
      if (r.result === 'success' && r.rates) rates.set(from, { at: Date.now(), rates: r.rates });
    } catch {
      /* offline */
    }
  }
  return rates.get(from)?.rates[to] ?? null;
}

const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', RUB: '₽', JPY: '¥', CNY: '¥', UAH: '₴', KZT: '₸', TRY: '₺', INR: '₹', AED: 'AED', BYN: 'Br', GEL: '₾', AMD: '֏', CHF: 'CHF', PLN: 'zł' };
export const symbol = (c: string) => SYMBOL[c] ?? c;

export function formatRate(v: number, to: string, lang: Lang) {
  const digits = v >= 100 ? 1 : v >= 1 ? 2 : 4;
  return `${v.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${symbol(to)}`;
}

// ---------- World clocks ----------

export function timeIn(tz: string, lang: Lang, now = new Date()) {
  try {
    return now.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  } catch {
    return '—';
  }
}

/** "+3 h" difference from local time. */
export function offsetFromLocal(tz: string, now = new Date()) {
  try {
    const there = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const here = new Date(now.toLocaleString('en-US'));
    const h = Math.round((there.getTime() - here.getTime()) / 3600_000);
    return h === 0 ? '±0' : `${h > 0 ? '+' : '−'}${Math.abs(h)}`;
  } catch {
    return '';
  }
}

// ---------- Greeting ----------

export function greeting(lang: Lang, hour = new Date().getHours(), name = '') {
  const L = (en: string, ru: string) => (lang === 'ru' ? ru : en);
  const n = name.trim() ? `, ${name.trim()}` : '';
  if (hour < 5) return L(`Good night${n} 🌙`, `Доброй ночи${n} 🌙`);
  if (hour < 12) return L(`Good morning${n} ☀️`, `Доброе утро${n} ☀️`);
  if (hour < 18) return L(`Good afternoon${n} 👋`, `Добрый день${n} 👋`);
  return L(`Good evening${n} 🌇`, `Добрый вечер${n} 🌇`);
}

// ---------- Holidays (Nager.Date, no key) and fact of the day ----------

const holidayCache = new Map<string, { date: string; localName: string; name: string }[]>();

export async function holidayToday(lang: Lang, now = new Date()): Promise<string | null> {
  const country = systemRegion();
  const key = `${now.getFullYear()}-${country}`;
  if (!holidayCache.has(key)) {
    try {
      const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${now.getFullYear()}/${country}`);
      holidayCache.set(key, r.ok ? await r.json() : []);
    } catch {
      return null;
    }
  }
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const h = holidayCache.get(key)!.find((x) => x.date === today);
  return h ? `🎉 ${lang === 'ru' ? h.localName : h.name}` : null;
}

const FACTS: [string, string][] = [
  ['Honey never spoils: edible honey was found in 3,000-year-old tombs.', 'Мёд не портится: съедобный мёд находили в гробницах возрастом 3000 лет.'],
  ['Octopuses have three hearts and blue blood.', 'У осьминога три сердца и голубая кровь.'],
  ['A day on Venus is longer than its year.', 'Сутки на Венере длиннее, чем год.'],
  ['Bananas are berries, but strawberries are not.', 'Банан — это ягода, а клубника — нет.'],
  ['The Eiffel Tower grows about 15 cm taller in summer heat.', 'Летом Эйфелева башня «вырастает» примерно на 15 см от жары.'],
  ['Sharks existed before trees.', 'Акулы появились раньше деревьев.'],
  ['A cloud can weigh more than a million kilograms.', 'Облако может весить больше миллиона килограммов. ☁️'],
  ['Wombat poop is cube-shaped.', 'У вомбатов кубические какашки.'],
  ['Hot water can freeze faster than cold water (the Mpemba effect).', 'Горячая вода иногда замерзает быстрее холодной — эффект Мпембы.'],
  ['There are more possible games of chess than atoms in the observable universe.', 'Вариантов шахматных партий больше, чем атомов в наблюдаемой Вселенной.'],
  ['Sea otters hold hands while they sleep so they don’t drift apart.', 'Каланы спят, держась за лапки, чтобы их не разнесло течением.'],
  ['The first computer bug was a real moth, found in 1947.', 'Первый компьютерный «баг» был настоящей молью — в 1947 году.'],
  ['Lightning is about five times hotter than the surface of the Sun.', 'Молния примерно в пять раз горячее поверхности Солнца. ⚡'],
  ['Cows have best friends and get stressed when separated.', 'У коров есть лучшие друзья, и в разлуке они нервничают.'],
  ['A teaspoon of a neutron star would weigh about a billion tonnes.', 'Чайная ложка нейтронной звезды весила бы около миллиарда тонн.'],
  ['Russia spans 11 time zones.', 'Россия раскинулась на 11 часовых поясов.'],
  ['The shortest war in history lasted 38 minutes.', 'Самая короткая война в истории длилась 38 минут.'],
  ['Butterflies taste with their feet.', 'Бабочки чувствуют вкус лапками. 🦋'],
  ['Your brain uses about 20% of your body’s energy.', 'Мозг тратит около 20% энергии всего тела. 🧠'],
  ['A group of flamingos is called a flamboyance.', 'Стаю фламинго по-английски называют flamboyance — «пышность».'],
  ['The dot over the letters i and j is called a tittle.', 'Точка над буквами i и j называется «титл».'],
  ['Saturn would float in a big enough bathtub — it’s less dense than water.', 'Сатурн плавал бы в огромной ванне: он легче воды.'],
  ['Koalas sleep up to 22 hours a day.', 'Коалы спят до 22 часов в сутки. 😴'],
  ['The word “robot” comes from the Czech “robota”, meaning forced labour.', 'Слово «робот» придумал чешский писатель Карел Чапек. 🤖'],
  ['Light from the Sun takes about 8 minutes to reach Earth.', 'Свет от Солнца идёт до Земли около 8 минут. ☀️'],
  ['Rainbows can be full circles when seen from a plane.', 'Из самолёта радуга бывает полным кругом. 🌈'],
  ['Crows can recognise human faces and hold grudges.', 'Вороны узнают лица людей и помнят обиды.'],
  ['There are more trees on Earth than stars in the Milky Way.', 'Деревьев на Земле больше, чем звёзд в Млечном Пути. 🌳'],
  ['A snail can sleep for three years.', 'Улитка может проспать три года.'],
  ['Water makes up about 60% of the human body.', 'Человек примерно на 60% состоит из воды. 💧'],
  ['The Moon moves about 3.8 cm away from Earth every year.', 'Луна каждый год отдаляется от Земли на 3,8 см. 🌙'],
];

export function factOfDay(lang: Lang, now = new Date()) {
  const day = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const [en, ru] = FACTS[day % FACTS.length];
  return `💡 ${lang === 'ru' ? ru : en}`;
}
