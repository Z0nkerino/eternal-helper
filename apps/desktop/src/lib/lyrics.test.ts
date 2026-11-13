import { currentLine, parseLrc } from './lyrics';

describe('lyrics', () => {
  const lines = parseLrc('[ar: x]\n[00:01.50] Hello\n[00:05.00]World\n[01:02.3][01:10.00] Chorus\n');
  it('parses synced LRC, including repeated stamps', () => {
    expect(lines.map((l) => l.at)).toEqual([1500, 5000, 62300, 70000]);
    expect(lines[2].text).toBe('Chorus');
  });
  it('finds the current line', () => {
    expect(currentLine(lines, 0)).toBe(-1);
    expect(currentLine(lines, 1500)).toBe(0);
    expect(currentLine(lines, 6000)).toBe(1);
    expect(currentLine(lines, 99999)).toBe(3);
  });
});

import { cleanArtist, cleanTitle, estimateTimes, splitDashed } from './lyrics';

describe('lyrics matching', () => {
  it('cleans titles and artists', () => {
    expect(cleanTitle('Blinding Lights (Official Video)')).toBe('Blinding Lights');
    expect(cleanTitle('Song (feat. Someone) [Lyrics]')).toBe('Song');
    expect(cleanTitle('Here Comes the Sun - Remastered 2009')).toBe('Here Comes the Sun');
    expect(cleanTitle('Track ft. Guest')).toBe('Track');
    expect(cleanArtist('The Weeknd - Topic')).toBe('The Weeknd');
    expect(cleanArtist('Daft Punk, Pharrell Williams')).toBe('Daft Punk');
  });
  it('reads "Artist - Song" uploads', () => {
    expect(splitDashed('Rick Astley - Never Gonna Give You Up', 'RickAstleyVEVO')).toEqual({ artist: 'Rick Astley', title: 'Never Gonna Give You Up' });
    expect(splitDashed('Hello - Live', 'Adele')).toEqual({ title: 'Hello - Live', artist: 'Adele' });
  });
  it('spreads plain lyrics over the song', () => {
    const l = estimateTimes('a\n\nb\nc', 100_000);
    expect(l.map((x) => x.text)).toEqual(['a', 'b', 'c']);
    expect(l[0].at).toBe(7000);
    expect(l[2].at).toBeLessThan(93_000);
  });
});
