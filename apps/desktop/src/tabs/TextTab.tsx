import { useState } from 'react';
import { useT } from '../lib/i18n';
import { toast } from '../lib/store';
import { copyText } from '../lib/clipboard';
import * as tx from '../lib/text';

type Tool = { id: string; en: string; ru: string; run: (s: string) => string };

const TOOLS: Tool[] = [
  { id: 'upper', en: 'UPPER', ru: 'ВЕРХНИЙ', run: (s) => tx.changeCase(s, 'upper') },
  { id: 'lower', en: 'lower', ru: 'нижний', run: (s) => tx.changeCase(s, 'lower') },
  { id: 'title', en: 'Each Word', ru: 'Каждое Слово', run: (s) => tx.changeCase(s, 'title') },
  { id: 'sentence', en: 'Sentence', ru: 'Предложение', run: (s) => tx.changeCase(s, 'sentence') },
  { id: 'layout', en: 'Fix layout', ru: 'Раскладка', run: tx.fixLayout },
  { id: 'translit', en: 'Translit', ru: 'Транслит', run: tx.translit },
  { id: 'clean', en: 'Clean text', ru: 'Чистый текст', run: tx.cleanText },
  { id: 'json', en: 'JSON pretty', ru: 'JSON красиво', run: tx.jsonPretty },
  { id: 'jsonmin', en: 'JSON one line', ru: 'JSON в строку', run: tx.jsonMinify },
  { id: 'b64', en: 'Base64 →', ru: 'Base64 →', run: tx.base64Encode },
  { id: 'unb64', en: '← Base64', ru: '← Base64', run: tx.base64Decode },
  { id: 'url', en: 'URL encode', ru: 'URL encode', run: tx.urlEncode },
  { id: 'unurl', en: 'URL decode', ru: 'URL decode', run: tx.urlDecode },
];

export function TextTab() {
  const t = useT();
  const [text, setText] = useState('');
  const { chars, words } = tx.stats(text);

  const apply = async (tool: Tool) => {
    try {
      const out = tool.run(text);
      setText(out);
      await copyText(out);
      toast(t('text.result'), { tone: 'ok' });
    } catch (e) {
      toast(String((e as Error).message ?? e), { tone: 'error' });
    }
  };

  return (
    <div className="text-tab">
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('text.input')} aria-label={t('text.input')} spellCheck={false} />
      <div className="row between">
        <span className="faint small">
          {chars} {t.lang === 'ru' ? 'символов' : 'characters'} · {words} {t.lang === 'ru' ? 'слов' : 'words'}
        </span>
      </div>
      <div className="chips wrap">
        {TOOLS.map((tool) => (
          <button key={tool.id} className="chip" disabled={!text} onClick={() => void apply(tool)}>
            {t.lang === 'ru' ? tool.ru : tool.en}
          </button>
        ))}
      </div>
    </div>
  );
}
