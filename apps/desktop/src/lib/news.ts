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
  {date: "2026-11-13", tag: "update", title: "Beta 0.4.0 — calmer and more useful", body: "Much less motion and softer colours. New AI tab for ChatGPT, Claude, Gemini and more; a clipboard history with the time and website of everything you copy; live volume, brightness, Caps Lock and download activity in the island; and you can drag the island anywhere."},
  {date: "2026-11-13", tag: "tip", title: "Move the island", body: "Grab the closed island — or the tab bar of the open one — and drop it anywhere. Drop it near the top centre to send it home."},
  {date: "2026-11-13", tag: "news", title: "Updates are now required", body: "When a new version is out, the island asks you to update before you continue. It takes a minute and restarts by itself."},
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
