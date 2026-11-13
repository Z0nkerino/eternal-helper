import { describe, expect, it } from 'vitest';
import { chunks, detect } from './TranslateView';

describe('translator helpers', () => {
  it('guesses the language from its letters', () => {
    expect(detect('Привет, как дела?')).toBe('ru');
    expect(detect('Привіт, як справи?')).toBe('uk');
    expect(detect('Hello there')).toBe('en');
    expect(detect('こんにちは')).toBe('ja');
    expect(detect('Grüße aus München')).toBe('de');
  });
  it('splits long text at sentence ends', () => {
    const t = 'One sentence here. '.repeat(60);
    const parts = chunks(t, 200);
    expect(parts.length).toBeGreaterThan(4);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    expect(parts.join('')).toBe(t);
  });
});
