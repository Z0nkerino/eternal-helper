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

/** "Song (feat. X) [Official Video] - Remastered 2011" → "Song". */
export function cleanTitle(t: string): string {
  return t
    .replace(/\s*[([][^)\]]*\b(?:official|lyrics?|audio|video|hd|hq|4k|mv|visuali[sz]er|explicit|clean|live|remaster(?:ed)?|feat|ft|prod|with)\b[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(?:remaster(?:ed)?(?: \d{4})?|\d{4} remaster(?:ed)?|radio edit|single version|original mix|live.*|mono|stereo)$/i, '')
    .replace(/\s+(?:feat\.?|ft\.?)\s+.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** "Artist - Topic", "ArtistVEVO", "A, B & C" → "Artist" / "A". */
export function cleanArtist(a: string): string {
  return a
    .replace(/\s*-\s*topic$/i, '')
    .replace(/vevo$/i, '')
    .split(/\s*(?:,|&| x | feat\.?| ft\.?| и )\s*/i)[0]
    .trim();
}

/** YouTube-style uploads carry the artist in the title: "Artist - Song". */
export function splitDashed(title: string, artist: string): { title: string; artist: string } {
  const m = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m && (!artist || /topic|vevo|official|records|music/i.test(artist) || m[1].toLowerCase().includes(cleanArtist(artist).toLowerCase())) ? { artist: m[1], title: m[2] } : { title, artist };
}

/** Plain (unsynced) lyrics spread over the song, skipping a short intro and outro. */
export function estimateTimes(plain: string, durationMs: number): LyricLine[] {
  const lines = plain.split(/\r?\n/).map((l) => l.trim());
  const sung = lines.filter(Boolean).length || 1;
  const start = durationMs * 0.07;
  const span = durationMs * 0.86;
  let i = 0;
  return lines.flatMap((text) => (text ? [{ at: Math.round(start + (span * i++) / sung), text }] : []));
}

const cache = new Map<string, LyricLine[] | null>();
type Hit = { syncedLyrics?: string | null; plainLyrics?: string | null; duration?: number };
export interface Lyrics {
  lines: LyricLine[];
  /** Times are spread evenly (only plain lyrics exist): shown as "approximate". */
  approximate: boolean;
}
const STORE = 'eh.lyrics.v2';
function stored(key: string): Lyrics | null | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, Lyrics | null>;
    return key in all ? all[key] : undefined;
  } catch {
    return undefined;
  }
}
function store(key: string, v: Lyrics | null) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, Lyrics | null>;
    all[key] = v;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete all[k];
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Finds lyrics for almost any song: LRCLIB with the exact names, then cleaned names, then searches,
 * preferring synced lyrics whose length matches the song; plain lyrics get evenly spread times.
 */
export async function findLyrics(rawTitle: string, rawArtist: string, durationMs?: number | null): Promise<Lyrics | null> {
  const key = `${rawTitle}\u0001${rawArtist}`;
  const cached = stored(key);
  if (cached !== undefined) return cached;
  const d = splitDashed(rawTitle, rawArtist);
  const title = cleanTitle(d.title);
  const artist = cleanArtist(d.artist);
  const secs = durationMs ? Math.round(durationMs / 1000) : null;
  const near = (h: Hit) => (secs && h.duration ? Math.abs(h.duration - secs) : 0);
  const get = async (q: Record<string, string>): Promise<Hit | null> => {
    try {
      const r = await fetch(`https://lrclib.net/api/get?${new URLSearchParams(q)}`);
      return r.ok ? ((await r.json()) as Hit) : null;
    } catch {
      return null;
    }
  };
  const search = async (q: Record<string, string>): Promise<Hit[]> => {
    try {
      const r = await fetch(`https://lrclib.net/api/search?${new URLSearchParams(q)}`);
      return r.ok ? ((await r.json()) as Hit[]) : [];
    } catch {
      return [];
    }
  };
  const best = (hits: Hit[]) => {
    const ok = hits.filter((h) => !secs || !h.duration || near(h) <= 8);
    return ok.filter((h) => h.syncedLyrics).sort((a, b) => near(a) - near(b))[0] ?? ok.filter((h) => h.plainLyrics).sort((a, b) => near(a) - near(b))[0] ?? null;
  };
  let hit: Hit | null = null;
  for (const q of [
    { track_name: rawTitle, artist_name: rawArtist, ...(secs ? { duration: String(secs) } : {}) },
    { track_name: title, artist_name: artist, ...(secs ? { duration: String(secs) } : {}) },
    { track_name: title, artist_name: artist },
  ]) {
    const h = await get(q);
    if (h?.syncedLyrics) {
      hit = h;
      break;
    }
    if (h?.plainLyrics && !hit) hit = h;
  }
  if (!hit?.syncedLyrics) hit = best([...(await search({ track_name: title, artist_name: artist })), ...(hit ? [hit] : [])]) ?? hit;
  if (!hit?.syncedLyrics) hit = best([...(await search({ q: `${artist} ${title}` })), ...(hit ? [hit] : [])]) ?? hit;
  if (!hit?.syncedLyrics && !hit?.plainLyrics) hit = best(await search({ q: title })) ?? null;
  const out: Lyrics | null = hit?.syncedLyrics
    ? { lines: parseLrc(hit.syncedLyrics), approximate: false }
    : hit?.plainLyrics && durationMs
      ? { lines: estimateTimes(hit.plainLyrics, durationMs), approximate: true }
      : null;
  store(key, out);
  return out;
}

/** Older callers: just the lines. */
export async function fetchLyrics(title: string, artist: string, durationMs?: number | null): Promise<LyricLine[] | null> {
  const k = `${title}\u0001${artist}`;
  if (cache.has(k)) return cache.get(k)!;
  const l = (await findLyrics(title, artist, durationMs))?.lines ?? null;
  cache.set(k, l);
  return l;
}
