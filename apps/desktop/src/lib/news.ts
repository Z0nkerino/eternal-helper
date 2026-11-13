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
  {date: "2026-11-13", tag: "update", title: "Beta 0.8.2 — tabs fixed", body: "The tab bar always fits, every screen opens in a window, panels are never cut off, and chats close when you click elsewhere instead of staying stuck."},
  {date: "2026-11-13", tag: "update", title: "Beta 0.8.1 — fixes", body: "The island no longer closes while your cursor is on it, and its placement (and the chats over the panel) are right again. After opening a chat the island used to lose track of the cursor and its position."},
  {date: "2026-11-13", tag: "update", title: "Beta 0.6.0 — liquid, chats, music", body: "The island opens like liquid glass and comes in five shapes. Chats (ChatGPT, Claude, Telegram, WhatsApp, Discord…) open right inside it. A new Music tab with its own volume, a Time tab, Calendar, a Notes board, a file shelf and notifications from your PC."},
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
