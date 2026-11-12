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
