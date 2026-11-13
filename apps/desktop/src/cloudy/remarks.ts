// What Cloudy says about what's on the screen: the app in front (and its window title) and the song
// that's playing. Pure functions, so they're easy to test; `rand` picks between phrasings.
import type { Lang } from '../lib/i18n';

type Line = [en: string, ru: string];
type Fg = { app: string; title: string } | null;
type Track = { title: string; artist: string } | null;

const pick = (lines: Line[], lang: Lang, rand: () => number) => {
  const l = lines[Math.floor(rand() * lines.length) % lines.length];
  return lang === 'ru' ? l[1] : l[0];
};
const short = (s: string, n = 34) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** "Some video - YouTube — Google Chrome" → "Some video". */
export function pageTitle(title: string): string {
  return title.replace(/\s+[-—–|]\s+(Google Chrome|Microsoft​? Edge|Mozilla Firefox|Opera|Brave|Yandex|Яндекс Браузер|Vivaldi)$/i, '').replace(/\s+[-—–|]\s+YouTube$/i, '').trim();
}

/** A remark about the app in front, or null when there's nothing worth saying. */
export function remarkFor(fg: Fg, lang: Lang, rand: () => number = Math.random): string | null {
  if (!fg) return null;
  const app = fg.app.toLowerCase();
  const title = fg.title;
  const page = pageTitle(title);
  const t = title.toLowerCase();
  const browser = /chrome|msedge|firefox|opera|brave|yandex|browser|vivaldi|safari|arc/.test(app);
  if (browser && /youtube/.test(t) && page) return pick([[`What are we watching? “${short(page)}” 👀`, `Что смотрим? «${short(page)}» 👀`], [`Ooh, “${short(page)}”! Can I watch too? 🍿`, `О, «${short(page)}»! Можно с тобой? 🍿`]], lang, rand);
  if (browser && /github/.test(t)) return pick([['Code on GitHub! Push it, push it 🚀', 'Код на GitHub! Пушим 🚀']], lang, rand);
  if (browser && /(mail|gmail|почта|outlook)/.test(t)) return pick([['Checking mail? Inbox zero, let’s go 📬', 'Разбираем почту? Вперёд к пустому ящику 📬']], lang, rand);
  if (browser && /(chatgpt|claude|gemini|perplexity|deepseek|copilot)/.test(t)) return pick([['Talking to another AI? I’m still your favourite cloud, right? ☁️', 'Болтаешь с другим ИИ? Но я же всё равно любимое облачко? ☁️']], lang, rand);
  if (browser && /(wikipedia|википедия)/.test(t) && page) return pick([[`Learning about “${short(page, 26)}”? Tell me later! 📚`, `Читаешь про «${short(page, 26)}»? Потом расскажешь! 📚`]], lang, rand);
  if (browser && /(netflix|кинопоиск|twitch|okko|ivi)/.test(t)) return pick([['Movie time! I’ll be quiet 🤫🍿', 'Время кино! Я тихонько 🤫🍿']], lang, rand);
  if (browser && /(shop|cart|корзина|ozon|wildberries|amazon|aliexpress|market)/.test(t)) return pick([['Shopping? Get me something fluffy 🛍️', 'Шопинг? Купи мне что-нибудь пушистое 🛍️']], lang, rand);
  if (/^(code|cursor|idea64|idea|pycharm64|pycharm|webstorm64|devenv|sublime_text|zed|nvim|rider64)$/.test(app) || /visual studio/.test(t)) return pick([['Coding! Don’t forget to save 💾', 'Кодим! Не забудь сохранить 💾'], ['Bug hunting? I believe in you 🐛🔍', 'Ловим баги? Я в тебя верю 🐛🔍'], [`Working on ${short(title.split(/ [-—] /)[0] || 'code', 24)}? Nice 👩‍💻`, `Работаешь над ${short(title.split(/ [-—] /)[0] || 'кодом', 24)}? Круто 👩‍💻`]], lang, rand);
  if (/^(windowsterminal|cmd|powershell|pwsh|terminal|iterm2|warp|wezterm-gui|alacritty)$/.test(app)) return pick([['The terminal! Very hacker of you 😎', 'Терминал! Очень по-хакерски 😎']], lang, rand);
  if (/^(winword|pages)$/.test(app)) return pick([['Writing something? You’ve got this ✍️', 'Пишешь что-то? У тебя получится ✍️']], lang, rand);
  if (/^(excel|numbers)$/.test(app)) return pick([['Numbers, numbers… 📊 Want a calculator?', 'Цифры, цифры… 📊 Калькулятор нужен?']], lang, rand);
  if (/^(powerpnt|keynote)$/.test(app)) return pick([['A presentation! You’ll be great 🎤', 'Презентация! Ты справишься 🎤']], lang, rand);
  if (/^(figma|photoshop|illustrator|afterfx|blender|krita|gimp)/.test(app)) return pick([['Ooh, making something pretty 🎨', 'О, создаёшь красоту 🎨']], lang, rand);
  if (/^(telegram|whatsapp|discord|signal|viber|slack|teams|ms-teams)/.test(app)) return pick([['Say hi from me 💬', 'Передай привет от меня 💬'], ['Chatting? I’ll wait right here ☁️', 'Переписываешься? Я подожду ☁️']], lang, rand);
  if (/^(steam|steamwebhelper|epicgameslauncher|battle\.net|riotclientservices)$/.test(app)) return pick([['Picking a game? 🎮 Have fun!', 'Выбираешь игру? 🎮 Удачи!']], lang, rand);
  if (/^(spotify|yandexmusic|music|itunes|aimp|foobar2000)$/.test(app)) return pick([['Choosing music? I’ll dance 💃', 'Выбираешь музыку? Я потанцую 💃']], lang, rand);
  if (/^(explorer|finder)$/.test(app) && title) return pick([[`Tidying up “${short(title, 22)}”? 🗂️`, `Наводишь порядок в «${short(title, 22)}»? 🗂️`]], lang, rand);
  if (/^(obs64|obs)$/.test(app)) return pick([['Going live? Wave to everyone for me 👋', 'Стрим? Помаши всем от меня 👋']], lang, rand);
  if (/^(notepad|notepad\+\+|obsidian|notion)$/.test(app)) return pick([['Taking notes? I keep a board in the island too 📝', 'Записываешь? У меня в острове тоже есть доска 📝']], lang, rand);
  if (browser && page) return pick([[`Reading “${short(page, 28)}”? 👀`, `Читаешь «${short(page, 28)}»? 👀`]], lang, rand);
  return null;
}

/** A remark about the song that just started. */
export function remarkForTrack(t: Track, lang: Lang, rand: () => number = Math.random): string | null {
  if (!t?.title) return null;
  const s = short(t.title, 28);
  const a = t.artist ? short(t.artist.split(/,|&| feat/i)[0].trim(), 22) : '';
  return pick(
    a
      ? [[`♪ “${s}” by ${a} — great choice! 🎧`, `♪ «${s}» — ${a}, отличный выбор! 🎧`], [`${a}! I love this one 💙`, `${a}! Обожаю эту песню 💙`], [`Turning it up for “${s}” 🔊`, `Сделаю погромче для «${s}» 🔊`]]
      : [[`♪ “${s}” — let’s vibe 🎧`, `♪ «${s}» — кайфуем 🎧`]],
    lang,
    rand,
  );
}
