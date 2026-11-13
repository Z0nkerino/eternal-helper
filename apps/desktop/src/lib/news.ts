// The developer notice: news and updates from Eternal Inc. Read from NEWS.json in the GitHub repository,
// so news can be posted without a new release; the copy bundled here is shown when offline.
export interface NewsItem {
  date: string;
  tag: 'update' | 'news' | 'tip';
  title: string;
  body: string;
}

const URL = 'https://raw.githubusercontent.com/Z0nkerino/eternal-helper/main/NEWS.json';

export const BUNDLED: NewsItem[] = [
  {date: "2026-11-14", tag: "update", title: "Beta 0.9.0 — liquid glass & 3D Cloudy", body: "Liquid glass everywhere, a smoother liquid opening, brand-new Settings, Cloudy as a real 3D cloud that spins, flips and rolls, and chats and messengers that finally load and let you sign in."},
  {date: "2026-11-14", tag: "tip", title: "Click Cloudy in his room", body: "Open Cloudy's room and click him: he spins, flips, rolls and hops. On the desktop he does tricks by himself now and then."},
  {date: "2026-11-13", tag: "update", title: "Beta 0.8.3 — music player fits", body: "The Music tab is compact and easier to use: a full-width seek bar, big centred controls, the music volume beside them and more room for lyrics. It always fits, even on small or scaled screens."},
];

const valid = (x: unknown): x is NewsItem => {
  const n = x as NewsItem;
  return !!n && typeof n.title === 'string' && typeof n.body === 'string' && typeof n.date === 'string' && ['update', 'news', 'tip'].includes(n.tag);
};

export async function fetchNews(): Promise<NewsItem[]> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(URL, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok) return BUNDLED;
    const j = (await r.json()) as { items?: unknown[] };
    const items = (j.items ?? []).filter(valid).slice(0, 8).map((n) => ({ ...n, title: n.title.slice(0, 80), body: n.body.slice(0, 400) }));
    return items.length ? items : BUNDLED;
  } catch {
    return BUNDLED;
  }
}
