// Translator: flags for every language, a big from → to bar with an animated swap, two side-by-side
// cards (type on the left, the translation appears on the right as you type), your recent languages one
// tap away, read aloud, copy, and a history of the last translations. Longer texts are translated in
// sentence-sized pieces. Translation by MyMemory (free, no key).
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftRight, ChevronDown, ClipboardPaste, Copy, Globe2, History, Search, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as FLAGS from 'country-flag-icons/string/3x2';
import { useTr } from '../lib/i18n';
import { copyText } from '../lib/clipboard';
import { toast } from '../lib/store';

export const LANGS: [string, string, string][] = [
  ['auto', 'Detect language', 'Определить язык'], ['en', 'English', 'Английский'], ['ru', 'Russian', 'Русский'], ['de', 'German', 'Немецкий'], ['fr', 'French', 'Французский'],
  ['es', 'Spanish', 'Испанский'], ['it', 'Italian', 'Итальянский'], ['pt', 'Portuguese', 'Португальский'], ['pl', 'Polish', 'Польский'], ['uk', 'Ukrainian', 'Украинский'],
  ['tr', 'Turkish', 'Турецкий'], ['zh', 'Chinese', 'Китайский'], ['ja', 'Japanese', 'Японский'], ['ko', 'Korean', 'Корейский'], ['ar', 'Arabic', 'Арабский'],
  ['hi', 'Hindi', 'Хинди'], ['nl', 'Dutch', 'Нидерландский'], ['sv', 'Swedish', 'Шведский'], ['cs', 'Czech', 'Чешский'], ['kk', 'Kazakh', 'Казахский'],
  ['be', 'Belarusian', 'Белорусский'], ['fi', 'Finnish', 'Финский'], ['da', 'Danish', 'Датский'], ['no', 'Norwegian', 'Норвежский'], ['el', 'Greek', 'Греческий'],
  ['he', 'Hebrew', 'Иврит'], ['vi', 'Vietnamese', 'Вьетнамский'], ['th', 'Thai', 'Тайский'], ['id', 'Indonesian', 'Индонезийский'], ['ro', 'Romanian', 'Румынский'],
  ['hu', 'Hungarian', 'Венгерский'], ['bg', 'Bulgarian', 'Болгарский'], ['sr', 'Serbian', 'Сербский'], ['hr', 'Croatian', 'Хорватский'], ['sk', 'Slovak', 'Словацкий'],
  ['lt', 'Lithuanian', 'Литовский'], ['lv', 'Latvian', 'Латышский'], ['et', 'Estonian', 'Эстонский'], ['hy', 'Armenian', 'Армянский'], ['ka', 'Georgian', 'Грузинский'],
  ['az', 'Azerbaijani', 'Азербайджанский'], ['uz', 'Uzbek', 'Узбекский'], ['fa', 'Persian', 'Персидский'],
];

/** The country whose flag stands for a language. */
const FLAG_OF: Record<string, string> = {
  en: 'GB', ru: 'RU', de: 'DE', fr: 'FR', es: 'ES', it: 'IT', pt: 'PT', pl: 'PL', uk: 'UA', tr: 'TR', zh: 'CN', ja: 'JP', ko: 'KR', ar: 'SA', hi: 'IN', nl: 'NL', sv: 'SE',
  cs: 'CZ', kk: 'KZ', be: 'BY', fi: 'FI', da: 'DK', no: 'NO', el: 'GR', he: 'IL', vi: 'VN', th: 'TH', id: 'ID', ro: 'RO', hu: 'HU', bg: 'BG', sr: 'RS', hr: 'HR', sk: 'SK',
  lt: 'LT', lv: 'LV', et: 'EE', hy: 'AM', ka: 'GE', az: 'AZ', uz: 'UZ', fa: 'IR',
};

/** A real flag (SVG, so it looks the same on Windows, which has no flag emoji). */
export function Flag({ lang, size = 20 }: { lang: string; size?: number }) {
  const svg = (FLAGS as Record<string, string>)[FLAG_OF[lang] ?? ''];
  if (!svg) return <span className="flag globe" style={{ width: size * 1.5, height: size }}><Globe2 size={size * 0.8} /></span>;
  return <img className="flag" src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={size * 1.5} height={size} alt="" />;
}


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

const RECENT = 'eh.tr.recent';
const HIST = 'eh.tr.history';
type Hist = { from: string; to: string; text: string; out: string; at: number };
const load = <T,>(k: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '') as T;
  } catch {
    return d;
  }
};
const keep = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

function LangPicker({ value, onPick, withAuto, onClose, side }: { value: string; onPick: (c: string) => void; withAuto: boolean; onClose: () => void; side: 'from' | 'to' }) {
  const tr = useTr();
  const [q, setQ] = useState('');
  const list = LANGS.filter(([c, en, ru]) => (withAuto || c !== 'auto') && (en + ' ' + ru + ' ' + c).toLowerCase().includes(q.toLowerCase()));
  return (
    <motion.div className={`tr-picker2 ${side}`} initial={{ opacity: 0, y: -10, scale: 0.96, rotateX: -12 }} animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ type: 'spring', stiffness: 460, damping: 32 }}>
      <label className="settings-search">
        <Search size={13} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search languages', 'Поиск языка')} onKeyDown={(e) => (e.key === 'Escape' ? onClose() : e.key === 'Enter' && list[0] ? (onPick(list[0][0]), onClose()) : undefined)} />
        <button className="icon-btn sm" onClick={onClose} aria-label={tr('Close', 'Закрыть')}><X size={13} /></button>
      </label>
      <div className="tr-picker2-grid scroll">
        {list.map(([c, en, ru], i) => (
          <motion.button key={c} className={`tr-lang2 ${c === value ? 'on' : ''}`} onClick={() => (onPick(c), onClose())} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 24) * 0.008 }}>
            <Flag lang={c} size={14} />
            <span className="ellipsis">{tr(en, ru)}</span>
          </motion.button>
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
  const [spin, setSpin] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => load(RECENT, ['en', 'ru', 'de', 'es']));
  const [hist, setHist] = useState<Hist[]>(() => load(HIST, []));
  const [showHist, setShowHist] = useState(false);
  const inRef = useRef<HTMLTextAreaElement>(null);
  const name = (c: string) => {
    const l = LANGS.find((x) => x[0] === c);
    return l ? tr(l[1], l[2]) : c;
  };
  const detected = useMemo(() => (from === 'auto' && text.trim() ? detect(text) : null), [from, text]);
  const use = (c: string) => {
    if (c === 'auto') return;
    const next = [c, ...recent.filter((x) => x !== c)].slice(0, 6);
    setRecent(next);
    keep(RECENT, next);
  };

  useEffect(() => {
    setErr(false);
    if (!text.trim()) return setOut('');
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        // When the text is already in the target language, translate the other way round.
        const src = from === 'auto' ? detect(text) : from;
        const dst = src === to ? (to === 'en' ? 'ru' : 'en') : to;
        const res = await translate(text, src, dst);
        setOut(res);
        if (text.trim().length > 1) {
          const next = [{ from: src, to: dst, text: text.trim().slice(0, 300), out: res.slice(0, 300), at: Date.now() }, ...load<Hist[]>(HIST, []).filter((h) => h.text !== text.trim().slice(0, 300))].slice(0, 8);
          setHist(next);
          keep(HIST, next);
        }
      } catch {
        setErr(true);
      } finally {
        setBusy(false);
      }
    }, 500);
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
    setSpin((x) => x + 180);
    setFrom(to);
    setTo(src);
    if (out) setText(out);
  };
  const shownFrom = from === 'auto' && detected ? detected : from;

  return (
    <div className="translate3">
      <div className="tr-bar">
        <button className={`tr-big ${pick === 'from' ? 'open' : ''}`} onClick={() => setPick(pick === 'from' ? null : 'from')}>
          <motion.span layout layoutId={`flag-${shownFrom}`} className="tr-big-flag"><Flag lang={shownFrom} size={18} /></motion.span>
          <span className="tr-big-name">{from === 'auto' ? (detected ? `${name(detected)} · ${tr('auto', 'авто')}` : name('auto')) : name(from)}</span>
          <ChevronDown size={14} className="faint" />
        </button>
        <motion.button className="tr-swap2" onClick={swap} animate={{ rotate: spin }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} aria-label={tr('Swap languages', 'Поменять языки')} title={tr('Swap languages', 'Поменять языки')}>
          <ArrowLeftRight size={16} />
        </motion.button>
        <button className={`tr-big to ${pick === 'to' ? 'open' : ''}`} onClick={() => setPick(pick === 'to' ? null : 'to')}>
          <motion.span layout layoutId={`flag-${to}`} className="tr-big-flag"><Flag lang={to} size={18} /></motion.span>
          <span className="tr-big-name">{name(to)}</span>
          <ChevronDown size={14} className="faint" />
        </button>
      </div>
      <div className="tr-recent">
        {recent.map((c) => (
          <motion.button key={c} layout className={`tr-pill ${c === to ? 'on' : ''}`} onClick={() => (setTo(c), use(c))} whileTap={{ scale: 0.92 }} title={name(c)}>
            <Flag lang={c} size={11} /> <span>{c.toUpperCase()}</span>
          </motion.button>
        ))}
        <span className="grow" />
        <button className={`tr-pill ${showHist ? 'on' : ''}`} onClick={() => setShowHist(!showHist)} title={tr('History', 'История')}>
          <History size={12} /> {hist.length}
        </button>
      </div>
      <div className="tr-cards">
        <div className="tr-card2">
          <textarea ref={inRef} className="tr-text2" value={text} maxLength={3000} onChange={(e) => setText(e.target.value)} placeholder={tr('Type or paste text', 'Введи или вставь текст')} autoFocus />
          <div className="tr-foot tiny faint">
            {text ? (
              <button className="icon-btn sm" onClick={() => (setText(''), inRef.current?.focus())} aria-label={tr('Clear', 'Очистить')}><X size={14} /></button>
            ) : (
              <button className="icon-btn sm" onClick={() => void navigator.clipboard?.readText().then((t) => t && setText(t)).catch(() => {})} aria-label={tr('Paste', 'Вставить')} title={tr('Paste', 'Вставить')}><ClipboardPaste size={14} /></button>
            )}
            {text && <button className="icon-btn sm" onClick={() => speak(text, detected ?? from)} aria-label={tr('Read aloud', 'Озвучить')}><Volume2 size={14} /></button>}
            <span className="grow" />
            {text.length > 0 && <span className="mono">{text.length} / 3000</span>}
          </div>
        </div>
        <div className={`tr-card2 out ${busy ? 'busy' : ''}`}>
          <div className="tr-text2 out" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={err ? 'err' : out || 'ph'} initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, filter: 'blur(4px)' }} transition={{ duration: 0.2 }}>
                {err ? <span className="tr-err">{tr('Couldn’t translate — check your connection.', 'Не удалось перевести — проверь интернет.')}</span> : out || <span className="faint">{tr('Translation', 'Перевод')}</span>}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="tr-foot tiny faint">
            {busy && <span className="tr-dots" aria-label="…"><i /><i /><i /></span>}
            {out && !err && (
              <>
                <button className="icon-btn sm" onClick={() => speak(out, to)} aria-label={tr('Read aloud', 'Озвучить')}><Volume2 size={14} /></button>
                <button className="icon-btn sm" onClick={() => void copyText(out).then(() => toast(tr('Copied', 'Скопировано'), { tone: 'ok' }))} aria-label={tr('Copy', 'Копировать')}><Copy size={14} /></button>
              </>
            )}
            <span className="grow" />
            <span>MyMemory</span>
          </div>
        </div>
        <AnimatePresence>
          {pick && <LangPicker side={pick} value={pick === 'from' ? from : to} withAuto={pick === 'from'} onPick={(c) => (pick === 'from' ? setFrom(c) : setTo(c), use(c))} onClose={() => setPick(null)} />}
          {showHist && (
            <motion.div className="tr-hist" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
              <div className="row"><span className="small">{tr('History', 'История')}</span><span className="grow" /><button className="icon-btn sm" onClick={() => setShowHist(false)} aria-label={tr('Close', 'Закрыть')}><X size={13} /></button></div>
              <div className="scroll tr-hist-list">
                {hist.length === 0 && <span className="tiny faint">{tr('Nothing yet', 'Пока пусто')}</span>}
                {hist.map((h) => (
                  <button key={h.at} className="tr-hist-row" onClick={() => (setFrom(h.from), setTo(h.to), setText(h.text), setShowHist(false))}>
                    <span className="row gap-s"><Flag lang={h.from} size={10} /> → <Flag lang={h.to} size={10} /></span>
                    <span className="tiny ellipsis">{h.text}</span>
                    <span className="tiny faint ellipsis">{h.out}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
