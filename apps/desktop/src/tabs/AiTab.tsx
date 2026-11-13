// AI: your own accounts at ChatGPT, Claude, Gemini, Perplexity, Copilot or DeepSeek, used fully. You sign
// in once on the service's own site (Eternal Helper never sees the password); it then opens in a window
// docked right under the island. Type a question here and it opens with the question filled in.
import { motion } from 'framer-motion';
import { ArrowUp, Lock, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { call, type Settings } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { closePanel, saveSettings, toast, useApp } from '../lib/store';
import { copyText } from '../lib/clipboard';

type Service = { id: string; name: string; prefill: boolean };
const COLORS: Record<string, [string, string]> = {
  chatgpt: ['#10a37f', '#0d8a6b'],
  claude: ['#d97757', '#b8603f'],
  gemini: ['#4f8cff', '#9b72f2'],
  perplexity: ['#20b8cd', '#1690a3'],
  copilot: ['#7f5af0', '#2f9bff'],
  deepseek: ['#4d6bfe', '#3450d6'],
};
const USED = 'eh.ai.used';
const readUsed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(USED) ?? '[]');
  } catch {
    return [];
  }
};

export function AiTab() {
  const tr = useTr();
  const [services, setServices] = useState<Service[]>([]);
  const [q, setQ] = useState('');
  const [used, setUsed] = useState(readUsed);
  const def = useApp((s) => (s.settings as unknown as { ai?: { service?: string } })?.ai?.service ?? 'chatgpt');
  const focus = useApp((s) => s.focusAfina);
  useEffect(() => void call('ai_services').then((l) => setServices(l ?? [])), []);
  const current = services.find((s) => s.id === def) ?? services[0];

  const open = async (s: Service, prompt?: string) => {
    try {
      const prefilled = await call('ai_open', { service: s.id, prompt: prompt?.trim() || null, docked: true });
      if (prompt?.trim() && !prefilled) {
        await copyText(prompt.trim());
        toast(tr(`${s.name} is open — your question is copied, paste it with Ctrl+V`, `${s.name} открыт — вопрос скопирован, вставь его Ctrl+V`), { force: true, ms: 5000 });
      }
      const next = [s.id, ...used.filter((x) => x !== s.id)].slice(0, 6);
      setUsed(next);
      try {
        localStorage.setItem(USED, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      setQ('');
      closePanel();
    } catch (e) {
      toast(String(e), { tone: 'error' });
    }
  };

  return (
    <div className="ai">
      <form className="ai-ask" onSubmit={(e) => (e.preventDefault(), current && q.trim() && void open(current, q))}>
        <span className="ai-badge" style={{ ['--a' as string]: COLORS[current?.id ?? 'chatgpt']?.[0], ['--b' as string]: COLORS[current?.id ?? 'chatgpt']?.[1] }}>{current?.name.slice(0, 1)}</span>
        <input key={focus} autoFocus={focus > 0} value={q} onChange={(e) => setQ(e.target.value)} placeholder={current ? tr(`Ask ${current.name} anything…`, `Спроси ${current.name} о чём угодно…`) : '…'} aria-label={tr('Question', 'Вопрос')} />
        <button className="send" type="submit" disabled={!q.trim()} aria-label={tr('Ask', 'Спросить')}>
          <ArrowUp size={16} />
        </button>
      </form>
      <div className="ai-grid">
        {services.map((s, i) => {
          const [a, b] = COLORS[s.id] ?? ['#666', '#444'];
          const isDef = s.id === current?.id;
          return (
            <motion.div key={s.id} className={`ai-card ${isDef ? 'on' : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.2 }}>
              <button className="ai-card-main" onClick={() => void open(s)}>
                <span className="ai-badge" style={{ ['--a' as string]: a, ['--b' as string]: b }}>{s.name.slice(0, 1)}</span>
                <span className="grow">
                  <span className="ai-name">{s.name}</span>
                  <span className="tiny faint">{used.includes(s.id) ? tr('Open', 'Открыть') : tr('Sign in', 'Войти')}</span>
                </span>
              </button>
              <button className={`ai-star ${isDef ? 'on' : ''}`} aria-label={tr('Make default', 'По умолчанию')} title={tr('Ask this one by default', 'Спрашивать его по умолчанию')} onClick={() => void saveSettings({ ai: { service: s.id } } as unknown as Partial<Settings>)}>
                <Star size={13} fill={isDef ? 'currentColor' : 'none'} />
              </button>
            </motion.div>
          );
        })}
      </div>
      <p className="ai-note tiny faint">
        <Lock size={11} /> {tr('You sign in on the service’s own page. Eternal Helper never sees your password or your chats.', 'Ты входишь на странице самого сервиса. Eternal Helper не видит ни пароль, ни переписку.')}
      </p>
    </div>
  );
}
