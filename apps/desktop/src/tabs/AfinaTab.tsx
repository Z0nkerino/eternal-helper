import { ArrowUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Orb } from '../afina/Orb';
import { send, useChat } from '../afina/chat';
import { useT } from '../lib/i18n';
import { useApp } from '../lib/store';
import { Rich } from '../lib/emoji';

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
