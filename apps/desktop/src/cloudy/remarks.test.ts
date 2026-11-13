import { describe, expect, it } from 'vitest';
import { pageTitle, remarkFor, remarkForTrack } from './remarks';

const first = () => 0;
describe('Cloudy remarks', () => {
  it('cleans browser titles', () => {
    expect(pageTitle('Lo-fi beats - YouTube — Google Chrome')).toBe('Lo-fi beats');
  });
  it('talks about YouTube videos, code and chats', () => {
    expect(remarkFor({ app: 'chrome', title: 'Lo-fi beats - YouTube - Google Chrome' }, 'en', first)).toContain('Lo-fi beats');
    expect(remarkFor({ app: 'Code', title: 'main.rs — eternal-helper' }, 'en', first)).toContain('save');
    expect(remarkFor({ app: 'Telegram', title: 'Telegram' }, 'ru', first)).toContain('привет');
  });
  it('stays quiet about unknown apps', () => {
    expect(remarkFor({ app: 'someapp', title: '' }, 'en', first)).toBeNull();
    expect(remarkFor(null, 'en')).toBeNull();
  });
  it('comments on songs', () => {
    expect(remarkForTrack({ title: 'Northern Lights', artist: 'Aurora, Friend' }, 'en', first)).toContain('Aurora');
    expect(remarkForTrack(null, 'en')).toBeNull();
  });
});
