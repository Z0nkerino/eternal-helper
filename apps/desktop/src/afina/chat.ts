// Afina's conversation in the island. Order of answers:
// 1) her own rules (time, timers, Planner, recording…), 2) computer tools (find files / text, screenshot,
// web search) when the user allowed them, 3) her brain: the on-device model (like in Universal Planner),
// an AI account the user signed in to (ChatGPT, Claude, Gemini…), or a developer API key.
import { create } from 'zustand';
import { call, type ChatMessage, type FoundFile } from '../lib/ipc';
import { resolveLang, tNow } from '../lib/i18n';
import { openPanel, saveSettings, startTimer, stopTimer, takeScreenshot, toast, useApp } from '../lib/store';
import { startRecording, stopRecording } from '../lib/recorder';
import { copyText } from '../lib/clipboard';
import { contextFor, respond, type AfinaWorld } from './engine';
import { complete, llmReady, loadModel, checkSupport, useLlm, setBaseModel } from './llm';

export interface Bubble {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  chips?: string[];
  error?: boolean;
  files?: FoundFile[];
  /** An action button under the message. */
  action?: { label: string; run: () => void };
}

export const useChat = create<{ bubbles: Bubble[] }>(() => ({ bubbles: [] }));

let nextId = 1;
const push = (b: Omit<Bubble, 'id'>) => useChat.setState((s) => ({ bubbles: [...s.bubbles, { ...b, id: nextId++ }].slice(-60) }));

export const ACCOUNT_SERVICES = ['chatgpt', 'claude', 'gemini', 'perplexity', 'copilot', 'deepseek'] as const;
export const SERVICE_NAMES: Record<string, string> = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', perplexity: 'Perplexity', copilot: 'Copilot', deepseek: 'DeepSeek' };

export function world(): AfinaWorld {
  const s = useApp.getState();
  return {
    now: new Date(),
    weather: s.weather,
    place: s.settings?.weather.place ?? '',
    planner: s.planner,
    timerEndsAt: s.timer?.endsAt ?? null,
    recording: s.rec.status === 'recording' || s.rec.status === 'paused',
    name: s.settings?.name,
    actions: {
      startTimer: (m, label) => startTimer(m, label),
      stopTimer,
      startRecording: () => void startRecording(),
      stopRecording: () => void stopRecording(),
      openPlanner: () => void call('planner_open'),
      openTab: (t) => openPanel(t),
      setDnd: (on) => void saveSettings({ doNotDisturb: on }),
    },
  };
}

const L = (en: string, ru: string) => (resolveLang(useApp.getState().settings?.language) === 'ru' ? ru : en);

const SYSTEM = `You are Afina, the friendly assistant of Eternal Inc., living in the Eternal Helper desktop island (and in Universal Planner). Be warm, brief and concrete: 1–4 short sentences, plain text, an emoji now and then. Answer in the user's language (Russian or English). Use the context about the user's day when relevant and never invent tasks or files.`;

/** Allowing computer tools is a deliberate choice; Afina asks first. */
const toolsOn = () => !!(useApp.getState().settings as unknown as { afinaTools?: { enabled?: boolean } })?.afinaTools?.enabled;
const askForTools = () =>
  push({
    role: 'assistant',
    text: L(
      'I can look through your own folders (Desktop, Documents, Downloads, Pictures, Videos, Music) to find files and text — only when you ask, and nothing leaves your computer. Allow it?',
      'Я могу искать файлы и текст в твоих папках (Рабочий стол, Документы, Загрузки, Изображения, Видео, Музыка) — только по твоей просьбе, и ничего не уходит с компьютера. Разрешить?',
    ),
    action: { label: L('Allow Afina to use this computer', 'Разрешить Афине пользоваться компьютером'), run: () => void saveSettings({ afinaTools: { enabled: true } } as never).then(() => toast(L('✅ Done — ask me again', '✅ Готово — спроси ещё раз'), { tone: 'ok', force: true })) },
  });

async function tools(input: string): Promise<boolean> {
  const text = input.trim();
  const shot = /(сделай|сними|take|grab)\s.*(скриншот|снимок экрана|screenshot)/i.test(text);
  if (shot) {
    push({ role: 'assistant', text: L('Select an area — then you can draw on it ✏️', 'Выдели область — потом можно на ней рисовать ✏️') });
    void takeScreenshot();
    return true;
  }
  const web = text.match(/^(?:найди в интернете|поищи в интернете|загугли|search the web for|google)\s+(.+)$/i);
  if (web) {
    const ru = /[а-яё]/i.test(web[1]);
    void call('open_url', { url: `https://${ru ? 'yandex.ru/search/?text=' : 'www.google.com/search?q='}${encodeURIComponent(web[1])}` });
    push({ role: 'assistant', text: L(`Searching the web for “${web[1]}” 🔎`, `Ищу в интернете «${web[1]}» 🔎`) });
    return true;
  }
  const inText = text.match(/^(?:найди|поищи|find|search(?: for)?)\s+(?:текст|фразу|слова|text|phrase|words)\s+["«“]?(.+?)["»”]?(?:\s+(?:в документах|в файлах|in (?:my )?(?:documents|files)))?$/i);
  const file = !inText && text.match(/^(?:найди|поищи|где|find|where is|search for|locate)\s+(?:мой\s+|my\s+)?(?:файл|файлы|документ|папку|file|files|document|the file)?\s*["«“]?(.+?)["»”]?\??$/i);
  if (!inText && !file) return false;
  // "find a recipe for pancakes" is a question, not a file search: only treat it as one with file words.
  if (file && !/(файл|документ|папк|file|document|\.\w{2,4}\b|где|where)/i.test(text)) return false;
  if (!toolsOn()) {
    askForTools();
    return true;
  }
  const query = (inText ? inText[1] : file ? file[1] : '').trim();
  useApp.setState({ afinaThinking: true });
  try {
    const found = inText ? await call('afina_find_text', { query }) : await call('afina_find_files', { query });
    push(
      found.length
        ? { role: 'assistant', text: inText ? L(`Found “${query}” in ${found.length} file(s) 📄`, `Нашла «${query}» в файлах: ${found.length} 📄`) : L(`Here’s what I found for “${query}” 🗂️`, `Вот что нашлось по «${query}» 🗂️`), files: found }
        : { role: 'assistant', text: L(`Nothing found for “${query}” in your folders 🤷`, `По «${query}» в твоих папках ничего нет 🤷`) },
    );
  } catch (e) {
    if (String(e) === 'tools-off') askForTools();
    else push({ role: 'assistant', text: String(e), error: true });
  } finally {
    useApp.setState({ afinaThinking: false });
  }
  return true;
}

function history(): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const b of useChat.getState().bubbles.filter((b) => !b.error).slice(-10)) {
    if (!out.length && b.role !== 'user') continue;
    const last = out[out.length - 1];
    if (last && last.role === b.role) last.content += `\n${b.text}`;
    else out.push({ role: b.role, content: b.text });
  }
  return out;
}

export async function send(text: string) {
  const input = text.trim();
  if (!input || useApp.getState().afinaThinking) return;
  push({ role: 'user', text: input });
  const lang = resolveLang(useApp.getState().settings?.language);
  const w = world();
  const local = respond(input, w, lang);
  if (local.handled) return push({ role: 'assistant', text: local.text, chips: local.chips });
  if (await tools(input)) return;

  const afina = useApp.getState().settings?.afina;
  const provider = afina?.provider ?? 'local';
  if (!afina?.enabled || provider === 'off') return push({ role: 'assistant', text: tNow('afina.noKey') });

  // An AI account: open it with the question (filled in where the service allows it).
  if ((ACCOUNT_SERVICES as readonly string[]).includes(provider)) {
    const name = SERVICE_NAMES[provider];
    try {
      const prefilled = await call('ai_open', { service: provider, prompt: input });
      if (!prefilled) await copyText(input);
      push({
        role: 'assistant',
        text: prefilled
          ? L(`Asked ${name} — the answer is in its window 💬`, `Спросила ${name} — ответ в его окне 💬`)
          : L(`Opened ${name} and copied your question — paste it with Ctrl+V (⌘V) 📋`, `Открыла ${name} и скопировала вопрос — вставь его через Ctrl+V (⌘V) 📋`),
      });
    } catch (e) {
      push({ role: 'assistant', text: String(e), error: true });
    }
    return;
  }

  // The on-device brain.
  if (provider === 'local') {
    setBaseModel(afina.model);
    const supported = await checkSupport();
    if (!supported) {
      return push({
        role: 'assistant',
        text: L('My on-device brain can’t run on this computer’s graphics. Pick an AI account in Settings → Afina and I’ll ask it for you.', 'Мой встроенный мозг не запускается на видеокарте этого компьютера. Выбери ИИ-аккаунт в Настройках → Afina, и я спрошу его за тебя.'),
        chips: [L('Open settings', 'Открой настройки')],
      });
    }
    if (!llmReady()) {
      if (!useLlm.getState().installed) {
        return push({
          role: 'assistant',
          text: L('To chat about anything, I need to download my brain once (about 1 GB). After that I work offline, for free. Download now?', 'Чтобы болтать обо всём, мне нужно один раз скачать «мозг» (около 1 ГБ). Потом я работаю без интернета и бесплатно. Скачать?'),
          action: { label: L('Download Afina’s brain', 'Скачать мозг Афины'), run: () => void loadModel() },
        });
      }
      useApp.setState({ afinaThinking: true });
      const ok = await loadModel();
      useApp.setState({ afinaThinking: false });
      if (!ok) return push({ role: 'assistant', text: L('I couldn’t wake my brain up. Check Settings → Afina.', 'Не получилось разбудить мозг. Загляни в Настройки → Afina.'), error: true });
    }
    useApp.setState({ afinaThinking: true });
    try {
      const answer = await complete([{ role: 'system', content: `${SYSTEM}\n\nContext:\n${contextFor(w, lang)}` }, ...history()]);
      push({ role: 'assistant', text: answer.trim() || '🙂' });
    } catch (e) {
      push({ role: 'assistant', text: `${tNow('afina.error')}: ${String(e)}`, error: true });
    } finally {
      useApp.setState({ afinaThinking: false });
    }
    return;
  }

  // Developer option: the user's own API key (kept in the system keychain).
  useApp.setState({ afinaThinking: true });
  try {
    const answer = await call('afina_ask', { context: contextFor(w, lang), history: history() });
    push({ role: 'assistant', text: answer.trim() });
  } catch (e) {
    const err = String(e);
    const text = err === 'no-key' || err === 'off' ? tNow('afina.noKey') : err === 'refusal' ? tNow('afina.refusal') : `${tNow('afina.error')}: ${err}`;
    push({ role: 'assistant', text, error: err !== 'refusal' });
  } finally {
    useApp.setState({ afinaThinking: false });
  }
}
