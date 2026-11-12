import { livePosition, pickMedia } from './music';
import type { MediaInfo, MusicReport } from './ipc';

const sys: MediaInfo = { title: 'Sys', artist: 'A', album: '', playing: false, source: 'Edge' };
const web: MusicReport = { service: 'yandex', title: 'Web', artist: 'B', album: '', artwork: null, playing: true, positionMs: 1000, durationMs: 5000 };

describe('media picking', () => {
  it('prefers whatever is playing', () => {
    expect(pickMedia(sys, { yandex: web }).source).toEqual({ kind: 'web', service: 'yandex' });
    expect(pickMedia({ ...sys, playing: true }, { yandex: { ...web, playing: false } }).media?.title).toBe('Sys');
    expect(pickMedia(null, { yandex: { ...web, playing: false } }).media?.source).toBe('Yandex Music');
    expect(pickMedia(null, {}).media).toBeNull();
  });
  it('moves the position forward while playing, capped at the duration', () => {
    const m = { ...sys, playing: true, positionMs: 1000, durationMs: 3000 };
    expect(livePosition(m, 0, 1500)).toBe(2500);
    expect(livePosition(m, 0, 9000)).toBe(3000);
    expect(livePosition({ ...m, playing: false }, 0, 9000)).toBe(1000);
  });
});
