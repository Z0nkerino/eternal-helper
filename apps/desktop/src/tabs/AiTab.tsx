// Chats: AI services (ChatGPT, Claude, Gemini, Perplexity, Copilot, DeepSeek) and messengers (Telegram,
// WhatsApp, Discord) right inside the island. A rail of logos on the left; the chosen one loads in the
// panel itself (a web view placed exactly over the screen area), signed in with the user's own account.
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, ChevronLeft, ExternalLink, Lock, RotateCw, Sparkles } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { call, type ChatService } from '../lib/ipc';
import { trNow, useTr } from '../lib/i18n';
import { toast, useApp } from '../lib/store';
import { copyText } from '../lib/clipboard';
import { AppLogo, brandColor, logoId } from '../lib/brands';

const LAST = 'eh.chat.last';
const HOME_URL: Record<string, string> = {
  chatgpt: 'https://chatgpt.com/', claude: 'https://claude.ai/new', gemini: 'https://gemini.google.com/app', perplexity: 'https://www.perplexity.ai/',
  copilot: 'https://copilot.microsoft.com/', deepseek: 'https://chat.deepseek.com/', telegram: 'https://web.telegram.org/a/', whatsapp: 'https://web.whatsapp.com/', discord: 'https://discord.com/app',
};
const store = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

/** Unread notifications per service (from the PC's notifications, matched by app name). */
function useUnread() {
  const list = useApp((s) => s.notifications);
  const out: Record<string, number> = {};
  for (const n of list) {
    const id = logoId(n.app);
    if (id) out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

/** Places the chat's web view over `ref` and keeps it there while the panel resizes. */
function useChatView(service: string | null, ref: React.RefObject<HTMLDivElement>, prompt: React.MutableRefObject<string | null>) {
  const moving = useApp((s) => s.moving);
  const view = useApp((s) => s.view);
  const sheet = useApp((s) => s.sheet);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!service || !el || moving || view !== 'panel' || sheet) {
      void call('chat_hide');
      useApp.setState({ chatOpen: false });
      return;
    }
    let alive = true;
    const rect = () => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    // Wait for the island's opening spring to settle, so the view lands in the right place.
    const t = setTimeout(async () => {
      if (!alive) return;
      const q = prompt.current;
      prompt.current = null;
      // Marked open before the window appears: the cursor lands on it at once, and the island must not
      // read that as "the cursor left" and close itself (and the chat) while the site loads.
      useApp.setState({ chatOpen: true });
      try {
        const prefilled = await call('chat_show', { service, ...rect(), prompt: q });
        if (!alive) return void call('chat_hide');
        if (q && !prefilled) {
          await copyText(q);
          toast('📋 ' + trNow('Your question is copied — paste it with Ctrl+V', 'Вопрос скопирован — вставь его Ctrl+V'), { force: true, ms: 5000 });
        }
      } catch (e) {
        useApp.setState({ chatOpen: false });
        toast(String(e), { tone: 'error' });
      }
    }, 360);
    const ro = new ResizeObserver(() => void call('chat_place', { service, ...rect() }));
    ro.observe(el);
    return () => {
      alive = false;
      clearTimeout(t);
      ro.disconnect();
      void call('chat_hide');
      useApp.setState({ chatOpen: false });
    };
  }, [service, moving, view, sheet, ref, prompt]);
}

export function AiTab() {
  const tr = useTr();
  const [services, setServices] = useState<ChatService[]>([]);
  const [active, setActive] = useState<string | null>(() => read(LAST));
  const [q, setQ] = useState('');
  const req = useApp((s) => s.chatRequest);
  // The AI asked from the box (Settings → Chats & clipboard).
  const defAi = useApp((s) => (s.settings as unknown as { ai?: { service?: string } } | null)?.ai?.service ?? 'chatgpt');
  const unread = useUnread();
  const screen = useRef<HTMLDivElement>(null);
  const prompt = useRef<string | null>(null);
  useEffect(() => void call('ai_services').then((l) => setServices(l ?? [])), []);
  // Asked from elsewhere (Home, Cloudy, a notification): open that chat with the question.
  useEffect(() => {
    if (!req) return;
    prompt.current = req.prompt;
    setActive(null);
    requestAnimationFrame(() => setActive(req.service));
  }, [req]);
  useEffect(() => store(LAST, active), [active]);
  useChatView(active, screen, prompt);
  // Opening a messenger clears its unread notifications.
  useEffect(() => {
    if (active) useApp.setState((s) => ({ notifications: s.notifications.filter((n) => logoId(n.app) !== active) }));
  }, [active]);

  const ai = services.filter((s) => s.kind === 'ai');
  const msg = services.filter((s) => s.kind === 'messenger');
  const cur = services.find((s) => s.id === active);
  const ask = (s: ChatService) => {
    if (!q.trim()) return;
    prompt.current = q.trim();
    setQ('');
    setActive(null);
    requestAnimationFrame(() => setActive(s.id));
  };

  const RailBtn = ({ s }: { s: ChatService }) => (
    <button className={`chat-rail-btn ${active === s.id ? 'on' : ''}`} onClick={() => setActive(active === s.id ? null : s.id)} title={s.name} aria-label={s.name} style={{ ['--brand' as string]: brandColor(s.id) ?? 'var(--accent)' }}>
      {active === s.id && <motion.span layoutId="chat-rail-pill" className="chat-rail-pill" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
      <AppLogo name={s.id} size={26} />
      {unread[s.id] ? <span className="chat-unread">{Math.min(9, unread[s.id])}</span> : null}
    </button>
  );

  return (
    <div className="chats">
      <nav className="chat-rail" aria-label={tr('Chats', 'Чаты')}>
        <button className={`chat-rail-btn home ${active ? '' : 'on'}`} onClick={() => setActive(null)} aria-label={tr('All chats', 'Все чаты')} title={tr('All chats', 'Все чаты')}>
          {!active && <motion.span layoutId="chat-rail-pill" className="chat-rail-pill" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
          <Sparkles size={18} />
        </button>
        <span className="chat-rail-sep" />
        {ai.map((s) => <RailBtn key={s.id} s={s} />)}
        <span className="chat-rail-sep" />
        {msg.map((s) => <RailBtn key={s.id} s={s} />)}
      </nav>
      <div className="chat-main">
        <AnimatePresence mode="popLayout" initial={false}>
          {cur ? (
            <motion.div key={cur.id} className="chat-open" initial={{ opacity: 0, scale: 0.98, filter: 'blur(4px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
              <header className="chat-head">
                <button className="icon-btn" onClick={() => setActive(null)} aria-label={tr('Back', 'Назад')}>
                  <ChevronLeft size={16} />
                </button>
                <AppLogo name={cur.id} size={18} />
                <span className="chat-title">{cur.name}</span>
                <span className="grow" />
                <button className="icon-btn" title={tr('Reload', 'Обновить')} aria-label={tr('Reload', 'Обновить')} onClick={() => void call('chat_reload', { service: cur.id })}>
                  <RotateCw size={14} />
                </button>
                <button className="icon-btn" title={tr('Open in the browser', 'Открыть в браузере')} aria-label={tr('Open in the browser', 'Открыть в браузере')} onClick={() => void call('open_url', { url: HOME_URL[cur.id] })}>
                  <ExternalLink size={14} />
                </button>
              </header>
              <div className="chat-screen" ref={screen}>
                <div className="chat-loading">
                  <AppLogo name={cur.id} size={40} />
                  <span className="tiny faint">{tr('Loading…', 'Загружаю…')}</span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="home" className="chat-home scroll" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              <form className="ai-ask" onSubmit={(e) => (e.preventDefault(), ai[0] && ask(services.find((s) => s.id === defAi) ?? ai[0]))}>
                <Sparkles size={16} className="faint" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Ask an AI anything…', 'Спроси ИИ о чём угодно…')} aria-label={tr('Question', 'Вопрос')} />
                <button className="send" type="submit" disabled={!q.trim()} aria-label={tr('Ask', 'Спросить')}>
                  <ArrowUp size={16} />
                </button>
              </form>
              {q.trim() && (
                <div className="chat-ask-with">
                  {ai.map((s) => (
                    <button key={s.id} className="chip-btn" onClick={() => ask(s)}>
                      <AppLogo name={s.id} size={14} /> {s.name}
                    </button>
                  ))}
                </div>
              )}
              <p className="chat-sec">{tr('AI', 'ИИ')}</p>
              <div className="chat-cards">
                {ai.map((s, i) => (
                  <Card key={s.id} s={s} i={i} sub={s.prefill ? tr('Ask from here', 'Спрашивай отсюда') : tr('Sign in once', 'Войди один раз')} onOpen={() => setActive(s.id)} />
                ))}
              </div>
              <p className="chat-sec">{tr('Messengers', 'Мессенджеры')}</p>
              <div className="chat-cards">
                {msg.map((s, i) => (
                  <Card key={s.id} s={s} i={i + ai.length} unread={unread[s.id]} sub={unread[s.id] ? tr(`${unread[s.id]} new`, `${unread[s.id]} новых`) : tr('Scan the QR code once', 'Один раз отсканируй QR-код')} onOpen={() => setActive(s.id)} />
                ))}
              </div>
              <p className="ai-note tiny faint">
                <Lock size={11} /> {tr('You sign in on each service’s own page, right here in the island. Eternal Helper never sees your password or your chats.', 'Ты входишь на странице самого сервиса прямо в острове. Eternal Helper не видит ни пароль, ни переписку.')}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Card({ s, i, sub, unread, onOpen }: { s: ChatService; i: number; sub: string; unread?: number; onOpen: () => void }) {
  return (
    <motion.button
      className="chat-card"
      onClick={onOpen}
      style={{ ['--brand' as string]: brandColor(s.id) ?? 'var(--accent)' }}
      initial={{ opacity: 0, y: 10, rotateX: -18 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ delay: i * 0.025, type: 'spring', stiffness: 420, damping: 30 }}
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
    >
      <AppLogo name={s.id} size={30} />
      <span className="grow">
        <span className="chat-card-name">{s.name}</span>
        <span className="tiny faint">{sub}</span>
      </span>
      {unread ? <span className="chat-unread static">{Math.min(99, unread)}</span> : null}
    </motion.button>
  );
}
