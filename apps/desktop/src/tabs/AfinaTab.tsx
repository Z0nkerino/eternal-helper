import { ArrowUp, FolderSearch } from 'lucide-react';
import { call } from '../lib/ipc';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Orb } from '../afina/Orb';
import { send, useChat } from '../afina/chat';
import { useT } from '../lib/i18n';
import { openPanel, useApp } from '../lib/store';
import { Rich } from '../lib/emoji';
import { SERVICE_NAMES } from '../afina/chat';
import { useLlm } from '../afina/llm';

export function AfinaTab() {
  const t = useT();
  const bubbles = useChat((s) => s.bubbles);
  const thinking = useApp((s) => s.afinaThinking);
  const focusAfina = useApp((s) => s.focusAfina);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => input.current?.focus(), [focusAfina]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles.length, thinking]);

  const submit = (v = text) => {
    if (!v.trim()) return;
    setText('');
    void send(v);
  };

  const starters = t.lang === 'ru' ? ['Что сегодня?', 'Погода', 'Таймер 10 минут', 'Начни запись экрана'] : ['What’s today?', 'Weather', 'Timer 10 minutes', 'Start recording'];

  return (
    <div className="afina">
      <div className="chat" ref={list} aria-live="polite">
        {!bubbles.length && (
          <div className="afina-hello">
            <Orb size={56} />
            <p>{t('afina.hello')}</p>
            <div className="chips">
              {starters.map((c) => (
                <button key={c} className="chip" onClick={() => submit(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        {bubbles.map((b, i) => (
          <motion.div key={b.id} className={`bubble-msg ${b.role} ${b.error ? 'error' : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            {b.role === 'assistant' && <Orb size={16} />}
            <div>
              <div className="msg-text">
                <Rich text={b.text} />
              </div>
              {b.files && b.files.length > 0 && (
                <ul className="found">
                  {b.files.map((f) => (
                    <li key={f.path}>
                      <button className="found-main" onClick={() => void call('afina_open', { path: f.path, reveal: false })} title={f.path}>
                        <span className="ellipsis">{f.name}</span>
                        <span className="tiny faint ellipsis">{f.snippet ?? f.path.replace(/[\\/][^\\/]*$/, '')}</span>
                      </button>
                      <button className="icon-btn" aria-label={t.lang === 'ru' ? 'Показать в папке' : 'Show in folder'} onClick={() => void call('afina_open', { path: f.path, reveal: true })}>
                        <FolderSearch size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {b.action && (
                <button className="btn accent msg-action" onClick={b.action.run}>
                  {b.action.label}
                </button>
              )}
              {b.chips && i === bubbles.length - 1 && (
                <div className="chips">
                  {b.chips.map((c) => (
                    <button key={c} className="chip" onClick={() => submit(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {thinking && (
          <div className="bubble-msg assistant">
            <Orb size={16} thinking />
            <div className="msg-text muted">{t('afina.thinking')}</div>
          </div>
        )}
      </div>
      <BrainChip />
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('afina.placeholder')} aria-label={t('afina.placeholder')} />
        <button className="send" type="submit" disabled={!text.trim() || thinking} aria-label="Send">
          <ArrowUp size={16} />
        </button>
      </form>
    </div>
  );
}

/** Which brain Afina uses right now (click → settings). */
function BrainChip() {
  const t = useT();
  const provider = useApp((s) => s.settings?.afina.provider ?? 'local');
  const llm = useLlm();
  const ru = t.lang === 'ru';
  const label =
    provider === 'local'
      ? `🔮 ${ru ? 'Мозг на устройстве' : 'On-device brain'}${llm.status === 'downloading' ? ` · ${Math.round(llm.progress * 100)}%` : llm.status === 'ready' ? (ru ? ' · готов' : ' · ready') : ''}`
      : SERVICE_NAMES[provider]
        ? `💬 ${SERVICE_NAMES[provider]}`
        : provider === 'off'
          ? (ru ? 'ИИ выключен' : 'AI off')
          : `🛠️ API · ${provider}`;
  return (
    <div className="brain-chip-row">
      <button className="brain-chip tiny" onClick={() => openPanel('settings')}>
        <Rich text={label} size={13} />
      </button>
      {llm.status === 'downloading' && <div className="progress brain-progress"><div style={{ width: `${llm.progress * 100}%` }} /></div>}
    </div>
  );
}
