// Text tools. Pure functions, so they're easy to test and reuse from Afina.

export type CaseMode = 'upper' | 'lower' | 'title' | 'sentence';

export function changeCase(s: string, mode: CaseMode): string {
  switch (mode) {
    case 'upper':
      return s.toLocaleUpperCase();
    case 'lower':
      return s.toLocaleLowerCase();
    case 'title':
      return s.toLocaleLowerCase().replace(/(^|[\s\-«"'(])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase());
    case 'sentence':
      return s.toLocaleLowerCase().replace(/(^\s*|[.!?…]\s+)(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase());
  }
}

// ЙЦУКЕН ↔ QWERTY, same physical keys.
const EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./~QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?@#$^&";
const RU = 'ёйцукенгшщзхъфывапролджэячсмитьбю.ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,"№;:?';
const toRu = new Map([...EN].map((c, i) => [c, RU[i]]));
const toEn = new Map([...RU].map((c, i) => [c, EN[i]]));

/** "ghbdtn" → "привет" and "руддщ" → "hello". Direction is picked by which alphabet dominates. */
export function fixLayout(s: string): string {
  const cyr = (s.match(/[а-яё]/gi) ?? []).length;
  const lat = (s.match(/[a-z]/gi) ?? []).length;
  const map = lat >= cyr ? toRu : toEn;
  const chars = [...s];
  // A comma or full stop right before a space is almost always real punctuation, not a mistyped letter.
  return chars.map((c, i) => (/[,.]/.test(c) && /\s|^$/.test(chars[i + 1] ?? '') ? c : map.get(c) ?? c)).join('');
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function translit(s: string): string {
  return [...s]
    .map((c) => {
      const low = c.toLowerCase();
      const t = TRANSLIT[low];
      if (t === undefined) return c;
      return c === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join('');
}

/** Joins lines broken mid-sentence and squeezes repeated spaces, keeping paragraph breaks. */
export function cleanText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/-\n(?=\p{Ll})/gu, '').replace(/\s*\n\s*/g, ' ').replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function jsonPretty(s: string) {
  return JSON.stringify(JSON.parse(s), null, 2);
}
export function jsonMinify(s: string) {
  return JSON.stringify(JSON.parse(s));
}

export function base64Encode(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
export function base64Decode(s: string) {
  const bin = atob(s.trim());
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export const urlEncode = (s: string) => encodeURIComponent(s);
export const urlDecode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '));

export function stats(s: string) {
  return { chars: [...s].length, words: (s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length };
}

/** Safe arithmetic for Afina and the palette: digits, + - * / ^ % ( ) and decimals only. */
export function calc(expr: string): number | null {
  const src = expr.replace(/,/g, '.').replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  if (!/^[\d.+\-*/^%()]+$/.test(src) || !/\d/.test(src)) return null;
  let i = 0;
  const peek = () => src[i];
  const num = (): number => {
    if (peek() === '(') {
      i++;
      const v = add();
      if (src[i++] !== ')') throw new Error('paren');
      return v;
    }
    if (peek() === '-') {
      i++;
      return -num();
    }
    const m = /^\d*\.?\d+/.exec(src.slice(i));
    if (!m) throw new Error('num');
    i += m[0].length;
    let v = parseFloat(m[0]);
    if (peek() === '%') {
      i++;
      v /= 100;
    }
    return v;
  };
  const pow = (): number => {
    const b = num();
    if (peek() === '^') {
      i++;
      return b ** pow();
    }
    return b;
  };
  const mul = (): number => {
    let v = pow();
    while (peek() === '*' || peek() === '/') v = src[i++] === '*' ? v * pow() : v / pow();
    return v;
  };
  const add = (): number => {
    let v = mul();
    while (peek() === '+' || peek() === '-') v = src[i++] === '+' ? v + mul() : v - mul();
    return v;
  };
  try {
    const v = add();
    return i === src.length && Number.isFinite(v) ? Math.round(v * 1e10) / 1e10 : null;
  } catch {
    return null;
  }
}
