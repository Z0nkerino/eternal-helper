// Afina's conversation in the island. Local engine first, then the user's language model.
import { create } from 'zustand';
import { call, type ChatMessage } from '../lib/ipc';
import { resolveLang, tNow } from '../lib/i18n';
import { openPanel, saveSettings, startTimer, stopTimer, useApp } from '../lib/store';
import { startRecording, stopRecording } from '../lib/recorder';
import { contextFor, respond, type AfinaWorld } from './engine';

export interface Bubble {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  chips?: string[];
  error?: boolean;
}

export const useChat = create<{ bubbles: Bubble[] }>(() => ({ bubbles: [] }));

let nextId = 1;
const push = (b: Omit<Bubble, 'id'>) => useChat.setState((s) => ({ bubbles: [...s.bubbles, { ...b, id: nextId++ }].slice(-60) }));

export function world(): AfinaWorld {
  const s = useApp.getState();
  return {
    now: new Date(),
    weather: s.weather,
    place: s.settings?.weather.place ?? '',
    planner: s.planner,
    timerEndsAt: s.timer?.endsAt ?? null,
    recording: s.rec.status === 'recording' || s.rec.status === 'paused',
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

export async function send(text: string) {
  const input = text.trim();
  if (!input || useApp.getState().afinaThinking) return;
  push({ role: 'user', text: input });
  const lang = resolveLang(useApp.getState().settings?.language);
  const w = world();
  const local = respond(input, w, lang);
  if (local.handled) {
    push({ role: 'assistant', text: local.text, chips: local.chips });
    return;
  }

  const afina = useApp.getState().settings?.afina;
  if (!afina?.enabled || afina.provider === 'off') {
    push({ role: 'assistant', text: tNow('afina.noKey'), chips: [lang === 'ru' ? 'Открой настройки' : 'Open settings'] });
    return;
  }
  // The model sees the recent conversation (user/assistant alternating, starting with the user).
  const history: ChatMessage[] = [];
  for (const b of useChat.getState().bubbles.filter((b) => !b.error).slice(-12)) {
    if (!history.length && b.role !== 'user') continue;
    const last = history[history.length - 1];
    if (last && last.role === b.role) last.content += `\n${b.text}`;
    else history.push({ role: b.role, content: b.text });
  }
  useApp.setState({ afinaThinking: true });
  try {
    const answer = await call('afina_ask', { context: contextFor(w, lang), history });
    push({ role: 'assistant', text: answer.trim() });
  } catch (e) {
    const err = String(e);
    const text = err === 'no-key' || err === 'off' ? tNow('afina.noKey') : err === 'refusal' ? tNow('afina.refusal') : `${tNow('afina.error')}: ${err}`;
    push({ role: 'assistant', text, error: err !== 'refusal', chips: err === 'no-key' ? [lang === 'ru' ? 'Открой настройки' : 'Open settings'] : undefined });
  } finally {
    useApp.setState({ afinaThinking: false });
  }
}
