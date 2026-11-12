// Translator: MyMemory (free, no key), with language picker, swap and copy.
import { ArrowLeftRight, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTr } from '../lib/i18n';
import { copyText } from '../lib/clipboard';
import { toast } from '../lib/store';

const LANGS: [string, string, string][] = [
  ['auto', 'Detect', 'Определить'], ['en', 'English', 'Английский'], ['ru', 'Russian', 'Русский'], ['de', 'German', 'Немецкий'], ['fr', 'French', 'Французский'],
  ['es', 'Spanish', 'Испанский'], ['it', 'Italian', 'Итальянский'], ['zh', 'Chinese', 'Китайский'], ['ja', 'Japanese', 'Японский'], ['tr', 'Turkish', 'Турецкий'], ['uk', 'Ukrainian', 'Украинский'], ['ar', 'Arabic', 'Арабский'],
];

export async function translate(text: string, from: string, to: string): Promise<string> {
  const src = from === 'auto' ? (/[а-яё]/i.test(text) ? 'ru' : 'en') : from;
  if (src === to) return text;
  const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=${src}|${to}`);
  const j = (await r.json()) as { responseData?: { translatedText?: string }; responseStatus?: number };
  if (!j.responseData?.translatedText || (j.responseStatus && j.responseStatus >= 400)) throw new Error('translation failed');
  return j.responseData.translatedText;
}

export function TranslateView() {
  const tr = useTr();
  const [from, setFrom] = useState('auto');
  const [to, setTo] = useState(tr.lang === 'ru' ? 'en' : 'ru');
  const [text, setText] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!text.trim()) return setOut('');
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        setOut(await translate(text, from, to));
      } catch {
        setOut(tr('Couldn’t translate — check your connection.', 'Не удалось перевести — проверь интернет.'));
      } finally {
        setBusy(false);
      }
    }, 450);
    return () => clearTimeout(id);
  }, [text, from, to]);

  const sel = (v: string, set: (x: string) => void, withAuto: boolean) => (
    <select className="field" value={v} onChange={(e) => set(e.target.value)}>
      {LANGS.filter(([c]) => withAuto || c !== 'auto').map(([c, en, ru]) => (
        <option key={c} value={c}>{tr(en, ru)}</option>
      ))}
    </select>
  );

  return (
    <div className="translate">
      <div className="row gap">
        {sel(from, setFrom, true)}
        <button className="icon-btn" aria-label={tr('Swap', 'Поменять')} onClick={() => (from !== 'auto' && (setFrom(to), setTo(from)), out && setText(out))}>
          <ArrowLeftRight size={15} />
        </button>
        {sel(to, setTo, false)}
      </div>
      <textarea className="tr-in" value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('Type or paste text…', 'Введи или вставь текст…')} autoFocus />
      <div className={`tr-out ${busy ? 'busy' : ''}`}>
        {out || <span className="faint">{tr('Translation appears here', 'Здесь появится перевод')}</span>}
        {out && (
          <button className="icon-btn tr-copy" aria-label={tr('Copy', 'Копировать')} onClick={() => void copyText(out).then(() => toast(tr('📋 Copied', '📋 Скопировано'), { tone: 'ok' }))}>
            <Copy size={14} />
          </button>
        )}
      </div>
      <div className="tiny faint">{tr('Translation by MyMemory', 'Перевод: MyMemory')}</div>
    </div>
  );
}
