import { base64Decode, base64Encode, calc, changeCase, cleanText, fixLayout, jsonMinify, jsonPretty, stats, translit, urlDecode } from './text';

describe('text tools', () => {
  it('changes case', () => {
    expect(changeCase('привет мир', 'upper')).toBe('ПРИВЕТ МИР');
    expect(changeCase('hello big world', 'title')).toBe('Hello Big World');
    expect(changeCase('ONE. TWO! three', 'sentence')).toBe('One. Two! Three');
  });

  it('fixes keyboard layout both ways', () => {
    expect(fixLayout('ghbdtn')).toBe('привет');
    expect(fixLayout('руддщ')).toBe('hello');
    expect(fixLayout('Ghbdtn, vbh!')).toBe('Привет, мир!');
  });

  it('transliterates', () => {
    expect(translit('Щука и ёжик')).toBe('Shchuka i yozhik');
  });

  it('cleans broken lines and spaces', () => {
    expect(cleanText('Это   длин-\nный текст,\nразбитый  на строки.\n\nВторой абзац.')).toBe('Это длинный текст, разбитый на строки.\n\nВторой абзац.');
  });

  it('formats JSON', () => {
    expect(jsonMinify('{ "a": [1, 2] }')).toBe('{"a":[1,2]}');
    expect(jsonPretty('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(() => jsonPretty('{nope')).toThrow();
  });

  it('round-trips unicode base64 and URLs', () => {
    expect(base64Decode(base64Encode('Привет 👋'))).toBe('Привет 👋');
    expect(urlDecode('a+b%20c')).toBe('a b c');
  });

  it('counts', () => {
    expect(stats('Hello, world — it’s fine')).toEqual({ chars: 24, words: 4 });
  });

  it('calculates safely', () => {
    expect(calc('2+2*2')).toBe(6);
    expect(calc('(1+2)^2')).toBe(9);
    expect(calc('10%*50')).toBe(5);
    expect(calc('1,5 × 4')).toBe(6);
    expect(calc('alert(1)')).toBeNull();
    expect(calc('2+')).toBeNull();
  });
});
