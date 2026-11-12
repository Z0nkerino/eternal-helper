// Calculator: keypad and keyboard input, live result, history.
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { calc } from '../lib/text';
import { copyText } from '../lib/clipboard';
import { toast } from '../lib/store';
import { useTr } from '../lib/i18n';

const KEYS = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '%', '0', '.', '='];

export function CalcView() {
  const tr = useTr();
  const [expr, setExpr] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const norm = (e: string) => e.replace(/−/g, '-');
  const live = expr ? calc(norm(expr)) : null;

  const press = (k: string) => {
    if (k === 'C') return setExpr('');
    if (k === '=') {
      if (live == null) return;
      setHistory((h) => [`${expr} = ${live}`, ...h].slice(0, 6));
      return setExpr(String(live));
    }
    if (k === '⌫') return setExpr((e) => e.slice(0, -1));
    setExpr((e) => e + k);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const map: Record<string, string> = { '*': '×', '/': '÷', '-': '−', Enter: '=', '=': '=', Backspace: '⌫', Escape: 'C', ',': '.' };
      const k = map[e.key] ?? (/^[0-9.+()%]$/.test(e.key) ? e.key : '');
      if (k) (e.preventDefault(), press(k));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  return (
    <div className={`calc ${history.length ? 'with-history' : ''}`}>
      <div className="calc-display" onClick={() => live != null && void copyText(String(live)).then(() => toast(`📋 ${live}`, { tone: 'ok' }))} title={tr('Click to copy', 'Нажми, чтобы скопировать')}>
        <div className="calc-expr mono">{expr || '0'}</div>
        <div className="calc-result mono">{live != null && expr !== String(live) ? `= ${live.toLocaleString(tr.lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 10 })}` : ' '}</div>
      </div>
      <div className="calc-keys">
        {KEYS.map((k) => (
          <motion.button key={k} whileTap={{ scale: 0.9 }} className={`calc-key ${/[÷×−+=]/.test(k) ? 'op' : ''} ${k === '=' ? 'eq' : ''}`} onClick={() => press(k)}>
            {k}
          </motion.button>
        ))}
      </div>
      {history.length > 0 && (
        <ul className="calc-history">
          {history.map((h, i) => (
            <li key={i} className="mono small faint" onClick={() => setExpr(h.split(' = ')[1])}>
              {h}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
