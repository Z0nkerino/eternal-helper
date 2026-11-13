// Translator: two cards (from / to) like Apple's and Google's apps — language chips with a searchable
// picker, the detected language, swap, paste, clear, copy and read aloud. Longer texts are translated
// in sentence-sized pieces. Translation by MyMemory (free, no key).
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpDown, ChevronDown, ClipboardPaste, Copy, Search, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTr } from '../lib/i18n';
import { copyText } from '../lib/clipboard';
import { toast } from '../lib/store';

export const LANGS: [string, string, string][] = [
  ['auto', 'Detect language', 'Определить язык'], ['en', 'English', 'Английский'], ['ru', 'Russian', 'Русский'], ['de', 'German', 'Немецкий'], ['fr', 'French', 'Французский'],
  ['es', 'Spanish', 'Испанский'], ['it', 'Italian', 'Итальянский'], ['pt', 'Portuguese', 'Португальский'], ['pl', 'Polish', 'Польский'], ['uk', 'Ukrainian', 'Украинский'],
  ['tr', 'Turkish', 'Турецкий'], ['zh', 'Chinese', 'Китайский'], ['ja', 'Japanese', 'Японский'], ['ko', 'Korean', 'Корейский'], ['ar', 'Arabic', 'Арабский'],
  ['hi', 'Hindi', 'Хинди'], ['nl', 'Dutch', 'Нидерландский'], ['sv', 'Swedish', 'Шведский'], ['cs', 'Czech', 'Чешский'], ['kk', 'Kazakh', 'Казахский'],
];

/** A best guess from the letters used (good enough to pick a direction). */
export function detect(text: string): string {
  if (/[іїєґ]/i.test(text)) return 'uk';
  if (/[а-яё]/i.test(text)) return 'ru';
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  if (/[äöüß]/i.test(text)) return 'de';
  if (/[ñ¿¡]/i.test(text)) return 'es';
  if (/[çœàèùâêîôû]/i.test(text)) return 'fr';
  if (/[ąęłńśźż]/i.test(text)) return 'pl';
  return 'en';
}

/** Splits text into pieces under `max` characters, at sentence ends where possible. */
export function chunks(text: string, max = 450): string[] {
  const out: string[] = [];
  let cur = '';
  for (const s of text.match(/[^.!?。！？\n]+[.!?。！？\n]*\s*/g) ?? [text]) {
    if ((cur + s).length > max && cur) (out.push(cur), (cur = ''));
    cur += s.length > max ? s.slice(0, max) : s;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export async function translate(text: string, from: string, to: string): Promise<string> {
  const src = from === 'auto' ? detect(text) : from;
  if (src === to) return text;
  const parts = await Promise.all(
    chunks(text.slice(0, 3000)).map(async (p) => {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(p.trim())}&langpair=${src}|${to}`);
      const j = (await r.json()) as { responseData?: { translatedText?: string }; responseStatus?: number };
      if (!j.responseData?.translatedText || (j.responseStatus && j.responseStatus >= 400)) throw new Error('translation failed');
      return j.responseData.translatedText + (/\n\s*$/.test(p) ? '\n' : ' ');
    }),
  );
  return parts.join('').trim();
}

function LangPicker({ value, onPick, withAuto, onClose }: { value: string; onPick: (c: string) => void; withAuto: boolean; onClose: () => void }) {
  const tr = useTr();
  const [q, setQ] = useState('');
  const list = LANGS.filter(([c, en, ru]) => (withAuto || c !== 'auto') && (en + ' ' + ru).toLowerCase().includes(q.toLowerCase()));
  return (
    <motion.div className="tr-picker" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
      <label className="settings-search">
        <Search size={13} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search languages', 'Поиск языка')} onKeyDown={(e) => e.key === 'Escape' && onClose()} />
      </label>
      <div className="tr-picker-grid scroll">
        {list.map(([c, en, ru]) => (
          <button key={c} className={`tr-lang ${c === value ? 'on' : ''}`} onClick={() => (onPick(c), onClose())}>
            {tr(en, ru)}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

export function TranslateView() {
  const tr = useTr();
  const [from, setFrom] = useState('auto');
  const [to, setTo] = useState(tr.lang === 'ru' ? 'en' : 'ru');
  const [text, setText] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [pick, setPick] = useState<'from' | 'to' | null>(null);
  const inRef = useRef<HTMLTextAreaElement>(null);
  const name = (c: string) => {
    const l = LANGS.find((x) => x[0] === c);
    return l ? tr(l[1], l[2]) : c;
  };
  const detected = useMemo(() => (from === 'auto' && text.trim() ? detect(text) : null), [from, text]);

  useEffect(() => {
    setErr(false);
    if (!text.trim()) return setOut('');
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        // When the text is already in the target language, translate the other way round.
        const src = from === 'auto' ? detect(text) : from;
        setOut(await translate(text, src, src === to ? (to === 'en' ? 'ru' : 'en') : to));
      } catch {
        setErr(true);
      } finally {
        setBusy(false);
      }
    }, 450);
    return () => clearTimeout(id);
  }, [text, from, to]);

  const speak = (s: string, lang: string) => {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(s);
      u.lang = lang;
      speechSynthesis.speak(u);
    } catch {
      /* no voices */
    }
  };
  const swap = () => {
    const src = from === 'auto' ? detected ?? 'en' : from;
    setFrom(to);
    setTo(src);
    if (out) setText(out);
  };

  return (
    <div className="translate2">
      <div className="tr-card">
        <div className="tr-head">
          <button className="tr-chip" onClick={() => setPick(pick === 'from' ? null : 'from')}>
            {name(from)} <ChevronDown size={13} />
          </button>
          {detected && <span className="tiny faint">{tr('Looks like', 'Похоже на')} {name(detected)}</span>}
          <span className="grow" />
          {text ? (
            <button className="icon-btn sm" onClick={() => (setText(''), inRef.current?.focus())} aria-label={tr('Clear', 'Очистить')}><X size={14} /></button>
          ) : (
            <button className="icon-btn sm" onClick={() => void navigator.clipboard?.readText().then((t) => t && setText(t)).catch(() => {})} aria-label={tr('Paste', 'Вставить')} title={tr('Paste', 'Вставить')}><ClipboardPaste size={14} /></button>
          )}
        </div>
        <textarea ref={inRef} className="tr-text" value={text} maxLength={3000} onChange={(e) => setText(e.target.value)} placeholder={tr('Type or paste text', 'Введи или вставь текст')} autoFocus />
        <div className="tr-foot tiny faint">
          {text.length > 0 && <span className="mono">{text.length} / 3000</span>}
          <span className="grow" />
          {text && <button className="icon-btn sm" onClick={() => speak(text, detected ?? from)} aria-label={tr('Read aloud', 'Озвучить')}><Volume2 size={14} /></button>}
        </div>
        <AnimatePresence>{pick === 'from' && <LangPicker value={from} withAuto onPick={setFrom} onClose={() => setPick(null)} />}</AnimatePresence>
      </div>

      <button className="tr-swap" onClick={swap} aria-label={tr('Swap languages', 'Поменять языки')} title={tr('Swap languages', 'Поменять языки')}>
        <ArrowUpDown size={16} />
      </button>

      <div className={`tr-card out ${busy ? 'busy' : ''}`}>
        <div className="tr-head">
          <button className="tr-chip accent" onClick={() => setPick(pick === 'to' ? null : 'to')}>
            {name(to)} <ChevronDown size={13} />
          </button>
          <span className="grow" />
          {busy && <span className="tr-dots" aria-label="…"><i /><i /><i /></span>}
        </div>
        <div className="tr-text out" aria-live="polite">
          {err ? <span className="tr-err">{tr('Couldn’t translate — check your connection.', 'Не удалось перевести — проверь интернет.')}</span> : out || <span className="faint">{tr('Translation', 'Перевод')}</span>}
        </div>
        <div className="tr-foot tiny faint">
          <span>MyMemory</span>
          <span className="grow" />
          {out && !err && (
            <>
              <button className="icon-btn sm" onClick={() => speak(out, to)} aria-label={tr('Read aloud', 'Озвучить')}><Volume2 size={14} /></button>
              <button className="icon-btn sm" onClick={() => void copyText(out).then(() => toast(tr('Copied', 'Скопировано'), { tone: 'ok' }))} aria-label={tr('Copy', 'Копировать')}><Copy size={14} /></button>
            </>
          )}
        </div>
        <AnimatePresence>{pick === 'to' && <LangPicker value={to} withAuto={false} onPick={setTo} onClose={() => setPick(null)} />}</AnimatePresence>
      </div>
    </div>
  );
}
