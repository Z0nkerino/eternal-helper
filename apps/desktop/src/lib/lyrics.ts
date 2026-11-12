// Synced lyrics from LRCLIB (free, no key). The current line is highlighted while the track plays.
export interface LyricLine {
  at: number; // ms
  text: string;
}

export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const line of lrc.split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) {
      const frac = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
      out.push({ at: (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000 + frac, text });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Index of the line being sung at `ms`, or -1 before the first line. */
export function currentLine(lines: LyricLine[], ms: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].at <= ms) (ans = mid), (lo = mid + 1);
    else hi = mid - 1;
  }
  return ans;
}

const cache = new Map<string, LyricLine[] | null>();

export async function fetchLyrics(title: string, artist: string, durationMs?: number | null): Promise<LyricLine[] | null> {
  const key = `${title}\u0001${artist}`;
  if (cache.has(key)) return cache.get(key)!;
  let lines: LyricLine[] | null = null;
  try {
    const q = new URLSearchParams({ track_name: title, artist_name: artist });
    if (durationMs) q.set('duration', String(Math.round(durationMs / 1000)));
    let r = await fetch(`https://lrclib.net/api/get?${q}`);
    let body: { syncedLyrics?: string | null } | { syncedLyrics?: string | null }[] | null = r.ok ? await r.json() : null;
    if (!body || (!Array.isArray(body) && !body.syncedLyrics)) {
      r = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ q: `${artist} ${title}` })}`);
      body = r.ok ? await r.json() : null;
    }
    const synced = Array.isArray(body) ? body.find((x) => x.syncedLyrics)?.syncedLyrics : body?.syncedLyrics;
    lines = synced ? parseLrc(synced) : null;
  } catch {
    lines = null;
  }
  cache.set(key, lines);
  return lines;
}
